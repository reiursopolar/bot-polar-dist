// src/keys.js — geração e validação de chaves POLAR- com Ed25519
// Chaves assinadas com chave privada Ed25519 (só no Worker).
// Bots verificam com a chave pública — segura para estar no código distribuído.

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

async function importPrivateKey(privateJwkStr) {
  return crypto.subtle.importKey('jwk', JSON.parse(privateJwkStr), 'Ed25519', false, ['sign'])
}

async function importPublicKey(privateJwkStr) {
  const jwk = JSON.parse(privateJwkStr)
  return crypto.subtle.importKey('jwk', { kty: jwk.kty, crv: jwk.crv, x: jwk.x }, 'Ed25519', false, ['verify'])
}

async function signPayload(payload, privateJwkStr) {
  const key = await importPrivateKey(privateJwkStr)
  const sig = await crypto.subtle.sign('Ed25519', key, new TextEncoder().encode(payload))
  return toBase64url(new Uint8Array(sig))
}

export async function gerarChave(dias, cliente, privateJwkStr) {
  const exp     = Date.now() + dias * 24 * 60 * 60 * 1000
  const id      = randomHex(4)
  const payload = toBase64url(new TextEncoder().encode(JSON.stringify({ exp, cliente, id })))
  const sig     = await signPayload(payload, privateJwkStr)
  return { key: `POLAR-${payload}.${sig}`, keyId: id, exp }
}

// Gera nova key com o mesmo keyId (para estender sem mudar o ID)
export async function gerarChaveComId(diasExtras, lic, privateJwkStr) {
  const base    = lic.expiresAt ? Math.max(Date.now(), new Date(lic.expiresAt).getTime()) : Date.now()
  const exp     = base + diasExtras * 24 * 60 * 60 * 1000
  const payload = toBase64url(new TextEncoder().encode(JSON.stringify({ exp, cliente: lic.cliente, id: lic.keyId })))
  const sig     = await signPayload(payload, privateJwkStr)
  return { key: `POLAR-${payload}.${sig}`, exp }
}

export async function validarChave(key, privateJwkStr) {
  if (!key?.startsWith('POLAR-')) return { valida: false, motivo: 'formato inválido' }
  const rest   = key.slice(6)
  const dotIdx = rest.lastIndexOf('.')
  if (dotIdx === -1) return { valida: false, motivo: 'formato inválido' }
  const payload = rest.slice(0, dotIdx)
  const sigB64  = rest.slice(dotIdx + 1)
  try {
    const pubKey  = await importPublicKey(privateJwkStr)
    const isValid = await crypto.subtle.verify('Ed25519', pubKey, fromBase64url(sigB64), new TextEncoder().encode(payload))
    if (!isValid) return { valida: false, motivo: 'chave inválida ou modificada' }
    const { exp, cliente, id } = JSON.parse(new TextDecoder().decode(fromBase64url(payload)))
    if (Date.now() > exp) return { valida: false, motivo: 'chave expirada' }
    const diasRestantes = Math.ceil((exp - Date.now()) / 86_400_000)
    return { valida: true, cliente, expira: new Date(exp).toISOString(), diasRestantes, keyId: id }
  } catch {
    return { valida: false, motivo: 'chave corrompida' }
  }
}
