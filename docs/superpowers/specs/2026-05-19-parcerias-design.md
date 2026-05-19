# Sistema de Parcerias — Design Spec
**Data:** 2026-05-19  
**Âmbito:** Melhoria do sistema de parcerias por grupo

---

## Contexto

O sistema de parcerias permite que admins autorizem utilizadores específicos a divulgar links de grupos WhatsApp dentro de um grupo. Cada parceiro tem um limite de links por janela de 24h (rolling). A melhoria renomeia os comandos, torna o limite obrigatório e explícito, adiciona feedback ao parceiro quando lhe restar apenas 1 link, e adiciona um comando de auto-consulta (`!minhaparceria`).

---

## Comandos

### Gestão (admin)

| Comando | Sintaxe | Descrição |
|---|---|---|
| `!addparceria` | `!addparceria @mention/N` ou `!addparceria @mention N` | Adiciona ou atualiza parceiro com limite N links/dia (obrigatório). Atualiza o limite sem apagar o histórico de shares. |
| `!rmparceria` | `!rmparceria @mention` | Remove parceiro. |
| `!parceiros` | `!parceiros` | Lista parceiros do grupo com limite e uso atual. |
| `!parceria` | `!parceria on/off` | Ativa/desativa o sistema (sem alteração). |
| `!advparceria` | `!advparceria on/off` | Auto-adv por link não autorizado (sem alteração). |

**Aliases removidos:** `!addparceiro` e `!rmparceiro` são eliminados.

**Regra de limite:** Se `N` não for especificado, o bot responde com exemplo de uso. Não existe default de 3.

### Auto-consulta (parceiro)

| Comando | Quem usa | Descrição |
|---|---|---|
| `!minhaparceria` | Qualquer membro parceiro | Mostra links restantes e tempos de reset. Silencioso (só responde ao próprio) se não for parceiro. |

---

## Feedback de Links

### Parceiro envia link permitido

- **`remaining > 1`** após o share → silêncio (nenhuma mensagem).
- **`remaining == 1`** após o share → bot avisa no grupo:
  ```
  ⚠️ @fulano, última divulgação disponível hoje! Reset em *18h 30m* ⌛
  ```
  ("Reset em" = tempo até o share mais antigo expirar, abrindo +1 slot)

### Parceiro atingiu o limite

Comportamento existente mantido — apaga o link e avisa:
```
⏳ @fulano, atingiste o teu limite de *5 divulgações* em 24h. Volta em *6h* ⌛
```

### Não-parceiro envia link

Comportamento existente mantido — apaga, alerta admins, adv opcional.

---

## Saída dos Comandos

### `!minhaparceria`

```
🤝 *A tua parceria*

📊 Divulgações: 3/5 hoje
⏳ Próximo reset: em 8h 20m   ← quando o share mais antigo expira (+1 slot)
🔄 Reset completo: em 22h 10m ← quando todos os shares das últimas 24h expiram
```

Se o utilizador não for parceiro do grupo, o bot não responde (ou responde em privado com erro).

### `!parceiros` (melhorado)

```
🤝 *Parceiros — #NomeDoGrupo*

1. +351912345678 — 5/dia · usado: 3 · reset em 8h
2. +351987654321 — 10/dia · usado: 0
```

---

## Arquitetura

### Schema (sem alterações)

As tabelas `parcerias` e `parcerias_shares` existentes são suficientes.

```sql
parcerias        (grupo_id, user_num, limite)
parcerias_shares (id, grupo_id, user_num, timestamp)
```

### `src/database.js`

Nova query adicionada:
- `lastShare(grupoId, num)` → `SELECT MAX(timestamp)` das shares das últimas 24h. Usado para calcular `fullReset` (quando o share mais recente expira).

### `src/parcerias.js`

- `checkShare(grupoId, jid)` passa a retornar também `remaining` (slots restantes após este share).
- Nova função `getStats(grupoId, jid)` → `{ used, limite, remaining, nextReset, fullReset }`:
  - `nextReset` = `firstShare + 86_400_000 - Date.now()` (ms até o slot mais antigo abrir)
  - `fullReset` = `lastShare + 86_400_000 - Date.now()` (ms até todos os slots resetarem)

### `src/commands/admin.js`

- `case 'addparceiro'` → `case 'addparceria'`:
  - Parse `@mention/N` e `@mention N`
  - Limite obrigatório — sem fallback para 3
  - `addParceiro(from, jid, N)` já faz `INSERT OR REPLACE` → atualiza limite sem apagar histórico
- `case 'rmparceiro'` → `case 'rmparceria'`
- `case 'parceiros'` — usa `getStats` para mostrar uso atual por parceiro
- Novo `case 'minhaparceria'` — verifica se é parceiro, usa `getStats`, responde

### `src/handler.js`

- Listas de comandos: substituir `addparceiro`/`rmparceiro` por `addparceria`/`rmparceria`, adicionar `minhaparceria`.
- Após `checkShare` devolver `allowed: true`, verificar `remaining == 1` e enviar aviso.

---

## Fluxo de Dados — Link enviado por parceiro

```
Mensagem com link
      ↓
GROUP_LINK_REGEX.test(body) && isEnabled(from) && !isAdmin
      ↓
isParceiro(from, sender)? → não → apagar + alertar admins + adv opcional
      ↓ sim
checkShare(from, sender)
      ↓
allowed?
  não → apagar + avisar limite atingido
  sim → deixar passar
        remaining == 1? → avisar "última divulgação hoje"
```

---

## Casos Limite

- **Parceiro atualizado** (`!addparceria @mention 10` quando já era parceiro com limite 5): o `INSERT OR REPLACE` atualiza o limite. O histórico de shares mantém-se — o used count não é afetado.
- **`!minhaparceria` fora de grupo**: não aplicável (parcerias são por grupo); bot responde com erro.
- **Sem shares nas últimas 24h**: `nextReset` e `fullReset` retornam 0 → mostrar "sem divulgações hoje".
