'use strict';
const express = require('express');
const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const os = require('os');

const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'sdr.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  usuario TEXT NOT NULL UNIQUE,
  salt TEXT NOT NULL,
  hash TEXT NOT NULL,
  papel TEXT NOT NULL DEFAULT 'sdr',
  meta_ligacoes INTEGER NOT NULL DEFAULT 80,
  meta_whatsapp INTEGER NOT NULL DEFAULT 80,
  ativo INTEGER NOT NULL DEFAULT 1,
  trocar_senha INTEGER NOT NULL DEFAULT 0,
  criado_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  criado_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  telefone TEXT NOT NULL,
  cidade TEXT,
  consumo TEXT,
  email TEXT,
  obs TEXT,
  status TEXT NOT NULL DEFAULT 'novo',
  owner_id INTEGER REFERENCES users(id),
  tentativas INTEGER NOT NULL DEFAULT 0,
  ultimo_contato INTEGER,
  followup_em INTEGER,
  valor_venda REAL,
  lote TEXT,
  criado_em INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_tel ON leads(telefone);
CREATE INDEX IF NOT EXISTS idx_leads_owner ON leads(owner_id, status);
CREATE TABLE IF NOT EXISTS interacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL REFERENCES leads(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  canal TEXT NOT NULL,
  resultado TEXT NOT NULL,
  nota TEXT,
  origem TEXT,
  valor REAL,
  criado_em INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_int_user ON interacoes(user_id, criado_em);
CREATE INDEX IF NOT EXISTS idx_int_lead ON interacoes(lead_id);
CREATE TABLE IF NOT EXISTS mensagens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo TEXT NOT NULL,
  variantes TEXT NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS config (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
`);

const TZ_OFFSET = -3 * 3600 * 1000;
const DAY = 86400000;
const startOfDay = (ms) => Math.floor((ms + TZ_OFFSET) / DAY) * DAY - TZ_OFFSET;
const now = () => Date.now();

function hashPwd(pwd, salt) {
  return crypto.scryptSync(String(pwd), salt, 64).toString('hex');
}
function createUser({ nome, usuario, senha, papel = 'sdr', meta_ligacoes = 80, meta_whatsapp = 80, trocar_senha = 0 }) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPwd(senha, salt);
  return db.prepare(`INSERT INTO users (nome, usuario, salt, hash, papel, meta_ligacoes, meta_whatsapp, trocar_senha, criado_em)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(nome, usuario.toLowerCase().trim(), salt, hash, papel, meta_ligacoes, meta_whatsapp, trocar_senha, now()).lastInsertRowid;
}

const DEFAULT_CONFIG = {
  empresa: 'SDR Flow',
  wa_limite_dia: '80',
  wa_intervalo_s: '25',
  max_tentativas: '5',
  pdf_link: '',
  cadencia_nao_atendeu_h: '24',
  cadencia_enviado_h: '48',
  cadencia_conversa_h: '24',
  cadencia_proposta_h: '48'
};
for (const [k, v] of Object.entries(DEFAULT_CONFIG)) {
  db.prepare('INSERT OR IGNORE INTO config (chave, valor) VALUES (?,?)').run(k, v);
}
function getConfig() {
  const o = {};
  for (const r of db.prepare('SELECT chave, valor FROM config').all()) o[r.chave] = r.valor;
  return o;
}

if (db.prepare('SELECT COUNT(*) c FROM users').get().c === 0) {
  createUser({ nome: 'Gestor', usuario: 'gestor', senha: 'trocar123', papel: 'gestor', trocar_senha: 1 });
  console.log('Usuário inicial criado: gestor / trocar123 (o sistema pede para trocar a senha no primeiro acesso)');
}
if (db.prepare('SELECT COUNT(*) c FROM mensagens').get().c === 0) {
  db.prepare('INSERT INTO mensagens (titulo, variantes) VALUES (?,?)').run(
    'Abordagem inicial - energia por assinatura',
    JSON.stringify([
      'Olá, {nome}! Aqui é {sdr}. Posso te mostrar como reduzir a sua conta de luz sem investir em placas nem obras? Leva 1 minuto.',
      'Oi, {nome}, tudo bem? Sou {sdr}. Hoje dá para economizar na conta de energia com assinatura solar, sem instalação. Posso te explicar rapidinho?',
      'Boa tarde, {nome}! {sdr} por aqui. Fiz uma simulação de economia na conta de luz para a sua região. Quer ver quanto você pode economizar?'
    ])
  );
  db.prepare('INSERT INTO mensagens (titulo, variantes) VALUES (?,?)').run(
    'Segundo toque - com material',
    JSON.stringify([
      '{nome}, te deixo o material com a simulação de economia: {link}. Qualquer dúvida é só responder aqui.',
      'Oi, {nome}! Segue o material para você ver o quanto pode economizar na energia: {link}. Posso te ligar para explicar?'
    ])
  );
}

const app = express();
app.use(express.json({ limit: '25mb' }));

const auth = (papeis) => (req, res, next) => {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ erro: 'Não autenticado' });
  const row = db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND u.ativo = 1`).get(token);
  if (!row) return res.status(401).json({ erro: 'Sessão expirada' });
  if (papeis && !papeis.includes(row.papel)) return res.status(403).json({ erro: 'Sem permissão' });
  req.user = row;
  next();
};
const publicUser = (u) => ({
  id: u.id, nome: u.nome, usuario: u.usuario, papel: u.papel,
  meta_ligacoes: u.meta_ligacoes, meta_whatsapp: u.meta_whatsapp,
  ativo: u.ativo, trocar_senha: u.trocar_senha
});

app.post('/api/login', (req, res) => {
  const { usuario, senha } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE usuario = ? AND ativo = 1').get(String(usuario || '').toLowerCase().trim());
  if (!u) return res.status(401).json({ erro: 'Usuário ou senha incorretos' });
  const a = Buffer.from(hashPwd(senha || '', u.salt), 'hex');
  const b = Buffer.from(u.hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ erro: 'Usuário ou senha incorretos' });
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id, criado_em) VALUES (?,?,?)').run(token, u.id, now());
  res.json({ token, user: publicUser(u), config: getConfig() });
});
app.post('/api/logout', auth(), (req, res) => {
  const h = req.headers.authorization.slice(7);
  db.prepare('DELETE FROM sessions WHERE token = ?').run(h);
  res.json({ ok: true });
});
app.get('/api/me', auth(), (req, res) => res.json({ user: publicUser(req.user), config: getConfig() }));
app.post('/api/me/senha', auth(), (req, res) => {
  const { atual, nova } = req.body || {};
  if (!nova || String(nova).length < 6) return res.status(400).json({ erro: 'A nova senha precisa ter pelo menos 6 caracteres' });
  const a = Buffer.from(hashPwd(atual || '', req.user.salt), 'hex');
  const b = Buffer.from(req.user.hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(400).json({ erro: 'Senha atual incorreta' });
  const salt = crypto.randomBytes(16).toString('hex');
  db.prepare('UPDATE users SET salt=?, hash=?, trocar_senha=0 WHERE id=?').run(salt, hashPwd(nova, salt), req.user.id);
  res.json({ ok: true });
});

app.get('/api/config', auth(), (req, res) => res.json(getConfig()));
app.put('/api/config', auth(['gestor']), (req, res) => {
  const body = req.body || {};
  const up = db.prepare('INSERT INTO config (chave, valor) VALUES (?,?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor');
  for (const k of Object.keys(DEFAULT_CONFIG)) {
    if (body[k] !== undefined) up.run(k, String(body[k]));
  }
  res.json(getConfig());
});

app.get('/api/usuarios', auth(['gestor']), (req, res) => {
  res.json(db.prepare('SELECT * FROM users ORDER BY papel, nome').all().map(publicUser));
});
app.post('/api/usuarios', auth(['gestor']), (req, res) => {
  const { nome, usuario, senha, papel, meta_ligacoes, meta_whatsapp } = req.body || {};
  if (!nome || !usuario || !senha || String(senha).length < 6) return res.status(400).json({ erro: 'Preencha nome, usuário e senha (mínimo 6 caracteres)' });
  try {
    const id = createUser({
      nome, usuario, senha,
      papel: papel === 'gestor' ? 'gestor' : 'sdr',
      meta_ligacoes: parseInt(meta_ligacoes) || 80,
      meta_whatsapp: parseInt(meta_whatsapp) || 80,
      trocar_senha: 1
    });
    res.json({ id });
  } catch (e) {
    res.status(400).json({ erro: 'Esse usuário já existe' });
  }
});
app.put('/api/usuarios/:id', auth(['gestor']), (req, res) => {
  const id = parseInt(req.params.id);
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(id);
  if (!u) return res.status(404).json({ erro: 'Não encontrado' });
  const { nome, meta_ligacoes, meta_whatsapp, ativo, senha } = req.body || {};
  if (id === req.user.id && ativo === 0) return res.status(400).json({ erro: 'Você não pode desativar o seu próprio usuário' });
  db.prepare('UPDATE users SET nome=?, meta_ligacoes=?, meta_whatsapp=?, ativo=? WHERE id=?').run(
    nome ?? u.nome, parseInt(meta_ligacoes) || u.meta_ligacoes, parseInt(meta_whatsapp) || u.meta_whatsapp,
    ativo === undefined ? u.ativo : (ativo ? 1 : 0), id
  );
  if (senha) {
    if (String(senha).length < 6) return res.status(400).json({ erro: 'Senha com pelo menos 6 caracteres' });
    const salt = crypto.randomBytes(16).toString('hex');
    db.prepare('UPDATE users SET salt=?, hash=?, trocar_senha=1 WHERE id=?').run(salt, hashPwd(senha, salt), id);
  }
  res.json({ ok: true });
});

function normalizePhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  d = d.replace(/^0+/, '');
  if (d.length === 10 || d.length === 11) d = '55' + d;
  if (!(d.length === 12 || d.length === 13) || !d.startsWith('55')) return null;
  return d;
}
const titleCase = (s) => String(s || '').toLowerCase().replace(/(^|\s|-)([a-zà-ú])/g, (m, a, b) => a + b.toUpperCase()).trim();

app.post('/api/leads/importar', auth(['gestor']), (req, res) => {
  const { leads, distribuir, lote } = req.body || {};
  if (!Array.isArray(leads) || !leads.length) return res.status(400).json({ erro: 'Nenhum contato para importar' });
  const sdrs = Array.isArray(distribuir) && distribuir.length
    ? db.prepare(`SELECT id FROM users WHERE ativo=1 AND papel='sdr' AND id IN (${distribuir.map(() => '?').join(',')}) ORDER BY id`).all(...distribuir.map(Number)).map((r) => r.id)
    : [];
  let rr = 0;
  const out = { importados: 0, duplicados: 0, invalidos: 0 };
  const ins = db.prepare(`INSERT INTO leads (nome, telefone, cidade, consumo, email, obs, owner_id, lote, criado_em) VALUES (?,?,?,?,?,?,?,?,?)`);
  const exists = db.prepare('SELECT id FROM leads WHERE telefone=?');
  const loteNome = (lote && String(lote).trim()) || 'Importação ' + new Date(now() + TZ_OFFSET).toISOString().slice(0, 16).replace('T', ' ');
  db.transaction(() => {
    for (const l of leads) {
      const tel = normalizePhone(l.telefone);
      if (!tel) { out.invalidos++; continue; }
      if (exists.get(tel)) { out.duplicados++; continue; }
      const owner = sdrs.length ? sdrs[rr++ % sdrs.length] : null;
      ins.run(titleCase(l.nome) || 'Cliente', tel, l.cidade ? titleCase(l.cidade) : null, l.consumo ? String(l.consumo).trim() : null,
        l.email || null, l.obs || null, owner, loteNome, now());
      out.importados++;
    }
  })();
  res.json(out);
});

app.post('/api/leads/distribuir', auth(['gestor']), (req, res) => {
  const { sdr_ids, modo } = req.body || {};
  const ids = (sdr_ids || []).map(Number);
  if (!ids.length) return res.status(400).json({ erro: 'Escolha pelo menos uma SDR' });
  const sdrs = db.prepare(`SELECT id FROM users WHERE ativo=1 AND papel='sdr' AND id IN (${ids.map(() => '?').join(',')}) ORDER BY id`).all(...ids).map((r) => r.id);
  if (!sdrs.length) return res.status(400).json({ erro: 'SDRs inválidas' });
  const where = modo === 'todos_novos' ? `status='novo'` : `owner_id IS NULL AND status='novo'`;
  const leads = db.prepare(`SELECT id FROM leads WHERE ${where} ORDER BY id`).all();
  const up = db.prepare('UPDATE leads SET owner_id=? WHERE id=?');
  db.transaction(() => { leads.forEach((l, i) => up.run(sdrs[i % sdrs.length], l.id)); })();
  res.json({ distribuidos: leads.length });
});

app.get('/api/leads', auth(), (req, res) => {
  const { status, owner, q, limit = 50, offset = 0 } = req.query;
  const cond = []; const args = [];
  if (req.user.papel === 'sdr') { cond.push('l.owner_id = ?'); args.push(req.user.id); }
  else if (owner === 'sem') cond.push('l.owner_id IS NULL');
  else if (owner) { cond.push('l.owner_id = ?'); args.push(Number(owner)); }
  if (status) { cond.push('l.status = ?'); args.push(status); }
  if (q) { cond.push('(l.nome LIKE ? OR l.telefone LIKE ? OR l.cidade LIKE ?)'); const s = '%' + q + '%'; args.push(s, s, s); }
  const w = cond.length ? 'WHERE ' + cond.join(' AND ') : '';
  const total = db.prepare(`SELECT COUNT(*) c FROM leads l ${w}`).get(...args).c;
  const rows = db.prepare(`SELECT l.*, u.nome AS owner_nome FROM leads l LEFT JOIN users u ON u.id=l.owner_id ${w} ORDER BY l.id DESC LIMIT ? OFFSET ?`).all(...args, Math.min(Number(limit), 200), Number(offset));
  res.json({ total, leads: rows });
});

app.get('/api/leads/:id', auth(), (req, res) => {
  const l = db.prepare('SELECT l.*, u.nome AS owner_nome FROM leads l LEFT JOIN users u ON u.id=l.owner_id WHERE l.id=?').get(Number(req.params.id));
  if (!l) return res.status(404).json({ erro: 'Não encontrado' });
  if (req.user.papel === 'sdr' && l.owner_id !== req.user.id) return res.status(403).json({ erro: 'Sem permissão' });
  const hist = db.prepare(`SELECT i.*, u.nome AS user_nome FROM interacoes i JOIN users u ON u.id=i.user_id WHERE i.lead_id=? ORDER BY i.criado_em DESC`).all(l.id);
  res.json({ lead: l, historico: hist });
});

app.put('/api/leads/:id/atribuir', auth(['gestor']), (req, res) => {
  const owner = req.body.owner_id ? Number(req.body.owner_id) : null;
  db.prepare('UPDATE leads SET owner_id=? WHERE id=?').run(owner, Number(req.params.id));
  res.json({ ok: true });
});

const ENCERRADOS = ['venda', 'perdido', 'invalido'];
const RESULTADOS = {
  ligacao: ['nao_atendeu', 'caixa_postal', 'falou', 'interessado', 'proposta', 'venda', 'sem_interesse', 'invalido'],
  whatsapp: ['enviado', 'respondeu', 'interessado', 'proposta', 'venda', 'sem_interesse', 'invalido'],
  nota: ['nota']
};

function queueCounts(userId) {
  const t = now();
  const fimHoje = startOfDay(t) + DAY;
  const inicioHoje = startOfDay(t);
  const base = `owner_id=? AND status NOT IN ('venda','perdido','invalido')`;
  const vencidos = db.prepare(`SELECT COUNT(*) c FROM leads WHERE ${base} AND followup_em IS NOT NULL AND followup_em < ?`).get(userId, inicioHoje).c;
  const hoje = db.prepare(`SELECT COUNT(*) c FROM leads WHERE ${base} AND followup_em IS NOT NULL AND followup_em >= ? AND followup_em < ?`).get(userId, inicioHoje, fimHoje).c;
  const devidos = db.prepare(`SELECT COUNT(*) c FROM leads WHERE ${base} AND followup_em IS NOT NULL AND followup_em <= ?`).get(userId, t).c;
  const novos = db.prepare(`SELECT COUNT(*) c FROM leads WHERE owner_id=? AND status='novo' AND followup_em IS NULL`).get(userId).c;
  return { vencidos, hoje, devidos, novos };
}

app.get('/api/fila/proxima', auth(), (req, res) => {
  const pular = String(req.query.pular || '').split(',').map(Number).filter(Boolean);
  const skipSql = pular.length ? `AND id NOT IN (${pular.map(() => '?').join(',')})` : '';
  const t = now();
  let lead = db.prepare(`SELECT * FROM leads WHERE owner_id=? AND status NOT IN ('venda','perdido','invalido') AND followup_em IS NOT NULL AND followup_em <= ? ${skipSql} ORDER BY followup_em ASC LIMIT 1`).get(req.user.id, t, ...pular);
  let motivo = 'followup';
  if (!lead) {
    lead = db.prepare(`SELECT * FROM leads WHERE owner_id=? AND status='novo' AND followup_em IS NULL ${skipSql} ORDER BY id ASC LIMIT 1`).get(req.user.id, ...pular);
    motivo = 'novo';
  }
  const counts = queueCounts(req.user.id);
  if (!lead) return res.json({ lead: null, counts });
  const hist = db.prepare(`SELECT i.*, u.nome AS user_nome FROM interacoes i JOIN users u ON u.id=i.user_id WHERE i.lead_id=? ORDER BY i.criado_em DESC LIMIT 8`).all(lead.id);
  res.json({ lead, motivo, historico: hist, counts });
});

app.get('/api/hoje', auth(), (req, res) => {
  const t = now();
  const fimHoje = startOfDay(t) + DAY;
  const lista = db.prepare(`SELECT * FROM leads WHERE owner_id=? AND status NOT IN ('venda','perdido','invalido') AND followup_em IS NOT NULL AND followup_em < ? ORDER BY followup_em ASC LIMIT 200`).all(req.user.id, fimHoje);
  const proximos = db.prepare(`SELECT * FROM leads WHERE owner_id=? AND status NOT IN ('venda','perdido','invalido') AND followup_em IS NOT NULL AND followup_em >= ? ORDER BY followup_em ASC LIMIT 20`).all(req.user.id, fimHoje);
  res.json({ counts: queueCounts(req.user.id), followups: lista, proximos, agora: t });
});

app.post('/api/leads/:id/registrar', auth(), (req, res) => {
  const id = Number(req.params.id);
  const lead = db.prepare('SELECT * FROM leads WHERE id=?').get(id);
  if (!lead) return res.status(404).json({ erro: 'Contato não encontrado' });
  if (req.user.papel === 'sdr' && lead.owner_id !== req.user.id) return res.status(403).json({ erro: 'Sem permissão' });
  const { canal, resultado, nota, origem, followup_em, valor } = req.body || {};
  if (!RESULTADOS[canal] || !RESULTADOS[canal].includes(resultado)) return res.status(400).json({ erro: 'Resultado inválido' });
  const cfg = getConfig();
  const t = now();
  const h = (x) => Math.max(1, parseFloat(x) || 24) * 3600 * 1000;

  let status = lead.status;
  let tentativas = lead.tentativas;
  let fu = lead.followup_em;
  let valorVenda = lead.valor_venda;

  if (canal !== 'nota') {
    switch (resultado) {
      case 'nao_atendeu':
      case 'caixa_postal':
        tentativas += 1;
        if (status === 'novo') status = 'novo';
        fu = t + h(cfg.cadencia_nao_atendeu_h);
        if (tentativas >= parseInt(cfg.max_tentativas || '5') && lead.status === 'novo') { status = 'perdido'; fu = null; }
        break;
      case 'enviado':
        tentativas += 1;
        if (status === 'novo') status = 'abordado';
        fu = t + h(cfg.cadencia_enviado_h);
        break;
      case 'falou':
      case 'respondeu':
        status = 'conversando'; fu = t + h(cfg.cadencia_conversa_h); break;
      case 'interessado':
        status = 'interessado'; fu = t + h(cfg.cadencia_conversa_h); break;
      case 'proposta':
        status = 'proposta'; fu = t + h(cfg.cadencia_proposta_h); break;
      case 'venda':
        status = 'venda'; fu = null; valorVenda = valor ? Number(valor) : lead.valor_venda; break;
      case 'sem_interesse':
        status = 'perdido'; fu = null; break;
      case 'invalido':
        status = 'invalido'; fu = null; break;
    }
    if (!ENCERRADOS.includes(status) && followup_em !== undefined) {
      fu = followup_em === null ? null : Number(followup_em);
    }
  }
  db.transaction(() => {
    db.prepare(`INSERT INTO interacoes (lead_id, user_id, canal, resultado, nota, origem, valor, criado_em) VALUES (?,?,?,?,?,?,?,?)`)
      .run(id, req.user.id, canal, resultado, nota || null, origem || null, resultado === 'venda' && valor ? Number(valor) : null, t);
    if (canal !== 'nota') {
      db.prepare(`UPDATE leads SET status=?, tentativas=?, followup_em=?, valor_venda=?, ultimo_contato=? WHERE id=?`)
        .run(status, tentativas, fu, valorVenda, t, id);
    }
  })();
  res.json({ ok: true, status, followup_em: fu, tentativas });
});

function rangeFor(periodo) {
  const t = now();
  const ini = startOfDay(t);
  if (periodo === '7d') return [ini - 6 * DAY, t];
  if (periodo === '30d') return [ini - 29 * DAY, t];
  if (periodo === 'mes') {
    const d = new Date(t + TZ_OFFSET);
    return [Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - TZ_OFFSET, t];
  }
  return [ini, t];
}
const POSITIVOS = ['falou', 'respondeu', 'interessado', 'proposta', 'venda'];

function statsUser(userId, ini, fim) {
  const rows = db.prepare(`SELECT canal, resultado, origem, valor, lead_id FROM interacoes WHERE user_id=? AND criado_em>=? AND criado_em<=? AND canal!='nota'`).all(userId, ini, fim);
  const s = { ligacoes: 0, atendidas: 0, whatsapp: 0, respostas: 0, followups: 0, interessados: 0, propostas: 0, vendas: 0, valor: 0 };
  const vistos = { int: new Set(), prop: new Set(), ven: new Set() };
  for (const r of rows) {
    if (r.canal === 'ligacao') {
      s.ligacoes++;
      if (!['nao_atendeu', 'caixa_postal', 'invalido'].includes(r.resultado)) s.atendidas++;
    } else if (r.canal === 'whatsapp') {
      if (r.resultado === 'enviado') s.whatsapp++;
      if (POSITIVOS.includes(r.resultado)) s.respostas++;
    }
    if (r.origem === 'followup') s.followups++;
    if (['interessado', 'proposta', 'venda'].includes(r.resultado)) vistos.int.add(r.lead_id);
    if (['proposta', 'venda'].includes(r.resultado)) vistos.prop.add(r.lead_id);
    if (r.resultado === 'venda') { vistos.ven.add(r.lead_id); s.valor += r.valor || 0; }
  }
  s.interessados = vistos.int.size; s.propostas = vistos.prop.size; s.vendas = vistos.ven.size;
  return s;
}

app.get('/api/stats/meu', auth(), (req, res) => {
  const t = now();
  const [ini] = rangeFor('hoje');
  const hoje = statsUser(req.user.id, ini, t);
  const porDia = [];
  for (let i = 6; i >= 0; i--) {
    const a = ini - i * DAY;
    const s = statsUser(req.user.id, a, a + DAY - 1);
    porDia.push({ dia: new Date(a + TZ_OFFSET).toISOString().slice(5, 10), ligacoes: s.ligacoes, whatsapp: s.whatsapp, vendas: s.vendas });
  }
  const horas = new Array(24).fill(0);
  for (const r of db.prepare(`SELECT criado_em FROM interacoes WHERE user_id=? AND criado_em>=? AND canal!='nota'`).all(req.user.id, ini)) {
    horas[new Date(r.criado_em + TZ_OFFSET).getUTCHours()]++;
  }
  const semana = statsUser(req.user.id, ini - 6 * DAY, t);
  res.json({ hoje, semana, porDia, horas, metas: { ligacoes: req.user.meta_ligacoes, whatsapp: req.user.meta_whatsapp }, whatsapp_limite: parseInt(getConfig().wa_limite_dia) });
});

app.get('/api/stats/equipe', auth(['gestor']), (req, res) => {
  const [ini, fim] = rangeFor(req.query.periodo || 'hoje');
  const sdrs = db.prepare(`SELECT * FROM users WHERE papel='sdr' AND ativo=1 ORDER BY nome`).all();
  const equipe = sdrs.map((u) => {
    const s = statsUser(u.id, ini, fim);
    const fila = queueCounts(u.id);
    const ultima = db.prepare('SELECT MAX(criado_em) m FROM interacoes WHERE user_id=?').get(u.id).m;
    return { id: u.id, nome: u.nome, meta_ligacoes: u.meta_ligacoes, meta_whatsapp: u.meta_whatsapp, ...s, atrasados: fila.vencidos, fila_novos: fila.novos, ultima_atividade: ultima };
  });
  const tot = equipe.reduce((a, s) => {
    for (const k of ['ligacoes', 'atendidas', 'whatsapp', 'respostas', 'followups', 'interessados', 'propostas', 'vendas', 'valor']) a[k] = (a[k] || 0) + s[k];
    return a;
  }, {});
  const funilRows = db.prepare(`SELECT lead_id, canal, resultado FROM interacoes WHERE criado_em>=? AND criado_em<=? AND canal!='nota'`).all(ini, fim);
  const f = { tocados: new Set(), conversas: new Set(), interessados: new Set(), propostas: new Set(), vendas: new Set() };
  for (const r of funilRows) {
    f.tocados.add(r.lead_id);
    if (POSITIVOS.includes(r.resultado)) f.conversas.add(r.lead_id);
    if (['interessado', 'proposta', 'venda'].includes(r.resultado)) f.interessados.add(r.lead_id);
    if (['proposta', 'venda'].includes(r.resultado)) f.propostas.add(r.lead_id);
    if (r.resultado === 'venda') f.vendas.add(r.lead_id);
  }
  const base = db.prepare('SELECT COUNT(*) c FROM leads').get().c;
  const baseStatus = db.prepare('SELECT status, COUNT(*) c FROM leads GROUP BY status').all();
  const semDono = db.prepare(`SELECT COUNT(*) c FROM leads WHERE owner_id IS NULL AND status='novo'`).get().c;
  const horas = new Array(24).fill(0);
  for (const r of db.prepare(`SELECT criado_em FROM interacoes WHERE criado_em>=? AND criado_em<=? AND canal!='nota'`).all(ini, fim)) {
    horas[new Date(r.criado_em + TZ_OFFSET).getUTCHours()]++;
  }
  const dias = [];
  const diasN = req.query.periodo === '30d' || req.query.periodo === 'mes' ? 14 : 7;
  const hoje0 = startOfDay(now());
  for (let i = diasN - 1; i >= 0; i--) {
    const a = hoje0 - i * DAY;
    const row = db.prepare(`SELECT canal, resultado FROM interacoes WHERE criado_em>=? AND criado_em<? AND canal!='nota'`).all(a, a + DAY);
    dias.push({
      dia: new Date(a + TZ_OFFSET).toISOString().slice(5, 10),
      ligacoes: row.filter((r) => r.canal === 'ligacao').length,
      whatsapp: row.filter((r) => r.canal === 'whatsapp' && r.resultado === 'enviado').length,
      vendas: row.filter((r) => r.resultado === 'venda').length
    });
  }
  res.json({
    equipe, totais: tot,
    funil: { base, tocados: f.tocados.size, conversas: f.conversas.size, interessados: f.interessados.size, propostas: f.propostas.size, vendas: f.vendas.size },
    baseStatus, semDono, horas, dias
  });
});

app.get('/api/mensagens', auth(), (req, res) => {
  const rows = db.prepare('SELECT * FROM mensagens WHERE ativo=1 ORDER BY id').all().map((m) => ({ ...m, variantes: JSON.parse(m.variantes) }));
  res.json(rows);
});
app.post('/api/mensagens', auth(['gestor']), (req, res) => {
  const { titulo, variantes } = req.body || {};
  const v = (variantes || []).map((x) => String(x).trim()).filter(Boolean);
  if (!titulo || !v.length) return res.status(400).json({ erro: 'Informe o título e pelo menos uma versão do texto' });
  const id = db.prepare('INSERT INTO mensagens (titulo, variantes) VALUES (?,?)').run(titulo, JSON.stringify(v)).lastInsertRowid;
  res.json({ id });
});
app.put('/api/mensagens/:id', auth(['gestor']), (req, res) => {
  const { titulo, variantes } = req.body || {};
  const v = (variantes || []).map((x) => String(x).trim()).filter(Boolean);
  if (!titulo || !v.length) return res.status(400).json({ erro: 'Informe o título e pelo menos uma versão do texto' });
  db.prepare('UPDATE mensagens SET titulo=?, variantes=? WHERE id=?').run(titulo, JSON.stringify(v), Number(req.params.id));
  res.json({ ok: true });
});
app.delete('/api/mensagens/:id', auth(['gestor']), (req, res) => {
  db.prepare('UPDATE mensagens SET ativo=0 WHERE id=?').run(Number(req.params.id));
  res.json({ ok: true });
});

app.get('/api/export.csv', auth(['gestor']), (req, res) => {
  const [ini, fim] = rangeFor(req.query.periodo || '30d');
  const rows = db.prepare(`SELECT i.criado_em, u.nome sdr, l.nome cliente, l.telefone, l.cidade, i.canal, i.resultado, i.origem, i.valor, i.nota
    FROM interacoes i JOIN users u ON u.id=i.user_id JOIN leads l ON l.id=i.lead_id WHERE i.criado_em>=? AND i.criado_em<=? ORDER BY i.criado_em`).all(ini, fim);
  const esc = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const head = ['data_hora', 'sdr', 'cliente', 'telefone', 'cidade', 'canal', 'resultado', 'origem', 'valor', 'nota'];
  const lines = [head.join(';')];
  for (const r of rows) {
    lines.push([new Date(r.criado_em + TZ_OFFSET).toISOString().replace('T', ' ').slice(0, 19), r.sdr, r.cliente, r.telefone, r.cidade, r.canal, r.resultado, r.origem, r.valor, r.nota].map(esc).join(';'));
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="sdr-flow-atividades.csv"');
  res.send('﻿' + lines.join('\n'));
});

app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, p) => { if (p.endsWith('.html') || p.endsWith('.js') || p.endsWith('.json')) res.setHeader('Cache-Control', 'no-cache'); }
}));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ erro: 'Rota não encontrada' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('\nSDR Flow rodando.');
  console.log('  Neste computador:  http://localhost:' + PORT);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list) if (i.family === 'IPv4' && !i.internal) console.log('  No celular (mesma rede Wi-Fi):  http://' + i.address + ':' + PORT);
  }
  console.log('');
});
