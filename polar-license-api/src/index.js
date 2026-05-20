// src/index.js — fetch handler principal do Cloudflare Worker
import { verifyBotRequest, verifyDashboardCookie, makeSessionCookie } from './auth.js'
import { getLicense, createLicense, patchLicense, getAllLicenses, deleteLicense, appendLog, getRecentLogs } from './kv.js'
import { gerarChave, gerarChaveComId } from './keys.js'
import { loginPage, dashboardPage } from './dashboard.js'

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

// ── Auto-delete: chaves inativas há mais de 10 dias (cron diário) ─────
async function autoDeleteInactive(env) {
  const kv        = env.POLAR_LICENSES
  const licenses  = await getAllLicenses(kv)
  const cutoff    = Date.now() - 10 * 86_400_000
  const criadorPhone = (env.CRIADOR_PHONE ?? '').replace(/\D/g, '')

  for (const lic of licenses) {
    // Nunca apagar a key do criador
    const botPhoneClean  = (lic.botPhone  ?? '').replace(/\D/g, '')
    const donoPhoneClean = (lic.donoPhone ?? '').replace(/\D/g, '')
    if (criadorPhone && (botPhoneClean === criadorPhone || donoPhoneClean === criadorPhone)) continue

    const lastSeen    = lic.lastSeen    ? new Date(lic.lastSeen).getTime()    : null
    const activatedAt = lic.activatedAt ? new Date(lic.activatedAt).getTime() : null
    const criadaEm    = lic.criadaEm   ? new Date(lic.criadaEm).getTime()    : null

    let shouldDelete = false
    let reason = ''

    if (lastSeen && lastSeen < cutoff) {
      shouldDelete = true
      reason = 'Inativo >10 dias'
    } else if (!lastSeen && activatedAt && activatedAt < cutoff) {
      shouldDelete = true
      reason = 'Ativado mas nunca visto >10 dias'
    } else if (!lastSeen && !activatedAt && criadaEm && criadaEm < cutoff) {
      shouldDelete = true
      reason = 'Nunca ativado >10 dias'
    }

    if (shouldDelete) {
      await deleteLicense(kv, lic.keyId)
      await appendLog(kv, { action: 'auto_delete', keyId: lic.keyId, cliente: lic.cliente, source: 'cron', reason })
    }
  }
}

// Extrai o keyId do payload do Bearer POLAR token (sem re-verificar assinatura)
function getBearerKeyId(request) {
  const auth = request.headers.get('Authorization') ?? ''
  if (!auth.startsWith('Bearer POLAR-')) return null
  const rest   = auth.slice(13)
  const dotIdx = rest.lastIndexOf('.')
  if (dotIdx === -1) return null
  const payload = rest.slice(0, dotIdx)
  try {
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64 + '='.repeat((4 - b64.length % 4) % 4)
    const { id } = JSON.parse(atob(pad))
    return typeof id === 'string' ? id : null
  } catch { return null }
}

const FORBIDDEN = () => new Response('Forbidden', { status: 403 })

// ── Router de API (bot → Worker) ──────────────────────────────────────
async function handleApi(request, env, pathname) {
  const kv        = env.POLAR_LICENSES
  const isCreator = !!env.CREATOR_TOKEN && request.headers.get('X-Creator-Token') === env.CREATOR_TOKEN

  // ── Endpoints exclusivos do criador ───────────────────────────────
  if (pathname === '/api/licenses' && request.method === 'GET') {
    if (!isCreator) return FORBIDDEN()
    return json(await getAllLicenses(kv))
  }

  if (pathname === '/api/logs' && request.method === 'GET') {
    if (!isCreator) return FORBIDDEN()
    return json(await getRecentLogs(kv))
  }

  if (pathname === '/api/stats' && request.method === 'GET') {
    if (!isCreator) return FORBIDDEN()
    const all = await getAllLicenses(kv)
    const now = Date.now()
    const stats = { total: all.length, ativas: 0, aguardando: 0, expiradas: 0, revogadas: 0 }
    for (const lic of all) {
      if (lic.revogada) { stats.revogadas++; continue }
      if (lic.expiresAt && new Date(lic.expiresAt).getTime() < now) { stats.expiradas++; continue }
      lic.botPhone ? stats.ativas++ : stats.aguardando++
    }
    return json(stats)
  }

  if (pathname === '/api/generate' && request.method === 'POST') {
    if (!isCreator) return FORBIDDEN()
    const body    = await request.json()
    const dias    = parseInt(body.dias, 10) || 30
    const cliente = (body.cliente ?? '').trim() || 'cliente'
    const { key, keyId, exp } = await gerarChave(dias, cliente, env.ED25519_PRIVATE_JWK)
    await createLicense(kv, keyId, {
      key, cliente,
      criadaEm  : new Date().toISOString(),
      expiresAt : new Date(exp).toISOString(),
      diasTotal : dias,
      botPhone  : null, donoPhone: null, activatedAt: null, lastSeen: null,
      revogada  : false, revokedAt: null, fraude: null, phoneReset: null,
    })
    await appendLog(kv, { action: 'key_criada', keyId, cliente, source: 'bot' })
    return json({ key, keyId, expiresAt: new Date(exp).toISOString() }, 201)
  }

  // ── /api/license/:keyId — bot acede só à sua própria key ──────────
  const m = pathname.match(/^\/api\/license\/([a-f0-9]{8})$/)
  if (!m) return new Response('Not Found', { status: 404 })
  const keyId = m[1]

  // Bot não-criador só pode GET/PATCH na sua própria key
  if (!isCreator) {
    if (request.method === 'POST' || request.method === 'DELETE') return FORBIDDEN()
    if (getBearerKeyId(request) !== keyId) return FORBIDDEN()
  }

  if (request.method === 'GET') {
    const lic = await getLicense(kv, keyId)
    return lic ? json(lic) : json(null, 404)
  }

  if (request.method === 'POST') {
    const body = await request.json()
    const lic  = await createLicense(kv, keyId, body)
    await appendLog(kv, { action: 'key_criada', keyId, cliente: body.cliente, source: 'bot' })
    return json(lic, 201)
  }

  if (request.method === 'PATCH') {
    const body    = await request.json()
    const updated = await patchLicense(kv, keyId, body)
    if (!updated) return json({ error: 'not_found' }, 404)
    // Log apenas eventos significativos (não lastSeen)
    if (body.revogada)   await appendLog(kv, { action: 'key_revogada',  keyId, cliente: updated.cliente, source: 'bot', detalhe: body.fraude ? 'fraude' : 'manual' })
    if (body.phoneReset) await appendLog(kv, { action: 'reset_phone',   keyId, cliente: updated.cliente, source: 'bot', anterior: body.botPhone })
    if (body.botPhone && !body.revogada && !body.phoneReset)
                         await appendLog(kv, { action: 'key_ativada',   keyId, cliente: updated.cliente, source: 'bot', botPhone: body.botPhone, donoPhone: body.donoPhone ?? null })
    return json(updated)
  }

  if (request.method === 'DELETE') {
    const lic = await getLicense(kv, keyId)
    await deleteLicense(kv, keyId)
    await appendLog(kv, { action: 'key_apagada', keyId, cliente: lic?.cliente, source: 'api' })
    return new Response(null, { status: 204 })
  }

  return new Response('Method Not Allowed', { status: 405 })
}

// ── Router do dashboard ───────────────────────────────────────────────
async function handleDashboard(request, env, pathname) {
  const secret       = env.HMAC_SECRET          // cookie do dashboard
  const ed25519Jwk   = env.ED25519_PRIVATE_JWK  // assinar/verificar POLAR keys
  const password     = env.DASHBOARD_PASSWORD
  const criadorPhone = (env.CRIADOR_PHONE ?? '').replace(/\D/g, '')

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

    async function page(flash = '') {
      const [all, logs] = await Promise.all([getAllLicenses(kv), getRecentLogs(kv)])
      return dashboardPage(all, flash, logs, criadorPhone)
    }

    if (action === 'create') {
      const cliente = (form.get('cliente') ?? '').trim()
      const dias    = parseInt(form.get('dias') ?? '30', 10) || 30
      if (!cliente) return page('❌ Nome do cliente obrigatório.')
      const { key, keyId, exp } = await gerarChave(dias, cliente, ed25519Jwk)
      await createLicense(kv, keyId, {
        key, cliente,
        criadaEm  : new Date().toISOString(),
        expiresAt : new Date(exp).toISOString(),
        diasTotal : dias,
        botPhone  : null, donoPhone: null, activatedAt: null, lastSeen: null,
        revogada  : false, revokedAt: null, fraude: null, phoneReset: null,
      })
      await appendLog(kv, { action: 'key_criada', keyId, cliente, source: 'dashboard' })
      return page(`✅ Licença criada para <b>${cliente}</b> (${dias} dias):<br><br><code>${key}</code>`)
    }

    if (action === 'revoke') {
      const keyId  = form.get('keyId') ?? ''
      const before = await getLicense(kv, keyId)
      await patchLicense(kv, keyId, { revogada: true, revokedAt: new Date().toISOString() })
      await appendLog(kv, { action: 'key_revogada', keyId, cliente: before?.cliente, source: 'dashboard' })
      return page(`✅ Chave <code>${keyId}</code> revogada.`)
    }

    if (action === 'reset-phone') {
      const keyId  = form.get('keyId') ?? ''
      const before = await getLicense(kv, keyId)
      await patchLicense(kv, keyId, {
        botPhone: null, donoPhone: null,
        phoneReset: new Date().toISOString(),
        revogada: false, revokedAt: null, fraude: null,
      })
      await appendLog(kv, { action: 'reset_phone', keyId, cliente: before?.cliente, source: 'dashboard', anterior: before?.botPhone })
      return page(`✅ Phone da chave <code>${keyId}</code> limpo.`)
    }

    if (action === 'extend') {
      const keyId     = form.get('keyId') ?? ''
      const diasExtra = parseInt(form.get('dias') ?? '30', 10) || 30
      const lic       = await getLicense(kv, keyId)
      if (!lic) return page('❌ Chave não encontrada.')
      const { key, exp } = await gerarChaveComId(diasExtra, lic, ed25519Jwk)
      await patchLicense(kv, keyId, {
        key,
        expiresAt: new Date(exp).toISOString(),
        diasTotal: (lic.diasTotal ?? 0) + diasExtra,
      })
      await appendLog(kv, { action: 'key_extendida', keyId, cliente: lic.cliente, source: 'dashboard', diasAdded: diasExtra })
      return page(`✅ Chave <code>${keyId}</code> estendida +${diasExtra} dias.<br><br>Nova chave para enviar ao cliente:<br><code>${key}</code>`)
    }

    if (action === 'delete') {
      const keyId = form.get('keyId') ?? ''
      const lic   = await getLicense(kv, keyId)
      await deleteLicense(kv, keyId)
      await appendLog(kv, { action: 'key_apagada', keyId, cliente: lic?.cliente, source: 'dashboard' })
      return page(`✅ Chave <code>${keyId}</code> apagada permanentemente.`)
    }

    return new Response('Bad Request', { status: 400 })
  }

  // GET /dashboard
  if (pathname === '/dashboard') {
    const [all, logs] = await Promise.all([getAllLicenses(kv), getRecentLogs(kv)])
    return dashboardPage(all, '', logs, criadorPhone)
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
        const valid = await verifyBotRequest(request, env.ED25519_PRIVATE_JWK, env.CREATOR_TOKEN)
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
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(autoDeleteInactive(env))
  }
}
