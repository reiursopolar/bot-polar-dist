# Polar License API — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar uma API Cloudflare Workers + KV que substitui o GitHub Gist como backend de licenças, com painel web completo para gestão, e actualizar o bot para usar a nova API.

**Architecture:** Cloudflare Worker (ESM) com router interno. API REST autenticada por HMAC-SHA256 para o bot. Dashboard HTML servido pelo próprio Worker, protegido por cookie assinado. KV armazena cada licença como entrada individual.

**Tech Stack:** Cloudflare Workers, Cloudflare KV, Wrangler CLI v3, Vitest (unit tests das funções puras), Node.js 20+ no bot.

---

## Mapa de Ficheiros

**Criados (nova pasta `polar-license-api/` dentro do repo do bot):**
- `polar-license-api/package.json`
- `polar-license-api/wrangler.toml`
- `polar-license-api/src/keys.js` — geração/validação de chaves POLAR-...
- `polar-license-api/src/kv.js` — operações no Cloudflare KV
- `polar-license-api/src/auth.js` — HMAC verify + cookie auth
- `polar-license-api/src/dashboard.js` — HTML do painel + handlers
- `polar-license-api/src/index.js` — router principal (fetch handler)
- `polar-license-api/test/keys.test.js` — unit tests

**Modificados (bot):**
- `src/licenca.js` — substituir Gist por chamadas à API

---

## Task 1: Scaffold do projecto Worker

**Files:**
- Create: `polar-license-api/package.json`
- Create: `polar-license-api/wrangler.toml`

- [ ] **Step 1: Criar a pasta**

```bash
mkdir -p polar-license-api/src polar-license-api/test
```

- [ ] **Step 2: Criar `polar-license-api/package.json`**

```json
{
  "name": "polar-license-api",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run"
  },
  "devDependencies": {
    "wrangler": "^3.60.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 3: Criar `polar-license-api/wrangler.toml`**

```toml
name = "polar-license-api"
main = "src/index.js"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]

[[kv_namespaces]]
binding = "POLAR_LICENSES"
id = "FILL_AFTER_CREATE"
preview_id = "FILL_AFTER_CREATE"

# Secrets configurados via: wrangler secret put HMAC_SECRET
# Secrets configurados via: wrangler secret put DASHBOARD_PASSWORD
```

- [ ] **Step 4: Instalar dependências**

```bash
cd polar-license-api && npm install
```

Esperado: `node_modules/` criado, wrangler disponível.

- [ ] **Step 5: Commit**

```bash
git add polar-license-api/package.json polar-license-api/wrangler.toml polar-license-api/package-lock.json
git commit -m "feat: scaffold polar-license-api (wrangler + package.json)"
```

---

## Task 2: `src/keys.js` — Geração e Validação de Chaves

A lógica de chaves tem de ser **bit-a-bit compatível** com o bot (`src/licenca.js`).
O bot usa `Buffer` (Node.js). O Worker usa Web Crypto API + `TextEncoder`.
O encoding é `base64url` standard (RFC 4648): `+`→`-`, `/`→`_`, `=` removido.

**Files:**
- Create: `polar-license-api/src/keys.js`
- Create: `polar-license-api/test/keys.test.js`

- [ ] **Step 1: Escrever `polar-license-api/src/keys.js`**

```js
// src/keys.js — geração e validação de chaves POLAR-...
// Compatível bit-a-bit com src/licenca.js do bot (mesmo formato base64url + HMAC)

async function hmacHex(secret, data) {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  )
  const buf = await crypto.subtle.sign('HMAC', key, enc.encode(data))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

function toBase64url(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64url(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
  const pad = b64 + '='.repeat((4 - b64.length % 4) % 4)
  return Uint8Array.from(atob(pad), c => c.charCodeAt(0))
}

function randomHex(bytes) {
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  return [...arr].map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function gerarChave(dias, cliente, secret) {
  const exp     = Date.now() + dias * 24 * 60 * 60 * 1000
  const id      = randomHex(4)
  const json    = JSON.stringify({ exp, cliente, id })
  const payload = toBase64url(new TextEncoder().encode(json))
  const sig     = (await hmacHex(secret, payload)).slice(0, 24)
  return { key: `POLAR-${payload}.${sig}`, keyId: id, exp }
}

export async function validarChave(key, secret) {
  if (!key?.startsWith('POLAR-')) return { valida: false, motivo: 'formato inválido' }
  const rest   = key.slice(6)
  const dotIdx = rest.lastIndexOf('.')
  if (dotIdx === -1) return { valida: false, motivo: 'formato inválido' }
  const payload  = rest.slice(0, dotIdx)
  const sig      = rest.slice(dotIdx + 1)
  const expected = (await hmacHex(secret, payload)).slice(0, 24)
  if (sig !== expected) return { valida: false, motivo: 'chave inválida ou modificada' }
  try {
    const { exp, cliente, id } = JSON.parse(new TextDecoder().decode(fromBase64url(payload)))
    if (Date.now() > exp) return { valida: false, motivo: 'chave expirada' }
    const diasRestantes = Math.ceil((exp - Date.now()) / 86_400_000)
    return { valida: true, cliente, expira: new Date(exp).toISOString(), diasRestantes, keyId: id }
  } catch {
    return { valida: false, motivo: 'chave corrompida' }
  }
}
```

- [ ] **Step 2: Escrever `polar-license-api/test/keys.test.js`**

```js
import { describe, it, expect } from 'vitest'
import { gerarChave, validarChave } from '../src/keys.js'

const SECRET = 'test-secret-123'

describe('gerarChave', () => {
  it('gera chave com prefixo POLAR-', async () => {
    const { key } = await gerarChave(30, 'TestCliente', SECRET)
    expect(key).toMatch(/^POLAR-[A-Za-z0-9_-]+\.[a-f0-9]{24}$/)
  })

  it('keyId tem 8 chars hex', async () => {
    const { keyId } = await gerarChave(30, 'x', SECRET)
    expect(keyId).toMatch(/^[a-f0-9]{8}$/)
  })
})

describe('validarChave', () => {
  it('valida chave gerada', async () => {
    const { key } = await gerarChave(30, 'Ze', SECRET)
    const r = await validarChave(key, SECRET)
    expect(r.valida).toBe(true)
    expect(r.cliente).toBe('Ze')
    expect(r.diasRestantes).toBeGreaterThan(28)
  })

  it('rejeita chave com secret errado', async () => {
    const { key } = await gerarChave(30, 'Ze', SECRET)
    const r = await validarChave(key, 'wrong-secret')
    expect(r.valida).toBe(false)
    expect(r.motivo).toBe('chave inválida ou modificada')
  })

  it('rejeita chave adulterada', async () => {
    const { key } = await gerarChave(30, 'Ze', SECRET)
    const tampered = key.slice(0, -4) + 'xxxx'
    const r = await validarChave(tampered, SECRET)
    expect(r.valida).toBe(false)
  })

  it('rejeita formato inválido', async () => {
    const r = await validarChave('nao-e-uma-chave', SECRET)
    expect(r.valida).toBe(false)
    expect(r.motivo).toBe('formato inválido')
  })

  it('aceita cliente com caracteres Unicode', async () => {
    const { key } = await gerarChave(7, 'João & Ângela', SECRET)
    const r = await validarChave(key, SECRET)
    expect(r.valida).toBe(true)
    expect(r.cliente).toBe('João & Ângela')
  })
})
```

- [ ] **Step 3: Correr os testes**

```bash
cd polar-license-api && npm test
```

Esperado: 6 testes a passar (verde). Se algum falhar, verificar a lógica de base64url em `fromBase64url`.

- [ ] **Step 4: Commit**

```bash
git add polar-license-api/src/keys.js polar-license-api/test/keys.test.js
git commit -m "feat: keys.js — geração e validação de chaves POLAR- (Worker-compatible)"
```

---

## Task 3: `src/kv.js` — Operações no Cloudflare KV

**Files:**
- Create: `polar-license-api/src/kv.js`

- [ ] **Step 1: Escrever `polar-license-api/src/kv.js`**

```js
// src/kv.js — operações no Cloudflare KV (namespace POLAR_LICENSES)

async function getIndex(kv) {
  const val = await kv.get('idx:all')
  return val ? JSON.parse(val) : []
}

async function setIndex(kv, idx) {
  await kv.put('idx:all', JSON.stringify(idx))
}

export async function getLicense(kv, keyId) {
  const val = await kv.get(`lic:${keyId}`)
  return val ? JSON.parse(val) : null
}

export async function createLicense(kv, keyId, data) {
  const existing = await getLicense(kv, keyId)
  if (existing) return existing   // idempotente — ignora se já existe
  const record = { keyId, ...data }
  await kv.put(`lic:${keyId}`, JSON.stringify(record))
  const idx = await getIndex(kv)
  if (!idx.includes(keyId)) {
    idx.unshift(keyId)   // mais recentes primeiro
    await setIndex(kv, idx)
  }
  return record
}

export async function patchLicense(kv, keyId, updates) {
  const existing = await getLicense(kv, keyId)
  if (!existing) return null
  const updated = { ...existing, ...updates }
  await kv.put(`lic:${keyId}`, JSON.stringify(updated))
  return updated
}

export async function getAllLicenses(kv) {
  const idx = await getIndex(kv)
  if (!idx.length) return []
  const entries = await Promise.all(idx.map(id => getLicense(kv, id)))
  return entries.filter(Boolean)
}
```

- [ ] **Step 2: Commit**

```bash
git add polar-license-api/src/kv.js
git commit -m "feat: kv.js — operações no Cloudflare KV (getLicense, create, patch, list)"
```

---

## Task 4: `src/auth.js` — Autenticação HMAC e Cookie

**Files:**
- Create: `polar-license-api/src/auth.js`

- [ ] **Step 1: Escrever `polar-license-api/src/auth.js`**

```js
// src/auth.js — verificação HMAC para bot + cookie para dashboard

async function hmacHex(secret, data) {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  )
  const buf = await crypto.subtle.sign('HMAC', key, enc.encode(data))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

// ── Autenticação do bot (HMAC-SHA256) ─────────────────────────────────
// O bot envia:  X-Polar-Sig: hmac(method + path + timestamp + body, SECRET)
//               X-Polar-Ts:  timestamp em ms
// Janela anti-replay: 5 minutos.
export async function verifyBotRequest(request, secret) {
  const sig = request.headers.get('X-Polar-Sig')
  const ts  = request.headers.get('X-Polar-Ts')
  if (!sig || !ts) return false
  if (Math.abs(Date.now() - parseInt(ts, 10)) > 300_000) return false
  const body     = await request.clone().text()
  const url      = new URL(request.url)
  const data     = request.method + url.pathname + ts + body
  const expected = await hmacHex(secret, data)
  return sig === expected
}

// ── Autenticação do dashboard (cookie assinado) ───────────────────────
function parseCookies(header) {
  const out = {}
  for (const part of (header ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k) out[k.trim()] = v.join('=').trim()
  }
  return out
}

export async function verifyDashboardCookie(request, secret, password) {
  const cookies  = parseCookies(request.headers.get('Cookie'))
  const session  = cookies['polar_session']
  if (!session) return false
  const expected = (await hmacHex(secret, password)).slice(0, 32)
  return session === expected
}

export async function makeSessionCookie(secret, password) {
  const val = (await hmacHex(secret, password)).slice(0, 32)
  return `polar_session=${val}; HttpOnly; Secure; SameSite=Strict; Max-Age=86400; Path=/dashboard`
}
```

- [ ] **Step 2: Commit**

```bash
git add polar-license-api/src/auth.js
git commit -m "feat: auth.js — HMAC bot auth + cookie dashboard auth"
```

---

## Task 5: `src/dashboard.js` — Painel HTML

**Files:**
- Create: `polar-license-api/src/dashboard.js`

- [ ] **Step 1: Escrever `polar-license-api/src/dashboard.js`**

```js
// src/dashboard.js — HTML do painel de gestão de licenças

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function htmlRes(content, status = 200, extraHeaders = {}) {
  return new Response(content, {
    status,
    headers: { 'Content-Type': 'text/html;charset=utf-8', ...extraHeaders }
  })
}

const CSS = `
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:monospace;background:#0a0a0a;color:#e0e0e0;padding:24px;font-size:13px}
  h1{color:#00cfff;margin-bottom:20px;font-size:18px}
  .card{background:#111;border:1px solid #2a2a2a;border-radius:8px;padding:16px;margin-bottom:20px}
  .card h2{color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px}
  .row{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap}
  label{display:block;color:#666;font-size:11px;margin-bottom:4px}
  input[type=text],input[type=number],input[type=password]{
    background:#1a1a1a;border:1px solid #333;color:#e0e0e0;
    padding:7px 10px;border-radius:4px;font-family:monospace;font-size:12px}
  .btn{background:#00cfff;color:#000;border:none;padding:8px 16px;border-radius:4px;
    cursor:pointer;font-weight:bold;font-size:12px;white-space:nowrap}
  .btn:hover{background:#00b8e0}
  .btn-sm{background:#1e1e2e;color:#ccc;border:1px solid #333;padding:3px 8px;
    border-radius:3px;cursor:pointer;font-size:11px}
  .btn-sm:hover{background:#2a2a3e}
  .btn-sm:disabled{opacity:.4;cursor:default}
  .btn-danger{background:#2a0a0a;color:#ff6b6b;border-color:#5a1a1a}
  table{width:100%;border-collapse:collapse;font-size:11px}
  th{background:#141420;color:#00cfff;padding:8px 6px;text-align:left;
    border-bottom:2px solid #222;white-space:nowrap}
  td{padding:6px;border-bottom:1px solid #1a1a1a;vertical-align:top}
  tr:hover td{background:#111}
  code{background:#1a1a1a;padding:1px 4px;border-radius:3px;font-size:10px}
  .tag{display:inline-block;padding:2px 6px;border-radius:10px;font-size:10px;font-weight:bold}
  .tag-ok{background:#0d2b1a;color:#5f9}
  .tag-wait{background:#1a1a0a;color:#cc9}
  .tag-exp{background:#2a0a0a;color:#f66}
  .tag-rev{background:#1a0a1a;color:#c6f}
  .tag-fraud{background:#2a1a0a;color:#fa0}
  .result{background:#0d2b1a;border:1px solid #2a6040;color:#5f9;padding:12px;
    border-radius:6px;margin-bottom:16px;word-break:break-all;line-height:1.6}
  .login-wrap{display:flex;align-items:center;justify-content:center;min-height:100vh}
  .login-box{background:#111;border:1px solid #2a2a2a;padding:32px;border-radius:8px;width:320px}
  .login-box h2{color:#00cfff;margin-bottom:20px}
  .err{color:#ff4444;margin-bottom:12px;font-size:12px}
  .mono-sm{font-size:10px;word-break:break-all;max-width:200px}
`

export function loginPage(error = '') {
  return htmlRes(`<!DOCTYPE html><html><head><meta charset=utf-8><title>Polar Licenses</title>
<style>${CSS}</style></head><body>
<div class="login-wrap"><div class="login-box">
  <h2>🔑 Polar Licenses</h2>
  ${error ? `<div class="err">${esc(error)}</div>` : ''}
  <form method="POST" action="/dashboard/login">
    <div style="margin-bottom:12px">
      <label>Palavra-passe</label>
      <input type="password" name="password" style="width:100%" autofocus required>
    </div>
    <button type="submit" class="btn" style="width:100%">Entrar</button>
  </form>
</div></div></body></html>`)
}

export function dashboardPage(licenses, flash = '') {
  const now = Date.now()

  function estado(lic) {
    if (lic.revogada)   return ['tag-rev',  '❌ Revogada']
    if (!lic.botPhone)  return ['tag-wait', '⏳ Aguardando']
    if (!lic.expiresAt) return ['tag-ok',   '✅ Ativa']
    if (now > new Date(lic.expiresAt).getTime()) return ['tag-exp', '🔴 Expirada']
    return ['tag-ok', '✅ Ativa']
  }

  function dias(lic) {
    if (!lic.expiresAt) return '—'
    const d = Math.ceil((new Date(lic.expiresAt).getTime() - now) / 86_400_000)
    return d > 0 ? `${d}d` : 'Expirada'
  }

  function dt(iso) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('pt-BR')
  }

  const rows = licenses.map(lic => {
    const [cls, label] = estado(lic)
    const fraude = lic.fraude
      ? `<span class="tag tag-fraud" title="Original: +${esc(lic.fraude.botOriginal)}">⚠️ +${esc(lic.fraude.botPirata)}</span>`
      : '—'
    return `<tr>
      <td><b>${esc(lic.cliente)}</b></td>
      <td>${lic.botPhone ? `+${esc(lic.botPhone)}` : '—'}</td>
      <td><span class="tag ${cls}">${label}</span></td>
      <td>${dias(lic)}</td>
      <td>${dt(lic.expiresAt)}</td>
      <td>${dt(lic.criadaEm)}</td>
      <td>${dt(lic.activatedAt)}</td>
      <td>${dt(lic.lastSeen)}</td>
      <td><code>${esc(lic.keyId)}</code></td>
      <td class="mono-sm">${esc(lic.key ?? '—')}</td>
      <td>${fraude}</td>
      <td style="white-space:nowrap">
        <form method="POST" action="/dashboard/action" style="display:inline">
          <input type="hidden" name="action" value="revoke">
          <input type="hidden" name="keyId" value="${esc(lic.keyId)}">
          <button class="btn-sm btn-danger" type="submit" ${lic.revogada ? 'disabled' : ''}>Revogar</button>
        </form>
        <form method="POST" action="/dashboard/action" style="display:inline;margin-left:4px">
          <input type="hidden" name="action" value="reset-phone">
          <input type="hidden" name="keyId" value="${esc(lic.keyId)}">
          <button class="btn-sm" type="submit">Reset Phone</button>
        </form>
      </td>
    </tr>`
  }).join('')

  const emptyRow = `<tr><td colspan="12" style="text-align:center;padding:32px;color:#444">
    Nenhuma licença ainda. Cria a primeira acima.
  </td></tr>`

  return htmlRes(`<!DOCTYPE html><html><head><meta charset=utf-8><title>Polar Licenses</title>
<style>${CSS}</style></head><body>
<h1>🔑 Polar Licenses <span style="font-size:13px;color:#444;font-weight:normal">${licenses.length} total</span>
  <a href="/dashboard/logout" style="float:right;font-size:11px;color:#444;text-decoration:none">Sair</a>
</h1>

${flash ? `<div class="result">${flash}</div>` : ''}

<div class="card">
  <h2>Nova Licença</h2>
  <form method="POST" action="/dashboard/action">
    <input type="hidden" name="action" value="create">
    <div class="row">
      <div>
        <label>Nome do cliente</label>
        <input type="text" name="cliente" placeholder="Ex: João Silva" required style="width:220px">
      </div>
      <div>
        <label>Dias de validade</label>
        <input type="number" name="dias" value="30" min="1" max="3650" style="width:80px">
      </div>
      <button type="submit" class="btn">+ Criar Licença</button>
    </div>
  </form>
</div>

<div class="card" style="padding:0;overflow:hidden">
  <div style="overflow-x:auto">
  <table>
    <thead><tr>
      <th>Cliente</th><th>Bot Phone</th><th>Estado</th><th>Dias</th>
      <th>Expira</th><th>Criada</th><th>Ativada</th><th>Último Acesso</th>
      <th>Key ID</th><th>Chave POLAR</th><th>Fraude</th><th>Ações</th>
    </tr></thead>
    <tbody>${rows || emptyRow}</tbody>
  </table>
  </div>
</div>
</body></html>`)
}
```

- [ ] **Step 2: Commit**

```bash
git add polar-license-api/src/dashboard.js
git commit -m "feat: dashboard.js — painel HTML completo com tabela e formulários"
```

---

## Task 6: `src/index.js` — Router Principal

**Files:**
- Create: `polar-license-api/src/index.js`

- [ ] **Step 1: Escrever `polar-license-api/src/index.js`**

```js
// src/index.js — fetch handler principal do Cloudflare Worker
import { verifyBotRequest, verifyDashboardCookie, makeSessionCookie } from './auth.js'
import { getLicense, createLicense, patchLicense, getAllLicenses } from './kv.js'
import { gerarChave } from './keys.js'
import { loginPage, dashboardPage } from './dashboard.js'

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

// ── Router de API (bot → Worker) ──────────────────────────────────────
async function handleApi(request, env, pathname) {
  const kv = env.POLAR_LICENSES

  // GET /api/licenses
  if (pathname === '/api/licenses' && request.method === 'GET') {
    return json(await getAllLicenses(kv))
  }

  // /api/license/:keyId  (8 hex chars)
  const m = pathname.match(/^\/api\/license\/([a-f0-9]{8})$/)
  if (!m) return new Response('Not Found', { status: 404 })
  const keyId = m[1]

  if (request.method === 'GET') {
    const lic = await getLicense(kv, keyId)
    return lic ? json(lic) : json(null, 404)
  }

  if (request.method === 'POST') {
    const body = await request.json()
    const lic  = await createLicense(kv, keyId, body)
    return json(lic, 201)
  }

  if (request.method === 'PATCH') {
    const body    = await request.json()
    const updated = await patchLicense(kv, keyId, body)
    return updated ? json(updated) : json({ error: 'not_found' }, 404)
  }

  return new Response('Method Not Allowed', { status: 405 })
}

// ── Router do dashboard ───────────────────────────────────────────────
async function handleDashboard(request, env, pathname) {
  const secret   = env.HMAC_SECRET
  const password = env.DASHBOARD_PASSWORD

  // Login
  if (pathname === '/dashboard/login') {
    if (request.method === 'GET') return loginPage()
    const body = await request.formData()
    const pw   = body.get('password') ?? ''
    if (pw !== password) return loginPage('Palavra-passe incorrecta.')
    const cookie = await makeSessionCookie(secret, password)
    return new Response(null, {
      status: 302,
      headers: { Location: '/dashboard', 'Set-Cookie': cookie }
    })
  }

  // Logout
  if (pathname === '/dashboard/logout') {
    return new Response(null, {
      status: 302,
      headers: {
        Location: '/dashboard/login',
        'Set-Cookie': 'polar_session=; Max-Age=0; Path=/dashboard'
      }
    })
  }

  // Verificar sessão para tudo o resto
  const authed = await verifyDashboardCookie(request, secret, password)
  if (!authed) {
    return new Response(null, { status: 302, headers: { Location: '/dashboard/login' } })
  }

  const kv = env.POLAR_LICENSES

  // Acções de formulário
  if (pathname === '/dashboard/action' && request.method === 'POST') {
    const form   = await request.formData()
    const action = form.get('action')

    if (action === 'create') {
      const cliente = (form.get('cliente') ?? '').trim()
      const dias    = parseInt(form.get('dias') ?? '30', 10) || 30
      if (!cliente) {
        const all = await getAllLicenses(kv)
        return dashboardPage(all, '❌ Nome do cliente obrigatório.')
      }
      const { key, keyId, exp } = await gerarChave(dias, cliente, secret)
      await createLicense(kv, keyId, {
        key,
        cliente,
        criadaEm  : new Date().toISOString(),
        expiresAt : new Date(exp).toISOString(),
        diasTotal : dias,
        botPhone  : null,
        activatedAt: null,
        lastSeen  : null,
        revogada  : false,
        revokedAt : null,
        fraude    : null,
        phoneReset: null,
      })
      const all = await getAllLicenses(kv)
      return dashboardPage(all,
        `✅ Licença criada para <b>${cliente}</b> (${dias} dias):\n\n<code>${key}</code>`
      )
    }

    if (action === 'revoke') {
      const keyId = form.get('keyId') ?? ''
      await patchLicense(kv, keyId, { revogada: true, revokedAt: new Date().toISOString() })
      const all = await getAllLicenses(kv)
      return dashboardPage(all, `✅ Chave <code>${keyId}</code> revogada.`)
    }

    if (action === 'reset-phone') {
      const keyId = form.get('keyId') ?? ''
      await patchLicense(kv, keyId, {
        botPhone  : null,
        phoneReset: new Date().toISOString(),
        revogada  : false,
        revokedAt : null,
        fraude    : null,
      })
      const all = await getAllLicenses(kv)
      return dashboardPage(all, `✅ Phone da chave <code>${keyId}</code> limpo.`)
    }

    return new Response('Bad Request', { status: 400 })
  }

  // GET /dashboard
  if (pathname === '/dashboard') {
    const all = await getAllLicenses(kv)
    return dashboardPage(all)
  }

  return new Response('Not Found', { status: 404 })
}

// ── Entry point ───────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    try {
      const url      = new URL(request.url)
      const pathname = url.pathname

      if (pathname.startsWith('/api/')) {
        const valid = await verifyBotRequest(request, env.HMAC_SECRET)
        if (!valid) return new Response('Unauthorized', { status: 401 })
        return handleApi(request, env, pathname)
      }

      if (pathname.startsWith('/dashboard')) {
        return handleDashboard(request, env, pathname)
      }

      if (pathname === '/') {
        return new Response(null, { status: 302, headers: { Location: '/dashboard' } })
      }

      return new Response('Not Found', { status: 404 })
    } catch (err) {
      console.error(err)
      return new Response('Internal Error', { status: 500 })
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add polar-license-api/src/index.js
git commit -m "feat: index.js — router principal (API + dashboard)"
```

---

## Task 7: Deploy no Cloudflare

- [ ] **Step 1: Fazer login no Cloudflare**

```bash
cd polar-license-api && npx wrangler login
```

Abre o browser — autentica com a conta Cloudflare.

- [ ] **Step 2: Criar o KV namespace**

```bash
npx wrangler kv:namespace create POLAR_LICENSES
```

Output esperado (exemplo):
```
✨ Success!
Add the following to your wrangler.toml:
[[kv_namespaces]]
binding = "POLAR_LICENSES"
id = "abc123def456..."
```

Copiar o `id` para `wrangler.toml` (substituir `FILL_AFTER_CREATE`).

- [ ] **Step 3: Criar também o namespace de preview**

```bash
npx wrangler kv:namespace create POLAR_LICENSES --preview
```

Copiar o `id` para `preview_id` no `wrangler.toml`.

- [ ] **Step 4: Configurar os secrets**

```bash
npx wrangler secret put HMAC_SECRET
```
Introduzir o valor: `p0l4r_lic_k3y_XZ9_2025mz` (o mesmo `_SECRET` do `src/licenca.js` do bot)

```bash
npx wrangler secret put DASHBOARD_PASSWORD
```
Introduzir a palavra-passe que quiseres para o painel.

- [ ] **Step 5: Deploy**

```bash
npx wrangler deploy
```

Output esperado:
```
✨ Successfully published your Worker to
https://polar-license-api.<tua-conta>.workers.dev
```

Guardar esse URL — vai ser usado no próximo task.

- [ ] **Step 6: Testar a API com curl**

Substituir `<URL>` pelo URL do Worker e `<SECRET>` por `p0l4r_lic_k3y_XZ9_2025mz`:

```bash
# Teste autenticação inválida — deve retornar 401
curl -s -o /dev/null -w "%{http_code}" https://<URL>/api/licenses
# Esperado: 401

# Teste dashboard — deve redirecionar para login
curl -s -o /dev/null -w "%{http_code}" https://<URL>/dashboard
# Esperado: 302
```

- [ ] **Step 7: Testar o dashboard no browser**

Abrir `https://<URL>/dashboard` → deve mostrar formulário de login.
Introduzir a password configurada → deve mostrar tabela vazia com formulário "Nova Licença".
Criar uma licença de teste: cliente "Teste", 7 dias → deve mostrar a chave POLAR-... gerada.

- [ ] **Step 8: Commit do wrangler.toml com IDs preenchidos**

```bash
git add polar-license-api/wrangler.toml
git commit -m "feat: wrangler.toml com KV namespace IDs (sem secrets)"
```

---

## Task 8: Refactor `src/licenca.js` do Bot

Substituir todas as chamadas ao Gist pela nova API.
O `_SECRET` (para assinar pedidos) já existe no ficheiro — reutilizá-lo.

**Files:**
- Modify: `src/licenca.js`

- [ ] **Step 1: Adicionar `_API_URL` e `_apiCall` no topo de `src/licenca.js`**

Localizar as linhas:
```js
// Registo online de licenças (GitHub Gist privado)
const _GT = ['ghp_', ...].join('')
const _GI = ['7ea6', ...].join('')
const _GF = 'registry.json'
```

Substituir por:
```js
// Registo online de licenças (Cloudflare Workers API)
const _AU = ['https://', 'polar-license-api.', '<tua-conta>', '.workers.dev'].join('')

async function _apiCall(method, path, body = null) {
  try {
    const ts  = Date.now().toString()
    const bod = body ? JSON.stringify(body) : ''
    const sig = crypto.createHmac('sha256', _SECRET)
      .update(method + path + ts + bod).digest('hex')
    const res = await fetch(_AU + path, {
      method,
      headers: {
        'X-Polar-Sig'   : sig,
        'X-Polar-Ts'    : ts,
        ...(bod ? { 'Content-Type': 'application/json' } : {}),
      },
      body: bod || undefined,
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}
```

**Nota:** Substituir `<tua-conta>` pelo subdomain real do Worker (obtido no Task 7 Step 5). Manter o split em array para consistência com o estilo do ficheiro.

- [ ] **Step 2: Remover `_lerRegistro` e `_escreverRegistro`**

Apagar as funções:
```js
async function _lerRegistro() { ... }
async function _escreverRegistro(registro) { ... }
```

- [ ] **Step 3: Substituir `registrarChaveGerada`**

```js
export async function registrarChaveGerada(chave, clienteNome) {
  try {
    const rest    = chave.slice(6)
    const dotIdx  = rest.lastIndexOf('.')
    const payload = rest.slice(0, dotIdx)
    const { exp, cliente, id } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    await _apiCall('POST', `/api/license/${id}`, {
      key       : chave,
      cliente   : clienteNome || cliente,
      criadaEm  : new Date().toISOString(),
      expiresAt : new Date(exp).toISOString(),
      diasTotal : Math.round((exp - Date.now()) / 86_400_000),
      botPhone  : null,
      activatedAt: null,
      lastSeen  : null,
      revogada  : false,
      revokedAt : null,
      fraude    : null,
      phoneReset: null,
    })
  } catch {}
}
```

- [ ] **Step 4: Substituir `listarLicencas`**

```js
export async function listarLicencas() {
  return await _apiCall('GET', '/api/licenses')
}
```

- [ ] **Step 5: Substituir `revogarChave`**

```js
export async function revogarChave(keyId) {
  const res = await _apiCall('PATCH', `/api/license/${keyId}`, {
    revogada : true,
    revokedAt: new Date().toISOString(),
  })
  return !!res
}
```

- [ ] **Step 6: Substituir `resetarBotPhone`**

```js
export async function resetarBotPhone(keyId) {
  const res = await _apiCall('PATCH', `/api/license/${keyId}`, {
    botPhone  : null,
    phoneReset: new Date().toISOString(),
    revogada  : false,
    revokedAt : null,
    fraude    : null,
  })
  if (!res) return { ok: false, motivo: 'sem acesso à API' }
  return { ok: true, phoneAnterior: res.botPhone ?? null, cliente: res.cliente }
}
```

**Nota:** `resetarBotPhone` retorna o estado ANTES do patch — a API retorna o estado DEPOIS. Guardar `botPhone` antes do patch:

```js
export async function resetarBotPhone(keyId) {
  const atual = await _apiCall('GET', `/api/license/${keyId}`)
  if (!atual) return { ok: false, motivo: 'sem acesso à API' }
  const phoneAnterior = atual.botPhone ?? null
  await _apiCall('PATCH', `/api/license/${keyId}`, {
    botPhone  : null,
    phoneReset: new Date().toISOString(),
    revogada  : false,
    revokedAt : null,
    fraude    : null,
  })
  return { ok: true, phoneAnterior, cliente: atual.cliente }
}
```

- [ ] **Step 7: Substituir `verificarLicencaOnline`**

Substituir a função inteira:

```js
export async function verificarLicencaOnline(polarmd) {
  try {
    const local = checkLicenca()
    if (!local.valida) return local

    const _cfg = loadConfig()
    const _cN  = CRIADOR.replace(/\D/g, '')
    const _dN  = (_cfg.numeroDono ?? '').replace(/\D/g, '')
    if (_cN && _dN === _cN) return local   // criador — sem verificação online

    const _rawId    = polarmd?.user?.id ?? ''
    const _botPhone = _rawId ? _rawId.split(':')[0].split('@')[0] : null
    const keyId     = local.keyId

    const entrada = await _apiCall('GET', `/api/license/${keyId}`)
    if (entrada === null) return local   // sem rede — não bloquear

    // ── Chave revogada ────────────────────────────────────────────────
    if (entrada.revogada) {
      saveConfig({ licencaRevogadaId: _hashRevId(keyId) })
      return { valida: false, motivo: 'chave revogada pelo criador' }
    }

    // ── Primeiro registo ──────────────────────────────────────────────
    if (!entrada.botPhone) {
      const updates = { lastSeen: new Date().toISOString() }
      if (_botPhone) {
        updates.botPhone    = _botPhone
        updates.activatedAt = new Date().toISOString()
      }
      if (!entrada.expiresAt && local.expira) {
        updates.expiresAt = local.expira.toISOString()
        updates.diasTotal  = local.diasRestantes ?? null
      }
      await _apiCall('PATCH', `/api/license/${keyId}`, updates)
      return local
    }

    // ── Preencher expiresAt em entradas antigas ───────────────────────
    if (!entrada.expiresAt && local.expira) {
      await _apiCall('PATCH', `/api/license/${keyId}`, {
        expiresAt: local.expira.toISOString(),
        diasTotal : local.diasRestantes ?? null,
      })
    }

    // ── Detetar partilha (botPhone diferente) ─────────────────────────
    if (entrada.botPhone && _botPhone && entrada.botPhone !== _botPhone) {
      const _isDonoBotOriginal = entrada.botPhone === _dN || entrada.botPhone === _cN
      if (_isDonoBotOriginal) {
        await _apiCall('PATCH', `/api/license/${keyId}`, {
          botPhone : _botPhone,
          lastSeen : new Date().toISOString(),
        })
        return local
      }

      await _apiCall('PATCH', `/api/license/${keyId}`, {
        revogada : true,
        revokedAt: new Date().toISOString(),
        fraude   : {
          botOriginal: entrada.botPhone,
          botPirata  : _botPhone,
          detetadoEm : new Date().toISOString(),
        },
      })
      saveConfig({ licencaRevogadaId: _hashRevId(keyId) })

      if (polarmd) {
        await polarmd.sendMessage(`${_cN}@s.whatsapp.net`, {
          text:
            `🚨 *ALERTA — LICENÇA PARTILHADA DETETADA*\n\n` +
            `👤 Cliente: *${local.cliente ?? '?'}*\n` +
            `🔑 Key ID: \`${keyId}\`\n\n` +
            `✅ Bot legítimo:  \`+${entrada.botPhone}\`\n` +
            `❌ Bot não autorizado: \`+${_botPhone}\`\n\n` +
            `A chave foi *revogada automaticamente*.\n` +
            `Usa *!licenca revogar ${keyId}* para gerir.`,
        }).catch(() => null)
      }

      return { valida: false, motivo: 'chave em uso noutro bot — revogada automaticamente' }
    }

    // ── Tudo OK — atualizar lastSeen ──────────────────────────────────
    const updates = { lastSeen: new Date().toISOString() }
    if (!entrada.botPhone && _botPhone) updates.botPhone = _botPhone
    if (!entrada.activatedAt) updates.activatedAt = new Date().toISOString()
    await _apiCall('PATCH', `/api/license/${keyId}`, updates)
    return local

  } catch {
    return checkLicenca()
  }
}
```

- [ ] **Step 8: Verificar que não restam referências ao Gist**

```bash
grep -n "_GT\|_GI\|_GF\|_lerRegistro\|_escreverRegistro\|api.github.com\|gists" src/licenca.js
```

Esperado: zero resultados.

- [ ] **Step 9: Commit**

```bash
git add src/licenca.js
git commit -m "feat: licenca.js — substituir GitHub Gist por Cloudflare Workers API"
```

- [ ] **Step 10: Teste de integração**

1. Iniciar o bot: `node index.js`
2. Enviar `!licenca` no WhatsApp → deve mostrar estado da licença com Key ID
3. Verificar no dashboard (`https://<URL>/dashboard`) que o `lastSeen` foi actualizado
4. Enviar `!licenca listar` (criador) → deve listar as licenças do KV

---

## Task 9: Migração do Gist para o KV

Se já existem licenças no Gist, importá-las manualmente.

- [ ] **Step 1: Aceder ao Gist actual**

Abrir `https://gist.github.com` e encontrar o Gist `registry.json`. Copiar o conteúdo JSON.

- [ ] **Step 2: Importar via dashboard**

O Gist tem formato `{ "keyId": { ...dados } }`. Para cada entrada, criar manualmente via o formulário "Nova Licença" **não funciona** (perde o botPhone/histórico).

Importar via script (correr uma única vez localmente):

```js
// migrate.mjs — correr com: node migrate.mjs
import crypto from 'crypto'

const API_URL = 'https://polar-license-api.<conta>.workers.dev'
const SECRET  = 'p0l4r_lic_k3y_XZ9_2025mz'

const GIST_DATA = {
  // COLAR AQUI O CONTEÚDO DO registry.json DO GIST
}

async function apiCall(method, path, body = null) {
  const ts  = Date.now().toString()
  const bod = body ? JSON.stringify(body) : ''
  const sig = crypto.createHmac('sha256', SECRET).update(method + path + ts + bod).digest('hex')
  const res = await fetch(API_URL + path, {
    method,
    headers: { 'X-Polar-Sig': sig, 'X-Polar-Ts': ts, 'Content-Type': 'application/json' },
    body: bod || undefined,
  })
  return res.json()
}

for (const [keyId, data] of Object.entries(GIST_DATA)) {
  console.log(`Importando ${keyId} (${data.cliente})...`)
  await apiCall('POST', `/api/license/${keyId}`, { keyId, ...data })
}
console.log('Migração completa!')
```

```bash
node migrate.mjs
```

- [ ] **Step 3: Verificar no dashboard**

Abrir o dashboard — todas as licenças do Gist devem aparecer na tabela.

- [ ] **Step 4: Commit do script de migração (opcional)**

```bash
git add migrate.mjs
git commit -m "chore: script de migração Gist → KV (usar uma vez, depois apagar)"
```
