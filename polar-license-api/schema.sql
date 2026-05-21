CREATE TABLE IF NOT EXISTS licenses (
  keyId       TEXT PRIMARY KEY,
  cliente     TEXT NOT NULL,
  key         TEXT,
  botPhone    TEXT,
  donoPhone   TEXT,
  revogada    INTEGER NOT NULL DEFAULT 0,
  expiresAt   TEXT,
  activatedAt TEXT,
  revokedAt   TEXT,
  lastSeen    TEXT,
  diasTotal   INTEGER,
  fraude      TEXT,
  phoneReset  TEXT,
  criadaEm    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS logs (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  ts        TEXT NOT NULL,
  action    TEXT,
  keyId     TEXT,
  cliente   TEXT,
  source    TEXT,
  extra     TEXT
);

CREATE TABLE IF NOT EXISTS telemetry (
  keyId         TEXT PRIMARY KEY,
  version       TEXT,
  uptimeSince   TEXT,
  lastHeartbeat TEXT,
  cmdStats      TEXT,
  errors        TEXT
);
