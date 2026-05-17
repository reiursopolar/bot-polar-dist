# Modofun & Auto-Diário Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `!modofun on/off` (bulk-toggle all 9 game systems) and auto-diário (bot auto-awards daily reward on user's first message when RPG is active).

**Architecture:** `!modofun` loops over a hardcoded constant in `jogos.js` using the existing `toggleSistema()` helper. Auto-diário extracts the diário reward logic into `runDiario()` in `rpg.js` (the motor), updates the command handler to call it, and triggers it automatically from `handler.js` when RPG is active and the cooldown is expired.

**Tech Stack:** Node.js ESM, better-sqlite3, Baileys (WhatsApp), no test framework — verify manually by running the bot.

---

## File Map

| File | Change |
|------|--------|
| `src/commands/jogos.js` | Add `FUN_SISTEMAS` constant + `case 'modofun'` |
| `src/rpg.js` | Add `export function runDiario(...)` |
| `src/commands/rpg.js` | Add `runDiario` to import, refactor `case 'diario'` to call it |
| `src/handler.js` | Add auto-diário trigger block inside `if (isGroup && body)` |

---

## Task 1 — `!modofun on/off`

**Files:**
- Modify: `src/commands/jogos.js` (add before line 615 `switch (command)` and before line 621 `case 'quizconfig'`)

- [ ] **Step 1: Add the `FUN_SISTEMAS` constant**

  In `src/commands/jogos.js`, add this constant right above the `handleJogos` function (line 606), after the closing `}` of `buildForcaDisplay`/`wordCompleto` helpers block (line 601):

  ```js
  const FUN_SISTEMAS = ['quiz','forca','adivinha','batalha','velha','conecta4','aki','numero_secreto','emojiquiz']
  ```

  The file currently has:
  ```js
  // ══════════════════════════════════════════════════════════════════════
  // HANDLER PRINCIPAL
  // ══════════════════════════════════════════════════════════════════════
  export async function handleJogos(sock, msg, ctx) {
  ```

  Insert after the blank line before the `// ══ HANDLER` comment:
  ```js
  const FUN_SISTEMAS = ['quiz','forca','adivinha','batalha','velha','conecta4','aki','numero_secreto','emojiquiz']

  // ══════════════════════════════════════════════════════════════════════
  // HANDLER PRINCIPAL
  // ══════════════════════════════════════════════════════════════════════
  export async function handleJogos(sock, msg, ctx) {
  ```

- [ ] **Step 2: Add `case 'modofun'`**

  In `src/commands/jogos.js`, inside `handleJogos`'s `switch (command)` block, add the `modofun` case **before** `case 'quizconfig'` (currently at line 621). The section header for QUIZ is at line 617. Insert before it:

  ```js
    // ══════════════════════════════════════════════════════════════════
    // MODO FUN — ativar/desativar todos os jogos de uma vez
    // ══════════════════════════════════════════════════════════════════

    case 'modofun': {
      if (!isAdmin) return reply('🚫 Apenas admins.')
      if (args[0] !== 'on' && args[0] !== 'off') return reply(`❌ Ex: ${prefix}modofun on/off`)
      const on = args[0] === 'on'
      for (const nome of FUN_SISTEMAS) toggleSistema(from, nome, on)
      const lista = FUN_SISTEMAS.join(' · ')
      return reply(on
        ? `✅ *Modo Fun ON*\n${lista}`
        : `❌ *Modo Fun OFF*\n${lista}`)
    }
  ```

- [ ] **Step 3: Verify manually**

  Start the bot. In a group where you are admin:
  - Send `!modofun on` → expect reply listing all 9 systems as ON
  - Send `!quiz` → quiz should now be active (check that it prompts to start)
  - Send `!modofun off` → expect reply listing all 9 systems as OFF
  - Send `!quiz` → should say quiz is deactivated
  - Send `!quizconfig on` → should still work independently (toggles only quiz)

- [ ] **Step 4: Commit**

  ```bash
  git add src/commands/jogos.js
  git commit -m "feat: add !modofun on/off to bulk-toggle all game systems"
  ```

---

## Task 2 — Extract `runDiario()` into `src/rpg.js`

**Files:**
- Modify: `src/rpg.js` (add `runDiario` after `hardResetAllRankings`)
- Modify: `src/commands/rpg.js` (add import + refactor `case 'diario'`)

- [ ] **Step 1: Add `runDiario` to `src/rpg.js`**

  In `src/rpg.js`, locate `export function hardResetAllRankings()` (line 372). Add `runDiario` after its closing brace:

  ```js
  export function runDiario(userNum, grupoId, { isVip = false, vipMult = 1 } = {}) {
    if (getCooldownRemaining(userNum, 'diario') > 0) return null

    const C      = getCoinsConfig()
    const prof   = getProfile(userNum)
    const agora  = Date.now()
    const diffH  = (agora - (prof?.diario_last ?? 0)) / 3_600_000
    let streak   = (diffH < 48 && diffH >= 20) ? (prof?.diario_streak ?? 0) + 1 : 1
    streak       = Math.min(streak, 30)
    setProfileField(userNum, 'diario_streak', streak)
    setProfileField(userNum, 'diario_last', agora)

    const bonus  = Math.floor(C.diario * Math.min(streak - 1, 10) * 0.05)
    const base   = C.diario + randInt(0, 80)
    const valor  = Math.floor((base + bonus) * vipMult)
    addCoins(userNum, valor)
    setCooldown(userNum, 'diario', isVip ? 12 * 3_600_000 : 24 * 3_600_000)
    addXP(userNum, 5, grupoId)
    return { moedas: valor, base, bonus, xp: 5, streak }
  }
  ```

  All functions called (`getCooldownRemaining`, `getCoinsConfig`, `getProfile`, `setProfileField`, `randInt`, `addCoins`, `setCooldown`, `addXP`) are already defined in the same file.

- [ ] **Step 2: Add `runDiario` to the import in `src/commands/rpg.js`**

  The current import from `../rpg.js` in `src/commands/rpg.js` (lines 6–19) ends with:
  ```js
    fetchImage, fmt, pick, randInt, resetProfile,
  } from '../rpg.js'
  ```

  Change it to:
  ```js
    fetchImage, fmt, pick, randInt, resetProfile,
    runDiario,
  } from '../rpg.js'
  ```

- [ ] **Step 3: Refactor `case 'diario'` in `src/commands/rpg.js`**

  The current `case 'diario'` block is at lines 305–346. Replace the entire block with:

  ```js
    case 'diario': {
      const r = runDiario(senderNum, from, {
        isVip,
        vipMult: isGroup ? vipMoedaMult(from, senderNum) : 1,
      })
      if (!r) {
        const cd = getCooldownRemaining(senderNum, 'diario')
        return reply(`⌛ Já recolheste hoje! Volta em *${formatDuration(cd)}*`)
      }

      verificarMedalhasRpg(sock, from, senderNum, 'diario_streak', r.streak).catch(() => null)

      const streakTxt = r.streak > 1
        ? `\n🔥 *Streak: ${r.streak} dias!* (+${fmt(r.bonus)} bónus)\n`
        : '\n'
      const img = await fetchImage('reward,gift,treasure,coins')
      const txt = (
        `🎁 *Recompensa Diária!*\n\n` +
        `💰 Base: *+${fmt(r.base)} moedas*${streakTxt}` +
        `💳 Saldo: *${fmt(getCoins(senderNum))} moedas*\n\n` +
        `_${r.streak >= 7 ? '⭐ Incrível! 7+ dias seguidos!' : `Volta amanhã — streak atual: ${r.streak}`}_`
      )
      if (img) await sock.sendMessage(from, { image: img, caption: txt }, { quoted: msg })
      else reply(txt)
      return true
    }
  ```

  The output is identical to the original — `base` and `bonus` are returned separately so the display text is unchanged.

- [ ] **Step 4: Verify manually**

  Start the bot. Send `!diario` in a group:
  - First call: should show the full reward message with image, streak, and balance
  - Immediately send `!diario` again: should say "Já recolheste hoje! Volta em X"
  - VIP user: cooldown should be 12h; non-VIP: 24h

- [ ] **Step 5: Commit**

  ```bash
  git add src/rpg.js src/commands/rpg.js
  git commit -m "refactor: extract runDiario() into rpg.js motor for reuse"
  ```

---

## Task 3 — Auto-diário in `src/handler.js`

**Files:**
- Modify: `src/handler.js` (add auto-diário block after line 1094)

- [ ] **Step 1: Add the auto-diário trigger**

  In `src/handler.js`, find the existing RPG block (around line 1091–1094):

  ```js
    // XP por mensagem + tick de veneno (RPG)
    if (_gdbSis.rpg) {
      trackXP(senderNum, from, isGroup)
      checkPoisonTick(senderNum)
    }
  ```

  Add the following block **immediately after** it (before the FAQ comment at line 1096):

  ```js
    // Auto-diário — recompensa automática na primeira mensagem do dia
    if (_gdbSis.rpg && !body.startsWith(cfg.prefix)) {
      try {
        const { runDiario } = await import('./rpg.js')
        const r = runDiario(senderNum, from, {
          isVip   : vips.isAtivo(senderNum),
          vipMult : vipMoedaMult(from, senderNum),
        })
        if (r) await sock.sendMessage(from, { text: `🎁 *Diário!* +${r.moedas} moedas · +${r.xp} XP` })
      } catch {}
    }
  ```

  Notes:
  - `vips` is imported from `./database.js` (line 18 of handler.js) — already available
  - `vipMoedaMult` is imported from `./commands/vip.js` (line 42) — already available
  - `cfg.prefix` is the live config prefix — already available in this scope
  - The dynamic `import('./rpg.js')` pattern matches the existing VIP XP block (line 1062) for consistency

- [ ] **Step 2: Verify manually**

  Start the bot. In a group with RPG active:
  1. Wait until your diário cooldown expires (or temporarily lower cooldown in DB for testing)
  2. Send any regular message (not a command)
  3. Bot should reply with `🎁 *Diário!* +X moedas · +Y XP`
  4. Send another message → bot stays silent (cooldown now active)
  5. Send `!diario` while in cooldown → should say "Já recolheste hoje!"
  6. In a group without RPG active: send a message → no auto-diário fires

- [ ] **Step 3: Commit**

  ```bash
  git add src/handler.js
  git commit -m "feat: auto-award diario on first message of the day when RPG is active"
  ```
