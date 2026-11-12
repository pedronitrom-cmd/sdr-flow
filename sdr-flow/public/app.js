'use strict';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const IC = {
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>',
  chat: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  chart: '<path d="M12 20V10M18 20V4M6 20v-4"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  msg: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  zap: '<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>',
  skip: '<path d="M5 4l10 8-10 8V4zM19 5v14"/>',
  refresh: '<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>'
};
const ic = (n, s = 20) => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true">${IC[n] || ''}</svg>`;

let TOKEN = null;
try { TOKEN = localStorage.getItem('sdrflow_token'); } catch (e) { /* sem storage */ }
const S = { sel: new Set(), del: null, lote: '', lotes: [], user: null, config: {}, view: '', skip: [], msgs: [], tplId: null, varIdx: 0, waWait: 0, stats: null, fila: null, counts: null, periodo: 'hoje', timer: null, imp: null, users: null, lf: { q: '', status: '', owner: '', lote: '', offset: 0 } };
const VIEWS = {};
const ACT = {};

function toast(msg, err) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'on' + (err ? ' err' : '');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.className = ''; }, err ? 4200 : 2200);
}

async function api(path, opts = {}) {
  const headers = { 'content-type': 'application/json' };
  if (TOKEN) headers.Authorization = 'Bearer ' + TOKEN;
  const r = await fetch('/api' + path, { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  if (r.status === 401 && TOKEN && path !== '/login') { logoutLocal(); throw new Error('Sessão expirada. Entre novamente.'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro || 'Algo deu errado. Tente de novo.');
  return j;
}
function logoutLocal() {
  TOKEN = null; S.user = null;
  try { localStorage.removeItem('sdrflow_token'); } catch (e) { /* ok */ }
  clearInterval(S.timer);
  viewLogin();
}

const fmtPhone = (t) => {
  const d = String(t || '').replace(/^55/, '');
  const ddd = d.slice(0, 2), r = d.slice(2);
  return r.length === 9 ? `(${ddd}) ${r.slice(0, 5)}-${r.slice(5)}` : `(${ddd}) ${r.slice(0, 4)}-${r.slice(4)}`;
};
const money = (n) => (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const num = (n) => Math.round(n || 0).toLocaleString('pt-BR');
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) + '%' : '—');
const first = (n) => String(n || '').trim().split(/\s+/)[0] || '';
const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
function when(ms) {
  if (!ms) return '—';
  const d = new Date(ms), diff = Math.round((dayStart(d) - dayStart(new Date())) / 86400000);
  const hm = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (diff === 0) return 'hoje ' + hm;
  if (diff === 1) return 'amanhã ' + hm;
  if (diff === -1) return 'ontem ' + hm;
  return diff < 0 ? 'há ' + -diff + ' dias' : 'em ' + diff + ' dias';
}
function ago(ms) {
  if (!ms) return 'sem atividade';
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'agora';
  if (m < 60) return 'há ' + m + ' min';
  const h = Math.round(m / 60);
  return h < 24 ? 'há ' + h + ' h' : 'há ' + Math.round(h / 24) + ' dias';
}
const STATUS = {
  novo: ['Novo', ''], abordado: ['Abordado', 'blue'], conversando: ['Conversando', 'vio'], interessado: ['Interessado', 'sun'],
  proposta: ['Proposta', 'sun'], venda: ['Venda', 'ok'], perdido: ['Perdido', 'bad'], invalido: ['Inválido', 'bad']
};
const statusChip = (s) => `<span class="chip ${(STATUS[s] || ['', ''])[1]}">${(STATUS[s] || [s])[0]}</span>`;
const RES_LABEL = {
  nao_atendeu: 'Não atendeu', caixa_postal: 'Caixa postal', falou: 'Falou com o cliente', interessado: 'Interessado', proposta: 'Proposta enviada',
  venda: 'Venda fechada', sem_interesse: 'Sem interesse', invalido: 'Número inválido', enviado: 'Mensagem enviada', respondeu: 'Respondeu', nota: 'Anotação'
};
const RES_LIG = [['nao_atendeu', 'Não atendeu'], ['caixa_postal', 'Caixa postal'], ['falou', 'Falou com o cliente'], ['interessado', 'Interessado', 'pos'], ['proposta', 'Proposta enviada', 'pos'], ['venda', 'Venda fechada', 'pos'], ['sem_interesse', 'Sem interesse', 'neg'], ['invalido', 'Número inválido', 'neg']];
const RES_WA = [['enviado', 'Mensagem enviada'], ['respondeu', 'Respondeu'], ['interessado', 'Interessado', 'pos'], ['proposta', 'Proposta enviada', 'pos'], ['venda', 'Venda fechada', 'pos'], ['sem_interesse', 'Sem interesse', 'neg'], ['invalido', 'Sem WhatsApp', 'neg']];

function normalizePhone(raw) {
  let d = String(raw || '').replace(/\D/g, '').replace(/^0+/, '');
  if (d.length === 10 || d.length === 11) d = '55' + d;
  return (d.length === 12 || d.length === 13) && d.startsWith('55') ? d : null;
}

/* ---------- modal ---------- */
function modal(html, locked) {
  closeModal();
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.id = 'modal';
  bg.innerHTML = `<div class="modal">${html}</div>`;
  if (!locked) bg.addEventListener('click', (e) => { if (e.target === bg) closeModal(); });
  document.body.appendChild(bg);
}
function closeModal() { const m = $('#modal'); if (m) m.remove(); }

/* ---------- login ---------- */
function viewLogin() {
  $('#app').innerHTML = `
  <div class="login"><form class="login-card" id="lf">
    <div class="logo"><div class="logo-mark">${ic('zap', 22)}</div><span>SDR Flow</span></div>
    <h1 style="margin-top:22px">Bem-vindo</h1>
    <p class="muted" style="margin:6px 0 0">Entre para começar a trabalhar a sua fila.</p>
    <label class="field"><span>Usuário</span><input type="text" id="lu" autocomplete="username" autocapitalize="none" autocorrect="off" required></label>
    <label class="field"><span>Senha</span><input type="password" id="lp" autocomplete="current-password" required></label>
    <div id="le" class="alert bad hide" style="margin-top:14px"></div>
    <button class="btn block" style="margin-top:20px" type="submit">Entrar</button>
  </form></div>`;
  $('#lf').addEventListener('submit', async (e) => {
    e.preventDefault();
    const b = $('#lf button'); b.disabled = true;
    try {
      const r = await api('/login', { method: 'POST', body: { usuario: $('#lu').value, senha: $('#lp').value } });
      TOKEN = r.token;
      try { localStorage.setItem('sdrflow_token', TOKEN); } catch (er) { /* ok */ }
      S.user = r.user; S.config = r.config;
      boot();
    } catch (er) {
      const x = $('#le'); x.textContent = er.message; x.classList.remove('hide'); b.disabled = false;
    }
  });
}

/* ---------- shell ---------- */
const NAV = {
  sdr: [['fila', 'Fila', 'phone'], ['hoje', 'Hoje', 'calendar'], ['numeros', 'Números', 'chart'], ['contatos', 'Contatos', 'user']],
  gestor: [['painel', 'Painel', 'chart'], ['contatos', 'Contatos', 'upload'], ['equipe', 'Equipe', 'users'], ['mensagens', 'Mensagens', 'msg'], ['config', 'Ajustes', 'sliders']]
};
function renderShell() {
  const nav = NAV[S.user.papel];
  const btn = (n) => `<button data-act="nav" data-v="${n[0]}" data-nav="${n[0]}">${ic(n[2], 22)}<span>${n[1]}</span>${n[0] === 'hoje' ? '<b class="badge-n hide" id="bdg"></b>' : ''}</button>`;
  $('#app').innerHTML = `
  <div class="shell">
    <aside class="side">
      <div class="logo"><div class="logo-mark">${ic('zap', 22)}</div><span>${esc(S.config.empresa || 'SDR Flow')}</span></div>
      <nav>${nav.map(btn).join('')}</nav>
      <div class="who"><b>${esc(S.user.nome)}</b><span class="muted" style="color:#9AA6C4">${S.user.papel === 'gestor' ? 'Gestor' : 'SDR'}</span>
        <div class="row" style="margin-top:10px"><button class="btn sm sec" data-act="pwd">Senha</button><button class="btn sm sec" data-act="logout">Sair</button></div></div>
    </aside>
    <main class="main">
      <div class="mtop"><div class="logo"><div class="logo-mark" style="width:32px;height:32px">${ic('zap', 18)}</div><span>${esc(S.config.empresa || 'SDR Flow')}</span></div>
        <div class="row"><span class="small muted">${esc(first(S.user.nome))}</span><button class="btn ghost" data-act="pwd" aria-label="Trocar senha">${ic('user', 20)}</button><button class="btn ghost" data-act="logout" aria-label="Sair">${ic('logout', 20)}</button></div></div>
      <div id="main"></div>
    </main>
    <nav class="tabs">${nav.map(btn).join('')}</nav>
  </div>`;
}
function setBadge(n) {
  $$('#bdg').forEach((b) => { b.textContent = n; b.classList.toggle('hide', !n); });
}
async function go(view, arg) {
  S.view = view;
  $$('[data-nav]').forEach((b) => b.classList.toggle('on', b.dataset.nav === view));
  clearInterval(S.timer);
  const m = $('#main');
  m.innerHTML = '<div class="muted" style="padding:40px;text-align:center">Carregando…</div>';
  try { await VIEWS[view](arg); } catch (e) { m.innerHTML = `<div class="alert bad">${esc(e.message)}</div>`; }
  window.scrollTo(0, 0);
}

async function boot() {
  if (!TOKEN) return viewLogin();
  try {
    const r = await api('/me');
    S.user = r.user; S.config = r.config;
  } catch (e) { return viewLogin(); }
  try { S.msgs = await api('/mensagens'); } catch (e) { S.msgs = []; }
  renderShell();
  if (S.user.trocar_senha) pwdModal(true);
  go(S.user.papel === 'gestor' ? 'painel' : 'fila');
  if (S.user.papel === 'sdr') api('/hoje').then((h) => setBadge(h.counts.devidos)).catch(() => {});
}

/* ---------- senha ---------- */
function pwdModal(forced) {
  modal(`<h2>${forced ? 'Crie a sua senha' : 'Trocar senha'}</h2>
    <p class="muted small">${forced ? 'No primeiro acesso é preciso trocar a senha provisória.' : 'Use pelo menos 6 caracteres.'}</p>
    <label class="field"><span>Senha atual</span><input type="password" id="p0" autocomplete="current-password"></label>
    <label class="field"><span>Nova senha</span><input type="password" id="p1" autocomplete="new-password"></label>
    <label class="field"><span>Repita a nova senha</span><input type="password" id="p2" autocomplete="new-password"></label>
    <div class="row" style="margin-top:18px">${forced ? '' : '<button class="btn sec grow" data-act="close">Cancelar</button>'}<button class="btn grow" data-act="pwdsave">Salvar</button></div>`, forced);
}
ACT.pwd = () => pwdModal(false);
ACT.close = () => closeModal();
ACT.pwdsave = async () => {
  const a = $('#p0').value, b = $('#p1').value, c = $('#p2').value;
  if (b !== c) return toast('As senhas novas não conferem', true);
  try { await api('/me/senha', { method: 'POST', body: { atual: a, nova: b } }); S.user.trocar_senha = 0; closeModal(); toast('Senha alterada'); } catch (e) { toast(e.message, true); }
};
ACT.logout = async () => { try { await api('/logout', { method: 'POST' }); } catch (e) { /* ok */ } logoutLocal(); };
ACT.nav = (t) => go(t.dataset.v);
ACT.open = (t) => { if (S.user.papel === 'gestor') leadModal(t.dataset.id); else go('fila', t.dataset.id); };

/* ---------- mensagens ---------- */
function renderTpl(text, lead) {
  return String(text || '')
    .replace(/\{nome\}/g, first(lead.nome))
    .replace(/\{nome_completo\}/g, lead.nome || '')
    .replace(/\{empresa\}/g, lead.empresa || '')
    .replace(/\{cidade\}/g, lead.cidade || '')
    .replace(/\{consumo\}/g, lead.consumo || '')
    .replace(/\{sdr\}/g, first(S.user.nome))
    .replace(/\{link\}/g, S.config.pdf_link || '')
    .replace(/[ \t]+\n/g, '\n').trim();
}
function msgPool(lead) {
  const esp = S.msgs.filter((m) => m.lote && lead && m.lote === lead.lote);
  return esp.length ? esp : S.msgs.filter((m) => !m.lote);
}
function pickMsg(rotate) {
  const f = S.fila, pool = msgPool(f.lead);
  const tpl = pool.find((t) => String(t.id) === String(S.tplId)) || pool[0];
  if (!tpl) { f.msgText = ''; return; }
  S.tplId = tpl.id;
  const n = tpl.variantes.length;
  S.varIdx = rotate ? (S.varIdx + 1) % n : Math.floor(Math.random() * n);
  f.msgText = renderTpl(tpl.variantes[S.varIdx], f.lead);
}

/* ---------- fila (SDR) ---------- */
VIEWS.fila = (forceId) => loadFila(forceId);
async function loadFila(forceId) {
  const stP = api('/stats/meu');
  let nx;
  if (forceId) {
    const r = await api('/leads/' + forceId);
    nx = { lead: r.lead, historico: r.historico.slice(0, 8), motivo: 'manual' };
  } else nx = await api('/fila/proxima?pular=' + S.skip.join(',') + '&lote=' + encodeURIComponent(S.lote));
  try { S.lotes = await api('/lotes'); } catch (e) { S.lotes = []; }
  S.stats = await stP;
  if (!nx.counts) nx.counts = (await api('/hoje')).counts;
  S.counts = nx.counts; setBadge(nx.counts.devidos);
  S.fila = { ...nx, canal: null, resultado: null, followup: 'auto', nota: '', valor: '', msgText: '' };
  if (S.fila.lead) pickMsg(false);
  drawFila();
}
function followupMs(v) {
  const h = 3600 * 1000, d = new Date();
  if (v === '2h') return Date.now() + 2 * h;
  if (v === 'amanha') { d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d.getTime(); }
  if (v === '3d') return Date.now() + 72 * h;
  if (v === '7d') return Date.now() + 168 * h;
  if (v === 'nenhum') return null;
  return undefined;
}
function progRow(label, v, meta, cls) {
  const p = meta ? Math.min(100, Math.round((v / meta) * 100)) : 0;
  return `<div class="prog-row"><div class="row sp"><span>${label}</span><span>${num(v)} <span class="muted">/ ${num(meta)}</span></span></div><div class="prog ${cls}"><i style="width:${p}%"></i></div></div>`;
}
function drawFila() {
  const f = S.fila, st = S.stats, c = f.counts || {};
  const lid = f.lead ? f.lead.id : 0;
  if (S.lastLead !== lid) { S.lastLead = lid; window.scrollTo(0, 0); }
  const m = $('#main');
  const head = `
    <div class="top"><div><h1>Fila de trabalho</h1><div class="muted small">${c.devidos || 0} retornos agora · ${c.novos || 0} contatos novos na fila</div></div></div>
    ${S.lotes.length > 1 ? `<label class="field" style="margin:0 0 10px"><span>Campanha</span><select data-bind="lote"><option value="">Todas as campanhas</option>${S.lotes.map((x) => `<option value="${esc(x.lote)}" ${S.lote === x.lote ? 'selected' : ''}>${esc(x.lote)} (${x.novos} novos)</option>`).join('')}</select></label>` : ''}
    <div class="card" style="padding:14px 16px">
      ${progRow('Ligações hoje', st.hoje.ligacoes, st.metas.ligacoes, 'g')}
      ${progRow('WhatsApp hoje', st.hoje.whatsapp, st.metas.whatsapp, 'w')}
    </div>`;
  if (!f.lead) {
    m.innerHTML = head + `<div class="card empty" style="margin-top:14px"><div class="big">${ic('check', 34)}</div><h2>Fila zerada</h2>
      <p class="muted">Não há contatos novos nem retornos vencidos agora.${S.skip.length ? ' Alguns foram pulados nesta sessão.' : ''}</p>
      ${S.skip.length ? '<button class="btn sec" data-act="unskip">Rever os pulados</button>' : ''}</div>`;
    return;
  }
  const l = f.lead;
  const motivo = f.motivo === 'followup'
    ? (l.followup_em < dayStart(new Date()) ? '<span class="chip bad">Retorno atrasado</span>' : '<span class="chip sun">Retorno de hoje</span>')
    : f.motivo === 'novo' ? '<span class="chip blue">Contato novo</span>' : '<span class="chip">Aberto manualmente</span>';
  const lim = parseInt(S.config.wa_limite_dia) || 80;
  const resList = f.canal === 'whatsapp' ? RES_WA : RES_LIG;
  const pool = msgPool(l), tplOpts = pool.map((t) => `<option value="${t.id}" ${String(t.id) === String(S.tplId) ? 'selected' : ''}>${esc(t.titulo)}</option>`).join('');
  m.innerHTML = head + `
  <div class="card" style="margin-top:14px">
    <div class="pills" style="margin-bottom:10px">${motivo}${statusChip(l.status)}${l.tentativas ? `<span class="chip">${l.tentativas} tentativa${l.tentativas > 1 ? 's' : ''}</span>` : ''}</div>
    <div class="lead-name">${esc(l.nome)}</div>
    ${l.empresa ? `<div class="small" style="margin-top:2px"><b>${esc(l.empresa)}</b>${l.ramo ? ' · ' + esc(l.ramo) : ''}${l.porte ? ' · ' + esc(l.porte) : ''}</div>` : ''}
    <div class="row" style="margin-top:6px"><span class="lead-phone">${fmtPhone(l.telefone)}</span>
      <button class="btn ghost sm" data-act="copy" aria-label="Copiar número">${ic('copy', 18)}</button></div>
    <div class="muted small" style="margin-top:4px">${[l.cidade, l.consumo ? 'Consumo: ' + l.consumo : '', l.email].filter(Boolean).map(esc).join(' · ') || 'Sem mais dados'}</div>
    ${l.alt_tel ? `<div class="muted small" style="margin-top:4px">Outros números: ${esc(l.alt_tel)}</div>` : ''}
    ${l.obs ? `<div class="alert" style="margin-top:10px">${esc(l.obs)}</div>` : ''}
    <div class="actions">
      <button class="act call" data-act="call">${ic('phone', 28)}Ligar<small>${fmtPhone(l.telefone)}</small></button>
      <button class="act wa" id="wabtn" data-act="wa">${ic('chat', 28)}WhatsApp<small id="wasub">${st.hoje.whatsapp >= lim ? 'Limite do dia atingido' : 'Abrir conversa'}</small></button>
      <button class="act wacall" data-act="wacall">${ic('phone', 22)}Chamar no WhatsApp (voz)<small>abre a conversa, toque no telefone</small></button>
    </div>
    <div class="msgbox">
      <div class="row sp"><b class="small">Mensagem do WhatsApp</b><button class="btn ghost sm" data-act="rotate">${ic('refresh', 16)} Outra versão</button></div>
      ${pool.length > 1 ? `<select data-bind="tpl" style="margin-top:8px">${tplOpts}</select>` : ''}
      <textarea data-bind="msgText" placeholder="Escreva a mensagem">${esc(f.msgText)}</textarea>
      ${!S.config.pdf_link && /\{link\}/.test(JSON.stringify(S.msgs)) ? '<div class="tiny muted" style="margin-top:6px">Dica: o gestor pode definir o link do material em Ajustes para ele entrar automático nos textos.</div>' : ''}
    </div>
  </div>
  <div class="card">
    <h3>Registrar resultado</h3>
    <div class="seg" style="margin-top:10px"><button class="${f.canal === 'ligacao' ? 'on' : ''}" data-act="canal" data-v="ligacao">Ligação</button><button class="${f.canal === 'whatsapp' ? 'on' : ''}" data-act="canal" data-v="whatsapp">WhatsApp</button></div>
    ${f.canal ? `<div class="results">${resList.map((r) => `<button class="res ${r[2] || ''} ${f.resultado === r[0] ? 'on' : ''}" data-act="res" data-v="${r[0]}">${r[1]}</button>`).join('')}</div>` : '<p class="muted small" style="margin:10px 0 0">Toque em Ligar ou WhatsApp, ou escolha o canal acima para registrar.</p>'}
    ${f.resultado === 'venda' ? `<label class="field"><span>Valor da venda (opcional)</span><input type="number" inputmode="decimal" data-bind="valor" value="${esc(f.valor)}" placeholder="Ex.: 1500"></label>` : ''}
    ${f.canal && !['venda', 'sem_interesse', 'invalido'].includes(f.resultado) ? `<label class="field"><span>Próximo retorno</span>
      <select data-bind="followup">${[['auto', 'Automático (regra da equipe)'], ['2h', 'Em 2 horas'], ['amanha', 'Amanhã às 9h'], ['3d', 'Em 3 dias'], ['7d', 'Em 1 semana'], ['nenhum', 'Sem retorno']].map((o) => `<option value="${o[0]}" ${f.followup === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}</select></label>` : ''}
    <label class="field"><span>Observação (opcional)</span><input type="text" data-bind="nota" value="${esc(f.nota)}" placeholder="Ex.: pediu para ligar depois das 18h"></label>
  </div>
  ${f.historico && f.historico.length ? `<div class="sec-title">Histórico</div><div class="card"><div class="hist">${f.historico.map((h) => `<div class="h"><b>${h.canal === 'ligacao' ? 'Ligação' : h.canal === 'whatsapp' ? 'WhatsApp' : 'Nota'}</b> · ${RES_LABEL[h.resultado] || h.resultado}<div class="muted tiny">${esc(h.user_nome)} · ${new Date(h.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}${h.nota ? ' · ' + esc(h.nota) : ''}</div></div>`).join('')}</div></div>` : ''}
  <div class="row savebar"><button class="btn sec" data-act="skip">${ic('skip', 18)} Pular</button><button class="btn grow" data-act="save">Salvar e próximo</button></div>`;
  updateWa();
}
function updateWa() {
  const b = $('#wabtn'); if (!b) return;
  const left = Math.ceil((S.waWait - Date.now()) / 1000), sub = $('#wasub');
  if (left > 0) { b.disabled = true; if (sub) sub.textContent = 'Aguarde ' + left + 's para o próximo envio'; }
  else if (b.disabled) {
    b.disabled = false;
    const lim = parseInt(S.config.wa_limite_dia) || 80;
    if (sub) sub.textContent = S.stats && S.stats.hoje.whatsapp >= lim ? 'Limite do dia atingido' : 'Abrir conversa';
  }
}
setInterval(updateWa, 1000);

ACT.call = () => {
  const f = S.fila;
  const a = document.createElement('a'); a.href = 'tel:+' + f.lead.telefone;
  document.body.appendChild(a); a.click(); a.remove();
  f.canal = 'ligacao'; f.viaWa = false; if (!RES_LIG.some((r) => r[0] === f.resultado)) f.resultado = null;
  drawFila();
};
ACT.wacall = () => {
  const f = S.fila;
  const url = isMobile() ? `https://wa.me/${f.lead.telefone}` : `https://web.whatsapp.com/send?phone=${f.lead.telefone}`;
  window.open(url, isMobile() ? '_blank' : 'sdrflow_wa');
  f.canal = 'ligacao'; f.viaWa = true; if (!RES_LIG.some((r) => r[0] === f.resultado)) f.resultado = null;
  toast('Na conversa, toque no ícone de telefone para ligar');
  drawFila();
};
ACT.wa = () => {
  const f = S.fila;
  if (Date.now() < S.waWait) return;
  const lim = parseInt(S.config.wa_limite_dia) || 80;
  if (S.stats.hoje.whatsapp >= lim && !confirm(`Você já enviou ${S.stats.hoje.whatsapp} mensagens hoje (limite ${lim}). Enviar mesmo assim?`)) return;
  const txt = encodeURIComponent(f.msgText || '');
  const url = isMobile() ? `https://wa.me/${f.lead.telefone}?text=${txt}` : `https://web.whatsapp.com/send?phone=${f.lead.telefone}&text=${txt}`;
  window.open(url, isMobile() ? '_blank' : 'sdrflow_wa');
  f.canal = 'whatsapp'; if (!RES_WA.some((r) => r[0] === f.resultado)) f.resultado = null;
  drawFila();
};
ACT.copy = async () => {
  try { await navigator.clipboard.writeText(fmtPhone(S.fila.lead.telefone)); toast('Número copiado'); } catch (e) { toast('Não foi possível copiar', true); }
};
ACT.rotate = () => { pickMsg(true); drawFila(); };
ACT.canal = (t) => {
  const f = S.fila; f.canal = t.dataset.v;
  const list = f.canal === 'whatsapp' ? RES_WA : RES_LIG;
  if (!list.some((r) => r[0] === f.resultado)) f.resultado = null;
  drawFila();
};
ACT.res = (t) => { S.fila.resultado = t.dataset.v; drawFila(); };
ACT.skip = () => { S.skip.push(S.fila.lead.id); loadFila(); };
ACT.unskip = () => { S.skip = []; loadFila(); };
ACT.save = async (t) => {
  const f = S.fila;
  if (!f.canal || !f.resultado) return toast('Escolha o canal e o resultado', true);
  const body = { canal: f.canal, resultado: f.resultado, nota: ((f.viaWa && f.canal === 'ligacao' ? '[Ligação pelo WhatsApp] ' : '') + (f.nota || '')).trim(), origem: f.motivo === 'followup' ? 'followup' : null };
  if (f.resultado === 'venda' && f.valor) body.valor = parseFloat(String(f.valor).replace(',', '.'));
  const fu = followupMs(f.followup);
  if (fu !== undefined) body.followup_em = fu;
  t.disabled = true;
  try {
    const r = await api(`/leads/${f.lead.id}/registrar`, { method: 'POST', body });
    if (f.canal === 'whatsapp' && f.resultado === 'enviado') S.waWait = Date.now() + (parseInt(S.config.wa_intervalo_s) || 25) * 1000;
    toast(r.status === 'venda' ? 'Venda registrada. Parabéns!' : 'Salvo');
    S.skip = [];
    await loadFila();
  } catch (e) { toast(e.message, true); t.disabled = false; }
};

document.addEventListener('input', (e) => {
  const k = e.target.dataset && e.target.dataset.bind; if (!k || !S.fila) return;
  if (k === 'lote') { S.lote = e.target.value; S.skip = []; loadFila(); return; }
  if (k === 'tpl') { S.tplId = e.target.value; pickMsg(false); drawFila(); return; }
  S.fila[k] = e.target.value;
});

/* ---------- hoje ---------- */
VIEWS.hoje = async () => {
  const h = await api('/hoje');
  setBadge(h.counts.devidos);
  const ini = dayStart(new Date());
  const atras = h.followups.filter((l) => l.followup_em < ini);
  const hoje = h.followups.filter((l) => l.followup_em >= ini);
  const row = (l) => `<div class="list-item" data-act="open" data-id="${l.id}"><div class="ava">${esc(first(l.nome)[0] || '?')}</div>
    <div class="grow"><b>${esc(l.nome)}</b>${l.empresa ? `<div class="small">${esc(l.empresa)}</div>` : ''}<div class="muted small">${fmtPhone(l.telefone)}${l.cidade ? ' · ' + esc(l.cidade) : ''}</div></div>
    <div style="text-align:right">${statusChip(l.status)}<div class="tiny muted" style="margin-top:4px">${when(l.followup_em)}</div></div></div>`;
  const sec = (t, arr) => arr.length ? `<div class="sec-title">${t} (${arr.length})</div><div class="card" style="padding:6px 14px">${arr.map(row).join('')}</div>` : '';
  $('#main').innerHTML = `<div class="top"><div><h1>Hoje</h1><div class="muted small">Seus retornos e follow-ups</div></div></div>
    <div class="kpis"><div class="kpi ${atras.length ? 'hl' : ''}"><div class="l">Atrasados</div><div class="v">${atras.length}</div></div>
    <div class="kpi"><div class="l">Para hoje</div><div class="v">${hoje.length}</div></div>
    <div class="kpi"><div class="l">Contatos novos</div><div class="v">${h.counts.novos}</div></div>
    <div class="kpi"><div class="l">Agendados</div><div class="v">${h.proximos.length}${h.proximos.length >= 20 ? '+' : ''}</div></div></div>
    ${h.followups.length ? '<button class="btn block" style="margin-top:14px" data-act="nav" data-v="fila">Começar pela fila</button>' : ''}
    ${sec('Atrasados', atras)}${sec('Hoje', hoje)}
    ${!h.followups.length ? '<div class="card empty" style="margin-top:14px"><div class="big">' + ic('check', 34) + '</div><h2>Tudo em dia</h2><p class="muted">Nenhum retorno pendente para hoje.</p></div>' : ''}
    ${sec('Próximos retornos', h.proximos)}`;
};

/* ---------- números (SDR) ---------- */
function barsDias(arr) {
  const max = Math.max(1, ...arr.map((d) => d.ligacoes + d.whatsapp));
  return `<div class="bars">${arr.map((d) => { const t = d.ligacoes + d.whatsapp; return `<div title="${d.ligacoes} ligações, ${d.whatsapp} WhatsApp"><b>${t || ''}</b><i style="height:${Math.round((t / max) * 100)}%"></i><em>${d.dia.slice(3)}/${d.dia.slice(0, 2)}</em></div>`; }).join('')}</div>`;
}
function hoursHeat(h) {
  const max = Math.max(1, ...h);
  return `<div class="hours">${h.map((v, i) => `<div class="${v ? 'a' : ''}" style="${v ? 'opacity:' + (0.3 + 0.7 * v / max).toFixed(2) : ''}" title="${i}h: ${v}"></div>`).join('')}</div><div class="hlabels"><span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span></div>`;
}
VIEWS.numeros = async () => {
  const s = await api('/stats/meu'); const h = s.hoje, w = s.semana;
  $('#main').innerHTML = `<div class="top"><div><h1>Meus números</h1><div class="muted small">Seu desempenho hoje e na semana</div></div></div>
  <div class="card">${progRow('Ligações', h.ligacoes, s.metas.ligacoes, 'g')}${progRow('WhatsApp enviados', h.whatsapp, s.metas.whatsapp, 'w')}</div>
  <div class="sec-title">Hoje</div>
  <div class="kpis">
    <div class="kpi"><div class="l">Ligações</div><div class="v">${h.ligacoes}</div><div class="s">${pct(h.atendidas, h.ligacoes)} atendidas</div></div>
    <div class="kpi"><div class="l">WhatsApp</div><div class="v">${h.whatsapp}</div><div class="s">${h.respostas} respostas</div></div>
    <div class="kpi"><div class="l">Follow-ups feitos</div><div class="v">${h.followups}</div></div>
    <div class="kpi"><div class="l">Interessados</div><div class="v">${h.interessados}</div></div>
    <div class="kpi hl"><div class="l">Vendas</div><div class="v">${h.vendas}</div><div class="s">${h.valor ? money(h.valor) : ' '}</div></div>
    <div class="kpi"><div class="l">Propostas</div><div class="v">${h.propostas}</div></div>
    <div class="kpi"><div class="l">Semana: contatos</div><div class="v">${num(w.ligacoes + w.whatsapp)}</div></div>
    <div class="kpi"><div class="l">Semana: vendas</div><div class="v">${w.vendas}</div></div>
  </div>
  <div class="sec-title">Contatos por dia (7 dias)</div><div class="card">${barsDias(s.porDia)}</div>
  <div class="sec-title">Atividade por hora (hoje)</div><div class="card">${hoursHeat(s.horas)}</div>`;
};

/* ---------- contatos ---------- */
VIEWS.contatos = async () => {
  const g = S.user.papel === 'gestor';
  $('#main').innerHTML = `<div class="top"><div><h1>Contatos</h1><div class="muted small">${g ? 'Importe a base, distribua e acompanhe' : 'Seus contatos e histórico'}</div></div></div>
  ${g ? '<div id="imp"></div><div id="dist"></div><div id="lotesbox"></div>' : ''}
  <div class="card" style="margin-top:14px">
    <div class="row wrap" style="gap:8px"><input type="search" id="lq" placeholder="Buscar nome, telefone ou cidade" value="${esc(S.lf.q)}" style="flex:1;min-width:180px">
      <select id="ls" style="width:auto"><option value="">Todos os status</option>${Object.keys(STATUS).map((k) => `<option value="${k}" ${S.lf.status === k ? 'selected' : ''}>${STATUS[k][0]}</option>`).join('')}</select>
      <select id="lt" style="width:auto"><option value="">Todas as campanhas</option></select>
      ${g ? '<select id="lo" style="width:auto"><option value="">Todas as SDRs</option><option value="sem">Sem dono</option></select>' : ''}</div>
    <div id="ll" style="margin-top:8px"></div></div>`;
  if (g) { drawImport(); drawDist(); drawLotes(); const us = S.users || (S.users = await api('/usuarios')); $('#lo').innerHTML += us.filter((u) => u.papel === 'sdr' && u.ativo).map((u) => `<option value="${u.id}" ${String(S.lf.owner) === String(u.id) ? 'selected' : ''}>${esc(u.nome)}</option>`).join(''); if (S.lf.owner) $('#lo').value = S.lf.owner; }
  api('/lotes').then((ls) => { const sel = $('#lt'); if (!sel) return; sel.innerHTML += ls.map((x) => `<option value="${esc(x.lote)}" ${S.lf.lote === x.lote ? 'selected' : ''}>${esc(x.lote)} (${x.total})</option>`).join(''); });
  $('#lt').addEventListener('change', (e) => { S.lf.lote = e.target.value; S.lf.offset = 0; loadLeads(); });
  let t;
  $('#lq').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { S.lf.q = e.target.value; S.lf.offset = 0; loadLeads(); }, 300); });
  $('#ls').addEventListener('change', (e) => { S.lf.status = e.target.value; S.lf.offset = 0; loadLeads(); });
  if (g) $('#lo').addEventListener('change', (e) => { S.lf.owner = e.target.value; S.lf.offset = 0; loadLeads(); });
  loadLeads();
};
async function loadLeads(append) {
  const f = S.lf, p = new URLSearchParams({ limit: 40, offset: f.offset });
  if (f.q) p.set('q', f.q); if (f.status) p.set('status', f.status); if (f.owner) p.set('owner', f.owner); if (f.lote) p.set('lote', f.lote);
  const r = await api('/leads?' + p);
  const g = S.user.papel === 'gestor';
  const rows = r.leads.map((l) => {
    const inner = `<div class="ava">${esc(first(l.nome)[0] || '?')}</div>
    <div class="grow"><b>${esc(l.nome)}</b>${l.empresa ? `<div class="small">${esc(l.empresa)}</div>` : ''}<div class="muted small">${fmtPhone(l.telefone)}${l.cidade ? ' · ' + esc(l.cidade) : ''}${g ? ' · ' + esc(l.owner_nome || 'sem dono') : ''}</div></div>${statusChip(l.status)}`;
    return g ? `<div class="list-item" style="cursor:default"><label class="selwrap"><input type="checkbox" class="selbox" data-id="${l.id}"></label><div class="open-area" data-act="open" data-id="${l.id}">${inner}</div></div>`
      : `<div class="list-item" data-act="open" data-id="${l.id}">${inner}</div>`;
  }).join('');
  const box = $('#ll'); if (!box) return;
  const more = f.offset + 40 < r.total ? '<button class="btn sec block" style="margin-top:10px" data-act="more">Carregar mais</button>' : '';
  const html = (append ? box.dataset.html || '' : '') + rows;
  box.dataset.html = html;
  const tools = g && html ? `<div class="row wrap seltools"><button class="btn sec sm" data-act="selall">Selecionar visíveis</button><button class="btn sec sm hide" id="btnselclr" data-act="selclr">Limpar seleção</button><button class="btn danger sm" id="btnseldel" data-act="delsel" disabled>Excluir selecionados</button><button class="btn danger sm" data-act="delfiltro">Excluir todos do filtro</button></div>` : '';
  box.innerHTML = `<div class="muted tiny" style="margin:4px 0">${num(r.total)} contato${r.total === 1 ? '' : 's'}</div>${tools}${html || '<p class="muted">Nenhum contato encontrado.</p>'}${more}`;
  box.querySelectorAll('.selbox').forEach((c) => { c.checked = S.sel.has(Number(c.dataset.id)); });
  updSel();
}
ACT.more = () => { S.lf.offset += 40; loadLeads(true); };

async function leadModal(id) {
  const r = await api('/leads/' + id), l = r.lead;
  const us = S.users || (S.users = await api('/usuarios'));
  modal(`<div class="row sp"><h2>${esc(l.nome)}</h2>${statusChip(l.status)}</div>
    <div class="muted" style="margin-top:4px">${fmtPhone(l.telefone)}${l.cidade ? ' · ' + esc(l.cidade) : ''}${l.consumo ? ' · ' + esc(l.consumo) : ''}</div>
    <label class="field"><span>Responsável</span><select id="own"><option value="">Sem dono</option>${us.filter((u) => u.papel === 'sdr' && u.ativo).map((u) => `<option value="${u.id}" ${l.owner_id === u.id ? 'selected' : ''}>${esc(u.nome)}</option>`).join('')}</select></label>
    <div class="sec-title">Histórico</div>
    ${r.historico.length ? `<div class="hist">${r.historico.map((h) => `<div class="h"><b>${h.canal === 'ligacao' ? 'Ligação' : h.canal === 'whatsapp' ? 'WhatsApp' : 'Nota'}</b> · ${RES_LABEL[h.resultado] || h.resultado}<div class="muted tiny">${esc(h.user_nome)} · ${new Date(h.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}${h.nota ? ' · ' + esc(h.nota) : ''}</div></div>`).join('')}</div>` : '<p class="muted small">Nenhuma interação ainda.</p>'}
    ${S.user.papel === 'gestor' ? `<button class="btn danger sm block" style="margin-top:14px" data-act="dellead" data-id="${l.id}" data-nome="${esc(l.nome)}" data-tel="${esc(fmtPhone(l.telefone))}">Excluir este contato</button>` : ''}
    <div class="row" style="margin-top:12px"><button class="btn sec grow" data-act="close">Fechar</button><button class="btn grow" data-act="assign" data-id="${l.id}">Salvar responsável</button></div>`);
}
ACT.assign = async (t) => {
  try { await api(`/leads/${t.dataset.id}/atribuir`, { method: 'PUT', body: { owner_id: $('#own').value || null } }); closeModal(); toast('Responsável atualizado'); S.lf.offset = 0; loadLeads(); } catch (e) { toast(e.message, true); }
};

/* ---------- exclusão (gestor) ---------- */
async function drawLotes() {
  const box = $('#lotesbox'); if (!box) return;
  let ls = []; try { ls = await api('/lotes'); } catch (e) { return; }
  if (!ls.length) { box.innerHTML = ''; return; }
  box.innerHTML = `<details class="card lotes"><summary><b>Listas importadas</b> <span class="muted small">(${ls.length}) · excluir listas</span></summary>
    <p class="muted small" style="margin:8px 0 4px">“Não trabalhados” são os contatos novos, sem nenhuma ligação ou mensagem registrada.</p>
    ${ls.map((x) => `<div class="lote-row"><div class="grow"><b>${esc(x.lote)}</b><div class="muted tiny">${num(x.total)} contatos · ${num(x.limpos)} não trabalhados · ${num(x.total - x.limpos)} trabalhados · ${num(x.vendas)} venda${x.vendas === 1 ? '' : 's'}</div></div>
      <button class="btn sec sm" data-act="dellote" data-modo="limpos" data-lote="${esc(x.lote)}" ${x.limpos ? '' : 'disabled'}>Só não trabalhados</button>
      <button class="btn danger sm" data-act="dellote" data-modo="tudo" data-lote="${esc(x.lote)}">Tudo</button></div>`).join('')}</details>`;
}
function updSel() {
  const n = S.sel.size, b = $('#btnseldel'), c = $('#btnselclr');
  if (b) { b.disabled = !n; b.textContent = n ? `Excluir selecionados (${num(n)})` : 'Excluir selecionados'; }
  if (c) c.classList.toggle('hide', !n);
}
ACT.selall = () => { document.querySelectorAll('.selbox').forEach((c) => { c.checked = true; S.sel.add(Number(c.dataset.id)); }); updSel(); };
ACT.selclr = () => { S.sel.clear(); document.querySelectorAll('.selbox').forEach((c) => { c.checked = false; }); updSel(); };

async function abrirExclusao(cfg) {
  S.del = { ...cfg, tr: !!cfg.tr, sim: null };
  await simularExclusao();
}
async function simularExclusao() {
  const d = S.del, r = d.mk(d.tr);
  try { d.sim = await api(r.path, { method: 'POST', body: { ...r.body, simular: true } }); } catch (e) { toast(e.message, true); return; }
  drawExclusao();
}
const exigeTexto = (d) => d.sim.alvo >= 100 || (d.tr && d.sim.trabalhados > 0 && d.sim.alvo > 1);
function drawExclusao() {
  const d = S.del, s = d.sim, pl = (n, a, b) => `${num(n)} ${n === 1 ? a : b}`;
  const aviso = s.alvo
    ? `<div class="card flat" style="margin-top:12px;border-color:var(--bad)"><b>Serão excluídos ${pl(s.alvo, 'contato', 'contatos')}</b>${d.tr && s.interacoes ? ` e ${pl(s.interacoes, 'registro de ligação/mensagem/nota', 'registros de ligação/mensagem/nota')}` : ''}.
        <div class="small" style="margin-top:6px">Não dá para desfazer. Os telefones excluídos poderão ser importados de novo.${d.tr && s.interacoes ? ' Os números do Painel que vieram desses registros deixam de contar.' : ''}</div></div>`
    : `<div class="card flat" style="margin-top:12px">Nada para excluir com estas opções.</div>`;
  modal(`<h2>${esc(d.titulo)}</h2>${d.desc ? `<div class="muted small" style="margin-top:4px">${esc(d.desc)}</div>` : ''}
    <div class="small" style="margin-top:10px">Encontrados: <b>${num(s.total)}</b> · não trabalhados: <b>${num(s.limpos)}</b> · já trabalhados: <b>${num(s.trabalhados)}</b>${s.vendas ? ` (<b>${num(s.vendas)}</b> venda${s.vendas === 1 ? '' : 's'})` : ''}</div>
    ${d.fixo ? '' : `<label class="chk"><input type="checkbox" id="dxtr" ${d.tr ? 'checked' : ''}> <span>Incluir também os já trabalhados <span class="muted">(apaga o histórico de ligações e mensagens deles)</span></span></label>`}
    ${aviso}
    ${d.tr && s.vendas ? `<label class="chk"><input type="checkbox" id="dxv"> <span>Sei que isso apaga ${pl(s.vendas, 'venda registrada', 'vendas registradas')}</span></label>` : ''}
    ${s.alvo && exigeTexto(d) ? `<label class="field"><span>Para confirmar, digite EXCLUIR</span><input type="text" id="dxt" autocomplete="off" autocapitalize="characters" placeholder="EXCLUIR"></label>` : ''}
    <div class="row" style="margin-top:16px"><button class="btn sec grow" data-act="close">Cancelar</button><button class="btn danger grow" id="dxgo" data-act="dodel" disabled>Excluir</button></div>`);
  validarExclusao();
}
function validarExclusao() {
  const d = S.del, b = $('#dxgo'); if (!d || !b) return;
  const t = $('#dxt'), v = $('#dxv');
  b.disabled = !d.sim.alvo || (t && t.value.trim().toUpperCase() !== 'EXCLUIR') || (v && !v.checked);
}
ACT.dodel = async (t) => {
  const d = S.del; if (!d) return;
  t.disabled = true;
  const r = d.mk(d.tr);
  try {
    const out = await api(r.path, { method: 'POST', body: { ...r.body, confirmar_vendas: !!$('#dxv') && $('#dxv').checked } });
    closeModal();
    toast(`${num(out.excluidos)} contato${out.excluidos === 1 ? '' : 's'} excluído${out.excluidos === 1 ? '' : 's'}`);
    S.sel.clear(); S.del = null;
    try { const ls = await api('/lotes'); if (S.lf.lote && !ls.some((x) => x.lote === S.lf.lote)) S.lf.lote = ''; if (S.lote && !ls.some((x) => x.lote === S.lote)) S.lote = ''; } catch (e) { /* ok */ }
    S.lf.offset = 0; S.stats = null;
    if (S.view === 'contatos') VIEWS.contatos(); else go('contatos');
  } catch (e) { toast(e.message, true); t.disabled = false; }
};
ACT.dellote = (t) => {
  const lote = t.dataset.lote;
  abrirExclusao({ titulo: 'Excluir lista', desc: lote, tr: t.dataset.modo === 'tudo', mk: (tr) => ({ path: '/lotes/excluir', body: { lote, modo: tr ? 'tudo' : 'limpos' } }) });
};
ACT.dellead = (t) => {
  const id = Number(t.dataset.id);
  abrirExclusao({ titulo: 'Excluir contato', desc: `${t.dataset.nome} · ${t.dataset.tel}`, tr: true, fixo: true, mk: () => ({ path: '/leads/excluir', body: { ids: [id], incluir_trabalhados: true } }) });
};
ACT.delsel = () => {
  const ids = [...S.sel]; if (!ids.length) return;
  abrirExclusao({ titulo: 'Excluir contatos selecionados', desc: `${num(ids.length)} selecionado${ids.length === 1 ? '' : 's'}`, tr: false, mk: (tr) => ({ path: '/leads/excluir', body: { ids, incluir_trabalhados: tr } }) });
};
ACT.delfiltro = () => {
  const f = S.lf, filtro = {};
  if (f.q) filtro.q = f.q; if (f.status) filtro.status = f.status; if (f.owner) filtro.owner = f.owner; if (f.lote) filtro.lote = f.lote;
  if (!Object.keys(filtro).length) { toast('Aplique um filtro (campanha, status, SDR ou busca) para excluir em massa', true); return; }
  const partes = [];
  if (f.lote) partes.push('lista: ' + f.lote);
  if (f.status) partes.push('status: ' + ((STATUS[f.status] || [f.status])[0]));
  if (f.owner) partes.push(f.owner === 'sem' ? 'sem dono' : 'SDR: ' + (((S.users || []).find((u) => String(u.id) === String(f.owner)) || {}).nome || f.owner));
  if (f.q) partes.push('busca: “' + f.q + '”');
  abrirExclusao({ titulo: 'Excluir todos os contatos do filtro', desc: partes.join(' · '), tr: false, mk: (tr) => ({ path: '/leads/excluir', body: { filtro, incluir_trabalhados: tr } }) });
};
document.addEventListener('change', (e) => {
  const t = e.target; if (!t || !t.classList) return;
  if (t.classList.contains('selbox')) { const id = Number(t.dataset.id); if (t.checked) S.sel.add(id); else S.sel.delete(id); updSel(); }
  else if (t.id === 'dxtr' && S.del) { S.del.tr = t.checked; simularExclusao(); }
  else if (t.id === 'dxv') validarExclusao();
});
document.addEventListener('input', (e) => { if (e.target && e.target.id === 'dxt') validarExclusao(); });

/* ---------- importação (gestor) ---------- */
function parseTable(text) {
  const head = text.split(/\r?\n/)[0] || '';
  const cnt = (c) => head.split(c).length - 1;
  const delim = cnt('\t') >= 1 ? '\t' : cnt(';') >= cnt(',') ? ';' : ',';
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some((c) => c.trim() !== '')) rows.push(row); row = []; }
    else cur += ch;
  }
  row.push(cur); if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}
const FIELDS = [['nome', 'Nome', /nome|name|cliente|titular/i], ['telefone', 'Telefone / WhatsApp', /tel|cel|whats|fone|phone|contato|numero|número/i], ['cidade', 'Cidade', /cidade|city|munic/i], ['consumo', 'Consumo / valor da conta', /consumo|kwh|valor|conta|fatura/i], ['email', 'E-mail', /mail/i], ['obs', 'Observação', /obs|nota|coment/i]];
function setupImport(rows) {
  const hasHeader = !(rows[0] || []).some((c) => String(c).replace(/\D/g, '').length >= 8);
  const headers = hasHeader ? rows[0].map((h) => String(h).trim()) : rows[0].map((_, i) => 'Coluna ' + (i + 1));
  const map = {};
  FIELDS.forEach(([k, , re]) => { const i = headers.findIndex((h, idx) => re.test(h) && !Object.values(map).includes(idx)); map[k] = i; });
  if (map.telefone < 0) {
    const best = headers.map((_, i) => rows.slice(hasHeader ? 1 : 0, 30).filter((r) => normalizePhone(r[i])).length);
    const mx = Math.max(...best); if (mx > 0) map.telefone = best.indexOf(mx);
  }
  S.imp = { rows: hasHeader ? rows.slice(1) : rows, headers, map, sel: S.imp ? S.imp.sel : null };
}
function drawImport() {
  const box = $('#imp'); if (!box) return;
  if (!S.imp) {
    box.innerHTML = `<div class="card"><h3>Importar contatos</h3><p class="muted small" style="margin:6px 0 12px">Envie um arquivo CSV (no Excel: Salvar como CSV) ou cole as linhas copiadas da planilha. Telefones duplicados são ignorados.</p>
      <div class="drop"><input type="file" id="ifile" accept=".csv,.txt,.xlsx,.xls,text/csv,text/plain" class="hide"><button class="btn" data-act="pick">${ic('upload', 18)} Escolher planilha (Excel ou CSV)</button>
      <div class="muted small" style="margin:12px 0 8px">ou cole aqui os dados (com cabeçalho)</div>
      <textarea id="ipaste" placeholder="nome;telefone;cidade&#10;Maria Souza;(34) 99999-1111;Uberlândia"></textarea>
      <button class="btn sec" style="margin-top:8px" data-act="readpaste">Ler dados colados</button></div></div>`;
    $('#ifile').addEventListener('change', readFile);
    return;
  }
  const im = S.imp, colOpts = (sel) => '<option value="-1">— não usar —</option>' + im.headers.map((h, i) => `<option value="${i}" ${sel === i ? 'selected' : ''}>${esc(h)}</option>`).join('');
  const val = im.rows.map((r) => normalizePhone(r[im.map.telefone]));
  const ok = val.filter(Boolean), uniq = new Set(ok);
  const sdrs = (S.users || []).filter((u) => u.papel === 'sdr' && u.ativo);
  const sel = im.sel || sdrs.map((u) => u.id);
  box.innerHTML = `<div class="card"><div class="row sp"><h3>Conferir importação</h3><button class="btn ghost sm" data-act="impcancel">Cancelar</button></div>
    ${im.extra ? '<div class="alert ok" style="margin-top:8px">Base de empresas reconhecida: uma linha por empresa, com o melhor celular de sócio como número principal e os demais guardados como alternativos.</div>' : `<div class="two" style="margin-top:6px">${FIELDS.map(([k, label]) => `<label class="field"><span>${label}</span><select data-imp="${k}">${colOpts(im.map[k])}</select></label>`).join('')}</div>`}
    <div class="pills" style="margin:14px 0"><span class="chip">${num(im.rows.length)} linhas</span><span class="chip ok">${num(uniq.size)} telefones válidos</span>${ok.length - uniq.size ? `<span class="chip sun">${ok.length - uniq.size} repetidos no arquivo</span>` : ''}${im.rows.length - ok.length ? `<span class="chip bad">${im.rows.length - ok.length} sem telefone válido</span>` : ''}</div>
    <div class="scroll-x"><table class="t"><thead><tr><th>Nome</th>${im.extra ? '<th>Empresa</th>' : ''}<th>Telefone</th><th>Cidade</th></tr></thead><tbody>${im.rows.slice(0, 5).map((r, ri) => `<tr><td>${esc(r[im.map.nome] || '')}</td>${im.extra ? `<td>${esc(im.extra[ri].empresa)}</td>` : ''}<td>${esc(normalizePhone(r[im.map.telefone]) ? fmtPhone(normalizePhone(r[im.map.telefone])) : (r[im.map.telefone] || '—'))}</td><td>${esc(r[im.map.cidade] || '')}</td></tr>`).join('')}</tbody></table></div>
    <label class="field"><span>Nome do lote</span><input type="text" id="lote" placeholder="Ex.: Base clientes novembro"></label>
    <div class="field"><span style="display:block;font-size:13px;font-weight:600;color:var(--ink2);margin-bottom:6px">Distribuir entre</span>
      ${sdrs.length ? `<div class="checks">${sdrs.map((u) => `<label><input type="checkbox" data-sdr="${u.id}" ${sel.includes(u.id) ? 'checked' : ''}> ${esc(u.nome)}</label>`).join('')}</div>` : '<div class="alert">Cadastre as SDRs na aba Equipe para distribuir. Sem SDR, os contatos entram sem dono e você distribui depois.</div>'}</div>
    <button class="btn block" style="margin-top:16px" data-act="doimport" ${uniq.size ? '' : 'disabled'}>Importar ${num(uniq.size)} contatos</button></div>`;
  $$('[data-imp]', box).forEach((s) => s.addEventListener('change', () => { im.map[s.dataset.imp] = parseInt(s.value); drawImport(); }));
  $$('[data-sdr]', box).forEach((c) => c.addEventListener('change', () => { im.sel = $$('[data-sdr]', box).filter((x) => x.checked).map((x) => parseInt(x.dataset.sdr)); }));
}
function loadXlsxLib() {
  if (window.XLSX) return Promise.resolve();
  return new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'; s.onload = ok; s.onerror = () => no(new Error('Não consegui carregar o leitor de Excel. Salve como CSV e tente de novo.')); document.head.appendChild(s); });
}
function readFile(e) {
  const file = e.target.files[0]; if (!file) return;
  const isX = /\.xlsx?$/i.test(file.name);
  const rd = new FileReader();
  rd.onload = async () => {
    const buf = rd.result;
    if (isX) {
      try {
        toast('Lendo planilha...');
        await loadXlsxLib();
        const wb = XLSX.read(buf, { type: 'array' });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' }).filter((r) => r.some((c) => String(c).trim() !== ''));
        return startRows(rows);
      } catch (er) { return toast(er.message, true); }
    }
    let text; try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (er) { text = new TextDecoder('windows-1252').decode(buf); }
    startImport(text);
  };
  rd.readAsArrayBuffer(file);
}
/* base de empresas (CNPJ): uma linha por empresa, escolhe o melhor celular de sócio */
function cnpjConvert(rows) {
  const H = rows[0].map((h) => String(h || '').trim().toLowerCase());
  const col = (n) => H.indexOf(n.toLowerCase());
  const cols = (re) => H.map((h, i) => (re.test(h) ? i : -1)).filter((i) => i >= 0);
  const g = (r, i) => (i >= 0 ? String(r[i] ?? '').trim() : '');
  const iSit = col('situacaoempresadesc'), iDDD = col('ddd'), iTel = col('telefone');
  const socios = [[cols(/^cel$/), col('nomesocio1')], [cols(/^cel2$/), col('nomesocio2')], [cols(/^telefone1socio3$/), col('nomesocio3')], [cols(/^telefone1socio4$/), col('nomesocio4')]];
  const out = [], extra = []; let inativas = 0;
  for (const r of rows.slice(1)) {
    if (iSit >= 0 && g(r, iSit) && !/ativa/i.test(g(r, iSit))) { inativas++; continue; }
    const cand = [], seen = new Set();
    const add = (raw, nome) => { const t = normalizePhone(raw); if (t && !seen.has(t)) { seen.add(t); cand.push({ t, nome }); } };
    socios.forEach(([cs, ni]) => cs.forEach((c) => add(g(r, c), g(r, ni))));
    add(g(r, iDDD) + g(r, iTel), '');
    const fant = g(r, col('nomefantasia')), razao = g(r, col('razaosocial'));
    const empresa = (fant || razao).replace(/\s+\d{11}$/, '');
    const mob = (t) => t.length === 13;
    cand.sort((x, y) => (mob(y.t) - mob(x.t)) || (!!y.nome - !!x.nome));
    const p = cand[0];
    const nome = (p && p.nome) || g(r, col('nomesocio1')) || empresa;
    out.push([nome, p ? p.t : '', g(r, col('cidade')), '', g(r, col('email1socio1')) || g(r, col('email')), '']);
    extra.push({ empresa, cnpj: g(r, col('cnpj')), ramo: g(r, col('cnaeprincipaldesc')).slice(0, 90), porte: g(r, col('portempresadesc')) || g(r, col('porteempresadesc')), alt_tel: cand.slice(1, 4).map((c) => fmtPhone(c.t) + (c.nome ? ' (' + c.nome.split(' ')[0] + ')' : '')).join(' · ') });
  }
  return { rows: out, extra, inativas };
}
function startRows(rows) {
  if (rows.length < 1) return toast('Não encontrei dados no arquivo', true);
  const low = rows[0].map((h) => String(h || '').trim().toLowerCase());
  if (low.includes('cnpj') && low.includes('razaosocial')) {
    const c = cnpjConvert(rows);
    S.imp = { rows: c.rows, extra: c.extra, headers: ['Nome', 'Telefone', 'Cidade', 'Consumo', 'E-mail', 'Obs'], map: { nome: 0, telefone: 1, cidade: 2, consumo: -1, email: 4, obs: -1 }, sel: S.imp ? S.imp.sel : null };
    toast('Base de empresas reconhecida' + (c.inativas ? ' · ' + c.inativas + ' inativas ignoradas' : ''));
    return drawImport();
  }
  setupImport(rows);
  if (S.imp.map.telefone < 0) { toast('Não achei a coluna de telefone. Escolha manualmente.', true); }
  drawImport();
}
function startImport(text) { startRows(parseTable(text.replace(/^\uFEFF/, ''))); }
ACT.pick = () => $('#ifile').click();
ACT.readpaste = () => { const t = $('#ipaste').value; if (!t.trim()) return toast('Cole os dados primeiro', true); startImport(t); };
ACT.impcancel = () => { S.imp = null; drawImport(); };
ACT.doimport = async (t) => {
  const im = S.imp, leads = im.rows.map((r, i) => ({ ...(im.extra ? im.extra[i] : {}), nome: r[im.map.nome] || '', telefone: r[im.map.telefone] || '', cidade: r[im.map.cidade] || '', consumo: r[im.map.consumo] || '', email: r[im.map.email] || '', obs: r[im.map.obs] || '' }));
  const sel = im.sel || (S.users || []).filter((u) => u.papel === 'sdr' && u.ativo).map((u) => u.id);
  t.disabled = true;
  try {
    const r = await api('/leads/importar', { method: 'POST', body: { leads, distribuir: sel, lote: $('#lote').value } });
    S.imp = null; drawImport();
    $('#imp').innerHTML = `<div class="alert ok"><b>${num(r.importados)} contatos importados.</b> ${r.duplicados ? num(r.duplicados) + ' já existiam. ' : ''}${r.invalidos ? num(r.invalidos) + ' sem telefone válido.' : ''}</div>` + $('#imp').innerHTML;
    drawDist(); S.lf.offset = 0; loadLeads();
  } catch (e) { toast(e.message, true); t.disabled = false; }
};
async function drawDist() {
  const box = $('#dist'); if (!box) return;
  const r = await api('/leads?owner=sem&status=novo&limit=1');
  if (!r.total) { box.innerHTML = ''; return; }
  const us = S.users || (S.users = await api('/usuarios')); const sdrs = us.filter((u) => u.papel === 'sdr' && u.ativo);
  box.innerHTML = `<div class="card" style="margin-top:14px"><h3>${num(r.total)} contatos sem responsável</h3>
    <p class="muted small" style="margin:4px 0 10px">Distribua de forma igual entre as SDRs escolhidas.</p>
    ${sdrs.length ? `<div class="checks">${sdrs.map((u) => `<label><input type="checkbox" data-dsdr="${u.id}" checked> ${esc(u.nome)}</label>`).join('')}</div><button class="btn" style="margin-top:12px" data-act="dodist">Distribuir</button>` : '<div class="alert">Cadastre SDRs na aba Equipe.</div>'}</div>`;
}
ACT.dodist = async (t) => {
  const ids = $$('[data-dsdr]').filter((c) => c.checked).map((c) => parseInt(c.dataset.dsdr));
  if (!ids.length) return toast('Escolha ao menos uma SDR', true);
  t.disabled = true;
  try { const r = await api('/leads/distribuir', { method: 'POST', body: { sdr_ids: ids } }); toast(num(r.distribuidos) + ' contatos distribuídos'); drawDist(); S.lf.offset = 0; loadLeads(); } catch (e) { toast(e.message, true); t.disabled = false; }
};

/* ---------- painel (gestor) ---------- */
VIEWS.painel = async (silent) => {
  const d = await api('/stats/equipe?periodo=' + S.periodo), t = d.totais, fn = d.funil;
  const lbl = { hoje: 'Hoje', '7d': '7 dias', mes: 'Este mês', '30d': '30 dias' };
  const atras = d.equipe.reduce((a, s) => a + s.atrasados, 0);
  const ranking = d.equipe.slice().sort((a, b) => b.vendas - a.vendas || b.interessados - a.interessados || (b.ligacoes + b.whatsapp) - (a.ligacoes + a.whatsapp));
  const stages = [['Base total', fn.base], ['Contatados', fn.tocados], ['Conversas', fn.conversas], ['Interessados', fn.interessados], ['Propostas', fn.propostas], ['Vendas', fn.vendas]];
  const mx = Math.max(1, fn.base);
  $('#main').innerHTML = `<div class="top"><div><h1>Painel</h1><div class="muted small">Visão em tempo real da operação</div></div><button class="btn sec sm" data-act="export">${ic('download', 16)} Exportar</button></div>
  <div class="seg">${Object.keys(lbl).map((k) => `<button class="${S.periodo === k ? 'on' : ''}" data-act="periodo" data-v="${k}">${lbl[k]}</button>`).join('')}</div>
  ${atras ? `<div class="alert bad" style="margin-top:12px"><b>${atras} retornos atrasados</b> na equipe. Veja quem está acumulando abaixo.</div>` : ''}
  ${d.semDono ? `<div class="alert" style="margin-top:12px"><b>${num(d.semDono)} contatos novos sem responsável.</b> Distribua na aba Contatos.</div>` : ''}
  <div class="kpis" style="margin-top:14px">
    <div class="kpi hl"><div class="l">Vendas</div><div class="v">${num(t.vendas || 0)}</div><div class="s">${money(t.valor || 0)}</div></div>
    <div class="kpi"><div class="l">Interessados</div><div class="v">${num(t.interessados || 0)}</div><div class="s">${num(t.propostas || 0)} propostas</div></div>
    <div class="kpi"><div class="l">Ligações</div><div class="v">${num(t.ligacoes || 0)}</div><div class="s">${pct(t.atendidas, t.ligacoes)} atendidas</div></div>
    <div class="kpi"><div class="l">WhatsApp</div><div class="v">${num(t.whatsapp || 0)}</div><div class="s">${pct(t.respostas, t.whatsapp)} responderam</div></div>
  </div>
  <div class="sec-title">Funil do período</div>
  <div class="card funnel">${stages.map((s, i) => `<div class="f"><div class="bar" style="width:${Math.max(0, Math.round((s[1] / mx) * 100))}%"><span>${s[0]}</span><span>${num(s[1])}</span></div>${i > 1 ? `<div class="conv">${pct(s[1], stages[i - 1][1])} da etapa anterior</div>` : ''}</div>`).join('')}</div>
  <div class="sec-title">Ranking da equipe</div>
  ${ranking.length ? ranking.map((s, i) => `<div class="card sdr-card"><div class="row sp"><div class="row"><div class="ava" style="width:38px;height:38px;border-radius:12px;background:var(--sun-bg);color:#92400E;font-weight:800;display:flex;align-items:center;justify-content:center">${i + 1}</div><div><b>${esc(s.nome)}</b><div class="tiny muted">${ago(s.ultima_atividade)}</div></div></div>
      <div class="pills">${s.atrasados ? `<span class="chip bad">${s.atrasados} atrasados</span>` : '<span class="chip ok">Em dia</span>'}<span class="chip">${s.fila_novos} na fila</span></div></div>
      ${S.periodo === 'hoje' ? progRow('Ligações', s.ligacoes, s.meta_ligacoes, 'g') + progRow('WhatsApp', s.whatsapp, s.meta_whatsapp, 'w') : ''}
      <div class="nums"><div><b>${num(s.ligacoes)}</b><span>ligações</span></div><div><b>${num(s.whatsapp)}</b><span>WhatsApp</span></div><div><b>${num(s.interessados)}</b><span>interessados</span></div><div><b>${num(s.vendas)}</b><span>vendas</span></div></div>
      <div class="muted tiny" style="margin-top:10px">Atendimento ${pct(s.atendidas, s.ligacoes)} · Resposta ${pct(s.respostas, s.whatsapp)} · ${s.followups} follow-ups feitos${s.valor ? ' · ' + money(s.valor) : ''}</div></div>`).join('') : '<div class="card"><p class="muted">Cadastre as SDRs na aba Equipe para acompanhar a produtividade.</p></div>'}
  <div class="sec-title">Contatos por dia</div><div class="card">${barsDias(d.dias)}</div>
  <div class="sec-title">Atividade por hora</div><div class="card">${hoursHeat(d.horas)}</div>`;
  if (!silent) { clearInterval(S.timer); S.timer = setInterval(() => { if (S.view === 'painel' && !$('#modal')) VIEWS.painel(true).catch(() => {}); }, 30000); }
};
ACT.periodo = (t) => { S.periodo = t.dataset.v; go('painel'); };
ACT.export = async () => {
  try {
    const r = await fetch('/api/export.csv?periodo=' + (S.periodo === 'hoje' ? '30d' : S.periodo), { headers: { Authorization: 'Bearer ' + TOKEN } });
    if (!r.ok) throw new Error('Falha ao exportar');
    const blob = await r.blob(), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'sdr-flow-atividades.csv'; document.body.appendChild(a); a.click(); a.remove();
  } catch (e) { toast(e.message, true); }
};

/* ---------- equipe ---------- */
VIEWS.equipe = async () => {
  S.users = await api('/usuarios');
  $('#main').innerHTML = `<div class="top"><div><h1>Equipe</h1><div class="muted small">Usuários, metas diárias e acessos</div></div><button class="btn sun sm" data-act="newuser">${ic('plus', 16)} Nova pessoa</button></div>
  <div class="card" style="padding:6px 14px">${S.users.map((u) => `<div class="list-item" data-act="edituser" data-id="${u.id}"><div class="ava">${esc(first(u.nome)[0] || '?')}</div>
    <div class="grow"><b>${esc(u.nome)}</b><div class="muted small">@${esc(u.usuario)}${u.papel === 'sdr' ? ` · meta ${u.meta_ligacoes} lig. / ${u.meta_whatsapp} WhatsApp` : ''}</div></div>
    <div class="pills"><span class="chip ${u.papel === 'gestor' ? 'vio' : 'blue'}">${u.papel === 'gestor' ? 'Gestor' : 'SDR'}</span>${u.ativo ? '' : '<span class="chip bad">Inativo</span>'}</div></div>`).join('')}</div>`;
};
ACT.newuser = () => modal(`<h2>Nova pessoa</h2>
  <label class="field"><span>Nome</span><input type="text" id="un"></label>
  <label class="field"><span>Usuário (para entrar)</span><input type="text" id="uu" autocapitalize="none" autocorrect="off"></label>
  <label class="field"><span>Senha provisória (mínimo 6 caracteres)</span><input type="text" id="up"></label>
  <div class="two"><label class="field"><span>Perfil</span><select id="ur"><option value="sdr">SDR</option><option value="gestor">Gestor</option></select></label>
  <label class="field"><span>Meta de ligações/dia</span><input type="number" id="ul" value="80"></label></div>
  <label class="field"><span>Meta de WhatsApp/dia</span><input type="number" id="uw" value="80"></label>
  <p class="muted small">A pessoa troca a senha no primeiro acesso.</p>
  <div class="row" style="margin-top:14px"><button class="btn sec grow" data-act="close">Cancelar</button><button class="btn grow" data-act="saveuser">Criar</button></div>`);
ACT.saveuser = async () => {
  try {
    await api('/usuarios', { method: 'POST', body: { nome: $('#un').value, usuario: $('#uu').value, senha: $('#up').value, papel: $('#ur').value, meta_ligacoes: $('#ul').value, meta_whatsapp: $('#uw').value } });
    closeModal(); toast('Pessoa cadastrada'); go('equipe');
  } catch (e) { toast(e.message, true); }
};
ACT.edituser = (t) => {
  const u = S.users.find((x) => String(x.id) === t.dataset.id);
  modal(`<h2>${esc(u.nome)}</h2><div class="muted small">@${esc(u.usuario)}</div>
  <label class="field"><span>Nome</span><input type="text" id="en" value="${esc(u.nome)}"></label>
  <div class="two"><label class="field"><span>Meta de ligações/dia</span><input type="number" id="el" value="${u.meta_ligacoes}"></label>
  <label class="field"><span>Meta de WhatsApp/dia</span><input type="number" id="ew" value="${u.meta_whatsapp}"></label></div>
  <label class="field"><span>Nova senha provisória (deixe vazio para manter)</span><input type="text" id="es"></label>
  <label class="field"><span>Situação</span><select id="ea"><option value="1" ${u.ativo ? 'selected' : ''}>Ativo</option><option value="0" ${u.ativo ? '' : 'selected'}>Inativo (sem acesso)</option></select></label>
  <div class="row" style="margin-top:14px"><button class="btn sec grow" data-act="close">Cancelar</button><button class="btn grow" data-act="updateuser" data-id="${u.id}">Salvar</button></div>`);
};
ACT.updateuser = async (t) => {
  try {
    await api('/usuarios/' + t.dataset.id, { method: 'PUT', body: { nome: $('#en').value, meta_ligacoes: $('#el').value, meta_whatsapp: $('#ew').value, senha: $('#es').value || undefined, ativo: $('#ea').value === '1' ? 1 : 0 } });
    closeModal(); toast('Atualizado'); go('equipe');
  } catch (e) { toast(e.message, true); }
};

/* ---------- mensagens ---------- */
VIEWS.mensagens = async () => {
  S.msgs = await api('/mensagens');
  const lotes = await api('/lotes').catch(() => []);
  const dl = `<datalist id="lotesdl">${lotes.map((x) => `<option value="${esc(x.lote)}">`).join('')}</datalist>`;
  const campo = (id, v) => `<label class="field"><span>Campanha (deixe vazio para valer para todas)</span><input type="text" list="lotesdl" id="ml${id}" value="${esc(v || '')}" placeholder="Nome do lote, ex.: Feirão Minha Casa Minha Vida"></label>`;
  const card = (m) => `<div class="card"><label class="field" style="margin-top:0"><span>Título</span><input type="text" id="mt${m.id}" value="${esc(m.titulo)}"></label>${campo(m.id, m.lote)}
    <label class="field"><span>Versões do texto (separe com uma linha contendo ---)</span><textarea id="mv${m.id}" style="min-height:170px">${esc(m.variantes.join('\n---\n'))}</textarea></label>
    <div class="row" style="margin-top:12px"><button class="btn danger sm" data-act="delmsg" data-id="${m.id}">Excluir</button><button class="btn grow" data-act="savemsg" data-id="${m.id}">Salvar</button></div></div>`;
  $('#main').innerHTML = `<div class="top"><div><h1>Mensagens</h1><div class="muted small">Modelos do WhatsApp com várias versões</div></div></div>
  <div class="alert">Variáveis: <b>{empresa}</b>, <b>{nome}</b> primeiro nome do cliente, <b>{nome_completo}</b>, <b>{cidade}</b>, <b>{consumo}</b>, <b>{sdr}</b> primeiro nome da SDR e <b>{link}</b> link do material (definido em Ajustes). Varie as versões: textos iguais enviados em massa aumentam o risco de bloqueio.</div>
  <div style="margin-top:14px">${S.msgs.map(card).join('')}</div>
  ${dl}<div class="sec-title">Novo modelo</div>
  <div class="card"><label class="field" style="margin-top:0"><span>Título</span><input type="text" id="mt0" placeholder="Ex.: Retomada de contato"></label>${campo(0, '')}
  <label class="field"><span>Versões do texto (separe com ---)</span><textarea id="mv0" style="min-height:130px" placeholder="Oi, {nome}! ...&#10;---&#10;Olá, {nome}, tudo bem? ..."></textarea></label>
  <button class="btn block" style="margin-top:12px" data-act="savemsg" data-id="0">Criar modelo</button></div>`;
};
ACT.savemsg = async (t) => {
  const id = t.dataset.id, variantes = $('#mv' + id).value.split(/\n\s*---+\s*\n/).map((x) => x.trim()).filter(Boolean);
  try {
    await api(id === '0' ? '/mensagens' : '/mensagens/' + id, { method: id === '0' ? 'POST' : 'PUT', body: { titulo: $('#mt' + id).value, lote: $('#ml' + id).value, variantes } });
    toast('Modelo salvo'); go('mensagens');
  } catch (e) { toast(e.message, true); }
};
ACT.delmsg = async (t) => { if (!confirm('Excluir este modelo?')) return; try { await api('/mensagens/' + t.dataset.id, { method: 'DELETE' }); toast('Modelo excluído'); go('mensagens'); } catch (e) { toast(e.message, true); } };

/* ---------- ajustes ---------- */
VIEWS.config = async () => {
  S.config = await api('/config'); const c = S.config;
  const f = (k, label, type, hint) => `<label class="field"><span>${label}</span><input type="${type || 'text'}" id="c_${k}" value="${esc(c[k])}">${hint ? `<div class="tiny muted" style="margin-top:4px">${hint}</div>` : ''}</label>`;
  $('#main').innerHTML = `<div class="top"><div><h1>Ajustes</h1><div class="muted small">Regras da operação</div></div></div>
  <div class="card"><h3>Geral</h3>${f('empresa', 'Nome exibido no sistema')}${f('pdf_link', 'Link do material (PDF, imagem ou simulação)', 'text', 'Entra no lugar de {link} nas mensagens. Pode ser um link do Drive ou do site.')}</div>
  <div class="card"><h3>Proteção do número no WhatsApp</h3>
    ${f('wa_limite_dia', 'Limite de mensagens por SDR por dia', 'number', 'Comece com 30 a 40 em número novo e suba aos poucos.')}
    ${f('wa_intervalo_s', 'Intervalo mínimo entre envios (segundos)', 'number', 'O botão do WhatsApp só libera depois desse tempo.')}</div>
  <div class="card"><h3>Cadência de follow-up</h3>
    ${f('max_tentativas', 'Tentativas sem contato antes de encerrar o contato', 'number')}
    ${f('cadencia_nao_atendeu_h', 'Retorno após não atender (horas)', 'number')}
    ${f('cadencia_enviado_h', 'Retorno após enviar WhatsApp (horas)', 'number')}
    ${f('cadencia_conversa_h', 'Retorno após conversa ou interesse (horas)', 'number')}
    ${f('cadencia_proposta_h', 'Retorno após proposta (horas)', 'number')}</div>
  <button class="btn block" style="margin-top:14px" data-act="savecfg">Salvar ajustes</button>`;
};
ACT.savecfg = async () => {
  const body = {}; $$('[id^="c_"]').forEach((i) => { body[i.id.slice(2)] = i.value; });
  try { S.config = await api('/config', { method: 'PUT', body }); toast('Ajustes salvos'); } catch (e) { toast(e.message, true); }
};

/* ---------- eventos ---------- */
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act]');
  if (!t || t.disabled) return;
  const fn = ACT[t.dataset.act];
  if (fn) { e.preventDefault(); fn(t, e); }
});

boot();
