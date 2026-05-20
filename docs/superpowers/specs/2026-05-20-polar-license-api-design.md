# Polar License API — Design Spec

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Substituir o GitHub Gist por uma API própria em Cloudflare Workers + KV, com painel web para gestão completa de licenças.

**Architecture:** Cloudflare Worker serve tanto a API REST (chamada pelo bot) como o painel HTML. Autenticação dupla: HMAC-SHA256 para o bot, cookie assinado para o dashboard. Dados guardados em Cloudflare KV.

**Tech Stack:** Cloudflare Workers (JavaScript ESM), Cloudflare KV, Wrangler CLI, sem frameworks.

---

## 1. Repositório

Projecto separado do bot: `polar-license-api/` (nova pasta fora do bot, ou repo próprio).

```
polar-license-api/
  src/
    index.js       — router principal (fetch handler)
    auth.js        — HMAC verify (pedidos do bot) + cookie auth (dashboard)
    keys.js        — geração e validação de chaves POLAR-...
    kv.js          — operações no Cloudflare KV
    dashboard.js   — HTML do painel + handlers de formulário
  wrangler.toml    — bindings KV, variáveis de ambiente
  package.json
```

---

## 2. Variáveis de Ambiente (Cloudflare Secrets)

| Variável | Descrição |
|---|---|
| `HMAC_SECRET` | Igual ao `_SECRET` do bot (`p0l4r_lic_k3y_XZ9_2025mz`) — assina chaves POLAR-... e autentica pedidos do bot |
| `DASHBOARD_PASSWORD` | Palavra-passe do painel web |

---

## 3. Cloudflare KV

Namespace: `POLAR_LICENSES`

| Chave KV | Valor |
|---|---|
| `lic:{keyId}` | JSON com todos os campos da licença |
| `idx:all` | JSON array de keyIds `["abc1", "abc2", ...]` |

**Estrutura de uma licença:**
```json
{
  "keyId": "a1b2c3d4",
  "key": "POLAR-...",
  "cliente": "ZeNeves",
  "botPhone": "5511999888777",
  "criadaEm": "2025-01-01T00:00:00Z",
  "expiresAt": "2025-02-01T00:00:00Z",
  "diasTotal": 30,
  "activatedAt": "2025-01-02T00:00:00Z",
  "lastSeen": "2025-01-10T00:00:00Z",
  "revogada": false,
  "revokedAt": null,
  "fraude": null,
  "phoneReset": null
}
```

---

## 4. Endpoints da API (Bot → Worker)

Todos requerem headers:
- `X-Polar-Sig: HMAC-SHA256(method+path+timestamp+body, HMAC_SECRET)`
- `X-Polar-Ts: {unix timestamp ms}`

O servidor rejeita se `|now - ts| > 300_000` (5 min) — anti-replay.

### `GET /api/license/:keyId`
Retorna a licença ou `null`.

**Response 200:**
```json
{ "keyId": "...", "cliente": "...", "botPhone": "...", "revogada": false, ... }
```
**Response 404:** `{ "error": "not_found" }`

### `POST /api/license/:keyId`
Cria registo (chamado por `registrarChaveGerada`). Ignora se já existe.

**Body:**
```json
{ "key": "POLAR-...", "cliente": "ZeNeves", "criadaEm": "...", "expiresAt": "...", "diasTotal": 30 }
```

### `PATCH /api/license/:keyId`
Atualização parcial — aceita qualquer subconjunto dos campos da licença.

**Exemplos de uso:**
```json
{ "lastSeen": "...", "botPhone": "5511..." }          // primeiro registo / lastSeen
{ "revogada": true, "revokedAt": "...", "fraude": {...} }  // revogar
{ "botPhone": null, "phoneReset": "...", "revogada": false, "fraude": null }  // reset phone
{ "expiresAt": "...", "diasTotal": 30 }               // preencher expiresAt em entradas antigas
```

### `GET /api/licenses`
Lista todas as licenças (array).

**Response 200:** `[{ ...licença }, ...]`

---

## 5. Dashboard Web

### Acesso
`GET /dashboard` → se sem cookie válido, redireciona para `/dashboard/login`.

### Login
`GET /dashboard/login` → formulário HTML.
`POST /dashboard/login` → verifica `DASHBOARD_PASSWORD`. Se ok, define cookie:
```
polar_session=HMAC-SHA256(password+timestamp, HMAC_SECRET); HttpOnly; Secure; SameSite=Strict; Max-Age=86400
```

### Painel principal (`GET /dashboard`)
Tabela com TODAS as colunas:

| Cliente | Bot Phone | Estado | Dias Rest. | Expira | Criada | Ativada | Último Acesso | Key ID | Chave POLAR | Fraude | Ações |
|---|---|---|---|---|---|---|---|---|---|---|---|

Estados: `✅ Ativa` / `⏳ Aguardando` / `🔴 Expirada` / `❌ Revogada`

Formulário "Nova Licença" no topo:
- Input: Nome do cliente
- Input: Dias (default 30)
- Submit → cria chave, mostra resultado com a chave `POLAR-...` para copiar

### Ações
`POST /dashboard/action` com body form:
- `action=revoke&keyId=abc1` → marca revogada
- `action=reset-phone&keyId=abc1` → limpa botPhone, limpa fraude, desmarca revogada
- `action=create&cliente=ZeNeves&dias=30` → gera POLAR-..., guarda em KV, retorna chave

---

## 6. Geração de Chaves no Worker (`src/keys.js`)

Mesma lógica do bot (portável 1:1):

```js
// Payload: { exp, cliente, id }
// Sig: HMAC-SHA256(payload_base64url, HMAC_SECRET).slice(0, 24)
// Key: `POLAR-${payload}.${sig}`
function gerarChave(dias, cliente, secret)
function validarChave(key, secret) → { valida, keyId, cliente, expira, diasRestantes }
```

---

## 7. Mudanças no Bot (`src/licenca.js`)

### Remover
- `_GT` (GitHub PAT) — desaparece completamente
- `_GI` (Gist ID)
- `_GF` (nome do ficheiro Gist)
- `_lerRegistro()` e `_escreverRegistro()`

### Adicionar
```js
const _API_URL = 'https://polar-license-api.<subdomain>.workers.dev'

async function _apiCall(method, path, body = null) {
  const ts  = Date.now().toString()
  const bod = body ? JSON.stringify(body) : ''
  const sig = HMAC-SHA256(method + path + ts + bod, _SECRET)
  return fetch(_API_URL + path, {
    method,
    headers: { 'X-Polar-Sig': sig, 'X-Polar-Ts': ts, 'Content-Type': 'application/json' },
    body: bod || undefined,
  })
}
```

### Refactor por função

| Função actual | Nova implementação |
|---|---|
| `verificarLicencaOnline` | `GET /api/license/:keyId` + `PATCH /api/license/:keyId` |
| `registrarChaveGerada` | `POST /api/license/:keyId` |
| `listarLicencas` | `GET /api/licenses` |
| `revogarChave` | `PATCH /api/license/:keyId` `{revogada: true, revokedAt}` |
| `resetarBotPhone` | `PATCH /api/license/:keyId` `{botPhone: null, phoneReset, revogada: false, fraude: null}` |

---

## 8. Migração do Gist

Endpoint temporário no Worker (remover após usar):
`POST /admin/migrate` com body `{ gistContent: {...} }` → importa registo do Gist para KV.

Alternativa: copiar JSON do Gist para o KV via Cloudflare Dashboard (editar KV manualmente).

---

## 9. Deploy

```bash
# Instalar wrangler
npm install -g wrangler
wrangler login

# Criar KV namespace
wrangler kv:namespace create POLAR_LICENSES

# Configurar secrets
wrangler secret put HMAC_SECRET
wrangler secret put DASHBOARD_PASSWORD

# Deploy
wrangler deploy
```

URL resultante: `https://polar-license-api.<account>.workers.dev`
Colocar essa URL em `_API_URL` no `src/licenca.js` do bot.

---

## 10. Segurança — Resumo

| Vector | Antes (Gist) | Depois (Worker) |
|---|---|---|
| PAT GitHub no código | ✅ presente (risco alto) | ❌ removido |
| Modificar registo sem auth | Possível com PAT extraído | Impossível (HMAC + timestamp) |
| Replay attacks | Sem proteção | Timestamp 5min window |
| Rate limiting | Nenhum | Cloudflare automático |
| Audit log | Nenhum | Cloudflare Workers logs |
