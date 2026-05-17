# Bot Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar 4 melhorias independentes: cap diário VIP gold, limite play 5/dia, hard reset de ranks, e reformatação visual dos menus.

**Architecture:** Cada tarefa é isolada — ficheiros diferentes, sem dependências entre si. Ordem recomendada: Task 1 (mais simples) → Task 2 → Task 3 → Task 4 (menus, mais extensa).

**Tech Stack:** Node.js ESM, SQLite (better-sqlite3), WhatsApp Baileys

---

## Task 1: Play limit 5/day

**Files:**
- Modify: `src/commands/media.js:27-41`

- [ ] **Step 1: Alterar o limite de 10 para 5**

Em `src/commands/media.js`, função `checkMusicLimit`, substituir o bloco completo:

```js
// ANTES (linha ~27-41)
async function checkMusicLimit(ctx, reply) {
  const sNum = ctx.senderNum ?? ctx.sender?.split('@')[0]?.split(':')[0]
  const { vips: _vips, musicaUsoDB: _muDB } = await import('../database.js')
  if (_vips.isAtivo(sNum) || ctx.isOwner) return false
  const usos = _muDB.count(sNum)
  if (usos >= 10) {
    reply(
      `🎵 Atingiste o limite de *10 músicas por dia* para não-VIPs.\n\n` +
      `👑 *VIPs têm downloads ilimitados!*\n_Compra VIP: *${ctx.prefix}vip*_`
    )
    return true
  }
  _muDB.inc(sNum)
  return false
}

// DEPOIS
async function checkMusicLimit(ctx, reply) {
  const sNum = ctx.senderNum ?? ctx.sender?.split('@')[0]?.split(':')[0]
  const { vips: _vips, musicaUsoDB: _muDB } = await import('../database.js')
  if (_vips.isAtivo(sNum) || ctx.isOwner) return false
  const usos = _muDB.count(sNum)
  if (usos >= 5) {
    reply(
      `🎵 Atingiste o limite de *5 músicas por dia* para não-VIPs.\n\n` +
      `👑 *VIPs têm downloads ilimitados!*\n_Compra VIP: *${ctx.prefix}vip*_`
    )
    return true
  }
  _muDB.inc(sNum)
  return false
}
```

- [ ] **Step 2: Verificar que VIP continua isento**

Confirmar visualmente que a linha `if (_vips.isAtivo(sNum) || ctx.isOwner) return false` está ANTES do check de limite. Se estiver, está correto — VIP nunca chega ao `if (usos >= 5)`.

- [ ] **Step 3: Commit**

```bash
git add src/commands/media.js
git commit -m "fix: reduzir limite de play para 5/dia para não-VIPs"
```

---

## Task 2: VIP gold cap 2000/dia

**Files:**
- Modify: `src/sistemas.js:1-10` (topo do ficheiro, adicionar Map)
- Modify: `src/sistemas.js:148-173` (bloco VIP bónus diário)

- [ ] **Step 1: Adicionar Map de controlo no topo do ficheiro**

Em `src/sistemas.js`, após as importações (linha ~10), adicionar:

```js
// Cap diário de bónus VIP: máx 2000 moedas/dia (4 grupos)
const _vipBonusHoje = new Map()  // user_num → total recebido hoje
```

Nota: este Map vive em memória. Reseta automaticamente no restart do processo (que ocorre pelo menos uma vez por dia no deploy). Não precisa de persistência porque o bónus já é deduplicado por `vip_bonus:${grupoId}`.

- [ ] **Step 2: Atualizar o loop de distribuição VIP**

Em `src/sistemas.js`, substituir APENAS as linhas internas do loop + notificação (dentro do `if dentroJanela`). Substituir do `const bonusVip` até ao `marcarFeito` inclusive:

```js
// ANTES (linhas ~150-160, dentro do if dentroJanela)
  const bonusVip   = 500
  const vipsAtivos = vips.listAtivos()
  for (const v of vipsAtivos) {
    try { addCoins(v.user_num, bonusVip) } catch {}
  }
  if (vipsAtivos.length) {
    await sock.sendMessage(grupoId, {
      text: `👑 *Bónus VIP diário distribuído!*\n\n💰 *+${fmt(bonusVip)} moedas* para ${vipsAtivos.length} VIP(s)!\n_Bom dia a todos!_ 🌅`
    }).catch(() => null)
  }
  marcarFeito(chaveVipBonus, fuso)

// DEPOIS (substituição exata das mesmas linhas)
  const CAP_DIARIO = 2000
  const bonusVip   = 500
  const vipsAtivos = vips.listAtivos()
  let   receberam  = 0
  for (const v of vipsAtivos) {
    const jaRecebeu = _vipBonusHoje.get(v.user_num) ?? 0
    if (jaRecebeu >= CAP_DIARIO) continue
    try {
      addCoins(v.user_num, bonusVip)
      _vipBonusHoje.set(v.user_num, jaRecebeu + bonusVip)
      receberam++
    } catch {}
  }
  if (receberam > 0) {
    await sock.sendMessage(grupoId, {
      text: `👑 *Bónus VIP diário distribuído!*\n\n💰 *+${fmt(bonusVip)} moedas* para ${receberam} VIP(s)!\n_Bom dia a todos!_ 🌅`
    }).catch(() => null)
  }
  marcarFeito(chaveVipBonus, fuso)
```

O `if (dentroJanela...)`, a linha `const chaveVipBonus`, e o código de leilões após `marcarFeito` permanecem intactos.

- [ ] **Step 3: Confirmar lógica**

Verificar mentalmente:
- Bot em 5 grupos, VIP em todos → grupo 1 dá 500, grupo 2 dá 500, grupo 3 dá 500, grupo 4 dá 500, grupo 5 → `jaRecebeu = 2000 >= 2000` → skip ✓
- VIP ativo mas não no grupo → recebe na mesma (comportamento existente mantido — o bónus é global, não por presença) ✓
- Cap de 2000 em vez de ilimitado ✓

- [ ] **Step 4: Commit**

```bash
git add src/sistemas.js
git commit -m "fix: cap bónus VIP diário a 2000 moedas/dia (máx 4 grupos)"
```

---

## Task 3: Hard reset de ranks

**Files:**
- Modify: `src/rpg.js:368-370` (substituir `resetAllRankings` por `hardResetAllRankings`)
- Modify: `src/commands/owner.js` (adicionar case `resetranks`)

- [ ] **Step 1: Adicionar função `hardResetAllRankings` em rpg.js**

Em `src/rpg.js`, substituir a função `resetAllRankings` existente (linha ~368):

```js
// ANTES
export function resetAllRankings() {
  db.exec('UPDATE rpg_wallet SET coins = 0; UPDATE rpg_group_xp SET xp = 0, msgs = 0')
}

// DEPOIS — mantém resetAllRankings para compatibilidade, adiciona hardReset
export function resetAllRankings() {
  db.exec('UPDATE rpg_wallet SET coins = 0; UPDATE rpg_group_xp SET xp = 0, msgs = 0')
}

export function hardResetAllRankings() {
  db.prepare('DELETE FROM rpg_wallet').run()
  db.prepare('DELETE FROM rpg_group_xp').run()
  db.prepare('DELETE FROM rpg_profile').run()
  db.prepare('DELETE FROM rpg_cooldowns').run()
}
```

- [ ] **Step 2: Importar `hardResetAllRankings` em owner.js**

`src/commands/owner.js` não importa `../rpg.js` atualmente. Adicionar este import após as importações existentes (linha ~10):

```js
import { hardResetAllRankings } from '../rpg.js'
```

- [ ] **Step 3: Adicionar case `resetranks` em owner.js**

Em `src/commands/owner.js`, dentro do switch de `handleOwner`, adicionar (pode ser antes do `default:` ou após o `case 'restore':`):

```js
// ── Reset total de ranks ──────────────────────────────────
case 'resetranks': {
  if (q?.trim().toLowerCase() !== 'confirmar') {
    return reply(
      `⚠️ *Atenção!* Isto apaga TODOS os dados de RPG:\n` +
      `rpg_wallet · rpg_group_xp · rpg_profile · rpg_cooldowns\n\n` +
      `Para confirmar: *${prefix}resetranks confirmar*`
    )
  }
  hardResetAllRankings()
  reply(`✅ *Hard reset concluído.* Todos os dados de ranking foram apagados.`)
  break
}
```

- [ ] **Step 4: Executar o reset manualmente**

Enviar no WhatsApp (como dono do bot):
```
!resetranks confirmar
```

Confirmar que a resposta é: `✅ Hard reset concluído. Todos os dados de ranking foram apagados.`

- [ ] **Step 5: Verificar**

Enviar `!ranking` num grupo. Deve aparecer vazio ou mensagem de sem dados.

- [ ] **Step 6: Commit**

```bash
git add src/rpg.js src/commands/owner.js
git commit -m "feat: adicionar hardResetAllRankings e comando !resetranks confirmar"
```

---

## Task 4: Reformatação visual dos menus

**Files:**
- Modify: `src/commands/menus.js` (todos os helpers e funções de menu)

A estratégia é alterar os helpers `sec`, `cmd`, `fim` e adicionar um helper `header`. Cada função de menu tem o seu título substituído por `header(...)`. O conteúdo dos comandos não muda — só o estilo.

### Novos helpers

- [ ] **Step 1: Substituir os helpers visuais**

Em `src/commands/menus.js`, substituir as linhas dos helpers (atualmente linhas ~32-34):

```js
// ANTES
const sec = (emoji, titulo) => `\n${emoji} *${titulo}*\n`
const cmd = (comando, desc) => `  ${p()}${comando} — ${desc}\n`
const fim = () => ``

// DEPOIS
const header = (emoji, nome) =>
  `╔══════════════════════════╗\n║  ${emoji} *${nome}*\n╚══════════════════════════╝\n`

const sec = (emoji, titulo) =>
  `\n*${emoji} ${titulo}*\n${'─'.repeat(24)}\n`

const cmd = (comando, desc) =>
  `  › ${p()}${comando} → ${desc}\n`

const fim = () => ``
```

### menuPrincipal

- [ ] **Step 2: Atualizar menuPrincipal**

Substituir a função `menuPrincipal` completa:

```js
export function menuPrincipal(saudacao, senderJid, { totalUsers = 0, totalCmds = 0 } = {}) {
  const numero = resolveDisplay(senderJid)
  return (
    `╔══════════════════════════╗\n║  🤖 *${n()}*\n╚══════════════════════════╝\n\n` +
    `${saudacao}, @${numero}! 👋\n` +
    `👥 *${totalUsers.toLocaleString('pt-BR')}* membros  ·  ⚡ *${totalCmds}* cmds\n` +
    `${'─'.repeat(24)}\n\n` +
    `*📂 CATEGORIAS*\n` +
    `  🛡️ \`${p()}menuadmin\` → Moderação\n` +
    `  🚀 \`${p()}menusistemas\` → Sistemas\n` +
    `  🎮 \`${p()}menufun\` → Diversão\n` +
    `  💕 \`${p()}menuamor\` → Amor & casais\n` +
    `  🎯 \`${p()}menujogos\` → Jogos\n` +
    `  ⚔️ \`${p()}menurpg\` → Economia/RPG\n` +
    `  🤖 \`${p()}menuia\` → IA\n` +
    `  📥 \`${p()}menumedia\` → Downloads\n` +
    `  🌍 \`${p()}menumundo\` → Mundo real\n` +
    `  🏪 \`${p()}menuloja\` → Loja\n` +
    `  👑 \`${p()}menuvip\` → VIP\n` +
    `${'─'.repeat(24)}\n` +
    `ℹ️ \`${p()}info\`  🏓 \`${p()}ping\`  👤 \`${p()}dono\`\n` +
    `_prefixo: *${p()}*_`
  )
}
```

### menuAdmin

- [ ] **Step 3: Atualizar menuAdmin**

Substituir a primeira linha do return de `menuAdmin`:

```js
// ANTES
`🛡️ *ADMINISTRAÇÃO*\n` +

// DEPOIS
header('🛡️', 'ADMINISTRAÇÃO') +
```

### menuBemVindo

- [ ] **Step 4: Atualizar menuBemVindo**

```js
// ANTES
`👋 *BEM-VINDO & SAÍDA*\n` +

// DEPOIS
header('👋', 'BEM-VINDO & SAÍDA') +
```

### menuAdvertencias

- [ ] **Step 5: Atualizar menuAdvertencias**

```js
// ANTES
`⚠️ *ADVERTÊNCIAS*\n` +

// DEPOIS
header('⚠️', 'ADVERTÊNCIAS') +
```

### menuFun

- [ ] **Step 6: Atualizar menuFun**

```js
// ANTES
`🎮 *BRINCADEIRAS*\n` +

// DEPOIS
header('🎮', 'BRINCADEIRAS') +
```

### menuIA

- [ ] **Step 7: Atualizar menuIA**

```js
// ANTES
`🤖 *INTELIGÊNCIA ARTIFICIAL*\n` +

// DEPOIS
header('🤖', 'INTELIGÊNCIA ARTIFICIAL') +
```

### menuMedia

- [ ] **Step 8: Atualizar menuMedia**

```js
// ANTES
`📥 *DOWNLOADS & MEDIA*\n` +

// DEPOIS
header('📥', 'DOWNLOADS & MEDIA') +
```

### menuLoja

- [ ] **Step 9: Atualizar menuLoja**

```js
// ANTES
`🏪 *LOJA*\n` +

// DEPOIS
header('🏪', 'LOJA') +
```

### menuSistemas

- [ ] **Step 10: Atualizar menuSistemas**

```js
// ANTES
`🚀 *SISTEMAS AVANÇADOS*\n` +

// DEPOIS
header('🚀', 'SISTEMAS AVANÇADOS') +
```

### menuMundo

- [ ] **Step 11: Atualizar menuMundo**

```js
// ANTES
`🌍 *MUNDO REAL*\n` +

// DEPOIS
header('🌍', 'MUNDO REAL') +
```

### menuJogos

- [ ] **Step 12: Atualizar menuJogos**

```js
// ANTES
`🎯 *JOGOS & DIVERSÃO*\n` +

// DEPOIS
header('🎯', 'JOGOS & DIVERSÃO') +
```

### menuAmor

- [ ] **Step 13: Atualizar menuAmor**

```js
// ANTES
`💕 *AMOR & RELACIONAMENTOS*\n` +

// DEPOIS
header('💕', 'AMOR & RELACIONAMENTOS') +
```

### menuRpg

- [ ] **Step 14: Atualizar menuRpg**

```js
// ANTES
`⚔️ *ECONOMIA & RPG*\n` +

// DEPOIS
header('⚔️', 'ECONOMIA & RPG') +
```

### menuVip

- [ ] **Step 15: Atualizar menuVip**

```js
// ANTES
`👑 *MENU VIP*\n` +

// DEPOIS
header('👑', 'MENU VIP') +
```

### menuDono

- [ ] **Step 16: Atualizar menuDono**

```js
// ANTES
`👑 *PAINEL DO DONO*\n` +

// DEPOIS
header('👑', 'PAINEL DO DONO') +
```

### Verificar e commit

- [ ] **Step 17: Verificar formatação**

Testar com `!menu`, `!menufun`, `!menurpg`, `!menuadmin`. Confirmar:
- Cada menu tem o header box `╔══╗`
- Cada secção tem título em bold + linha `────────────────────────`
- Comandos usam `› !cmd → descrição` consistentemente

- [ ] **Step 18: Commit**

```bash
git add src/commands/menus.js
git commit -m "style: reformatar visual dos menus com headers e secções consistentes"
```

---

## Verificação final

- [ ] `!play` 6x como não-VIP → bloqueado na 6ª
- [ ] `!play` 10x como VIP → sempre funciona
- [ ] Aguardar meia-noite (ou forçar scheduler) com bot em 5+ grupos → VIP recebe exatamente 2000 moedas
- [ ] `!resetranks confirmar` (como dono) → confirmação + `!ranking` retorna vazio
- [ ] `!menu`, `!menufun`, `!menuadmin`, `!menurpg` → visual consistente em todos
