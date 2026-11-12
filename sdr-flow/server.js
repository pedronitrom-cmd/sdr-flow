'use strict';
const express = require('express');
const { createClient } = require('@libsql/client');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const os = require('os');

const PORT = process.env.PORT || 3000;
const DB_PATH = path.resolve(process.env.DB_PATH || path.join(__dirname, 'data', 'sdr.db'));
const REMOTE = !!process.env.TURSO_DATABASE_URL;
if (!REMOTE) fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const client = createClient({
  url: REMOTE ? process.env.TURSO_DATABASE_URL : 'file:' + DB_PATH,
  authToken: process.env.TURSO_AUTH_TOKEN || undefined
});

const toObjs = (rs) => rs.rows.map((r) => { const o = {}; rs.columns.forEach((c, i) => { o[c] = r[i]; }); return o; });
const all = async (sql, args = []) => toObjs(await client.execute({ sql, args }));
const get = async (sql, args = []) => (await all(sql, args))[0];
const run = async (sql, args = []) => {
  const r = await client.execute({ sql, args });
  return { id: r.lastInsertRowid != null ? Number(r.lastInsertRowid) : null, changes: r.rowsAffected };
};
const batch = (stmts) => client.batch(stmts.map(([sql, args]) => ({ sql, args: args || [] })), 'write');

const SCHEMA = `
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
CREATE INDEX IF NOT EXISTS idx_int_data ON interacoes(criado_em);
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
`;

const TZ_OFFSET = -3 * 3600 * 1000;
const DAY = 86400000;
const startOfDay = (ms) => Math.floor((ms + TZ_OFFSET) / DAY) * DAY - TZ_OFFSET;
const now = () => Date.now();

const hashPwd = (pwd, salt) => crypto.scryptSync(String(pwd), salt, 64).toString('hex');
async function createUser({ nome, usuario, senha, papel = 'sdr', meta_ligacoes = 80, meta_whatsapp = 80, trocar_senha = 0 }) {
  const salt = crypto.randomBytes(16).toString('hex');
  const r = await run(
    `INSERT INTO users (nome, usuario, salt, hash, papel, meta_ligacoes, meta_whatsapp, trocar_senha, criado_em) VALUES (?,?,?,?,?,?,?,?,?)`,
    [nome, usuario.toLowerCase().trim(), salt, hashPwd(senha, salt), papel, meta_ligacoes, meta_whatsapp, trocar_senha, now()]
  );
  return r.id;
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
async function getConfig() {
  const o = { ...DEFAULT_CONFIG };
  for (const r of await all('SELECT chave, valor FROM config')) o[r.chave] = r.valor;
  return o;
}

async function init() {
  await client.executeMultiple(SCHEMA);
  for (const c of ['empresa', 'cnpj', 'ramo', 'porte', 'alt_tel']) {
    try { await client.execute(`ALTER TABLE leads ADD COLUMN ${c} TEXT`); } catch (e) { /* coluna já existe */ }
  }
  try { await client.execute('ALTER TABLE mensagens ADD COLUMN lote TEXT'); } catch (e) { /* coluna já existe */ }
  const cfg = await all('SELECT chave FROM config');
  const have = new Set(cfg.map((c) => c.chave));
  const missing = Object.entries(DEFAULT_CONFIG).filter(([k]) => !have.has(k));
  if (missing.length) await batch(missing.map(([k, v]) => ['INSERT OR IGNORE INTO config (chave, valor) VALUES (?,?)', [k, v]]));
  if ((await get('SELECT COUNT(*) c FROM users')).c === 0) {
    await createUser({ nome: 'Gestor', usuario: 'gestor', senha: 'trocar123', papel: 'gestor', trocar_senha: 1 });
    console.log('Usuário inicial criado: gestor / trocar123 (o sistema pede para trocar a senha no primeiro acesso)');
  }
  if ((await get('SELECT COUNT(*) c FROM mensagens')).c === 0) {
    await batch([
      ['INSERT INTO mensagens (titulo, variantes) VALUES (?,?)', ['Abordagem inicial - energia por assinatura', JSON.stringify([
        'Olá, {nome}! Aqui é {sdr}. Posso te mostrar como reduzir a sua conta de luz sem investir em placas nem obras? Leva 1 minuto.',
        'Oi, {nome}, tudo bem? Sou {sdr}. Hoje dá para economizar na conta de energia com assinatura solar, sem instalação. Posso te explicar rapidinho?',
        'Boa tarde, {nome}! {sdr} por aqui. Fiz uma simulação de economia na conta de luz para a sua região. Quer ver quanto você pode economizar?'
      ])]],
      ['INSERT INTO mensagens (titulo, variantes) VALUES (?,?)', ['Segundo toque - com material', JSON.stringify([
        '{nome}, te deixo o material com a simulação de economia: {link}. Qualquer dúvida é só responder aqui.',
        'Oi, {nome}! Segue o material para você ver o quanto pode economizar na energia: {link}. Posso te ligar para explicar?'
      ])]]
    ]);
  }
}

const app = express();
app.use(express.json({ limit: '25mb' }));

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch((e) => {
  console.error(e);
  res.status(500).json({ erro: 'Erro interno. Tente de novo.' });
});
const auth = (papeis) => wrap(async (req, res, next) => {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ erro: 'Não autenticado' });
  const row = await get(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND u.ativo = 1`, [token]);
  if (!row) return res.status(401).json({ erro: 'Sessão expirada' });
  if (papeis && !papeis.includes(row.papel)) return res.status(403).json({ erro: 'Sem permissão' });
  req.user = row;
  next();
});
const publicUser = (u) => ({
  id: u.id, nome: u.nome, usuario: u.usuario, papel: u.papel,
  meta_ligacoes: u.meta_ligacoes, meta_whatsapp: u.meta_whatsapp, ativo: u.ativo, trocar_senha: u.trocar_senha
});
const samePwd = (pwd, u) => {
  const a = Buffer.from(hashPwd(pwd || '', u.salt), 'hex');
  const b = Buffer.from(u.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

app.get('/api/ping', (req, res) => res.json({ ok: true }));

app.post('/api/login', wrap(async (req, res) => {
  const { usuario, senha } = req.body || {};
  const u = await get('SELECT * FROM users WHERE usuario = ? AND ativo = 1', [String(usuario || '').toLowerCase().trim()]);
  if (!u || !samePwd(senha, u)) return res.status(401).json({ erro: 'Usuário ou senha incorretos' });
  const token = crypto.randomBytes(32).toString('hex');
  await run('INSERT INTO sessions (token, user_id, criado_em) VALUES (?,?,?)', [token, u.id, now()]);
  res.json({ token, user: publicUser(u), config: await getConfig() });
}));
app.post('/api/logout', auth(), wrap(async (req, res) => {
  await run('DELETE FROM sessions WHERE token = ?', [req.headers.authorization.slice(7)]);
  res.json({ ok: true });
}));
app.get('/api/me', auth(), wrap(async (req, res) => res.json({ user: publicUser(req.user), config: await getConfig() })));
app.post('/api/me/senha', auth(), wrap(async (req, res) => {
  const { atual, nova } = req.body || {};
  if (!nova || String(nova).length < 6) return res.status(400).json({ erro: 'A nova senha precisa ter pelo menos 6 caracteres' });
  if (!samePwd(atual, req.user)) return res.status(400).json({ erro: 'Senha atual incorreta' });
  const salt = crypto.randomBytes(16).toString('hex');
  await run('UPDATE users SET salt=?, hash=?, trocar_senha=0 WHERE id=?', [salt, hashPwd(nova, salt), req.user.id]);
  res.json({ ok: true });
}));

app.get('/api/config', auth(), wrap(async (req, res) => res.json(await getConfig())));
app.put('/api/config', auth(['gestor']), wrap(async (req, res) => {
  const body = req.body || {};
  const stmts = Object.keys(DEFAULT_CONFIG).filter((k) => body[k] !== undefined)
    .map((k) => ['INSERT INTO config (chave, valor) VALUES (?,?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor', [k, String(body[k])]]);
  if (stmts.length) await batch(stmts);
  res.json(await getConfig());
}));

app.get('/api/usuarios', auth(['gestor']), wrap(async (req, res) => {
  res.json((await all('SELECT * FROM users ORDER BY papel, nome')).map(publicUser));
}));
app.post('/api/usuarios', auth(['gestor']), wrap(async (req, res) => {
  const { nome, usuario, senha, papel, meta_ligacoes, meta_whatsapp } = req.body || {};
  if (!nome || !usuario || !senha || String(senha).length < 6) return res.status(400).json({ erro: 'Preencha nome, usuário e senha (mínimo 6 caracteres)' });
  if (await get('SELECT id FROM users WHERE usuario=?', [String(usuario).toLowerCase().trim()])) return res.status(400).json({ erro: 'Esse usuário já existe' });
  const id = await createUser({
    nome, usuario, senha, papel: papel === 'gestor' ? 'gestor' : 'sdr',
    meta_ligacoes: parseInt(meta_ligacoes) || 80, meta_whatsapp: parseInt(meta_whatsapp) || 80, trocar_senha: 1
  });
  res.json({ id });
}));
app.put('/api/usuarios/:id', auth(['gestor']), wrap(async (req, res) => {
  const id = parseInt(req.params.id);
  const u = await get('SELECT * FROM users WHERE id=?', [id]);
  if (!u) return res.status(404).json({ erro: 'Não encontrado' });
  const { nome, meta_ligacoes, meta_whatsapp, ativo, senha } = req.body || {};
  if (id === req.user.id && ativo === 0) return res.status(400).json({ erro: 'Você não pode desativar o seu próprio usuário' });
  if (senha && String(senha).length < 6) return res.status(400).json({ erro: 'Senha com pelo menos 6 caracteres' });
  await run('UPDATE users SET nome=?, meta_ligacoes=?, meta_whatsapp=?, ativo=? WHERE id=?', [
    nome ?? u.nome, parseInt(meta_ligacoes) || u.meta_ligacoes, parseInt(meta_whatsapp) || u.meta_whatsapp,
    ativo === undefined ? u.ativo : (ativo ? 1 : 0), id
  ]);
  if (senha) {
    const salt = crypto.randomBytes(16).toString('hex');
    await run('UPDATE users SET salt=?, hash=?, trocar_senha=1 WHERE id=?', [salt, hashPwd(senha, salt), id]);
  }
  res.json({ ok: true });
}));

function normalizePhone(raw) {
  let d = String(raw || '').replace(/\D/g, '').replace(/^0+/, '');
  if (d.length === 10 || d.length === 11) d = '55' + d;
  if (!(d.length === 12 || d.length === 13) || !d.startsWith('55')) return null;
  return d;
}
const titleCase = (s) => String(s || '').toLowerCase().replace(/(^|\s|-)([a-zà-ú])/g, (m, a, b) => a + b.toUpperCase()).trim();
const inList = (n) => Array(n).fill('?').join(',');

app.post('/api/leads/importar', auth(['gestor']), wrap(async (req, res) => {
  const { leads, distribuir, lote } = req.body || {};
  if (!Array.isArray(leads) || !leads.length) return res.status(400).json({ erro: 'Nenhum contato para importar' });
  const ids = Array.isArray(distribuir) ? distribuir.map(Number).filter(Boolean) : [];
  const sdrs = ids.length
    ? (await all(`SELECT id FROM users WHERE ativo=1 AND papel='sdr' AND id IN (${inList(ids.length)}) ORDER BY id`, ids)).map((r) => r.id)
    : [];
  const existentes = new Set((await all('SELECT telefone FROM leads')).map((r) => r.telefone));
  const loteNome = (lote && String(lote).trim()) || 'Importação ' + new Date(now() + TZ_OFFSET).toISOString().slice(0, 16).replace('T', ' ');
  const out = { importados: 0, duplicados: 0, invalidos: 0 };
  const stmts = [];
  let rr = 0;
  for (const l of leads) {
    const tel = normalizePhone(l.telefone);
    if (!tel) { out.invalidos++; continue; }
    if (existentes.has(tel)) { out.duplicados++; continue; }
    existentes.add(tel);
    const owner = sdrs.length ? sdrs[rr++ % sdrs.length] : null;
    stmts.push([`INSERT INTO leads (nome, telefone, cidade, consumo, email, obs, owner_id, lote, criado_em, empresa, cnpj, ramo, porte, alt_tel) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [titleCase(l.nome) || 'Cliente', tel, l.cidade ? titleCase(l.cidade) : null, l.consumo ? String(l.consumo).trim() : null, l.email || null, l.obs || null, owner, loteNome, now(), l.empresa || null, l.cnpj || null, l.ramo || null, l.porte || null, l.alt_tel || null]]);
    out.importados++;
  }
  for (let i = 0; i < stmts.length; i += 400) await batch(stmts.slice(i, i + 400));
  res.json(out);
}));

app.post('/api/leads/distribuir', auth(['gestor']), wrap(async (req, res) => {
  const { sdr_ids, modo } = req.body || {};
  const ids = (sdr_ids || []).map(Number).filter(Boolean);
  if (!ids.length) return res.status(400).json({ erro: 'Escolha pelo menos uma SDR' });
  const sdrs = (await all(`SELECT id FROM users WHERE ativo=1 AND papel='sdr' AND id IN (${inList(ids.length)}) ORDER BY id`, ids)).map((r) => r.id);
  if (!sdrs.length) return res.status(400).json({ erro: 'SDRs inválidas' });
  const where = modo === 'todos_novos' ? `status='novo'` : `owner_id IS NULL AND status='novo'`;
  const leads = await all(`SELECT id FROM leads WHERE ${where} ORDER BY id`);
  const stmts = leads.map((l, i) => ['UPDATE leads SET owner_id=? WHERE id=?', [sdrs[i % sdrs.length], l.id]]);
  for (let i = 0; i < stmts.length; i += 400) await batch(stmts.slice(i, i + 400));
  res.json({ distribuidos: leads.length });
}));

app.get('/api/leads', auth(), wrap(async (req, res) => {
  const { status, owner, q, lote, limit = 50, offset = 0 } = req.query;
  const cond = []; const args = [];
  if (req.user.papel === 'sdr') { cond.push('l.owner_id = ?'); args.push(req.user.id); }
  else if (owner === 'sem') cond.push('l.owner_id IS NULL');
  else if (owner) { cond.push('l.owner_id = ?'); args.push(Number(owner)); }
  if (status) { cond.push('l.status = ?'); args.push(status); }
  if (lote) { cond.push('l.lote = ?'); args.push(lote); }
  if (q) { cond.push('(l.nome LIKE ? OR l.telefone LIKE ? OR l.cidade LIKE ?)'); const s = '%' + q + '%'; args.push(s, s, s); }
  const w = cond.length ? 'WHERE ' + cond.join(' AND ') : '';
  const [tot, rows] = await Promise.all([
    get(`SELECT COUNT(*) c FROM leads l ${w}`, args),
    all(`SELECT l.*, u.nome AS owner_nome FROM leads l LEFT JOIN users u ON u.id=l.owner_id ${w} ORDER BY l.id DESC LIMIT ? OFFSET ?`, [...args, Math.min(Number(limit), 200), Number(offset)])
  ]);
  res.json({ total: tot.c, leads: rows });
}));

app.get('/api/leads/:id', auth(), wrap(async (req, res) => {
  const l = await get('SELECT l.*, u.nome AS owner_nome FROM leads l LEFT JOIN users u ON u.id=l.owner_id WHERE l.id=?', [Number(req.params.id)]);
  if (!l) return res.status(404).json({ erro: 'Não encontrado' });
  if (req.user.papel === 'sdr' && l.owner_id !== req.user.id) return res.status(403).json({ erro: 'Sem permissão' });
  const hist = await all(`SELECT i.*, u.nome AS user_nome FROM interacoes i JOIN users u ON u.id=i.user_id WHERE i.lead_id=? ORDER BY i.criado_em DESC`, [l.id]);
  res.json({ lead: l, historico: hist });
}));

app.put('/api/leads/:id/atribuir', auth(['gestor']), wrap(async (req, res) => {
  await run('UPDATE leads SET owner_id=? WHERE id=?', [req.body.owner_id ? Number(req.body.owner_id) : null, Number(req.params.id)]);
  res.json({ ok: true });
}));

/* ---------- exclusão de contatos (gestor) ----------
   "Não trabalhado" = status 'novo' e nenhuma interação registrada.
   Excluir trabalhados apaga também as interações (ligações, WhatsApp, notas) desses contatos. */
const LIMPO = `status='novo' AND NOT EXISTS (SELECT 1 FROM interacoes i WHERE i.lead_id = leads.id)`;
async function contarLeads(where, args) {
  const r = await get(`SELECT COUNT(*) total,
      COALESCE(SUM(CASE WHEN ${LIMPO} THEN 1 ELSE 0 END),0) limpos,
      COALESCE(SUM(CASE WHEN status='venda' THEN 1 ELSE 0 END),0) vendas,
      COALESCE((SELECT COUNT(*) FROM interacoes WHERE lead_id IN (SELECT id FROM leads WHERE ${where})),0) interacoes
    FROM leads WHERE ${where}`, [...args, ...args]);
  return { total: r.total, limpos: r.limpos, trabalhados: r.total - r.limpos, vendas: r.vendas, interacoes: r.interacoes };
}
async function excluirLeads({ where, args, trabalhados, confirmarVendas, simular }) {
  const c = await contarLeads(where, args);
  const alvo = trabalhados ? c.total : c.limpos;
  const base = { ...c, alvo };
  if (simular) return { ...base, simulado: true };
  if (trabalhados && c.vendas > 0 && !confirmarVendas) return { ...base, bloqueado: true };
  if (!alvo) return { ...base, excluidos: 0, interacoes_excluidas: 0 };
  if (trabalhados) {
    await batch([
      [`DELETE FROM interacoes WHERE lead_id IN (SELECT id FROM leads WHERE ${where})`, args],
      [`DELETE FROM leads WHERE ${where}`, args]
    ]);
    return { ...base, excluidos: c.total, interacoes_excluidas: c.interacoes };
  }
  await run(`DELETE FROM leads WHERE (${where}) AND ${LIMPO}`, args);
  return { ...base, excluidos: c.limpos, interacoes_excluidas: 0 };
}
const respostaExclusao = (res, r) => {
  if (r.bloqueado) return res.status(409).json({ erro: `Há ${r.vendas} venda(s) entre os contatos. Confirme que deseja apagá-las.`, ...r });
  res.json(r);
};

// Exclui uma lista (lote) inteira. modo: 'limpos' (só não trabalhados) ou 'tudo'.
app.post('/api/lotes/excluir', auth(['gestor']), wrap(async (req, res) => {
  const { lote, modo, confirmar_vendas, simular } = req.body || {};
  const nome = String(lote || '').trim();
  if (!nome) return res.status(400).json({ erro: 'Informe a lista' });
  if (!['limpos', 'tudo'].includes(modo)) return res.status(400).json({ erro: 'Modo inválido' });
  respostaExclusao(res, await excluirLeads({ where: 'lote = ?', args: [nome], trabalhados: modo === 'tudo', confirmarVendas: !!confirmar_vendas, simular: !!simular }));
}));

// Exclui contatos por ids (selecionados / contato avulso) ou por filtro (todos os resultados do filtro).
app.post('/api/leads/excluir', auth(['gestor']), wrap(async (req, res) => {
  const { ids, filtro, incluir_trabalhados, confirmar_vendas, simular } = req.body || {};
  const trabalhados = !!incluir_trabalhados, confirmarVendas = !!confirmar_vendas;
  if (Array.isArray(ids)) {
    const lista = [...new Set(ids.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
    if (!lista.length) return res.status(400).json({ erro: 'Nenhum contato selecionado' });
    if (lista.length > 2000) return res.status(400).json({ erro: 'Selecione no máximo 2000 contatos por vez' });
    const partes = [];
    for (let i = 0; i < lista.length; i += 500) partes.push(lista.slice(i, i + 500));
    const somar = (a, b) => ({ total: a.total + b.total, limpos: a.limpos + b.limpos, trabalhados: a.trabalhados + b.trabalhados, vendas: a.vendas + b.vendas, interacoes: a.interacoes + b.interacoes, alvo: a.alvo + b.alvo });
    const zero = { total: 0, limpos: 0, trabalhados: 0, vendas: 0, interacoes: 0, alvo: 0 };
    let tot = zero;
    for (const p of partes) tot = somar(tot, await excluirLeads({ where: `id IN (${inList(p.length)})`, args: p, trabalhados, simular: true }));
    if (simular) return res.json({ ...tot, simulado: true });
    if (trabalhados && tot.vendas > 0 && !confirmarVendas) return respostaExclusao(res, { ...tot, bloqueado: true });
    let ex = 0, it = 0;
    for (const p of partes) { const r = await excluirLeads({ where: `id IN (${inList(p.length)})`, args: p, trabalhados, confirmarVendas: true }); ex += r.excluidos; it += r.interacoes_excluidas; }
    return res.json({ ...tot, excluidos: ex, interacoes_excluidas: it });
  }
  const f = filtro || {};
  const cond = []; const args = [];
  if (f.lote) { cond.push('lote = ?'); args.push(String(f.lote)); }
  if (f.status) { cond.push('status = ?'); args.push(String(f.status)); }
  if (f.owner === 'sem') cond.push('owner_id IS NULL');
  else if (f.owner) { cond.push('owner_id = ?'); args.push(Number(f.owner)); }
  if (f.q) { cond.push('(nome LIKE ? OR telefone LIKE ? OR cidade LIKE ?)'); const q = '%' + f.q + '%'; args.push(q, q, q); }
  if (!cond.length) return res.status(400).json({ erro: 'Escolha um filtro (lista, status, SDR ou busca) ou selecione contatos' });
  respostaExclusao(res, await excluirLeads({ where: cond.join(' AND '), args, trabalhados, confirmarVendas, simular: !!simular }));
}));

const ENCERRADOS = ['venda', 'perdido', 'invalido'];
const RESULTADOS = {
  ligacao: ['nao_atendeu', 'caixa_postal', 'falou', 'interessado', 'proposta', 'venda', 'sem_interesse', 'invalido'],
  whatsapp: ['enviado', 'respondeu', 'interessado', 'proposta', 'venda', 'sem_interesse', 'invalido'],
  nota: ['nota']
};

async function queueCounts(userId) {
  const t = now(), ini = startOfDay(t), fim = ini + DAY;
  const r = await get(`SELECT
      COALESCE(SUM(CASE WHEN status NOT IN ('venda','perdido','invalido') AND followup_em IS NOT NULL AND followup_em < ? THEN 1 ELSE 0 END),0) vencidos,
      COALESCE(SUM(CASE WHEN status NOT IN ('venda','perdido','invalido') AND followup_em IS NOT NULL AND followup_em >= ? AND followup_em < ? THEN 1 ELSE 0 END),0) hoje,
      COALESCE(SUM(CASE WHEN status NOT IN ('venda','perdido','invalido') AND followup_em IS NOT NULL AND followup_em <= ? THEN 1 ELSE 0 END),0) devidos,
      COALESCE(SUM(CASE WHEN status='novo' AND followup_em IS NULL THEN 1 ELSE 0 END),0) novos
    FROM leads WHERE owner_id=?`, [ini, ini, fim, t, userId]);
  return { vencidos: r.vencidos, hoje: r.hoje, devidos: r.devidos, novos: r.novos };
}

app.get('/api/fila/proxima', auth(), wrap(async (req, res) => {
  const pular = String(req.query.pular || '').split(',').map(Number).filter(Boolean);
  const lote = String(req.query.lote || '').trim();
  const skipSql = (pular.length ? `AND id NOT IN (${inList(pular.length)})` : '') + (lote ? ' AND lote = ?' : '');
  const lArg = lote ? [lote] : [];
  const t = now();
  let lead = await get(`SELECT * FROM leads WHERE owner_id=? AND status NOT IN ('venda','perdido','invalido') AND followup_em IS NOT NULL AND followup_em <= ? ${skipSql} ORDER BY followup_em ASC LIMIT 1`, [req.user.id, t, ...pular, ...lArg]);
  let motivo = 'followup';
  if (!lead) {
    lead = await get(`SELECT * FROM leads WHERE owner_id=? AND status='novo' AND followup_em IS NULL ${skipSql} ORDER BY id ASC LIMIT 1`, [req.user.id, ...pular, ...lArg]);
    motivo = 'novo';
  }
  const counts = await queueCounts(req.user.id);
  if (!lead) return res.json({ lead: null, counts });
  const historico = await all(`SELECT i.*, u.nome AS user_nome FROM interacoes i JOIN users u ON u.id=i.user_id WHERE i.lead_id=? ORDER BY i.criado_em DESC LIMIT 8`, [lead.id]);
  res.json({ lead, motivo, historico, counts });
}));

app.get('/api/hoje', auth(), wrap(async (req, res) => {
  const t = now(), fimHoje = startOfDay(t) + DAY;
  const [counts, lista, proximos] = await Promise.all([
    queueCounts(req.user.id),
    all(`SELECT * FROM leads WHERE owner_id=? AND status NOT IN ('venda','perdido','invalido') AND followup_em IS NOT NULL AND followup_em < ? ORDER BY followup_em ASC LIMIT 200`, [req.user.id, fimHoje]),
    all(`SELECT * FROM leads WHERE owner_id=? AND status NOT IN ('venda','perdido','invalido') AND followup_em IS NOT NULL AND followup_em >= ? ORDER BY followup_em ASC LIMIT 20`, [req.user.id, fimHoje])
  ]);
  res.json({ counts, followups: lista, proximos, agora: t });
}));

app.post('/api/leads/:id/registrar', auth(), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const lead = await get('SELECT * FROM leads WHERE id=?', [id]);
  if (!lead) return res.status(404).json({ erro: 'Contato não encontrado' });
  if (req.user.papel === 'sdr' && lead.owner_id !== req.user.id) return res.status(403).json({ erro: 'Sem permissão' });
  const { canal, resultado, nota, origem, followup_em, valor } = req.body || {};
  if (!RESULTADOS[canal] || !RESULTADOS[canal].includes(resultado)) return res.status(400).json({ erro: 'Resultado inválido' });
  const cfg = await getConfig();
  const t = now();
  const h = (x) => Math.max(1, parseFloat(x) || 24) * 3600 * 1000;

  let status = lead.status, tentativas = lead.tentativas, fu = lead.followup_em, valorVenda = lead.valor_venda;
  if (canal !== 'nota') {
    switch (resultado) {
      case 'nao_atendeu':
      case 'caixa_postal':
        tentativas += 1;
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
    if (!ENCERRADOS.includes(status) && followup_em !== undefined) fu = followup_em === null ? null : Number(followup_em);
  }
  const stmts = [[`INSERT INTO interacoes (lead_id, user_id, canal, resultado, nota, origem, valor, criado_em) VALUES (?,?,?,?,?,?,?,?)`,
    [id, req.user.id, canal, resultado, nota || null, origem || null, resultado === 'venda' && valor ? Number(valor) : null, t]]];
  if (canal !== 'nota') stmts.push([`UPDATE leads SET status=?, tentativas=?, followup_em=?, valor_venda=?, ultimo_contato=? WHERE id=?`, [status, tentativas, fu ?? null, valorVenda ?? null, t, id]]);
  await batch(stmts);
  res.json({ ok: true, status, followup_em: fu, tentativas });
}));

function rangeFor(periodo) {
  const t = now(), ini = startOfDay(t);
  if (periodo === '7d') return [ini - 6 * DAY, t];
  if (periodo === '30d') return [ini - 29 * DAY, t];
  if (periodo === 'mes') {
    const d = new Date(t + TZ_OFFSET);
    return [Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - TZ_OFFSET, t];
  }
  return [ini, t];
}
const POSITIVOS = ['falou', 'respondeu', 'interessado', 'proposta', 'venda'];
const ZERO = () => ({ ligacoes: 0, atendidas: 0, whatsapp: 0, respostas: 0, followups: 0, interessados: 0, propostas: 0, vendas: 0, valor: 0 });

function calcStats(rows) {
  const s = ZERO();
  const vi = new Set(), vp = new Set(), vv = new Set();
  for (const r of rows) {
    if (r.canal === 'ligacao') {
      s.ligacoes++;
      if (!['nao_atendeu', 'caixa_postal', 'invalido'].includes(r.resultado)) s.atendidas++;
    } else if (r.canal === 'whatsapp') {
      if (r.resultado === 'enviado') s.whatsapp++;
      if (POSITIVOS.includes(r.resultado)) s.respostas++;
    }
    if (r.origem === 'followup') s.followups++;
    if (['interessado', 'proposta', 'venda'].includes(r.resultado)) vi.add(r.lead_id);
    if (['proposta', 'venda'].includes(r.resultado)) vp.add(r.lead_id);
    if (r.resultado === 'venda') { vv.add(r.lead_id); s.valor += r.valor || 0; }
  }
  s.interessados = vi.size; s.propostas = vp.size; s.vendas = vv.size;
  return s;
}
const hourOf = (ms) => new Date(ms + TZ_OFFSET).getUTCHours();
const dayLabel = (a) => new Date(a + TZ_OFFSET).toISOString().slice(5, 10);
function porDia(rows, hoje0, n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const a = hoje0 - i * DAY;
    const r = rows.filter((x) => x.criado_em >= a && x.criado_em < a + DAY);
    out.push({
      dia: dayLabel(a),
      ligacoes: r.filter((x) => x.canal === 'ligacao').length,
      whatsapp: r.filter((x) => x.canal === 'whatsapp' && x.resultado === 'enviado').length,
      vendas: r.filter((x) => x.resultado === 'venda').length
    });
  }
  return out;
}

app.get('/api/stats/meu', auth(), wrap(async (req, res) => {
  const t = now(), ini = startOfDay(t);
  const rows = await all(`SELECT lead_id, canal, resultado, origem, valor, criado_em FROM interacoes WHERE user_id=? AND criado_em>=? AND canal!='nota'`, [req.user.id, ini - 6 * DAY]);
  const hojeRows = rows.filter((r) => r.criado_em >= ini);
  const horas = new Array(24).fill(0);
  hojeRows.forEach((r) => { horas[hourOf(r.criado_em)]++; });
  const cfg = await getConfig();
  res.json({
    hoje: calcStats(hojeRows), semana: calcStats(rows), porDia: porDia(rows, ini, 7), horas,
    metas: { ligacoes: req.user.meta_ligacoes, whatsapp: req.user.meta_whatsapp }, whatsapp_limite: parseInt(cfg.wa_limite_dia)
  });
}));

app.get('/api/stats/equipe', auth(['gestor']), wrap(async (req, res) => {
  const periodo = req.query.periodo || 'hoje';
  const [ini, fim] = rangeFor(periodo);
  const hoje0 = startOfDay(now());
  const diasN = periodo === '30d' || periodo === 'mes' ? 14 : 7;
  const desde = Math.min(ini, hoje0 - (diasN - 1) * DAY);
  const [sdrs, rowsAll, filas, ultimas, base, baseStatus, semDono] = await Promise.all([
    all(`SELECT * FROM users WHERE papel='sdr' AND ativo=1 ORDER BY nome`),
    all(`SELECT user_id, lead_id, canal, resultado, origem, valor, criado_em FROM interacoes WHERE criado_em>=? AND criado_em<=? AND canal!='nota'`, [desde, fim]),
    all(`SELECT owner_id,
        COALESCE(SUM(CASE WHEN status NOT IN ('venda','perdido','invalido') AND followup_em IS NOT NULL AND followup_em < ? THEN 1 ELSE 0 END),0) vencidos,
        COALESCE(SUM(CASE WHEN status='novo' AND followup_em IS NULL THEN 1 ELSE 0 END),0) novos
      FROM leads WHERE owner_id IS NOT NULL GROUP BY owner_id`, [hoje0]),
    all('SELECT user_id, MAX(criado_em) m FROM interacoes GROUP BY user_id'),
    get('SELECT COUNT(*) c FROM leads'),
    all('SELECT status, COUNT(*) c FROM leads GROUP BY status'),
    get(`SELECT COUNT(*) c FROM leads WHERE owner_id IS NULL AND status='novo'`)
  ]);
  const rows = rowsAll.filter((r) => r.criado_em >= ini);
  const equipe = sdrs.map((u) => {
    const s = calcStats(rows.filter((r) => r.user_id === u.id));
    const f = filas.find((x) => x.owner_id === u.id) || { vencidos: 0, novos: 0 };
    const ult = ultimas.find((x) => x.user_id === u.id);
    return { id: u.id, nome: u.nome, meta_ligacoes: u.meta_ligacoes, meta_whatsapp: u.meta_whatsapp, ...s, atrasados: f.vencidos, fila_novos: f.novos, ultima_atividade: ult ? ult.m : null };
  });
  const totais = equipe.reduce((a, s) => { for (const k of Object.keys(ZERO())) a[k] = (a[k] || 0) + s[k]; return a; }, {});
  const f = { tocados: new Set(), conversas: new Set(), interessados: new Set(), propostas: new Set(), vendas: new Set() };
  const horas = new Array(24).fill(0);
  for (const r of rows) {
    f.tocados.add(r.lead_id);
    if (POSITIVOS.includes(r.resultado)) f.conversas.add(r.lead_id);
    if (['interessado', 'proposta', 'venda'].includes(r.resultado)) f.interessados.add(r.lead_id);
    if (['proposta', 'venda'].includes(r.resultado)) f.propostas.add(r.lead_id);
    if (r.resultado === 'venda') f.vendas.add(r.lead_id);
    horas[hourOf(r.criado_em)]++;
  }
  res.json({
    equipe, totais,
    funil: { base: base.c, tocados: f.tocados.size, conversas: f.conversas.size, interessados: f.interessados.size, propostas: f.propostas.size, vendas: f.vendas.size },
    baseStatus, semDono: semDono.c, horas, dias: porDia(rowsAll, hoje0, diasN)
  });
}));

app.get('/api/lotes', auth(), wrap(async (req, res) => {
  const sdr = req.user.papel === 'sdr';
  const rows = await all(`SELECT lote, COUNT(*) total,
      COALESCE(SUM(CASE WHEN status='novo' THEN 1 ELSE 0 END),0) novos,
      COALESCE(SUM(CASE WHEN status='venda' THEN 1 ELSE 0 END),0) vendas,
      COALESCE(SUM(CASE WHEN status NOT IN ('novo','invalido') THEN 1 ELSE 0 END),0) trabalhados,
      COALESCE(SUM(CASE WHEN status='novo' AND NOT EXISTS (SELECT 1 FROM interacoes i WHERE i.lead_id = leads.id) THEN 1 ELSE 0 END),0) limpos
    FROM leads WHERE lote IS NOT NULL ${sdr ? 'AND owner_id=?' : ''} GROUP BY lote ORDER BY MAX(id) DESC`, sdr ? [req.user.id] : []);
  res.json(rows);
}));

app.get('/api/mensagens', auth(), wrap(async (req, res) => {
  res.json((await all('SELECT * FROM mensagens WHERE ativo=1 ORDER BY id')).map((m) => ({ ...m, variantes: JSON.parse(m.variantes) })));
}));
const cleanVars = (v) => (v || []).map((x) => String(x).trim()).filter(Boolean);
app.post('/api/mensagens', auth(['gestor']), wrap(async (req, res) => {
  const { titulo } = req.body || {}, v = cleanVars(req.body.variantes);
  if (!titulo || !v.length) return res.status(400).json({ erro: 'Informe o título e pelo menos uma versão do texto' });
  res.json({ id: (await run('INSERT INTO mensagens (titulo, variantes, lote) VALUES (?,?,?)', [titulo, JSON.stringify(v), String(req.body.lote || '').trim() || null])).id });
}));
app.put('/api/mensagens/:id', auth(['gestor']), wrap(async (req, res) => {
  const { titulo } = req.body || {}, v = cleanVars(req.body.variantes);
  if (!titulo || !v.length) return res.status(400).json({ erro: 'Informe o título e pelo menos uma versão do texto' });
  await run('UPDATE mensagens SET titulo=?, variantes=?, lote=? WHERE id=?', [titulo, JSON.stringify(v), String(req.body.lote || '').trim() || null, Number(req.params.id)]);
  res.json({ ok: true });
}));
app.delete('/api/mensagens/:id', auth(['gestor']), wrap(async (req, res) => {
  await run('UPDATE mensagens SET ativo=0 WHERE id=?', [Number(req.params.id)]);
  res.json({ ok: true });
}));

app.get('/api/export.csv', auth(['gestor']), wrap(async (req, res) => {
  const [ini, fim] = rangeFor(req.query.periodo || '30d');
  const rows = await all(`SELECT i.criado_em, u.nome sdr, l.nome cliente, l.telefone, l.cidade, i.canal, i.resultado, i.origem, i.valor, i.nota
    FROM interacoes i JOIN users u ON u.id=i.user_id JOIN leads l ON l.id=i.lead_id WHERE i.criado_em>=? AND i.criado_em<=? ORDER BY i.criado_em`, [ini, fim]);
  const esc = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const lines = [['data_hora', 'sdr', 'cliente', 'telefone', 'cidade', 'canal', 'resultado', 'origem', 'valor', 'nota'].join(';')];
  for (const r of rows) {
    lines.push([new Date(r.criado_em + TZ_OFFSET).toISOString().replace('T', ' ').slice(0, 19), r.sdr, r.cliente, r.telefone, r.cidade, r.canal, r.resultado, r.origem, r.valor, r.nota].map(esc).join(';'));
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="sdr-flow-atividades.csv"');
  res.send('﻿' + lines.join('\n'));
}));

app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, p) => { if (/\.(html|js|json)$/.test(p)) res.setHeader('Cache-Control', 'no-cache'); }
}));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ erro: 'Rota não encontrada' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

init().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log('\nSDR Flow rodando (' + (REMOTE ? 'banco online Turso' : 'banco local') + ').');
    console.log('  Neste computador:  http://localhost:' + PORT);
    for (const list of Object.values(os.networkInterfaces())) {
      for (const i of list) if (i.family === 'IPv4' && !i.internal) console.log('  No celular (mesma rede Wi-Fi):  http://' + i.address + ':' + PORT);
    }
    console.log('');
  });
}).catch((e) => { console.error('Falha ao iniciar:', e.message); process.exit(1); });
