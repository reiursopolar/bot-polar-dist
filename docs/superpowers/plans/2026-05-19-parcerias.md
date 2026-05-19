# Parcerias — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Melhorar o sistema de parcerias — renomear comandos, tornar limite obrigatório, aviso ao último link, auto-consulta `!minhaparceria` e `!parceiros` com uso atual.

**Architecture:** Quatro ficheiros são tocados em sequência: database → parcerias → admin.js → handler.js. Cada camada depende da anterior. O schema SQL não muda — apenas queries e lógica nova.

**Tech Stack:** Node.js ESM, better-sqlite3, Baileys (WhatsApp)

---

## File Map

| Ficheiro | O que muda |
|---|---|
| `src/database.js` | Nova query `lastShare` |
| `src/parcerias.js` | `checkShare` devolve `remaining`; nova `getStats` |
| `src/commands/admin.js` | Renomear `addparceiro`→`addparceria`, `rmparceiro`→`rmparceria`; `!parceiros` com uso; novo `!minhaparceria` |
| `src/handler.js` | Atualizar lista de comandos; lógica `remaining == 1` |
| `config/msgs/admin.json` | Atualizar keys e textos afetados |
| `src/commands/menus.js` | Atualizar menu de parcerias |

---

## Task 1 — `database.js`: adicionar `lastShare`

**Files:**
- Modify: `src/database.js` (secção parcerias ~linha 783)

- [ ] **Step 1: Adicionar a query `lastShare` logo após `stmtShareFirst`**

Localiza a linha:
```js
const stmtShareFirst   = db.prepare('SELECT MIN(timestamp) AS t FROM parcerias_shares WHERE grupo_id = ? AND user_num = ? AND timestamp > ?')
```

Adiciona imediatamente a seguir:
```js
const stmtShareLast    = db.prepare('SELECT MAX(timestamp) AS t FROM parcerias_shares WHERE grupo_id = ? AND user_num = ? AND timestamp > ?')
```

- [ ] **Step 2: Expor `lastShare` no objecto `parcerias`**

Localiza:
```js
  addShare(grupoId, num)         { stmtShareAdd.run(grupoId, num, Date.now()) },
```

Altera para:
```js
  addShare(grupoId, num)         { stmtShareAdd.run(grupoId, num, Date.now()) },
  lastShare(grupoId, num) {
    const since = Date.now() - 86_400_000
    return stmtShareLast.get(grupoId, num, since)?.t ?? null
  },
```

- [ ] **Step 3: Commit**

```bash
git add src/database.js
git commit -m "feat(parcerias): adicionar query lastShare"
```

---

## Task 2 — `parcerias.js`: `checkShare` com `remaining` + `getStats`

**Files:**
- Modify: `src/parcerias.js`

- [ ] **Step 1: Atualizar `checkShare` para devolver `remaining`**

Substitui a função `checkShare` completa:

```js
// Verificar e registar partilha
// Retorna { allowed, used, limite, remaining, resetIn }
export function checkShare(grupoId, jid) {
  const num   = norm(jid)
  const row   = db.get(grupoId, num)
  if (!row) return { allowed: false, used: 0, limite: 0, remaining: 0, resetIn: 0 }

  const limite = row.limite
  const used   = db.countShares(grupoId, num)

  if (used < limite) {
    db.addShare(grupoId, num)
    const remaining = limite - used - 1   // slots após este share
    return { allowed: true, used: used + 1, limite, remaining, resetIn: 0 }
  }

  // Limite esgotado — calcular quando o primeiro share expira
  const first   = db.firstShare(grupoId, num)
  const resetIn = first ? Math.max(0, first + 86_400_000 - Date.now()) : 0
  return { allowed: false, used, limite, remaining: 0, resetIn }
}
```

- [ ] **Step 2: Adicionar `getStats`**

Adiciona logo após `checkShare`:

```js
// Estatísticas do parceiro — sem registar share
// Retorna { used, limite, remaining, nextReset, fullReset }
// nextReset  = ms até o share mais antigo expirar (+1 slot disponível)
// fullReset  = ms até o share mais recente expirar (todos os slots livres)
export function getStats(grupoId, jid) {
  const num  = norm(jid)
  const row  = db.get(grupoId, num)
  if (!row) return null

  const limite    = row.limite
  const used      = db.countShares(grupoId, num)
  const remaining = Math.max(0, limite - used)
  const first     = db.firstShare(grupoId, num)
  const last      = db.lastShare(grupoId, num)
  const nextReset = first ? Math.max(0, first + 86_400_000 - Date.now()) : 0
  const fullReset = last  ? Math.max(0, last  + 86_400_000 - Date.now()) : 0

  return { used, limite, remaining, nextReset, fullReset }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/parcerias.js
git commit -m "feat(parcerias): checkShare devolve remaining; adicionar getStats"
```

---

## Task 3 — `config/msgs/admin.json`: atualizar textos

**Files:**
- Modify: `config/msgs/admin.json`

- [ ] **Step 1: Atualizar keys existentes**

Encontra e substitui os seguintes pares (chave → novo valor):

**`addparceiroUso`** → renomear referência no texto:
```json
"addparceiroUso": "❌ Ex: {prefix}addparceria @user/5",
```

**`addparceiroOk`** — sem alteração de conteúdo, funciona igual.

**`rmparceiroUso`** → renomear referência no texto:
```json
"rmparceiroUso": "❌ Ex: {prefix}rmparceria @user",
```

**`parceirosVazia`** → atualizar referência ao comando:
```json
"parceirosVazia": "❌ Nenhum parceiro configurado.\nUsa {prefix}addparceria @user/N para adicionar.",
```

**`parceriaStatus`** → atualizar referências aos comandos nas dicas:
```json
"parceriaStatus": "🤝 *Sistema de Parcerias*\n━━━━━━━━━━━━━━━━━━━━━\n\nStatus: {status}\nAdv automática: {autoAdv}\nParceiros: *{total}*\n\n_{prefix}parceria on/off — ativar/desativar_\n_{prefix}addparceria @user/N — adicionar parceiro_\n_{prefix}rmparceria @user — remover parceiro_\n_{prefix}parceiros — listar parceiros_\n_{prefix}advparceria on/off — advertência automática_",
```

- [ ] **Step 2: Adicionar novas keys no bloco de parcerias** (após `advparceriaDesativada`):

Nota: `parceirosList` já existe — não adicionar. Apenas as seguintes são novas:

```json
"addparceriaUsoObrigatorio": "❌ Indica o limite de divulgações por dia.\nEx: {prefix}addparceria @user/5",
"minhaparceriaNaoEs": "❌ Não és parceiro neste grupo.",
"minhaparceriaStats": "🤝 *A tua parceria*\n\n📊 Divulgações: *{used}/{limite}* hoje\n⏳ Próximo reset: em *{nextReset}*\n🔄 Reset completo: em *{fullReset}*",
"minhaparceriaLivre": "🤝 *A tua parceria*\n\n📊 Divulgações: *{used}/{limite}* hoje\n✅ Sem links nas últimas 24h — podes divulgar livremente!",
"parceriaUltimoLink": "⚠️ @{num}, última divulgação disponível hoje! Reset em *{resetIn}* ⌛"
```

- [ ] **Step 3: Commit**

```bash
git add config/msgs/admin.json
git commit -m "feat(parcerias): atualizar e adicionar textos de parcerias"
```

---

## Task 4 — `admin.js`: renomear comandos + `!minhaparceria` + `!parceiros` melhorado

**Files:**
- Modify: `src/commands/admin.js`

- [ ] **Step 1: Atualizar o import de `parcerias.js`**

Localiza:
```js
import {
  addParceiro, removeParceiro, listParceiros,
  isEnabled, setEnabled, isAutoAdv, setAutoAdv
} from '../parcerias.js'
```

Substitui por:
```js
import {
  addParceiro, removeParceiro, listParceiros,
  isEnabled, setEnabled, isAutoAdv, setAutoAdv,
  getStats, isParceiro,
} from '../parcerias.js'
```

- [ ] **Step 2: Renomear `case 'addparceiro'` → `case 'addparceria'` com limite obrigatório**

Substitui o bloco `case 'addparceiro'` completo:

```js
case 'addparceria': {
  if (!isAdmin) return reply(t('admin.addparceiroSoAdmins'))
  const alvosParc = mentioned.length ? mentioned : [resolveTarget(ctx)].filter(Boolean)
  if (!alvosParc.length) return reply(t('admin.addparceiroUso', { prefix }))

  // Aceita "@mention/5" e "@mention 5" — obrigatório
  const rawFull   = args.join(' ')
  const slashNum  = rawFull.match(/\/(\d+)/)
  const limiteArg = slashNum
    ? parseInt(slashNum[1], 10)
    : parseInt(args.find(a => /^\d+$/.test(a)) ?? '', 10)

  if (!limiteArg || limiteArg < 1) return reply(t('admin.addparceriaUsoObrigatorio', { prefix }))

  for (const jid of alvosParc) {
    addParceiro(from, jid, limiteArg)
  }
  const nomes = alvosParc.map(j => `@${resolveDisplay(j)}`).join(', ')
  reply(t('admin.addparceiroOk', { nomes, limite: limiteArg }), alvosParc)
  break
}
```

- [ ] **Step 3: Renomear `case 'rmparceiro'` → `case 'rmparceria'`**

Substitui `case 'rmparceiro':` por `case 'rmparceria':` (apenas o nome do case — o corpo fica igual).

Localiza:
```js
    case 'rmparceiro': {
```

Substitui por:
```js
    case 'rmparceria': {
```

Localiza também a linha de uso:
```js
      if (!alvosRmParc.length) return reply(t('admin.rmparceiroUso', { prefix }))
```
— fica igual (a key `rmparceiroUso` já foi atualizada no Task 3).

- [ ] **Step 4: Atualizar `case 'parceiros'` com uso atual**

Substitui o bloco `case 'parceiros'` completo:

```js
case 'parceiros': {
  if (!isAdmin) return reply(t('admin.parceirosSoAdmins'))
  const lista = listParceiros(from)
  if (!lista.length) return reply(t('admin.parceirosVazia', { prefix }))

  const linhas = lista.map((p, i) => {
    const stats = getStats(from, p.user_num)
    const used  = stats?.used ?? 0
    const resetTxt = (stats?.nextReset && stats.nextReset > 0)
      ? ` · reset em ${formatResetTime(stats.nextReset)}`
      : ''
    return `${i + 1}. +${resolveRawNum(p.user_num)} — *${p.limite}x*/dia · usado: *${used}*${resetTxt}`
  })

  reply(t('admin.parceirosList', {
    total: lista.length,
    lista: linhas.join('\n'),
  }))
  break
}
```

Note: `formatResetTime` já está importada do `parcerias.js` se não estiver, adiciona ao import do Step 1.

- [ ] **Step 5: Adicionar `case 'minhaparceria'`** — insere antes do `case 'advparceria'`:

```js
case 'minhaparceria': {
  if (!isGroup) return reply('❌ Este comando só funciona em grupos.')
  if (!isParceiro(from, sender)) return reply(t('admin.minhaparceriaNaoEs'))
  const st = getStats(from, sender)
  if (!st) return reply(t('admin.minhaparceriaNaoEs'))

  if (st.used === 0) {
    return reply(t('admin.minhaparceriaLivre', {
      used  : st.used,
      limite: st.limite,
    }))
  }
  reply(t('admin.minhaparceriaStats', {
    used     : st.used,
    limite   : st.limite,
    nextReset: st.nextReset > 0 ? formatResetTime(st.nextReset) : '< 1m',
    fullReset: st.fullReset > 0 ? formatResetTime(st.fullReset) : '< 1m',
  }))
  break
}
```

- [ ] **Step 6: Adicionar `formatResetTime` ao import de `parcerias.js`** (se não estiver já)

Confirma que o import do Step 1 inclui `formatResetTime`:
```js
import {
  addParceiro, removeParceiro, listParceiros,
  isEnabled, setEnabled, isAutoAdv, setAutoAdv,
  getStats, isParceiro, formatResetTime,
} from '../parcerias.js'
```

- [ ] **Step 7: Commit**

```bash
git add src/commands/admin.js
git commit -m "feat(parcerias): renomear comandos, limite obrigatório, !minhaparceria, !parceiros melhorado"
```

---

## Task 5 — `handler.js`: atualizar listas + aviso de último link

**Files:**
- Modify: `src/handler.js`

- [ ] **Step 1: Atualizar lista de comandos admin (linha ~110)**

Localiza:
```js
  'antisticker','autosticker','addparceiro','rmparceiro','parceiros','advparceria','marcos','x9',
```

Substitui por:
```js
  'antisticker','autosticker','addparceria','rmparceria','parceiros','minhaparceria','advparceria','marcos','x9',
```

- [ ] **Step 2: Verificar se `checkShare` e `formatResetTime` continuam importados**

Localiza a linha de import (já deve estar):
```js
import { isParceiro, isEnabled, isAutoAdv, setEnabled, setAutoAdv, checkShare, formatResetTime, GROUP_LINK_REGEX } from './parcerias.js'
```
— sem alterações necessárias.

- [ ] **Step 3: Adicionar aviso de último link após `allowed: true`**

Localiza o bloco (handler.js ~linha 784):
```js
      // Se allowed=true não faz nada — deixa a mensagem passar
```

Substitui esse comentário e o que vem a seguir (até ao `} else {`) por:

```js
      if (allowed && remaining === 1) {
        // Avisa que este foi o último link disponível hoje
        const first     = db.parcerias?.firstShare?.(from, senderNum)  // não usado directamente
        // calcular resetIn a partir do primeiro share activo
        const { resetIn: ri } = checkShareStats(from, sender)
        const resetTxt  = formatResetTime(ri > 0 ? ri : 86_400_000)
        await sendAndCapture(from, {
          text    : t('admin.parceriaUltimoLink', { num: senderNum, resetIn: resetTxt }),
          mentions: [senderM],
        })
      }
      // Se allowed=true deixa a mensagem passar
```

**Atenção:** A abordagem acima usa uma segunda chamada desnecessária. Em vez disso, simplifica: desestrutura `resetIn` do próprio `checkShare` — ele já o devolve quando `allowed: false`, mas para calcular o próximo reset quando `allowed: true` precisamos de `firstShare`. Usa a abordagem seguinte (mais simples):

Substitui a secção completa de parceiro em handler.js:

```js
  // ── Sistema de parcerias (links de convite WhatsApp) ─────────────────
  if (isGroup && GROUP_LINK_REGEX.test(body) && !isAdmin && isEnabled(from)) {
    if (isParceiro(from, sender)) {
      // Parceiro — verificar limite de 24h
      const { allowed, used, limite, remaining, resetIn } = checkShare(from, sender)
      if (!allowed) {
        try {
          await sock.sendMessage(from, {
            delete: { remoteJid: from, fromMe: false, id: msg.key.id, participant: sender }
          })
        } catch {}
        await sendAndCapture(from, {
          text    : `⏳ @${senderNum}, atingiste o teu limite de *${limite} divulgações* em 24h.\nPodes voltar a partilhar em *${formatResetTime(resetIn)}* ⌛`,
          mentions: [senderM]
        })
      } else if (remaining === 0) {
        // Este foi o último link disponível — avisar
        // O próximo reset = primeiro share activo + 24h
        // getStats devolve nextReset sem adicionar novo share
        const { nextReset } = getStats(from, sender) ?? { nextReset: 86_400_000 }
        await sendAndCapture(from, {
          text    : t('admin.parceriaUltimoLink', { num: senderNum, resetIn: formatResetTime(nextReset || 86_400_000) }),
          mentions: [senderM],
        })
      }
      // Se allowed=true e remaining>0 — silêncio
    } else {
      // Não é parceiro — apagar + alertar admins + adv opcional
      try {
        await sock.sendMessage(from, {
          delete: { remoteJid: from, fromMe: false, id: msg.key.id, participant: sender }
        })
      } catch {}
      const admins = cleanMentionJids(getAdmins(groupMeta))
      await sendAndCapture(from, {
        text    : `🚫 ${safeMentionTag(sender, msg.pushName)} tentou divulgar um link sem autorização.\n\n${admins.map(j => mentionText(j) || '').join(' ')}`,
        mentions: [cleanMentionJid(sender), ...admins]
      })
      if (isAutoAdv(from)) {
        const now    = new Date()
        const data   = now.toLocaleDateString('pt-BR')
        const hora   = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        const res    = addWarning(from, sender, 'Divulgação de link sem autorização')
        await sendAndCapture(from, { text: cardAviso(sender, res.total, res.max, 'Divulgação de link sem autorização', data, hora), mentions: [senderM] })
        if (res.atingiuMax && isBotAdmin) {
          await new Promise(r => setTimeout(r, 1500))
          await sendAndCapture(from, { text: cardBanimento(sender, 'Divulgação de link sem autorização', data, hora), mentions: [senderM] })
          await new Promise(r => setTimeout(r, 1000))
          await sock.groupParticipantsUpdate(from, [sender], 'remove')
        }
      }
    }
    return
  }
```

- [ ] **Step 4: Adicionar `getStats` ao import de `parcerias.js` em handler.js**

Localiza:
```js
import { isParceiro, isEnabled, isAutoAdv, setEnabled, setAutoAdv, checkShare, formatResetTime, GROUP_LINK_REGEX } from './parcerias.js'
```

Substitui por:
```js
import { isParceiro, isEnabled, isAutoAdv, setEnabled, setAutoAdv, checkShare, getStats, formatResetTime, GROUP_LINK_REGEX } from './parcerias.js'
```

- [ ] **Step 5: Verificar se `minhaparceria` precisa de estar em listas adicionais**

Confirma que `minhaparceria` não precisa estar em `ACOES_ADMIN` (qualquer membro parceiro pode usar). Não adicionar.

- [ ] **Step 6: Commit**

```bash
git add src/handler.js
git commit -m "feat(parcerias): aviso último link; getStats no handler; minhaparceria na lista de cmds"
```

---

## Task 6 — `menus.js`: atualizar menu de parcerias

**Files:**
- Modify: `src/commands/menus.js`

- [ ] **Step 1: Atualizar referências no menu admin**

Localiza:
```js
    cmd('parceria on/off / parceiros', 'Toggle/listar') +
    cmd('addparceiro / rmparceiro @u', 'Gerir') +
```

Substitui por:
```js
    cmd('parceria on/off / parceiros', 'Toggle/listar') +
    cmd('addparceria @u/N / rmparceria @u', 'Gerir') +
    cmd('minhaparceria', 'Ver os teus links restantes') +
```

- [ ] **Step 2: Commit**

```bash
git add src/commands/menus.js
git commit -m "feat(parcerias): atualizar menu admin"
```

---

## Task 7 — Push e verificação final

- [ ] **Step 1: Push para GitHub**

```bash
git push
```

- [ ] **Step 2: Verificação manual**

Testa os seguintes cenários no WhatsApp:

1. `!addparceria @u 5` → ✅ confirma com "5 divulgações/dia"
2. `!addparceria @u` (sem número) → ❌ mostra uso com exemplo `/N`
3. `!addparceria @u/10` → ✅ aceita sintaxe slash
4. `!rmparceria @u` → ✅ remove
5. `!parceiros` → lista com coluna "usado: X · reset em Yh"
6. Parceiro envia 4 links (limite=5): 4 em silêncio, 5.º dispara aviso "última divulgação"
7. Parceiro envia 6.º link: bot apaga + avisa limite
8. `!minhaparceria` como parceiro → mostra stats
9. `!minhaparceria` como não-parceiro → erro silencioso
