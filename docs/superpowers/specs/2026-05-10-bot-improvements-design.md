# Bot Improvements — Design Spec
**Date:** 2026-05-10  
**Status:** Approved

---

## Context

Four improvements to the WhatsApp bot after fixing the @mention system (LID → phone JID mapping). The rank reset clears stale data built under the old broken mention system. The other changes correct gameplay balance and visual consistency.

---

## 1. VIP Gold Cap per Day

**Problem:** The scheduler runs once per group at midnight. Each run distributes 500 gold to all active VIPs, regardless of whether they're in that group. A VIP in 5 bot groups receives 2500/day.

**Fix:** `src/sistemas.js`

- Add module-level `Map<userNum, totalReceivedToday>` called `_vipBonusHoje`
- Before awarding +500 to a VIP in a group, check if `_vipBonusHoje.get(userNum) >= 2000`
- If cap reached, skip that VIP
- If not, award +500 and increment the counter
- Map resets naturally on process restart (bot restarts daily or on deploy); no DB needed
- Per-group deduplication key `vip_bonus:${grupoId}` stays unchanged

**Cap:** 2000 gold/day (equivalent to 4 groups)

**Files changed:** `src/sistemas.js`

---

## 2. Play Limit — 5/day for Non-VIPs

**Problem:** Non-VIPs can download 10 songs/day. User wants this halved to 5.

**Fix:** `src/commands/media.js`, function `checkMusicLimit` (~line 33)

- Change `usos >= 10` → `usos >= 5`
- Update the reply message text from "10 músicas" → "5 músicas"
- VIPs and owner remain exempt (already handled by early return before this check)
- Affects all commands using `checkMusicLimit`: `!play`, `!playvid`, `!spotify`, `!sc`

**Files changed:** `src/commands/media.js`

---

## 3. Hard Reset of All Rankings

**Problem:** Rank data accumulated under the broken @mention system may have corrupt `user_num` keys (LID numbers instead of phone numbers). A clean slate ensures ranks build correctly going forward.

**Fix:** `src/rpg.js` + `src/commands/owner.js`

Add `hardResetAllRankings()` to `src/rpg.js`:
```js
export function hardResetAllRankings() {
  db.prepare('DELETE FROM rpg_wallet').run()
  db.prepare('DELETE FROM rpg_group_xp').run()
  db.prepare('DELETE FROM rpg_profile').run()
  db.prepare('DELETE FROM rpg_cooldowns').run()
}
```

Expose via `!resetranks confirmar` in `src/commands/owner.js` (owner-only, requires the word "confirmar" as argument to prevent accidents).

Run once manually after deploy.

**Tables cleared:** `rpg_wallet`, `rpg_group_xp`, `rpg_profile`, `rpg_cooldowns`  
**Files changed:** `src/rpg.js`, `src/commands/owner.js`

---

## 4. Menus — Visual Reformatting

**Problem:** Menus have inconsistent formatting — mixed use of `-`, `:`, `»`, varying emoji styles, no uniform section borders.

**Fix:** `src/commands/menus.js`

Apply a consistent visual pattern across all menus:

```
╔══════════════════════╗
║  📱 NOME DO MENU     ║
╚══════════════════════╝

┌─ 🎮 Secção ──────────┐
│ !cmd1 → descrição    │
│ !cmd2 → descrição    │
└──────────────────────┘
```

Rules:
- Header: `╔╗╚╝` box + emoji + menu name in uppercase
- Sections: `┌┐└┘` box + emoji + section title
- Commands: `│ !cmd → descrição` with `→` as separator (consistent)
- Footer on main menu: prefix + bot version info
- No content changes — layout only

**Files changed:** `src/commands/menus.js`

---

## Verification

1. **VIP Gold:** Restart bot, wait for midnight (or manually trigger the scheduler). Confirm a VIP in 5+ groups receives exactly 2000 gold, not 2500+.
2. **Play limit:** Non-VIP user runs `!play` 6 times. Should be blocked on the 6th. VIP user runs 10+ times without block.
3. **Ranks reset:** Run `!resetranks confirmar` as owner. Confirm `!ranking` returns empty or zero results.
4. **Menus:** Run `!menu`, `!menufun`, `!menurpg`, `!menujogos` — verify consistent border style across all.
