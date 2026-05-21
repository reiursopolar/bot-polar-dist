/**
 * sync-secrets.mjs
 *
 * Lê os valores do bot.json e envia automaticamente os secrets para o Worker.
 * Corre UMA VEZ localmente sempre que mudares o creatorToken ou quiseres
 * reconfigurar o Worker.
 *
 * Uso:
 *   node sync-secrets.mjs
 *
 * Requisitos:
 *   - wrangler instalado (npm i -g wrangler) e autenticado (wrangler login)
 *   - bot.json com creatorToken e numeroDono preenchidos
 */

import { readFileSync }      from 'fs'
import { spawnSync }         from 'child_process'
import { join, dirname }     from 'path'
import { fileURLToPath }     from 'url'
import { createInterface }   from 'readline'

const __dir    = dirname(fileURLToPath(import.meta.url))
const botJson  = join(__dir, '..', 'config', 'bot.json')

// ── Ler bot.json ──────────────────────────────────────────────────────
let bot
try {
  bot = JSON.parse(readFileSync(botJson, 'utf8'))
} catch {
  console.error('❌ Não encontrei config/bot.json. Corre este script a partir da pasta polar-license-api.')
  process.exit(1)
}

const creatorToken = bot.creatorToken?.trim()
const criadorPhone = (bot.numeroDono ?? '').replace(/\D/g, '')

if (!creatorToken) {
  console.error('❌ creatorToken não está definido no bot.json.')
  process.exit(1)
}
if (!criadorPhone) {
  console.error('❌ numeroDono não está definido no bot.json.')
  process.exit(1)
}

// ── Perguntar interativamente os secrets que NÃO existem no bot.json ─
const rl = createInterface({ input: process.stdin, output: process.stdout })
const ask = (q) => new Promise(r => rl.question(q, r))

console.log('\n🔑 Sincronização de secrets do Worker\n')
console.log(`   creatorToken  → lido do bot.json ✅`)
console.log(`   criadorPhone  → lido do bot.json ✅`)
console.log(`   Os restantes (HMAC_SECRET, DASHBOARD_PASSWORD, ED25519_PRIVATE_JWK) tens de inserir agora.\n`)

const hmac      = await ask('🔐 HMAC_SECRET (qualquer string aleatória longa): ')
const dashPass  = await ask('🔐 DASHBOARD_PASSWORD (password do painel): ')
const ed25519   = await ask('🔐 ED25519_PRIVATE_JWK (JWK privado, começa com {"kty":"OKP"...}): ')
rl.close()

if (!hmac.trim() || !dashPass.trim() || !ed25519.trim()) {
  console.error('\n❌ Nenhum valor pode estar vazio.')
  process.exit(1)
}

// ── Enviar cada secret via wrangler ──────────────────────────────────
const secrets = [
  ['CREATOR_TOKEN',       creatorToken],
  ['CRIADOR_PHONE',       criadorPhone],
  ['HMAC_SECRET',         hmac.trim()],
  ['DASHBOARD_PASSWORD',  dashPass.trim()],
  ['ED25519_PRIVATE_JWK', ed25519.trim()],
]

console.log('\n📤 A enviar secrets para o Worker...\n')

let ok = true
for (const [name, value] of secrets) {
  process.stdout.write(`   ${name.padEnd(22)} → `)
  const result = spawnSync('wrangler', ['secret', 'put', name], {
    input    : value + '\n',
    cwd      : __dir,
    encoding : 'utf8',
    stdio    : ['pipe', 'pipe', 'pipe'],
  })
  if (result.error || result.status !== 0) {
    console.log('❌ ERRO')
    console.error(result.stderr || result.error?.message || '')
    ok = false
  } else {
    console.log('✅')
  }
}

console.log(ok
  ? '\n✅ Todos os secrets foram configurados! Podes fazer deploy: wrangler deploy\n'
  : '\n⚠️  Alguns secrets falharam. Verifica se o wrangler está autenticado (wrangler login).\n'
)
