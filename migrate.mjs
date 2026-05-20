// migrate.mjs — importar registo do Gist para o Cloudflare KV
// Usar uma vez após o deploy do Worker, depois pode apagar.
//
// Uso:
//   1. Copiar o conteúdo do Gist registry.json para GIST_DATA abaixo
//   2. Preencher API_URL com o URL do Worker
//   3. node migrate.mjs
import crypto from 'crypto'

const API_URL = 'https://polar-license-api.FILL_YOUR_ACCOUNT.workers.dev'
const SECRET  = 'p0l4r_lic_k3y_XZ9_2025mz'

// Colar aqui o conteúdo de registry.json do Gist (objecto com keyId → dados)
const GIST_DATA = {
  // Exemplo (apagar e substituir pelo conteúdo real do Gist):
  // "a1b2c3d4": {
  //   "cliente": "ZeNeves",
  //   "criadaEm": "2025-01-01T00:00:00Z",
  //   "expiresAt": "2025-02-01T00:00:00Z",
  //   "diasTotal": 30,
  //   "botPhone": "5511999888777",
  //   "activatedAt": "2025-01-02T00:00:00Z",
  //   "lastSeen": "2025-01-10T00:00:00Z",
  //   "revogada": false
  // }
}

async function apiCall(method, path, body = null) {
  const ts  = Date.now().toString()
  const bod = body ? JSON.stringify(body) : ''
  const sig = crypto.createHmac('sha256', SECRET).update(method + path + ts + bod).digest('hex')
  const res = await fetch(API_URL + path, {
    method,
    headers: {
      'X-Polar-Sig'  : sig,
      'X-Polar-Ts'   : ts,
      'Content-Type' : 'application/json',
    },
    body: bod || undefined,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${method} ${path} → ${res.status}: ${text}`)
  }
  return res.json()
}

const entries = Object.entries(GIST_DATA)
if (!entries.length) {
  console.log('GIST_DATA está vazio — preenche antes de correr.')
  process.exit(1)
}

console.log(`A importar ${entries.length} licença(s)...`)
let ok = 0
let skip = 0

for (const [keyId, data] of entries) {
  try {
    await apiCall('POST', `/api/license/${keyId}`, { keyId, ...data })
    console.log(`✅ ${keyId} (${data.cliente ?? '?'})`)
    ok++
  } catch (err) {
    if (err.message.includes('201') || err.message.includes('existing')) {
      console.log(`⏭  ${keyId} já existe — ignorado`)
      skip++
    } else {
      console.error(`❌ ${keyId}: ${err.message}`)
    }
  }
}

console.log(`\nMigração completa: ${ok} importadas, ${skip} ignoradas.`)
