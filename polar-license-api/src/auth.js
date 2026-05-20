// src/auth.js — autenticação Ed25519 para bot + cookie HMAC para dashboard

function fromBase64url(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
  const pad = b64 + '='.repeat((4 - b64.length % 4) % 4)
  return Uint8Array.from(atob(pad), c => c.charCodeAt(0))
}

async function hmacHex(secret, data) {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const buf = await crypto.subtle.sign('HMAC', key, enc.encode(data))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

// Verifica assinatura Ed25519 de uma POLAR key + validade temporal
async function verifyPolarKey(polarKey, privateJwkStr) {
  if (!polarKey?.startsWith('POLAR-')) return false
  const rest   = polarKey.slice(6)
  const dotIdx = rest.lastIndexOf('.')
  if (dotIdx === -1) return false
  const payload = rest.slice(0, dotIdx)
  const sigB64  = rest.slice(dotIdx + 1)
  try {
    const jwk    = JSON.parse(privateJwkStr)
    const pubKey = await crypto.subtle.importKey(
      'jwk', { kty: jwk.kty, crv: jwk.crv, x: jwk.x }, 'Ed25519', false, ['verify']
    )
    const valid = await crypto.subtle.verify(
      'Ed25519', pubKey, fromBase64url(sigB64), new TextEncoder().encode(payload)
    )
    if (!valid) return false
    const { exp } = JSON.parse(new TextDecoder().decode(fromBase64url(payload)))
    return Date.now() <= exp
  } catch {
    return false
  }
}

// ── Autenticação do bot ───────────────────────────────────────────────
// Bots com licença enviam:
//   Authorization: Bearer {POLAR_KEY}
//   X-Polar-Ts:    {timestamp_ms}
//
// Criador envia (para comandos de gestão):
//   X-Creator-Token: {CREATOR_TOKEN}
//   X-Polar-Ts:      {timestamp_ms}
//
// Janela anti-replay: 5 minutos.
export async function verifyBotRequest(request, privateJwkStr, creatorToken) {
  const ts = request.headers.get('X-Polar-Ts')
  if (!ts || Math.abs(Date.now() - parseInt(ts, 10)) > 300_000) return false

  // Path do criador
  const ct = request.headers.get('X-Creator-Token')
  if (ct && creatorToken && ct === creatorToken) return true

  // Path do bot com POLAR key
  const auth = request.headers.get('Authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return false
  return verifyPolarKey(auth.slice(7).trim(), privateJwkStr)
}

// ── Autenticação do dashboard (cookie HMAC-SHA256) ────────────────────
function parseCookies(header) {
  const out = {}
  for (const part of (header ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k) out[k.trim()] = v.join('=').trim()
  }
  return out
}

export async function verifyDashboardCookie(request, secret, password) {
  const cookies = parseCookies(request.headers.get('Cookie'))
  const session = cookies['polar_session']
  if (!session) return false
  const expected = (await hmacHex(secret, password)).slice(0, 32)
  return session === expected
}

export async function makeSessionCookie(secret, password) {
  const val = (await hmacHex(secret, password)).slice(0, 32)
  return `polar_session=${val}; HttpOnly; Secure; SameSite=Strict; Max-Age=86400; Path=/dashboard`
}
