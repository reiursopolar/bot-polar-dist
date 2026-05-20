// src/dashboard.js — HTML do painel de gestão de licenças

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function htmlRes(content, status = 200) {
  return new Response(content, {
    status,
    headers: { 'Content-Type': 'text/html;charset=utf-8' }
  })
}

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#06060e;--surface:#0b0b18;--surface2:#0e0e1c;--border:#161628;--border2:#22223a;
  --text:#c0c4d0;--text2:#6a6e82;--text3:#2e2e46;
  --blue:#00d4ff;--green:#44ee88;--yellow:#ffcc33;--red:#ff4455;--purple:#bb44ff;--orange:#ff9933;
  --radius:10px;
}
body{font-family:'Courier New',monospace;background:var(--bg);color:var(--text);padding:28px 32px;font-size:13px;min-height:100vh}

/* ── Header ─────────────────────────────────────────────────────────── */
.header{display:flex;align-items:center;justify-content:space-between;margin-bottom:28px;padding-bottom:18px;border-bottom:1px solid var(--border)}
.logo{display:flex;align-items:center;gap:12px}
.logo-mark{width:36px;height:36px;border-radius:8px;background:linear-gradient(135deg,#00d4ff22,#00d4ff11);border:1px solid #00d4ff33;display:flex;align-items:center;justify-content:center;font-size:18px}
.logo h1{color:var(--blue);font-size:18px;letter-spacing:3px;font-weight:bold}
.header-meta{font-size:11px;color:var(--text3);margin-top:3px}
.header-right{display:flex;align-items:center;gap:10px}
.logout{color:var(--text3);text-decoration:none;font-size:11px;padding:6px 14px;border:1px solid var(--border2);border-radius:6px;transition:all .2s}
.logout:hover{color:var(--red);border-color:#3a1020}

/* ── Stats cards ─────────────────────────────────────────────────────── */
.stats{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:24px}
.stat{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:18px 20px;position:relative;overflow:hidden;transition:border-color .2s}
.stat::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;border-radius:var(--radius) var(--radius) 0 0}
.stat:hover{border-color:var(--border2)}
.stat-icon{font-size:20px;margin-bottom:10px;opacity:.7}
.stat-n{font-size:32px;font-weight:bold;line-height:1;font-variant-numeric:tabular-nums;letter-spacing:-1px}
.stat-l{font-size:10px;color:var(--text2);text-transform:uppercase;letter-spacing:1.5px;margin-top:6px}
.s-total::before{background:var(--blue)}   .s-total .stat-n{color:var(--blue)}
.s-ativa::before{background:var(--green)}  .s-ativa .stat-n{color:var(--green)}
.s-wait::before{background:var(--yellow)}  .s-wait  .stat-n{color:var(--yellow)}
.s-exp::before{background:var(--red)}      .s-exp   .stat-n{color:var(--red)}
.s-rev::before{background:var(--purple)}   .s-rev   .stat-n{color:var(--purple)}

/* ── Cards ───────────────────────────────────────────────────────────── */
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);margin-bottom:16px;overflow:hidden}
.card-head{padding:14px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between}
.card-head h2{font-size:11px;color:var(--text2);text-transform:uppercase;letter-spacing:1.5px;font-weight:normal}
.card-body{padding:20px}

/* ── Form ────────────────────────────────────────────────────────────── */
.form-row{display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap}
.field{display:flex;flex-direction:column;gap:6px}
.field label{font-size:10px;color:var(--text2);text-transform:uppercase;letter-spacing:.8px}
input[type=text],input[type=number],input[type=password]{
  background:#08080f;border:1px solid var(--border2);color:#d0d4e0;
  padding:9px 12px;border-radius:7px;font-family:monospace;font-size:12px;
  transition:border-color .2s,box-shadow .2s;outline:none;
}
input:focus{border-color:var(--blue);box-shadow:0 0 0 2px #00d4ff18}
.btn{background:linear-gradient(135deg,#00b8dd,#0090bb);color:#000;border:none;padding:9px 20px;border-radius:7px;cursor:pointer;font-weight:bold;font-size:12px;transition:opacity .2s;font-family:monospace;letter-spacing:.3px}
.btn:hover{opacity:.85}

/* ── Search ──────────────────────────────────────────────────────────── */
.search-wrap{padding:12px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px}
.search-wrap input{width:280px;background:#08080f;border:1px solid var(--border2);border-radius:7px;padding:8px 12px;color:var(--text);font-family:monospace;font-size:12px;outline:none;transition:border-color .2s}
.search-wrap input:focus{border-color:var(--blue)}
.search-icon{color:var(--text3);font-size:14px;user-select:none}

/* ── Table ───────────────────────────────────────────────────────────── */
.tbl-wrap{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:11px}
th{background:#070710;color:var(--text2);padding:10px 10px;text-align:left;border-bottom:1px solid var(--border);white-space:nowrap;font-size:10px;text-transform:uppercase;letter-spacing:.8px;font-weight:normal}
td{padding:9px 10px;border-bottom:1px solid #0b0b18;vertical-align:middle}
tr:last-child td{border-bottom:none}
tbody tr:hover td{background:#0d0d1e}
tr.warn-row td{background:#0d0c00}
tr.warn-row:hover td{background:#141200}

/* ── Badges / Tags ───────────────────────────────────────────────────── */
code{background:#0e0e1c;border:1px solid var(--border2);padding:2px 6px;border-radius:4px;font-size:10px;color:#7a8aaa;letter-spacing:.3px}
.tag{display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:20px;font-size:10px;font-weight:bold;white-space:nowrap;border:1px solid transparent;letter-spacing:.3px}
.t-ok  {background:#061410;color:var(--green); border-color:#1a4030}
.t-wait{background:#100e00;color:var(--yellow);border-color:#362e00}
.t-exp {background:#140608;color:var(--red);   border-color:#3a1018}
.t-rev {background:#0e0614;color:var(--purple);border-color:#2e1040}
.t-warn{background:#110d00;color:var(--orange);border-color:#382400}
.t-fr  {background:#140a00;color:var(--orange);border-color:#3a2000}
.src-bot {background:#020d18;color:#44aaff;border-color:#0a2840}
.src-dash{background:#021408;color:#66cc44;border-color:#0c3010}
.src-cron{background:#080820;color:#8888ff;border-color:#181848}
.src-api {background:#140800;color:var(--orange);border-color:#3a1800}

/* ── Key copy cell ───────────────────────────────────────────────────── */
.key-cell{display:flex;align-items:center;gap:6px;max-width:180px}
.key-val{font-size:10px;color:#3a4a5a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;font-family:monospace}
.cpbtn{background:none;border:1px solid var(--border2);color:var(--text3);padding:2px 7px;border-radius:4px;cursor:pointer;font-size:9px;font-family:monospace;transition:all .15s;flex-shrink:0}
.cpbtn:hover{border-color:var(--blue);color:var(--blue)}
.cpbtn.ok{border-color:var(--green);color:var(--green)}

/* ── Action buttons ──────────────────────────────────────────────────── */
.act-cell{display:flex;align-items:center;gap:4px;flex-wrap:nowrap}
.act-sep{width:1px;height:16px;background:var(--border2);margin:0 2px;flex-shrink:0}
.ab{display:inline-flex;align-items:center;gap:3px;background:var(--surface2);border:1px solid var(--border2);color:var(--text2);padding:4px 9px;border-radius:5px;cursor:pointer;font-size:10px;font-family:monospace;white-space:nowrap;transition:all .15s;text-decoration:none;line-height:1.2}
.ab:hover{background:#161626;border-color:#3a3a58;color:#ccc}
.ab:disabled{opacity:.22;cursor:default;pointer-events:none}
.ab.red{color:#cc3344}  .ab.red:hover{background:#150508;border-color:#7a1520;color:var(--red)}
.ab.grn{color:#33aa66}  .ab.grn:hover{background:#050f0a;border-color:#1a5030;color:var(--green)}
.ab.blu{color:#2288cc}  .ab.blu:hover{background:#030d18;border-color:#104868;color:var(--blue)}
.dias-in{width:34px;padding:4px 4px;background:#07070e;border:1px solid var(--border2);color:#888;border-radius:5px;font-size:10px;font-family:monospace;text-align:center;-moz-appearance:textfield}
.dias-in::-webkit-inner-spin-button{-webkit-appearance:none}

/* ── Flash ───────────────────────────────────────────────────────────── */
.flash{display:flex;align-items:flex-start;gap:10px;background:#040e08;border:1px solid #1a4025;border-left:3px solid var(--green);color:#88ccaa;padding:14px 18px;border-radius:8px;margin-bottom:20px;line-height:1.6;font-size:12px;word-break:break-all}
.flash-icon{font-size:16px;flex-shrink:0;margin-top:1px}

/* ── Log colours ─────────────────────────────────────────────────────── */
.la-key_criada{color:var(--green)}.la-key_ativada{color:#44aaff}.la-key_revogada{color:var(--purple)}
.la-reset_phone{color:var(--orange)}.la-key_apagada{color:var(--red)}.la-auto_delete{color:var(--yellow)}
.la-key_extendida{color:#44ccff}

/* ── Login ───────────────────────────────────────────────────────────── */
.login-wrap{display:flex;align-items:center;justify-content:center;min-height:100vh}
.login-box{background:var(--surface);border:1px solid var(--border);padding:40px;border-radius:14px;width:360px;box-shadow:0 16px 60px rgba(0,0,0,.5)}
.login-logo{text-align:center;margin-bottom:28px}
.login-logo .lm{width:52px;height:52px;border-radius:12px;background:linear-gradient(135deg,#00d4ff22,#00d4ff08);border:1px solid #00d4ff22;display:inline-flex;align-items:center;justify-content:center;font-size:26px;margin-bottom:10px}
.login-logo h2{color:var(--blue);font-size:16px;letter-spacing:4px}
.field-pw{margin-bottom:20px}
.err-msg{color:var(--red);margin-bottom:16px;font-size:11px;background:#0f0305;padding:10px 14px;border-radius:6px;border:1px solid #3a0810}
`

const JS = `
function cp(btn,val){
  navigator.clipboard.writeText(val).then(()=>{
    btn.textContent='✓';btn.classList.add('ok');
    setTimeout(()=>{btn.textContent='⎘';btn.classList.remove('ok')},1800);
  }).catch(()=>{});
}
function filt(){
  const q=document.getElementById('search').value.toLowerCase();
  document.querySelectorAll('#ltb tr').forEach(r=>{
    r.style.display=!q||r.textContent.toLowerCase().includes(q)?'':'none';
  });
}
`

const ACTION_ICON = {
  key_criada:'🆕 Criada', key_ativada:'✅ Ativada', key_revogada:'🚫 Revogada',
  reset_phone:'↺ Reset phone', key_apagada:'🗑 Apagada', auto_delete:'🤖 Auto-delete',
  key_extendida:'📅 Estendida',
}
const SRC = {
  bot:['src-bot','Bot'], dashboard:['src-dash','Dashboard'], cron:['src-cron','Cron'], api:['src-api','API'],
}

export function loginPage(error = '') {
  return htmlRes(`<!DOCTYPE html><html lang="pt"><head><meta charset=utf-8><title>Polar</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>${CSS}</style></head><body>
<div class="login-wrap"><div class="login-box">
  <div class="login-logo">
    <div class="lm">⬡</div>
    <h2>POLAR</h2>
  </div>
  ${error ? `<div class="err-msg">${esc(error)}</div>` : ''}
  <form method="POST" action="/dashboard/login">
    <div class="field field-pw">
      <label>Palavra-passe</label>
      <input type="password" name="password" style="width:100%" autofocus required>
    </div>
    <button type="submit" class="btn" style="width:100%;padding:11px">Entrar →</button>
  </form>
</div></div></body></html>`)
}

export function dashboardPage(licenses, flash = '', logs = [], criadorPhone = '') {
  const now = Date.now()

  const st = { total: licenses.length, ativas: 0, aguardando: 0, expiradas: 0, revogadas: 0 }
  for (const lic of licenses) {
    if (lic.revogada) { st.revogadas++; continue }
    if (lic.expiresAt && new Date(lic.expiresAt).getTime() < now) { st.expiradas++; continue }
    lic.botPhone ? st.ativas++ : st.aguardando++
  }

  function estado(lic) {
    if (lic.revogada) return ['t-rev','🚫 Revogada']
    const exp = lic.expiresAt ? new Date(lic.expiresAt).getTime() : null
    if (exp && exp < now)              return ['t-exp','● Expirada']
    if (!lic.botPhone)                 return ['t-wait','◌ Aguardando']
    if (exp && exp - now < 7*86400000) return ['t-warn','⚠ Expira em breve']
    return ['t-ok','● Ativa']
  }

  function dt(iso) {
    if (!iso) return `<span style="color:var(--text3)">—</span>`
    const d = new Date(iso)
    return `<span style="color:var(--text2)">${d.toLocaleDateString('pt-BR')}</span>`
  }

  function diasRestantes(lic) {
    if (!lic.expiresAt) return `<span style="color:var(--text3)">—</span>`
    const d = Math.ceil((new Date(lic.expiresAt).getTime() - now) / 86400000)
    if (d <= 0) return `<span style="color:var(--red);font-weight:bold">Expirada</span>`
    if (d <= 7)  return `<span style="color:var(--orange);font-weight:bold">${d}d</span>`
    return `<span style="color:var(--text2)">${d}d</span>`
  }

  function dtFull(iso) {
    if (!iso) return '—'
    const d = new Date(iso)
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})
  }

  const rows = licenses.map(lic => {
    const [tcls, tlabel] = estado(lic)
    const isCriador = criadorPhone && (
      (lic.botPhone  ?? '').replace(/\D/g,'') === criadorPhone ||
      (lic.donoPhone ?? '').replace(/\D/g,'') === criadorPhone
    )
    const expSoon = !lic.revogada && lic.expiresAt &&
      new Date(lic.expiresAt).getTime() - now < 7*86400000 &&
      new Date(lic.expiresAt).getTime() > now

    const keyCell = lic.key
      ? `<div class="key-cell"><span class="key-val" title="${esc(lic.key)}">${esc(lic.key.slice(0,32))}…</span><button class="cpbtn" onclick="cp(this,'${esc(lic.key)}')">⎘</button></div>`
      : `<span style="color:var(--text3)">—</span>`

    const fraudeCell = lic.fraude
      ? `<div>
          <span class="tag t-fr" title="Original: +${esc(lic.fraude.botOriginal)}">⚠ +${esc(lic.fraude.botPirata)}</span>
          <div style="font-size:9px;color:var(--text3);margin-top:2px">orig: +${esc(lic.fraude.botOriginal)}</div>
        </div>`
      : `<span style="color:var(--text3)">—</span>`

    const nomeCell = `<div>
      <span style="color:#e0e4f0;font-weight:bold">${esc(lic.cliente)}</span>${isCriador ? ` <span style="color:var(--blue);font-size:9px" title="Criador">★</span>` : ''}
      <div style="font-size:9px;color:var(--text3);margin-top:1px;font-family:monospace"><code style="font-size:9px">${esc(lic.keyId)}</code></div>
    </div>`

    return `<tr${expSoon ? ' class="warn-row"' : ''}>
      <td>${nomeCell}</td>
      <td>${lic.botPhone  ? `<code>+${esc(lic.botPhone)}</code>`  : `<span style="color:var(--text3)">—</span>`}</td>
      <td>${lic.donoPhone ? `<code>+${esc(lic.donoPhone)}</code>` : `<span style="color:var(--text3)">—</span>`}</td>
      <td><span class="tag ${tcls}">${tlabel}</span></td>
      <td style="text-align:right">${diasRestantes(lic)}</td>
      <td>${dt(lic.expiresAt)}</td>
      <td>${dt(lic.activatedAt)}</td>
      <td>${dt(lic.lastSeen)}</td>
      <td>${keyCell}</td>
      <td>${fraudeCell}</td>
      <td>
        <div class="act-cell">
          <form method="POST" action="/dashboard/action" style="display:contents">
            <input type="hidden" name="action" value="reset-phone">
            <input type="hidden" name="keyId" value="${esc(lic.keyId)}">
            <button class="ab" type="submit" title="Limpar phone">↺ Reset</button>
          </form>
          <form method="POST" action="/dashboard/action" style="display:contents">
            <input type="hidden" name="action" value="revoke">
            <input type="hidden" name="keyId" value="${esc(lic.keyId)}">
            <button class="ab red" type="submit" ${lic.revogada?'disabled':''} title="Revogar licença">🚫 Revogar</button>
          </form>
          <div class="act-sep"></div>
          <form method="POST" action="/dashboard/action" style="display:contents">
            <input type="hidden" name="action" value="extend">
            <input type="hidden" name="keyId" value="${esc(lic.keyId)}">
            <input class="dias-in" type="number" name="dias" value="30" min="1" max="3650" title="Dias a adicionar">
            <button class="ab grn" type="submit" title="Adicionar dias">+Dias</button>
          </form>
          <div class="act-sep"></div>
          <a href="/dashboard/tel/${esc(lic.keyId)}" target="_blank" class="ab blu" title="Telemetria">📊</a>
          <form method="POST" action="/dashboard/action" style="display:contents" onsubmit="return confirm('Apagar ${esc(lic.cliente)} permanentemente?')">
            <input type="hidden" name="action" value="delete">
            <input type="hidden" name="keyId" value="${esc(lic.keyId)}">
            <button class="ab red" type="submit" title="Apagar permanentemente">🗑</button>
          </form>
        </div>
      </td>
    </tr>`
  }).join('')

  const emptyRow = `<tr><td colspan="11" style="text-align:center;padding:48px;color:var(--text3)">
    Nenhuma licença registada — cria a primeira acima.
  </td></tr>`

  function logDetail(log) {
    const p = []
    if (log.botPhone)  p.push(`bot: +${esc(log.botPhone)}`)
    if (log.donoPhone) p.push(`dono: +${esc(log.donoPhone)}`)
    if (log.anterior)  p.push(`anterior: +${esc(log.anterior)}`)
    if (log.diasAdded) p.push(`+${log.diasAdded}d`)
    if (log.detalhe)   p.push(esc(log.detalhe))
    if (log.reason)    p.push(esc(log.reason))
    return p.join(' · ') || '—'
  }

  const logRows = logs.slice(0, 50).map(log => {
    const [sc, sl] = SRC[log.source] ?? ['', log.source ?? '?']
    return `<tr>
      <td style="color:var(--text3);white-space:nowrap;font-size:10px">${dtFull(log.ts)}</td>
      <td class="la-${esc(log.action)}" style="white-space:nowrap">${ACTION_ICON[log.action] ?? esc(log.action)}</td>
      <td><code>${esc(log.keyId ?? '—')}</code></td>
      <td style="color:var(--text2)">${esc(log.cliente ?? '—')}</td>
      <td><span class="tag ${sc}">${sl}</span></td>
      <td style="color:var(--text2);font-size:10px">${logDetail(log)}</td>
    </tr>`
  }).join('')

  const emptyLog = `<tr><td colspan="6" style="text-align:center;padding:28px;color:var(--text3)">Sem eventos registados.</td></tr>`

  const creatorBadge = criadorPhone
    ? `<span class="tag src-bot" style="font-size:9px;margin-left:8px">★ +${esc(criadorPhone)}</span>`
    : ''

  const flashHtml = flash
    ? `<div class="flash"><span class="flash-icon">${flash.startsWith('❌') ? '⚠' : '✓'}</span><div>${flash}</div></div>`
    : ''

  return htmlRes(`<!DOCTYPE html><html lang="pt"><head><meta charset=utf-8><title>Polar Licenses</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>${CSS}</style></head><body>

<div class="header">
  <div class="logo">
    <div class="logo-mark">⬡</div>
    <div>
      <h1>POLAR LICENSES</h1>
      <div class="header-meta">${st.total} licença${st.total!==1?'s':''} registada${st.total!==1?'s':''}${creatorBadge}</div>
    </div>
  </div>
  <div class="header-right">
    <a href="/dashboard/logout" class="logout">Sair →</a>
  </div>
</div>

${flashHtml}

<div class="stats">
  <div class="stat s-total"><div class="stat-icon">◈</div><div class="stat-n">${st.total}</div><div class="stat-l">Total</div></div>
  <div class="stat s-ativa"><div class="stat-icon">●</div><div class="stat-n">${st.ativas}</div><div class="stat-l">Ativas</div></div>
  <div class="stat s-wait"><div class="stat-icon">◌</div><div class="stat-n">${st.aguardando}</div><div class="stat-l">Aguardando</div></div>
  <div class="stat s-exp"><div class="stat-icon">✕</div><div class="stat-n">${st.expiradas}</div><div class="stat-l">Expiradas</div></div>
  <div class="stat s-rev"><div class="stat-icon">🚫</div><div class="stat-n">${st.revogadas}</div><div class="stat-l">Revogadas</div></div>
</div>

<div class="card">
  <div class="card-head"><h2>Nova Licença</h2></div>
  <div class="card-body">
    <form method="POST" action="/dashboard/action">
      <input type="hidden" name="action" value="create">
      <div class="form-row">
        <div class="field"><label>Nome do cliente</label><input type="text" name="cliente" placeholder="Ex: João Silva" required style="width:240px"></div>
        <div class="field"><label>Dias de validade</label><input type="number" name="dias" value="30" min="1" max="3650" style="width:90px"></div>
        <div class="field"><label>&nbsp;</label><button type="submit" class="btn">+ Criar Licença</button></div>
      </div>
    </form>
  </div>
</div>

<div class="card">
  <div class="search-wrap">
    <span class="search-icon">⌕</span>
    <input type="text" id="search" placeholder="Pesquisar cliente, phone, key ID…" oninput="filt()">
  </div>
  <div class="tbl-wrap">
    <table>
      <thead><tr>
        <th>Cliente · Key ID</th><th>Bot Phone</th><th>Dono</th><th>Estado</th><th style="text-align:right">Dias</th>
        <th>Expira</th><th>Ativada</th><th>Último acesso</th>
        <th>Chave POLAR</th><th>Fraude</th><th>Ações</th>
      </tr></thead>
      <tbody id="ltb">${rows || emptyRow}</tbody>
    </table>
  </div>
</div>

<div class="card">
  <div class="card-head">
    <h2>Audit Log</h2>
    <span style="font-size:10px;color:var(--text3)">últimos 50 eventos</span>
  </div>
  <div class="tbl-wrap">
    <table>
      <thead><tr><th>Data/Hora</th><th>Acção</th><th>Key ID</th><th>Cliente</th><th>Fonte</th><th>Detalhes</th></tr></thead>
      <tbody>${logRows || emptyLog}</tbody>
    </table>
  </div>
</div>

<script>${JS}</script>
</body></html>`)
}

export function telemetriaPage(lic, tel, criadorPhone = '') {
  const nome   = esc(lic?.cliente ?? '?')
  const keyId  = esc(lic?.keyId  ?? '?')
  const now    = Date.now()

  function dt(iso) {
    if (!iso) return '<span style="color:var(--text3)">—</span>'
    const d = new Date(iso)
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'})
  }

  function ago(iso) {
    if (!iso) return '—'
    const s = Math.floor((now - new Date(iso).getTime()) / 1000)
    if (s < 60)    return `${s}s atrás`
    if (s < 3600)  return `${Math.floor(s/60)}m atrás`
    if (s < 86400) return `${Math.floor(s/3600)}h atrás`
    return `${Math.floor(s/86400)}d atrás`
  }

  const cmdStats = tel.cmdStats ?? {}
  const topCmds  = Object.entries(cmdStats).sort((a,b) => b[1]-a[1]).slice(0, 20)

  const cmdRows = topCmds.length
    ? topCmds.map(([cmd, n], i) => {
        const pct = Math.round(n / topCmds[0][1] * 100)
        return `<tr>
          <td style="color:var(--text3);padding:6px 10px;width:32px">#${i+1}</td>
          <td style="padding:6px 10px"><code style="color:var(--blue)">${esc(cmd)}</code></td>
          <td style="padding:6px 10px;color:var(--green);font-variant-numeric:tabular-nums;text-align:right">${n.toLocaleString()}</td>
          <td style="padding:6px 10px;min-width:140px">
            <div style="background:#0e0e1c;border-radius:4px;height:5px;overflow:hidden">
              <div style="background:linear-gradient(90deg,#00d4ff,#0090cc);width:${pct}%;height:100%;border-radius:4px"></div>
            </div>
          </td>
        </tr>`
      }).join('')
    : `<tr><td colspan="4" style="padding:32px;text-align:center;color:var(--text3)">Sem dados de comandos ainda — o bot precisa de atualizar.</td></tr>`

  const errors = tel.errors ?? []
  const errRows = errors.length
    ? errors.map(e => `<tr>
        <td style="padding:5px 10px;color:var(--text3);font-size:10px;white-space:nowrap">${dt(e.ts)}</td>
        <td style="padding:5px 10px;color:var(--red)">${esc(e.type)}</td>
        <td style="padding:5px 10px;color:var(--text);max-width:340px;word-break:break-word">${esc(e.msg)}</td>
        <td style="padding:5px 10px;color:var(--text3);font-size:10px">${esc(e.ctx)}</td>
      </tr>`).join('')
    : `<tr><td colspan="4" style="padding:32px;text-align:center;color:var(--text3)">Sem erros registados.</td></tr>`

  const totalCmds = Object.values(cmdStats).reduce((a,b) => a+b, 0)

  return htmlRes(`<!DOCTYPE html><html lang="pt"><head><meta charset=utf-8><title>📊 ${nome}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>${CSS}
.tel-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}
@media(max-width:800px){.tel-grid{grid-template-columns:repeat(2,1fr)}}
</style></head><body>

<div class="header">
  <div class="logo">
    <div class="logo-mark">📊</div>
    <div>
      <h1>TELEMETRIA</h1>
      <div class="header-meta">${nome} · <code style="color:var(--blue)">${keyId}</code></div>
    </div>
  </div>
  <a href="/dashboard" class="logout">← Dashboard</a>
</div>

<div class="tel-grid">
  <div class="stat s-total"><div class="stat-icon">◈</div><div class="stat-n" style="font-size:22px">${esc(tel.version ?? '—')}</div><div class="stat-l">Versão</div></div>
  <div class="stat s-ativa"><div class="stat-icon">◉</div><div class="stat-n" style="font-size:18px">${tel.lastHeartbeat ? ago(tel.lastHeartbeat) : '—'}</div><div class="stat-l">Último heartbeat</div></div>
  <div class="stat s-wait"><div class="stat-icon">⌘</div><div class="stat-n" style="font-size:22px">${totalCmds.toLocaleString()}</div><div class="stat-l">Comandos totais</div></div>
  <div class="stat ${errors.length ? 's-exp' : 's-ativa'}"><div class="stat-icon">${errors.length ? '⚠' : '✓'}</div><div class="stat-n" style="font-size:22px">${errors.length}</div><div class="stat-l">Erros</div></div>
</div>

${tel.uptimeSince ? `<div style="margin-bottom:20px;font-size:11px;color:var(--text3)">Online desde: <span style="color:var(--text2)">${dt(tel.uptimeSince)}</span></div>` : ''}

<div class="card">
  <div class="card-head"><h2>Top Comandos</h2><span style="font-size:10px;color:var(--text3)">top 20</span></div>
  <div class="tbl-wrap">
    <table>
      <thead><tr><th>#</th><th>Comando</th><th style="text-align:right">Usos</th><th>Frequência</th></tr></thead>
      <tbody>${cmdRows}</tbody>
    </table>
  </div>
</div>

<div class="card">
  <div class="card-head"><h2>Erros Recentes</h2><span style="font-size:10px;color:var(--text3)">últimos 50</span></div>
  <div class="tbl-wrap">
    <table>
      <thead><tr><th>Data/Hora</th><th>Tipo</th><th>Mensagem</th><th>Contexto</th></tr></thead>
      <tbody>${errRows}</tbody>
    </table>
  </div>
</div>

</body></html>`)
}
