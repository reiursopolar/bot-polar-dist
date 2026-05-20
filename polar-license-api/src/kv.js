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

export async function deleteLicense(kv, keyId) {
  await kv.delete(`lic:${keyId}`)
  const idx = await getIndex(kv)
  await setIndex(kv, idx.filter(id => id !== keyId))
}

export async function appendLog(kv, event) {
  const raw  = await kv.get('log:recent')
  const logs = raw ? JSON.parse(raw) : []
  logs.unshift({ ts: new Date().toISOString(), ...event })
  if (logs.length > 300) logs.length = 300
  await kv.put('log:recent', JSON.stringify(logs))
}

export async function getRecentLogs(kv) {
  const raw = await kv.get('log:recent')
  return raw ? JSON.parse(raw) : []
}

// ── Telemetria por keyId ──────────────────────────────────────────────
export async function getTelemetry(kv, keyId) {
  const val = await kv.get(`tel:${keyId}`)
  return val ? JSON.parse(val) : null
}

export async function patchTelemetry(kv, keyId, updates) {
  const existing = await getTelemetry(kv, keyId) ?? {}

  if (updates.cmdStats && typeof updates.cmdStats === 'object' && !Array.isArray(updates.cmdStats)) {
    const prev = existing.cmdStats ?? {}
    for (const [cmd, n] of Object.entries(updates.cmdStats)) {
      if (typeof n === 'number' && n > 0) prev[cmd] = (prev[cmd] ?? 0) + n
    }
    updates = { ...updates, cmdStats: prev }
  }

  if (Array.isArray(updates.errors)) {
    const prev = existing.errors ?? []
    updates = { ...updates, errors: [...updates.errors, ...prev].slice(0, 50) }
  }

  const merged = { ...existing, ...updates }
  await kv.put(`tel:${keyId}`, JSON.stringify(merged))
  return merged
}
