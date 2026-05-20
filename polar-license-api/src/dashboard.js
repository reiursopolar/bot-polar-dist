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
  --bg:#07070f;--surface:#0c0c1a;--surface2:#0f0f1e;--border:#1a1a2e;--border2:#252538;
  --text:#b8bcc8;--text2:#6a6e80;--text3:#333345;
  --blue:#00d4ff;--green:#55ff99;--yellow:#ffcc33;--red:#ff5566;--purple:#cc55ff;--orange:#ff9944;
}
body{font-family:'Courier New',monospace;background:var(--bg);color:var(--text);padding:24px;font-size:13px;min-height:100vh}

/* Header */
.header{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid var(--border)}
.header-left h1{color:var(--blue);font-size:20px;letter-spacing:2px;font-weight:bold}
.header-meta{font-size:11px;color:var(--text2);margin-top:4px}
.logout{color:var(--text3);text-decoration:none;font-size:11px;padding:5px 12px;border:1px solid var(--border2);border-radius:5px;transition:all .2s;white-space:nowrap;margin-top:2px;display:inline-block}
.logout:hover{color:var(--red);border-color:#4a1a1a}

/* Stats */
.stats{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:24px}
.stat{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:14px 16px;transition:border-color .2s}
.stat:hover{border-color:var(--border2)}
.stat-n{font-size:30px;font-weight:bold;line-height:1.1;font-variant-numeric:tabular-nums}
.stat-l{font-size:10px;color:var(--text2);text-transform:uppercase;letter-spacing:1px;margin-top:6px}
.s-total .stat-n{color:var(--blue)}
.s-ativa .stat-n{color:var(--green)}
.s-wait  .stat-n{color:var(--yellow)}
.s-exp   .stat-n{color:var(--red)}
.s-rev   .stat-n{color:var(--purple)}

/* Cards */
.card{background:var(--surface);border:1px solid var(--border);border-radius:8px;margin-bottom:20px;box-shadow:0 4px 24px rgba(0,0,0,.35)}
.card-body{padding:16px}
.card-title{font-size:10px;color:var(--text2);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:14px}

/* Form */
.row{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap}
label{display:block;color:var(--text2);font-size:10px;margin-bottom:5px;text-transform:uppercase;letter-spacing:.5px}
input[type=text],input[type=number],input[type=password]{background:#080810;border:1px solid var(--border2);color:#d0d4e0;padding:8px 10px;border-radius:6px;font-family:monospace;font-size:12px;transition:border-color .2s;outline:none}
input:focus{border-color:var(--blue)}

/* Buttons */
.btn{background:linear-gradient(135deg,#00d4ff,#0095cc);color:#000;border:none;padding:9px 18px;border-radius:6px;cursor:pointer;font-weight:bold;font-size:12px;white-space:nowrap;transition:opacity .2s;font-family:monospace}
.btn:hover{opacity:.8}
.btn-sm{background:var(--surface2);color:#999;border:1px solid var(--border2);padding:3px 8px;border-radius:4px;cursor:pointer;font-size:11px;font-family:monospace;transition:all .15s}
.btn-sm:hover{background:#161626;color:#ccc;border-color:#3a3a5a}
.btn-sm:disabled{opacity:.25;cursor:default}
.btn-red{color:var(--red);border-color:#3a1515}
.btn-red:hover{background:#130808;border-color:#6a1a1a}
.btn-green{color:var(--green);border-color:#153a20}
.btn-green:hover{background:#08130c;border-color:#2a6a3a}

/* Search */
.search-bar{padding:12px 16px;border-bottom:1px solid var(--border)}
#search{width:260px}

/* Table */
.tbl-wrap{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:11px}
th{background:#080812;color:var(--blue);padding:9px 8px;text-align:left;border-bottom:1px solid var(--border);white-space:nowrap;font-size:10px;text-transform:uppercase;letter-spacing:.5px}
td{padding:7px 8px;border-bottom:1px solid #0d0d1c;vertical-align:middle}
tr:hover td{background:#0d0d1c}
tr.warn-row td{background:#100f00}
tr.warn-row:hover td{background:#161500}

/* Tags */
code{background:var(--surface2);padding:2px 5px;border-radius:3px;font-size:10px;color:#7a8a9a}
.tag{display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:bold;white-space:nowrap;border:1px solid transparent}
.t-ok  {background:#081a0e;color:var(--green); border-color:#1a4a25}
.t-wait{background:#151200;color:var(--yellow);border-color:#3a3000}
.t-exp {background:#180808;color:var(--red);   border-color:#401515}
.t-rev {background:#120818;color:var(--purple);border-color:#381545}
.t-warn{background:#151000;color:var(--orange);border-color:#3a2800}
.t-fr  {background:#181005;color:var(--orange);border-color:#3a2510}
.src-bot {background:#04121f;color:#55aaff;border-color:#0e2e50}
.src-dash{background:#081408;color:#77cc55;border-color:#1a3510}
.src-cron{background:#090920;color:#8888ff;border-color:#1a1a4a}
.src-api {background:#180f04;color:var(--orange);border-color:#402510}

/* Copy button */
.cpbtn{background:none;border:1px solid var(--border2);color:var(--text3);padding:2px 6px;border-radius:3px;cursor:pointer;font-size:9px;font-family:monospace;transition:all .15s;vertical-align:middle}
.cpbtn:hover{border-color:var(--blue);color:var(--blue)}
.cpbtn.ok{border-color:var(--green);color:var(--green)}
.key-val{font-size:10px;color:#445;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block;vertical-align:middle}

/* Dias mini-input */
.dias-in{width:38px;padding:2px 4px;background:#080810;border:1px solid var(--border2);color:#999;border-radius:3px;font-size:10px;font-family:monospace;text-align:center}

/* Flash */
.flash{background:#051508;border:1px solid #1a4a25;color:var(--green);padding:12px 16px;border-radius:7px;margin-bottom:20px;line-height:1.6;font-size:12px;word-break:break-all}

/* Login */
.login-wrap{display:flex;align-items:center;justify-content:center;min-height:100vh}
.login-box{background:var(--surface);border:1px solid var(--border);padding:36px;border-radius:10px;width:340px;box-shadow:0 8px 40px rgba(0,180,255,.04)}
.login-box h2{color:var(--blue);margin-bottom:24px;font-size:18px;letter-spacing:2px}
.err{color:var(--red);margin-bottom:14px;font-size:12px;background:#130505;padding:8px 12px;border-radius:4px;border:1px solid #3a1010}

/* Log colours */
.la-key_criada{color:var(--green)}.la-key_ativada{color:#55aaff}.la-key_revogada{color:var(--purple)}
.la-reset_phone{color:var(--orange)}.la-key_apagada{color:var(--red)}.la-auto_delete{color:var(--yellow)}
.la-key_extendida{color:#55ccff}
`

const JS = `
function cp(btn,val){
  navigator.clipboard.writeText(val).then(()=>{
    btn.textContent='✓';btn.classList.add('ok');
    setTimeout(()=>{btn.textContent='copy';btn.classList.remove('ok')},2000);
  });
}
function filt(){
  const q=document.getElementById('search').value.toLowerCase();
  document.querySelectorAll('#ltb tr').forEach(r=>{
    r.style.display=!q||r.textContent.toLowerCase().includes(q)?'':'none';
  });
}
`

const ACTION_ICON = {
  key_criada:'🆕 Criada', key_ativada:'✅ Ativada', key_revogada:'❌ Revogada',
  reset_phone:'🔄 Reset', key_apagada:'🗑️ Apagada', auto_delete:'🤖 Auto-delete',
  key_extendida:'📅 Estendida',
}
const SRC = {
  bot:['src-bot','Bot'], dashboard:['src-dash','Dashboard'], cron:['src-cron','Cron'], api:['src-api','API'],
}

export function loginPage(error = '') {
  return htmlRes(`<!DOCTYPE html><html><head><meta charset=utf-8><title>Polar</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>${CSS}</style></head><body>
<div class="login-wrap"><div class="login-box">
  <h2>⬡ POLAR</h2>
  ${error ? `<div class="err">${esc(error)}</div>` : ''}
  <form method="POST" action="/dashboard/login">
    <div style="margin-bottom:16px">
      <label>Palavra-passe</label>
      <input type="password" name="password" style="width:100%" autofocus required>
    </div>
    <button type="submit" class="btn" style="width:100%">Entrar →</button>
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
    if (lic.revogada) return ['t-rev','❌ Revogada']
    const exp = lic.expiresAt ? new Date(lic.expiresAt).getTime() : null
    if (exp && exp < now)              return ['t-exp','🔴 Expirada']
    if (!lic.botPhone)                 return ['t-wait','⏳ Aguardando']
    if (exp && exp - now < 7*86400000) return ['t-warn','⚠️ Expira em breve']
    return ['t-ok','✅ Ativa']
  }

  function dt(iso) {
    if (!iso) return `<span style="color:var(--text3)">—</span>`
    return new Date(iso).toLocaleDateString('pt-BR')
  }

  function dtFull(iso) {
    if (!iso) return '—'
    const d = new Date(iso)
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})
  }

  function diasRestantes(lic) {
    if (!lic.expiresAt) return `<span style="color:var(--text3)">—</span>`
    const d = Math.ceil((new Date(lic.expiresAt).getTime() - now) / 86400000)
    if (d <= 0) return `<span style="color:var(--red)">Expirada</span>`
    if (d <= 7)  return `<span style="color:var(--orange)">${d}d</span>`
    return `${d}d`
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
    const fraude = lic.fraude
      ? `<span class="tag t-fr" title="Original: +${esc(lic.fraude.botOriginal)}">⚠️ +${esc(lic.fraude.botPirata)}</span>`
      : `<span style="color:var(--text3)">—</span>`
    const keyCell = lic.key
      ? `<span class="key-val" title="${esc(lic.key)}">${esc(lic.key)}</span> <button class="cpbtn" onclick="cp(this,'${esc(lic.key)}')">copy</button>`
      : `<span style="color:var(--text3)">—</span>`
    return `<tr${expSoon ? ' class="warn-row"' : ''}>
      <td><b style="color:#d0d4e0">${esc(lic.cliente)}</b>${isCriador ? ` <span style="color:var(--blue);font-size:9px">★</span>` : ''}</td>
      <td>${lic.botPhone  ? `<code>+${esc(lic.botPhone)}</code>`  : `<span style="color:var(--text3)">—</span>`}</td>
      <td>${lic.donoPhone ? `<code>+${esc(lic.donoPhone)}</code>` : `<span style="color:var(--text3)">—</span>`}</td>
      <td><span class="tag ${tcls}">${tlabel}</span></td>
      <td>${diasRestantes(lic)}</td>
      <td>${dt(lic.expiresAt)}</td>
      <td>${dt(lic.criadaEm)}</td>
      <td>${dt(lic.activatedAt)}</td>
      <td>${dt(lic.lastSeen)}</td>
      <td><code>${esc(lic.keyId)}</code></td>
      <td>${keyCell}</td>
      <td>${fraude}</td>
      <td style="white-space:nowrap;display:flex;gap:4px;align-items:center;flex-wrap:wrap">
        <form method="POST" action="/dashboard/action" style="display:contents">
          <input type="hidden" name="action" value="revoke">
          <input type="hidden" name="keyId" value="${esc(lic.keyId)}">
          <button class="btn-sm btn-red" type="submit" ${lic.revogada?'disabled':''}>Revogar</button>
        </form>
        <form method="POST" action="/dashboard/action" style="display:contents">
          <input type="hidden" name="action" value="reset-phone">
          <input type="hidden" name="keyId" value="${esc(lic.keyId)}">
          <button class="btn-sm" type="submit">Reset</button>
        </form>
        <form method="POST" action="/dashboard/action" style="display:contents">
          <input type="hidden" name="action" value="extend">
          <input type="hidden" name="keyId" value="${esc(lic.keyId)}">
          <input class="dias-in" type="number" name="dias" value="30" min="1" max="3650">
          <button class="btn-sm btn-green" type="submit">+Dias</button>
        </form>
        <form method="POST" action="/dashboard/action" style="display:contents" onsubmit="return confirm('Apagar permanentemente?')">
          <input type="hidden" name="action" value="delete">
          <input type="hidden" name="keyId" value="${esc(lic.keyId)}">
          <button class="btn-sm btn-red" type="submit">Apagar</button>
        </form>
      </td>
    </tr>`
  }).join('')

  const emptyRow = `<tr><td colspan="13" style="text-align:center;padding:40px;color:var(--text3)">
    Nenhuma licença ainda — cria a primeira acima.
  </td></tr>`

  function logDetail(log) {
    const p = []
    if (log.botPhone)  p.push(`bot: +${esc(log.botPhone)}`)
    if (log.donoPhone) p.push(`dono: +${esc(log.donoPhone)}`)
    if (log.anterior)  p.push(`anterior: +${esc(log.anterior)}`)
    if (log.diasAdded) p.push(`+${log.diasAdded} dias`)
    if (log.detalhe)   p.push(esc(log.detalhe))
    if (log.reason)    p.push(esc(log.reason))
    return p.join(' · ') || '—'
  }

  const logRows = logs.slice(0, 50).map(log => {
    const [sc, sl] = SRC[log.source] ?? ['', log.source ?? '?']
    return `<tr>
      <td style="color:var(--text3);white-space:nowrap;font-size:10px">${dtFull(log.ts)}</td>
      <td class="la-${log.action}" style="white-space:nowrap">${ACTION_ICON[log.action] ?? log.action}</td>
      <td><code>${esc(log.keyId ?? '—')}</code></td>
      <td style="color:var(--text2)">${esc(log.cliente ?? '—')}</td>
      <td><span class="tag ${sc}">${sl}</span></td>
      <td style="color:var(--text2);font-size:10px">${logDetail(log)}</td>
    </tr>`
  }).join('')

  const emptyLog = `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text3)">Sem eventos registados.</td></tr>`

  const creatorInfo = criadorPhone
    ? ` &nbsp;·&nbsp; <span style="color:var(--text3)">★ <code style="color:var(--blue)">+${esc(criadorPhone)}</code></span>`
    : ''

  return htmlRes(`<!DOCTYPE html><html><head><meta charset=utf-8><title>Polar Licenses</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>${CSS}</style></head><body>

<div class="header">
  <div class="header-left">
    <h1>⬡ POLAR LICENSES</h1>
    <div class="header-meta">${st.total} licença${st.total!==1?'s':''} registada${st.total!==1?'s':''}${creatorInfo}</div>
  </div>
  <a href="/dashboard/logout" class="logout">Sair →</a>
</div>

${flash ? `<div class="flash">${flash}</div>` : ''}

<div class="stats">
  <div class="stat s-total"><div class="stat-n">${st.total}</div><div class="stat-l">Total</div></div>
  <div class="stat s-ativa"><div class="stat-n">${st.ativas}</div><div class="stat-l">Ativas</div></div>
  <div class="stat s-wait"><div class="stat-n">${st.aguardando}</div><div class="stat-l">Aguardando</div></div>
  <div class="stat s-exp"><div class="stat-n">${st.expiradas}</div><div class="stat-l">Expiradas</div></div>
  <div class="stat s-rev"><div class="stat-n">${st.revogadas}</div><div class="stat-l">Revogadas</div></div>
</div>

<div class="card">
  <div class="card-body">
    <div class="card-title">Nova Licença</div>
    <form method="POST" action="/dashboard/action">
      <input type="hidden" name="action" value="create">
      <div class="row">
        <div><label>Nome do cliente</label><input type="text" name="cliente" placeholder="Ex: João Silva" required style="width:220px"></div>
        <div><label>Dias de validade</label><input type="number" name="dias" value="30" min="1" max="3650" style="width:80px"></div>
        <button type="submit" class="btn">+ Criar Licença</button>
      </div>
    </form>
  </div>
</div>

<div class="card">
  <div class="search-bar">
    <input type="text" id="search" placeholder="Pesquisar cliente, phone, keyId…" oninput="filt()" style="width:260px">
  </div>
  <div class="tbl-wrap">
    <table>
      <thead><tr>
        <th>Cliente</th><th>Bot Phone</th><th>Dono Phone</th><th>Estado</th><th>Dias</th>
        <th>Expira</th><th>Criada</th><th>Ativada</th><th>Último Acesso</th>
        <th>Key ID</th><th>Chave POLAR</th><th>Fraude</th><th>Ações</th>
      </tr></thead>
      <tbody id="ltb">${rows || emptyRow}</tbody>
    </table>
  </div>
</div>

<div class="card">
  <div class="card-body" style="padding-bottom:0"><div class="card-title">Audit Log <span style="color:var(--text3);font-weight:normal">(últimos 50)</span></div></div>
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
