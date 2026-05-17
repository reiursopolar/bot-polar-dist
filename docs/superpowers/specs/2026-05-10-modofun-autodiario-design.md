# Modofun & Auto-Diário — Design Spec
**Date:** 2026-05-10  
**Status:** Approved

---

## Context

Two quality-of-life improvements to the WhatsApp bot:

1. `!modofun on/off` — bulk-toggles all game/fun systems in a group with a single command instead of enabling each one individually.
2. Auto-diário — when RPG is active, the bot automatically awards the daily reward on the user's first message of the day, so they don't need to type `!diario`.

---

## 1. `!modofun on/off`

**Problem:** Enabling games in a group requires 9 separate commands (`!quiz on`, `!forca on`, etc.).

**Fix:** `src/commands/jogos.js`

Add a module-level constant listing all pure game/fun system keys:

```js
const FUN_SISTEMAS = ['quiz','forca','adivinha','batalha','velha','conecta4','aki','numero_secreto','emojiquiz']
```

Add `case 'modofun'` (admin-only, same guard as other config cases in this file):

- `!modofun on` → loop over `FUN_SISTEMAS`, call `toggleSistema(from, name, true)` for each
- `!modofun off` → same with `false`
- Reply with a single confirmation message listing all toggled systems:

```
✅ Modo Fun *ON*
quiz · forca · adivinha · batalha · velha · conecta4 · aki · numero_secreto · emojiquiz
```

No new DB fields — each system already has its own key in `gdb.sistemas`. The individual `!quiz on/off` etc. commands continue to work independently.

**Files changed:** `src/commands/jogos.js`

---

## 2. Auto-Diário

**Problem:** Users must remember to type `!diario` each day to collect their daily reward.

**Fix:** `src/rpg.js` + `src/commands/rpg.js` + `src/handler.js`

### Extract shared reward function

Move the diário reward logic (coin award, XP, streak tracking, cooldown setting) from `case 'diario'` in `src/commands/rpg.js` into a new exported function in `src/rpg.js`:

```js
export function runDiario(userNum, grupoId)
// Returns { moedas, xp, streak } on success, null if cooldown active
```

The existing `case 'diario'` calls `runDiario()` and builds its full reply from the result — no behavior change for the manual command.

### Auto-trigger in handler

In `src/handler.js`, inside the non-command message processing block where `_gdbSis.rpg` is already checked, add:

```js
if (_gdbSis.rpg && !getCooldown('diario', userNum)) {
  const r = runDiario(userNum, from)
  if (r) sock.sendMessage(from, { text: `🎁 *Diário!* +${r.moedas} moedas · +${r.xp} XP` })
}
```

- Short, non-intrusive single line in the group chat
- No reply threading (avoids quoting random messages)
- VIP multiplier already applies inside `runDiario`
- If already in cooldown, silently skips
- Only fires when `_gdbSis.rpg` is truthy (RPG active in that group)

**Cooldown reuse:** The existing 24h/12h-VIP cooldown on key `'diario'` already serves as the "first message of the day" gate — if expired, the user hasn't collected yet.

**Files changed:** `src/rpg.js`, `src/commands/rpg.js`, `src/handler.js`

---

## Verification

1. **modofun:** As admin, run `!modofun on` in a group → confirm confirmation message lists all 9 systems and each is now active. Run `!modofun off` → all deactivated. Confirm `!quiz on` still works independently.
2. **Auto-diário:** Send a message in a group with RPG active after cooldown expires → bot sends short reward message. Send a second message → bot stays silent (cooldown active). Manual `!diario` still works and shows the full reward message.
