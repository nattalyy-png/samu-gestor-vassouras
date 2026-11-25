// SAMU Gestor · Vassouras — versão real (Firebase)
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, connectAuthEmulator, onAuthStateChanged, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeFirestore, connectFirestoreEmulator, persistentLocalCache, persistentMultipleTabManager, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, collection, query, where, orderBy, limit, getDocs, serverTimestamp, writeBatch, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { lerEscalaPDF } from "./escala-parser.js";

/* ================= utilidades ================= */
const app = document.getElementById('app');
const pad = n => String(n).padStart(2, '0');
const toDate = v => v ? (v.toDate ? v.toDate() : new Date(v)) : null;
const fmt = v => { const d = toDate(v); return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}` : 'enviando…'; };
const diaStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const mesStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const fmtDia = s => { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };
const fmtMes = s => { const [y, m] = s.split('-'); return new Date(+y, +m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }); };
const addMes = (s, n) => { const [y, m] = s.split('-').map(Number); return mesStr(new Date(y, m - 1 + n, 1)); };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const normNome = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim();
const linhas = t => String(t || '').split('\n').map(s => s.trim()).filter(Boolean);
const $ = id => document.getElementById(id);
const toast = msg => { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); };
const rows = snap => snap.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }));
const porQuando = (a, b) => (toDate(b.quando) || new Date()) - (toDate(a.quando) || new Date());
const ERROS = {
  'auth/invalid-credential': 'E-mail ou senha incorretos.', 'auth/wrong-password': 'E-mail ou senha incorretos.', 'auth/user-not-found': 'E-mail ou senha incorretos.',
  'auth/invalid-email': 'E-mail inválido.', 'auth/too-many-requests': 'Muitas tentativas. Espere alguns minutos e tente de novo.',
  'auth/email-already-in-use': 'Este e-mail já tem conta no sistema.', 'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
  'auth/network-request-failed': 'Sem internet. Verifique a conexão.', 'permission-denied': 'Sem permissão para esta ação.'
};
const msgErro = e => ERROS[e?.code] || ('Erro: ' + (e?.message || e));
const semInternet = () => !navigator.onLine;

/* ================= configuração ausente ================= */
if (!firebaseConfig || !firebaseConfig.apiKey || firebaseConfig.apiKey === 'COLE_AQUI') {
  app.innerHTML = `<div class="wrap login"><div class="card setup">
    <div class="logobox"><img src="logo-completa.png" alt="SAMU Gestor" width="200"></div>
    <h1>Falta conectar ao Firebase</h1>
    <p>O app está instalado, mas ainda não sabe qual banco de dados usar. Abra o arquivo <code>firebase-config.js</code> e cole a configuração do seu projeto Firebase (veja o passo a passo no LEIA-ME).</p>
  </div></div>`;
  throw new Error('firebase-config.js não preenchido');
}

const fb = initializeApp(firebaseConfig);
const auth = getAuth(fb);
let db;
try { db = initializeFirestore(fb, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }); }
catch (e) { db = initializeFirestore(fb, {}); }
// Só para testes no computador (localhost?emulador=1): usa os emuladores do Firebase.
const EMU = ['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).has('emulador');
if (EMU) { connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true }); connectFirestoreEmulator(db, '127.0.0.1', 8080); }
const C = name => collection(db, name);
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';

/* ================= listas padrão (EXEMPLOS: trocar pelas listas reais do coordenador) ================= */
const PADRAO = {
  viaturas: ['USB-01; USB', 'USB-02; USB', 'USA-01; USA'],
  checkUSB: ['Prancha longa com tirantes', 'Colar cervical (tamanhos P, M, G)', 'Cilindro de oxigênio cheio', 'Kit de oxigenoterapia (cateter, máscara)', 'Ambu adulto e infantil', 'Aspirador portátil', 'DEA (desfibrilador externo automático)', 'Esfigmomanômetro e estetoscópio', 'Oxímetro de pulso', 'Glicosímetro com fitas', 'Kit de imobilização (talas)', 'Kit parto', 'Maca retrátil', 'Rádio / comunicação', 'Pneus, luzes e sirene'],
  checkUSA: ['Monitor cardíaco / desfibrilador', 'Ventilador mecânico de transporte', 'Bomba de infusão', 'Kit de intubação (laringoscópio, tubos)', 'Maleta de medicamentos lacrada', 'Cilindro de oxigênio cheio', 'Aspirador portátil', 'Prancha longa com tirantes', 'Colar cervical (tamanhos P, M, G)', 'Oxímetro e capnógrafo', 'Glicosímetro com fitas', 'Material de acesso venoso', 'Kit parto', 'Maca retrátil', 'Rádio / comunicação', 'Pneus, luzes e sirene'],
  materiais: ['Luvas de procedimento (pares); 20', 'Gazes (pacotes); 10', 'Ataduras; 6', 'Soro fisiológico 500 ml; 4', 'Seringas 10 ml; 10', 'Cateter venoso (Jelco); 6', 'Esparadrapo (rolos); 2', 'Máscaras N95; 6', 'Lençol descartável; 4', 'Coletor de perfurocortante; 1'],
  tiposInter: ['Equipamento', 'Ocorrência fora do comum', 'Material', 'Viatura / mecânica', 'Outro'],
  turnos: ['Diurno 07h–19h', 'Noturno 19h–07h'],
  motivos: [
    { id: 'm1', nome: 'Sem indicação clínica para USA', texto: 'o quadro clínico descrito não apresenta critérios de gravidade que justifiquem o emprego de Unidade de Suporte Avançado, conforme avaliação da regulação médica', base: ['Portaria GM/MS nº 2.048/2002', 'Resolução CFM nº 2.110/2014'] },
    { id: 'm2', nome: 'Transporte eletivo', texto: 'trata-se de transporte eletivo/agendado, que não se enquadra no atendimento pré-hospitalar móvel de urgência, atribuição precípua do SAMU 192', base: ['Portaria GM/MS nº 2.048/2002', 'Portaria de Consolidação GM/MS nº 3/2017'] },
    { id: 'm3', nome: 'Fora da área de cobertura', texto: 'o local de origem ou destino encontra-se fora da área de cobertura desta base descentralizada', base: ['Portaria de Consolidação GM/MS nº 3/2017'] },
    { id: 'm4', nome: 'Viatura indisponível no momento', texto: 'não há, no momento da solicitação, viatura disponível sem prejuízo ao atendimento das urgências da população', base: ['Portaria GM/MS nº 2.048/2002'] },
    { id: 'm5', nome: 'Transferência sem vaga confirmada', texto: 'não foi apresentada confirmação de vaga na unidade de destino, requisito para a transferência inter-hospitalar', base: ['Resolução CFM nº 2.110/2014', 'Portaria GM/MS nº 2.048/2002'] }
  ],
  cab1: 'PREFEITURA MUNICIPAL DE VASSOURAS',
  cab2: 'SERVIÇO DE ATENDIMENTO MÓVEL DE URGÊNCIA – SAMU 192',
  cidade: 'Vassouras',
  assinatura: 'Coordenador(a) do SAMU 192 – Vassouras',
  textoAutorizacao: 'Em atenção à solicitação de transporte referente ao(à) paciente {paciente}, informamos que a mesma foi AUTORIZADA, devendo a unidade solicitante manter contato com a Central de Regulação 192 para o agendamento da saída e a confirmação das condições clínicas e da vaga no destino.',
  textoFinalNegativa: 'Permanecemos à disposição para os casos que se enquadrem no atendimento de urgência e emergência, por meio da Central de Regulação 192.',
  exemplo: true
};

let CFG = PADRAO;
const viaturas = () => (CFG.viaturas || []).map(l => { const [id, tipo] = l.split(';').map(s => s.trim()); return { id, tipo: (tipo || 'USB').toUpperCase() }; });
const materiaisCfg = () => (CFG.materiais || []).map(l => { const [n, m] = l.split(';').map(s => s.trim()); return { n, min: m === undefined || m === '' ? null : Number(m) }; });
const checkItens = tipo => (tipo === 'USA' ? CFG.checkUSA : CFG.checkUSB) || [];

/* ================= sessão ================= */
let me = null, tab = null, ui = {};
const perfilNome = p => ({ plantonista: 'Plantonista', coordenador: 'Coordenador', admin: 'Administração' }[p] || p);
const TABS = {
  plantonista: [['inicio', 'Início'], ['checklist', 'Checklist'], ['material', 'Material'], ['inter', 'Intercorrências'], ['escala', 'Minha escala'], ['sugestoes', 'Sugestões']],
  coordenador: [['painel', 'Painel'], ['solicitacoes', 'Solicitações e ofícios'], ['relatorios', 'Relatórios'], ['escalaGeral', 'Escala'], ['funcionarios', 'Funcionários'], ['config', 'Listas e ofícios'], ['sugestoes', 'Sugestões']],
  admin: [['painel', 'Painel'], ['solicitacoes', 'Solicitações e ofícios'], ['relatorios', 'Relatórios'], ['escalaGeral', 'Escala'], ['funcionarios', 'Funcionários'], ['config', 'Listas e ofícios'], ['backup', 'Cópia de segurança'], ['atividade', 'Registro de ações'], ['sugestoes', 'Sugestões']]
};
// A administração pode ver o app como gestor ou como plantonista (modo de visualização).
let modo = null; try { modo = localStorage.getItem('samu-modo'); } catch (e) { }
const vis = () => (me && me.perfil === 'admin' && ['coordenador', 'plantonista'].includes(modo)) ? modo : me?.perfil;
const gestao = () => me && (vis() === 'coordenador' || vis() === 'admin');
function seletorModo(escuro) {
  if (me.perfil !== 'admin') return '';
  const op = [['admin', 'Administração'], ['coordenador', 'Gestor'], ['plantonista', 'Plantonista']];
  return `<label class="modo ${escuro ? 'escuro' : ''}">Ver como<select id="modoSel">${op.map(([v, l]) => `<option value="${v}" ${vis() === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
}

function base(extra) { return { user: me.uid, userNome: me.nome, quando: serverTimestamp(), dia: diaStr(), mes: mesStr(), ...extra }; }
function registrarAcao(acao) { addDoc(C('log'), { user: me.uid, userNome: me.nome, acao, quando: serverTimestamp() }).catch(() => {}); }
// Grava sem travar a tela quando não há sinal: o Firebase envia quando a internet voltar.
function gravar(promise, okMsg) {
  if (semInternet()) toast(okMsg + ' (sem internet: será enviado quando o sinal voltar)'); else toast(okMsg);
  promise.catch(e => { console.error(e); alertaErro(msgErro(e)); });
}
function alertaErro(m) { const t = document.createElement('div'); t.className = 'toast'; t.style.background = 'var(--bad)'; t.textContent = m; document.body.appendChild(t); setTimeout(() => t.remove(), 5000); }

onAuthStateChanged(auth, async user => {
  me = null; ui = {};
  if (!user) { renderLogin(); return; }
  app.innerHTML = '<div class="spinner">Carregando…</div>';
  let perfil = null;
  try { const s = await getDoc(doc(db, 'users', user.uid)); if (s.exists()) perfil = s.data(); } catch (e) { /* sem permissão = conta sem cadastro ou inativa */ }
  if (!perfil || perfil.ativo !== true) {
    app.innerHTML = `<div class="wrap login"><div class="card logincard"><div class="logobox"><img src="logo-completa.png" alt="SAMU Gestor" width="200"></div>
      <h1>Conta não liberada</h1><p>O e-mail <b>${esc(user.email)}</b> entrou, mas não está ativo no SAMU Gestor. Fale com a coordenação.</p>
      <button id="sair">Sair</button></div></div>`;
    $('sair').onclick = () => signOut(auth); return;
  }
  me = { uid: user.uid, ...perfil };
  try { const c = await getDoc(doc(db, 'config', 'listas')); if (c.exists()) CFG = { ...PADRAO, ...c.data() }; } catch (e) { }
  tab = TABS[vis()][0][0];
  render();
});

/* ================= login ================= */
async function renderLogin() {
  let primeiro = false;
  try { primeiro = !(await getDoc(doc(db, 'config', 'setup'))).exists(); } catch (e) { }
  app.innerHTML = `<div class="login2">
    <div class="hero"><div class="logo"><img src="logo-completa.png" alt=""></div><div><b>SAMU Vassouras</b><span>Gestão do plantão</span></div></div>
    <div class="corpo">
    <h1>Entrar</h1>
    <form id="flogin" class="card" style="border:0;padding:0">
      <label>E-mail<input id="lemail" type="email" autocomplete="username" required></label>
      <label>Senha<input id="lsenha" type="password" autocomplete="current-password" required></label>
      <p id="lerro" class="err small" hidden></p>
      <button class="primary" type="submit">Entrar</button>
      <button type="button" class="linkbtn" id="esqueci">Esqueci minha senha</button>
    </form>
    ${primeiro ? `<hr style="border:0;border-top:1px solid var(--line);width:100%">
    <h2>Primeiro acesso do sistema</h2>
    <p class="small muted">Ainda não existe administração cadastrada. A conta criada aqui será a administração técnica (Denise). Isso só aparece uma vez.</p>
    <form id="fsetup" class="card" style="border:0;padding:0">
      <label>Seu nome<input id="snome" required></label>
      <label>E-mail<input id="semail" type="email" required></label>
      <label>Senha (mínimo 6 caracteres)<input id="ssenha" type="password" minlength="6" required></label>
      <p id="serro" class="err small" hidden></p>
      <button class="primary" type="submit">Criar conta da administração</button>
    </form>` : ''}
    <p class="rodape">Cada funcionário tem seu próprio acesso.<br>O coordenador entra pelo mesmo login e vê o painel completo.</p>
  </div></div>`;
  $('flogin').onsubmit = async e => {
    e.preventDefault(); $('lerro').hidden = true;
    try { await signInWithEmailAndPassword(auth, $('lemail').value.trim(), $('lsenha').value); }
    catch (err) { $('lerro').textContent = msgErro(err); $('lerro').hidden = false; }
  };
  $('esqueci').onclick = async () => {
    const em = $('lemail').value.trim();
    if (!em) { $('lerro').textContent = 'Digite seu e-mail acima e clique de novo em "Esqueci minha senha".'; $('lerro').hidden = false; return; }
    try { await sendPasswordResetEmail(auth, em); toast('Se o e-mail estiver cadastrado, chegará um link para criar nova senha.'); }
    catch (err) { $('lerro').textContent = msgErro(err); $('lerro').hidden = false; }
  };
  if (primeiro) $('fsetup').onsubmit = async e => {
    e.preventDefault(); $('serro').hidden = true;
    try {
      const nome = $('snome').value.trim(), email = $('semail').value.trim();
      const cred = await createUserWithEmailAndPassword(auth, email, $('ssenha').value);
      const b = writeBatch(db);
      b.set(doc(db, 'users', cred.user.uid), { nome, email, funcao: 'Administração técnica', perfil: 'admin', ativo: true, criadoEm: serverTimestamp() });
      b.set(doc(db, 'config', 'setup'), { criadoEm: serverTimestamp(), por: cred.user.uid });
      b.set(doc(db, 'config', 'listas'), PADRAO);
      await b.commit();
      location.reload();
    } catch (err) { $('serro').textContent = msgErro(err); $('serro').hidden = false; }
  };
}

/* ================= estrutura ================= */
let renderSeq = 0;
async function render() {
  const seq = ++renderSeq;
  const tabs = TABS[vis()];
  const aviso = CFG.exemplo && gestao() ? `<div class="banner"><div class="wrap">As listas de checklist, materiais e motivos de negativa ainda são EXEMPLOS. Troque pelas reais em "Listas e ofícios".</div></div>` : '';
  const iniciais = me.nome.split(/\s+/).filter(Boolean).map(w => w[0]).filter((c, i, a) => i === 0 || i === a.length - 1).join('').toUpperCase();
  if (gestao()) {
    app.innerHTML = `<div class="shell">
    <aside class="side"><div class="marca"><img src="logo-simbolo.png" alt=""><div><b>SAMU Vassouras</b><small>${esc(perfilNome(me.perfil))}</small></div></div>
      ${tabs.map(([k, l]) => `<button data-tab="${k}" aria-current="${k === tab}">${l}</button>`).join('')}
      <div class="quem"><span>${esc(me.nome)}</span>${seletorModo(true)}<button id="sair">Sair</button></div></aside>
    <div style="flex:1;min-width:0"><div class="topo-gestao"><div class="linha"><img src="logo-simbolo.png" alt=""><b>SAMU Vassouras</b>${seletorModo(true).replace('id="modoSel"', 'id="modoSel2"')}<button id="sair2">Sair</button></div>
      <nav>${tabs.map(([k, l]) => `<button data-tab="${k}" aria-current="${k === tab}">${l}</button>`).join('')}</nav></div>
    ${aviso}<main id="main"><div class="spinner">Carregando…</div></main></div></div>`;
  } else {
    const IC = { inicio: '<path d="M3 10.5 12 3l9 7.5V21H3z"/>', checklist: '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/>', material: '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/>', inter: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>', escala: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>', sugestoes: '<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/>' };
    const curto = { inicio: 'Início', checklist: 'Checklist', material: 'Material', inter: 'Ocorrência', escala: 'Escala', sugestoes: 'Ideias' };
    app.innerHTML = `<div class="plant-top"><div class="in"><div class="avatar">${esc(iniciais)}</div><div class="ola"><small>Bom plantão,</small><b>${esc(me.nome.split(' ')[0])}</b></div>${seletorModo(true)}<button id="sair">Sair</button></div></div>
    ${me.perfil === 'admin' ? '<div class="banner"><div class="wrap">Você está vendo o app como plantonista. O que enviar aqui fica registrado no seu nome.</div></div>' : ''}
    <main class="plant-main" id="main"><div class="card"><div class="spinner">Carregando…</div></div></main>
    <nav class="bottom">${tabs.map(([k]) => `<button data-tab="${k}" aria-current="${k === tab}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[k] || ''}</svg>${curto[k] || k}</button>`).join('')}</nav>`;
  }
  app.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; render(); window.scrollTo(0, 0); });
  if ($('sair2')) $('sair2').onclick = () => signOut(auth);
  ['modoSel', 'modoSel2'].forEach(id => { if ($(id)) $(id).onchange = e => { modo = e.target.value; try { localStorage.setItem('samu-modo', modo); } catch (er) { } tab = TABS[vis()][0][0]; ui = {}; render(); window.scrollTo(0, 0); }; });
  $('sair').onclick = () => signOut(auth);
  const main = $('main');
  try {
    const html = await (VIEWS[tab] || (async () => ''))();
    if (seq !== renderSeq || !document.body.contains(main)) return; // outra tela já foi aberta
    main.innerHTML = html;
    (BIND[tab] || (() => { }))();
  } catch (e) {
    console.error(e);
    if (seq !== renderSeq) return;
    main.innerHTML = `<div class="card"><p class="err">Não foi possível carregar esta tela.</p><p class="small muted">${esc(msgErro(e))}</p></div>`;
  }
}
const go = t => { tab = t; render(); window.scrollTo(0, 0); };
const VIEWS = {}, BIND = {};

/* ---------- consultas ---------- */
const meus = async (col, mes = mesStr()) => rows(await getDocs(query(C(col), where('user', '==', me.uid), where('mes', '==', mes)))).sort(porQuando);
const doDia = async (col, dia) => rows(await getDocs(query(C(col), where('dia', '==', dia)))).sort(porQuando);
const doMes = async (col, mes) => rows(await getDocs(query(C(col), where('mes', '==', mes)))).sort(porQuando);
const pendencias = ck => (ck.itens || []).filter(i => i.s !== 'ok');
const abaixoMin = m => materiaisCfg().filter(x => x.min !== null && m.qtd && m.qtd[x.n] !== undefined && m.qtd[x.n] < x.min).map(x => ({ n: x.n, q: m.qtd[x.n], min: x.min }));
const gravPill = g => `<span class="pill ${g === 'Alta' ? 'bad' : g === 'Média' ? 'warn' : 'neutral'}">${esc(g)}</span>`;

/* ================= PLANTONISTA ================= */
VIEWS.inicio = async () => {
  const hoje = diaStr();
  const [esc1, esc2, cks] = await Promise.all([meus('escala'), meus('escala', addMes(mesStr(), 1)), meus('checklists')]);
  const escala = [...esc1, ...esc2].sort((a, b) => a.data.localeCompare(b.data));
  const p = escala.find(e => e.data === hoje);
  const prox = escala.filter(e => e.data > hoje).slice(0, 5);
  const enviado = cks.some(c => c.dia === hoje);
  const tile = (go, tag, bg, fg, t, sub) => `<button class="tile" data-go="${go}"><span class="ic" style="background:${bg};color:${fg}">${tag}</span><span><b>${t}</b><small>${sub}</small></span></button>`;
  return `<div class="card"><div class="rotulo">Plantão de hoje</div>
    ${p ? `<div><b style="font-size:1.15rem">${esc(p.codigo ? p.codigo + ' · ' : '')}${esc(p.turno)}</b>${p.viatura ? `<div class="muted small">Viatura ${esc(p.viatura)}</div>` : ''}</div>` : '<p class="muted">Você não tem plantão hoje na escala.</p>'}
    ${enviado ? '<div class="aviso ok">✓ Checklist de hoje enviado</div>' : (p ? '<div class="aviso">⚠ Checklist da viatura ainda não enviado</div>' : '')}</div>
  <div class="tiles">
    ${tile('checklist', 'USB', '#FDECEC', '#B91C1C', 'Checklist USB', 'Suporte básico')}
    ${tile('checklist', 'USA', '#FDECEC', '#B91C1C', 'Checklist USA', 'Suporte avançado')}
    ${tile('material', 'MAT', '#E8F1FB', '#1D4E89', 'Contagem de material', 'Estoque da viatura')}
    ${tile('inter', '!', '#FFF4E5', '#92400E', 'Intercorrência', 'Registrar ocorrência')}
    ${tile('escala', 'ESC', '#E7F5EE', '#166534', 'Minha escala', 'Próximos plantões')}
    ${tile('sugestoes', 'IDEIA', '#F1ECFB', '#5B3A9E', 'Sugestões', 'Ideias para o app')}
  </div>
  <div class="card"><h2>Próximos plantões</h2>${prox.length ? `<div class="tablewrap"><table><tr><th>Data</th><th>Plantão</th></tr>${prox.map(e => `<tr><td>${fmtDia(e.data)}</td><td>${esc(e.codigo ? e.codigo + ' · ' : '')}${esc(e.turno)}${e.viatura ? ' · ' + esc(e.viatura) : ''}</td></tr>`).join('')}</table></div>` : '<p class="empty">Nenhum plantão lançado na escala.</p>'}</div>`;
};
BIND.inicio = () => document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { const t = b.querySelector('.ic')?.textContent; if (t === 'USB' || t === 'USA') { ui.ckTipo = t; ui.ckViatura = null; ui.ckItens = null; } go(b.dataset.go); });

VIEWS.checklist = async () => {
  const vs = viaturas();
  if (!ui.ckTipo) ui.ckTipo = vs[0]?.tipo || 'USB';
  const doTipo = vs.filter(v => v.tipo === ui.ckTipo);
  if (!ui.ckViatura || !doTipo.some(v => v.id === ui.ckViatura)) ui.ckViatura = doTipo[0]?.id || '';
  if (!ui.ckItens) ui.ckItens = checkItens(ui.ckTipo).map(n => ({ n, s: 'ok', o: '' }));
  const tipos = [...new Set(vs.map(v => v.tipo))];
  return `<h1>Checklist da viatura</h1>
  <div class="card">
    <div class="row"><div class="subtabs">${tipos.map(t => `<button data-tipo="${t}" ${t === ui.ckTipo ? 'class="primary"' : ''}>${t}</button>`).join('')}</div>
    <label style="flex:1;min-width:160px">Viatura<select id="ckv">${doTipo.map(v => `<option ${v.id === ui.ckViatura ? 'selected' : ''}>${esc(v.id)}</option>`).join('')}</select></label></div>
    <p class="small muted">${ui.ckTipo === 'USB' ? 'Unidade de Suporte Básico' : ui.ckTipo === 'USA' ? 'Unidade de Suporte Avançado' : ''}. Marque cada item. Itens com falta ou problema vão em destaque para o coordenador.</p>
    <div>${ui.ckItens.map((it, i) => `<div class="item ${it.s !== 'ok' ? 'flag' : ''}"><span>${esc(it.n)}</span>
      <div class="seg" role="group" aria-label="${esc(it.n)}">
        <button data-i="${i}" data-s="ok" class="${it.s === 'ok' ? 'on-ok' : ''}">OK</button>
        <button data-i="${i}" data-s="falta" class="${it.s === 'falta' ? 'on-falta' : ''}">Falta</button>
        <button data-i="${i}" data-s="prob" class="${it.s === 'prob' ? 'on-prob' : ''}">Problema</button></div>
      ${it.s !== 'ok' ? `<input class="obs" data-obs="${i}" placeholder="Descreva o que falta ou o problema" value="${esc(it.o)}">` : ''}</div>`).join('')}</div>
    <label>Observação geral (opcional)<textarea id="ckobs" placeholder="Sem nome ou dados de pacientes">${esc(ui.ckObs || '')}</textarea></label>
    <div class="row"><button class="primary" id="ckEnviar">Enviar checklist</button><span class="small muted">${ui.ckItens.filter(i => i.s !== 'ok').length} item(ns) com pendência</span></div>
  </div>`;
};
BIND.checklist = () => {
  document.querySelectorAll('[data-tipo]').forEach(b => b.onclick = () => { ui.ckTipo = b.dataset.tipo; ui.ckViatura = null; ui.ckItens = null; render(); });
  $('ckv').onchange = e => ui.ckViatura = e.target.value;
  $('ckobs').oninput = e => ui.ckObs = e.target.value;
  document.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { ui.ckItens[+b.dataset.i].s = b.dataset.s; render(); });
  document.querySelectorAll('[data-obs]').forEach(inp => inp.oninput = () => ui.ckItens[+inp.dataset.obs].o = inp.value);
  $('ckEnviar').onclick = () => {
    if (!ui.ckViatura) { alertaErro('Nenhuma viatura cadastrada para este tipo.'); return; }
    gravar(addDoc(C('checklists'), base({ viatura: ui.ckViatura, tipo: ui.ckTipo, itens: ui.ckItens, obs: ui.ckObs || '', pendentes: ui.ckItens.filter(i => i.s !== 'ok').length })), 'Checklist enviado');
    registrarAcao(`Enviou checklist ${ui.ckViatura}`);
    ui.ckItens = null; ui.ckObs = ''; go('inicio');
  };
};

VIEWS.material = async () => {
  const ult = (await meus('materiais')).slice(0, 5);
  return `<h1>Contagem de material</h1>
  <div class="card"><div class="row">
    <label style="flex:1;min-width:140px">Viatura<select id="mv">${viaturas().map(v => `<option>${esc(v.id)}</option>`).join('')}</select></label>
    <label style="flex:1;min-width:140px">Momento<select id="mm"><option>Início</option><option>Fim</option></select></label></div>
    <div class="tablewrap"><table><tr><th>Material</th><th>Mínimo</th><th>Quantidade</th></tr>${materiaisCfg().map((m, i) => `<tr><td>${esc(m.n)}</td><td class="num muted">${m.min ?? '–'}</td><td style="width:110px"><input id="mq${i}" type="number" min="0" inputmode="numeric"></td></tr>`).join('')}</table></div>
    <button class="primary" id="mEnviar">Salvar contagem</button></div>
  <div class="card"><h2>Minhas contagens deste mês</h2>${ult.length ? ult.map(m => { const b = abaixoMin(m); return `<p>${fmt(m.quando)} · ${esc(m.viatura)} · ${esc(m.momento)} do plantão ${b.length ? `<span class="pill bad">⚠ ${b.length} abaixo do mínimo</span>` : ''}</p>`; }).join('') : '<p class="empty">Nenhuma contagem ainda.</p>'}</div>`;
};
BIND.material = () => $('mEnviar').onclick = () => {
  const qtd = {}; let vazio = 0;
  materiaisCfg().forEach((m, i) => { const v = $('mq' + i).value; if (v === '') vazio++; qtd[m.n] = +(v || 0); });
  if (vazio === materiaisCfg().length) { alertaErro('Preencha as quantidades.'); return; }
  const v = $('mv').value, mo = $('mm').value;
  gravar(addDoc(C('materiais'), base({ viatura: v, momento: mo, qtd })), 'Contagem salva');
  registrarAcao(`Contou material ${v} (${mo})`); render();
};

VIEWS.inter = async () => {
  const minhas = await meus('intercorrencias');
  return `<h1>Intercorrências</h1>
  <div class="card"><div class="grid2">
    <label>Viatura<select id="iv">${viaturas().map(v => `<option>${esc(v.id)}</option>`).join('')}</select></label>
    <label>Tipo<select id="it">${(CFG.tiposInter || []).map(t => `<option>${esc(t)}</option>`).join('')}</select></label>
    <label>Gravidade<select id="ig"><option>Baixa</option><option>Média</option><option>Alta</option></select></label></div>
    <label>O que aconteceu<textarea id="itx" placeholder="Descreva sem colocar nome ou dados do paciente"></textarea></label>
    <p class="small muted">Não escreva nome, endereço ou documento de paciente. Registre só o que aconteceu com equipe, viatura ou equipamento.</p>
    <button class="primary" id="iEnviar">Registrar</button></div>
  <div class="card"><h2>Meus registros deste mês</h2>${minhas.length ? minhas.map(i => `<div><p class="small muted">${fmt(i.quando)} · ${esc(i.viatura)} · ${esc(i.tipo)} ${gravPill(i.gravidade)}</p><p>${esc(i.texto)}</p></div>`).join('') : '<p class="empty">Nenhum registro.</p>'}</div>`;
};
BIND.inter = () => $('iEnviar').onclick = () => {
  const t = $('itx').value.trim(); if (!t) { alertaErro('Descreva o que aconteceu'); return; }
  gravar(addDoc(C('intercorrencias'), base({ viatura: $('iv').value, tipo: $('it').value, gravidade: $('ig').value, texto: t })), 'Intercorrência registrada');
  registrarAcao('Registrou intercorrência'); render();
};

function calendario(mes, plantoes) {
  const [y, m] = mes.split('-').map(Number);
  const first = new Date(y, m - 1, 1).getDay(), days = new Date(y, m, 0).getDate(), hoje = diaStr();
  const cells = []; for (let i = 0; i < first; i++) cells.push('<td></td>');
  for (let d = 1; d <= days; d++) {
    const ds = `${mes}-${pad(d)}`; const es = plantoes.filter(x => x.data === ds);
    cells.push(`<td style="${ds === hoje ? 'outline:2px solid var(--accent);outline-offset:-2px;' : ''}"><b>${d}</b>${es.map(e => `<br><span class="pill ${/^diurno/i.test(e.turno) ? 'warn' : 'neutral'}" title="${esc(e.turno)}">${esc(e.codigo || e.turno.split(' ')[0])} ${esc(e.viatura || '')}</span>`).join('')}</td>`);
  }
  const r = []; for (let i = 0; i < cells.length; i += 7) r.push('<tr>' + cells.slice(i, i + 7).join('') + '</tr>');
  return `<div class="tablewrap"><table class="cal"><tr>${['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(x => `<th>${x}</th>`).join('')}</tr>${r.join('')}</table></div>`;
}
VIEWS.escala = async () => {
  if (!ui.escMes) ui.escMes = mesStr();
  const minhas = await meus('escala', ui.escMes);
  return `<h1>Minha escala</h1><div class="card"><div class="row" style="justify-content:space-between"><button id="mAnt">‹ Anterior</button><h2>${fmtMes(ui.escMes)}</h2><button id="mProx">Próximo ›</button></div>
  ${calendario(ui.escMes, minhas)}<p class="small muted">A escala é lançada pela coordenação.</p></div>`;
};
BIND.escala = () => { $('mAnt').onclick = () => { ui.escMes = addMes(ui.escMes, -1); render(); }; $('mProx').onclick = () => { ui.escMes = addMes(ui.escMes, 1); render(); }; };

VIEWS.sugestoes = async () => {
  const lista = gestao() ? rows(await getDocs(query(C('sugestoes'), orderBy('quando', 'desc'), limit(100))))
    : rows(await getDocs(query(C('sugestoes'), where('user', '==', me.uid)))).sort(porQuando);
  return `<h1>Sugestões</h1>
  <div class="card"><label>Sua sugestão para melhorar o app<textarea id="stx"></textarea></label><button class="primary" id="sEnviar">Enviar sugestão</button></div>
  <div class="card"><h2>${gestao() ? 'Todas as sugestões' : 'Minhas sugestões'}</h2>${lista.length ? lista.map(s => `<div class="viat"><div><p class="small muted">${fmt(s.quando)} · ${esc(s.userNome)}</p><p>${esc(s.texto)}</p></div>
  ${gestao() ? `<select data-sug="${s.id}" style="width:auto">${['Nova', 'Em análise', 'Feita', 'Não será feita'].map(o => `<option ${o === s.status ? 'selected' : ''}>${o}</option>`).join('')}</select>` : `<span class="pill neutral">${esc(s.status)}</span>`}</div>`).join('') : '<p class="empty">Nenhuma sugestão ainda.</p>'}</div>`;
};
BIND.sugestoes = () => {
  $('sEnviar').onclick = () => { const t = $('stx').value.trim(); if (!t) return; gravar(addDoc(C('sugestoes'), base({ texto: t, status: 'Nova' })), 'Sugestão enviada'); registrarAcao('Enviou sugestão'); setTimeout(render, 300); };
  document.querySelectorAll('[data-sug]').forEach(s => s.onchange = () => gravar(updateDoc(doc(db, 'sugestoes', s.dataset.sug), { status: s.value }), 'Status atualizado'));
};

/* ================= COORDENAÇÃO ================= */
VIEWS.painel = async () => {
  const hoje = diaStr();
  const [cks, mts, inters] = await Promise.all([doDia('checklists', hoje), doDia('materiais', hoje), doMes('intercorrencias', mesStr())]);
  const vs = viaturas();
  const pend = cks.flatMap(c => pendencias(c).map(i => ({ ...i, c })));
  const baixos = mts.flatMap(m => abaixoMin(m).map(b => ({ ...b, m })));
  const interH = inters.filter(i => i.dia === hoje);
  const envios = [...cks.map(c => ({ q: c.quando, t: `Checklist ${c.viatura}`, u: c.userNome })), ...mts.map(m => ({ q: m.quando, t: `Contagem ${m.viatura} (${m.momento})`, u: m.userNome })), ...interH.map(i => ({ q: i.quando, t: `Intercorrência ${i.viatura}`, u: i.userNome }))].sort((a, b) => porQuando({ quando: a.q }, { quando: b.q })).slice(0, 10);
  const statusV = v => {
    const ck = cks.find(c => c.viatura === v.id);
    if (!ck) return { pill: '<span class="pill neutral">Checklist pendente</span>', ck };
    const p = pendencias(ck);
    if (p.some(i => i.s === 'falta')) return { pill: `<span class="pill bad">⚠ ${p.length} pendência(s)</span>`, ck };
    if (p.length) return { pill: `<span class="pill warn">${p.length} com problema</span>`, ck };
    return { pill: '<span class="pill ok">Tudo OK</span>', ck };
  };
  return `<div class="row" style="justify-content:space-between"><h1>Painel do dia</h1><span class="muted">${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</span></div>
  <div class="stats">
    <div class="stat"><span>Checklists hoje</span><b>${new Set(cks.map(c => c.viatura)).size}/${vs.length}</b></div>
    <div class="stat"><span>Itens pendentes</span><b style="color:${pend.length ? 'var(--bad)' : 'var(--ok)'}">${pend.length}</b></div>
    <div class="stat"><span>Material abaixo do mínimo</span><b style="color:${baixos.length ? 'var(--bad)' : 'var(--ok)'}">${baixos.length}</b></div>
    <div class="stat"><span>Intercorrências hoje</span><b>${interH.length}</b></div></div>
  <div class="grid2">
    <div class="card"><h2>Situação das viaturas</h2>${vs.map(v => { const s = statusV(v); return `<div class="viat"><div><b>${esc(v.id)}</b><br><span class="small muted">${s.ck ? 'Último checklist: ' + fmt(s.ck.quando) + ' · ' + esc(s.ck.userNome) : 'Sem checklist hoje'}</span></div>${s.pill}</div>`; }).join('')}</div>
    <div class="card"><h2>Pendências de hoje</h2>${pend.length || baixos.length ? pend.map(p => `<div class="viat"><div><b>${esc(p.n)}</b><br><span class="small muted">${esc(p.c.viatura)} · ${esc(p.o || 'sem observação')}</span></div><span class="pill ${p.s === 'falta' ? 'bad' : 'warn'}">${p.s === 'falta' ? '⚠ Falta' : 'Problema'}</span></div>`).join('') + baixos.map(b => `<div class="viat"><div><b>${esc(b.n)}</b><br><span class="small muted">${esc(b.m.viatura)} · ${b.q} (mínimo ${b.min})</span></div><span class="pill bad">⚠ Abaixo do mínimo</span></div>`).join('') : '<p class="empty">Nenhuma pendência hoje.</p>'}</div></div>
  <div class="grid2">
    <div class="card"><h2>Intercorrências do mês</h2>${inters.slice(0, 5).map(i => `<div><p class="small muted">${fmt(i.quando)} · ${esc(i.viatura)} · ${esc(i.userNome)} ${gravPill(i.gravidade)}</p><p>${esc(i.texto)}</p></div>`).join('') || '<p class="empty">Nenhuma.</p>'}</div>
    <div class="card"><h2>Envios de hoje</h2>${envios.map(e => `<div class="viat"><span>${esc(e.t)}<br><span class="small muted">${esc(e.u)}</span></span><span class="small muted">${fmt(e.q)}</span></div>`).join('') || '<p class="empty">Nada enviado hoje.</p>'}</div></div>`;
};

/* ---------- solicitações e ofícios (somente coordenador) ---------- */
function gerarOficio(s) {
  const d = new Date(); const mes = d.toLocaleDateString('pt-BR', { month: 'long' });
  const mot = (CFG.motivos || []).filter(m => s.motivos.includes(m.id));
  const bases = [...new Set(mot.flatMap(m => m.base || []))];
  const head = `Ofício nº ${s.numero || '___/' + d.getFullYear()}\n${CFG.cidade}, ${d.getDate()} de ${mes} de ${d.getFullYear()}.\n\nAo(À) ${s.setor || '[setor solicitante]'}\n\nAssunto: ${s.decisao === 'Negado' ? 'Resposta a solicitação de transporte (não autorizada)' : 'Autorização de transporte'}\n\n`;
  let corpo;
  if (s.decisao === 'Negado') {
    corpo = `Em atenção à solicitação de transporte referente ao(à) paciente ${s.paciente || '[paciente]'}, informamos que a mesma não pôde ser atendida por esta base, ${mot.length ? 'considerando que ' + mot.map(m => m.texto).join('; e que ') + '.' : '[selecione ao menos um motivo].'}\n\n${bases.length ? 'Fundamentação: ' + bases.join('; ') + '.\n\n' : ''}${CFG.textoFinalNegativa || ''}`;
  } else {
    corpo = (CFG.textoAutorizacao || '').replace('{paciente}', s.paciente || '[paciente]');
  }
  return head + corpo + `\n\nAtenciosamente,\n\n\n______________________________\n${CFG.assinatura}`;
}
VIEWS.solicitacoes = async () => {
  const lista = rows(await getDocs(query(C('solicitacoes'), orderBy('quando', 'desc'), limit(60))));
  ui.solLista = lista;
  const s = ui.sol;
  let form = '';
  if (s) {
    form = `<div class="card"><h2>${s.id ? 'Solicitação ' + esc(s.numero || '') : 'Nova solicitação'}</h2>
    <p class="small muted">LGPD: registre só as <b>iniciais</b> do paciente e o mínimo necessário do quadro clínico.</p>
    <div class="grid2"><label>Paciente (iniciais)<input id="sp" value="${esc(s.paciente)}" placeholder="Ex.: J. S." maxlength="12"></label>
    <label>Setor / unidade solicitante<input id="ss" value="${esc(s.setor)}"></label></div>
    <label>Quadro clínico (resumo)<textarea id="sq">${esc(s.quadro)}</textarea></label>
    <div class="row"><button class="primary" id="autorizar">Autorizar</button><button id="negar">Negar</button>${s.decisao ? `<span class="pill ${s.decisao === 'Negado' ? 'bad' : 'ok'}">${esc(s.decisao)}</span>` : ''}</div>
    ${s.decisao === 'Negado' ? `<h3>Motivos da negativa</h3><div class="checks">${(CFG.motivos || []).map(m => `<label><input type="checkbox" data-mot="${esc(m.id)}" ${s.motivos.includes(m.id) ? 'checked' : ''}> <span>${esc(m.nome)}<br><span class="small muted">${esc((m.base || []).join(' · '))}</span></span></label>`).join('')}</div>` : ''}
    ${s.decisao ? `<h3>Texto do ofício (pode editar antes de salvar)</h3><textarea id="oftx" class="oficio" style="min-height:380px">${esc(s.texto || gerarOficio(s))}</textarea>
    <div class="row"><button class="primary" id="salvarOf">${s.id ? 'Salvar alterações' : 'Salvar e numerar ofício'}</button>${s.id ? '<button id="pdfOf">Baixar PDF</button>' : ''}<button class="ghost" id="regerar">Refazer texto</button></div>
    <p class="small muted">O app apenas sugere o texto. A decisão, a revisão e a assinatura são do coordenador.</p>` : ''}
    <button class="ghost" id="fecharSol">Fechar</button></div>`;
  }
  return `<div class="row" style="justify-content:space-between"><h1>Solicitações e ofícios</h1><button class="primary" id="novaSol">Nova solicitação</button></div>
  ${form}
  <div class="card"><h2>Histórico</h2><div class="tablewrap"><table><tr><th>Data</th><th>Paciente</th><th>Setor</th><th>Decisão</th><th>Ofício</th><th></th></tr>
  ${lista.map(x => `<tr><td>${fmt(x.quando)}</td><td>${esc(x.paciente)}</td><td>${esc(x.setor)}</td><td><span class="pill ${x.decisao === 'Negado' ? 'bad' : 'ok'}">${esc(x.decisao)}</span></td><td class="num">${esc(x.numero || '–')}</td><td><button data-abrir="${x.id}">Abrir</button></td></tr>`).join('') || '<tr><td colspan="6" class="empty">Nenhuma solicitação ainda.</td></tr>'}</table></div></div>`;
};
async function proximoNumero() {
  const ano = new Date().getFullYear();
  return runTransaction(db, async tx => {
    const ref = doc(db, 'config', 'contador');
    const s = await tx.get(ref);
    let seq = s.exists() && s.data().ano === ano ? s.data().seq : 0;
    seq++; tx.set(ref, { ano, seq });
    return `${String(seq).padStart(3, '0')}/${ano}`;
  });
}
BIND.solicitacoes = () => {
  $('novaSol').onclick = () => { ui.sol = { paciente: '', setor: '', quadro: '', decisao: null, motivos: [] }; render(); };
  document.querySelectorAll('[data-abrir]').forEach(b => b.onclick = () => { ui.sol = JSON.parse(JSON.stringify(ui.solLista.find(x => x.id === b.dataset.abrir), (k, v) => k === 'quando' ? undefined : v)); render(); window.scrollTo(0, 0); });
  if (!ui.sol) return;
  const sync = () => { ui.sol.paciente = $('sp').value.trim(); ui.sol.setor = $('ss').value.trim(); ui.sol.quadro = $('sq').value; if ($('oftx')) ui.sol.texto = $('oftx').value; };
  const decidir = d => { sync(); ui.sol.decisao = d; ui.sol.texto = null; render(); };
  $('autorizar').onclick = () => decidir('Autorizado');
  $('negar').onclick = () => decidir('Negado');
  $('fecharSol').onclick = () => { ui.sol = null; render(); };
  document.querySelectorAll('[data-mot]').forEach(c => c.onchange = () => { sync(); const id = c.dataset.mot; ui.sol.motivos = c.checked ? [...ui.sol.motivos, id] : ui.sol.motivos.filter(x => x !== id); ui.sol.texto = null; render(); });
  if (!$('salvarOf')) return;
  $('oftx').oninput = e => ui.sol.texto = e.target.value;
  $('regerar').onclick = () => { sync(); ui.sol.texto = null; render(); };
  if ($('pdfOf')) $('pdfOf').onclick = () => { sync(); pdfOficio(ui.sol); };
  $('salvarOf').onclick = async () => {
    sync();
    if (!ui.sol.paciente || !ui.sol.setor) { alertaErro('Preencha as iniciais do paciente e o setor.'); return; }
    if (ui.sol.decisao === 'Negado' && !ui.sol.motivos.length) { alertaErro('Marque ao menos um motivo da negativa.'); return; }
    const btn = $('salvarOf'); btn.disabled = true;
    try {
      const s = ui.sol;
      const motivosNomes = (CFG.motivos || []).filter(m => s.motivos.includes(m.id)).map(m => m.nome);
      if (!s.id) {
        s.numero = await proximoNumero();
        const textoFinal = (s.texto || gerarOficio({ ...s, numero: null })).replace(/Ofício nº _+\/\d{4}/, 'Ofício nº ' + s.numero);
        s.texto = textoFinal;
        const ref = await addDoc(C('solicitacoes'), { paciente: s.paciente, setor: s.setor, quadro: s.quadro, decisao: s.decisao, motivos: s.motivos, motivosNomes, texto: s.texto, numero: s.numero, criadoPor: me.uid, criadoPorNome: me.nome, quando: serverTimestamp(), dia: diaStr(), mes: mesStr() });
        s.id = ref.id;
      } else {
        await updateDoc(doc(db, 'solicitacoes', s.id), { paciente: s.paciente, setor: s.setor, quadro: s.quadro, decisao: s.decisao, motivos: s.motivos, motivosNomes, texto: s.texto, editadoEm: serverTimestamp(), editadoPor: me.nome });
      }
      registrarAcao(`Ofício ${s.numero} (${s.decisao})`);
      toast('Ofício ' + s.numero + ' salvo');
      pdfOficio(s);
      ui.sol = null; render();
    } catch (e) { alertaErro(msgErro(e)); btn.disabled = false; }
  };
};

/* ---------- PDF ---------- */
let logoData = null;
async function logo() {
  if (logoData) return logoData;
  const blob = await (await fetch('logo-completa.png')).blob();
  logoData = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
  return logoData;
}
function semPdf() { alertaErro('Não foi possível carregar o gerador de PDF. Verifique a internet.'); }
async function pdfOficio(s) {
  if (!window.jspdf) return semPdf();
  const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, M = 25;
  try { pdf.addImage(await logo(), 'PNG', M, 12, 20, 24.7); } catch (e) { }
  pdf.setFont('times', 'bold'); pdf.setFontSize(12);
  pdf.text(CFG.cab1 || '', W / 2 + 8, 20, { align: 'center' });
  pdf.setFontSize(10.5); pdf.text(CFG.cab2 || '', W / 2 + 8, 26, { align: 'center' });
  pdf.setDrawColor(196, 154, 54); pdf.setLineWidth(0.6); pdf.line(M, 40, W - M, 40);
  pdf.setFont('times', 'normal'); pdf.setFontSize(12);
  let y = 52;
  for (const par of (s.texto || '').split('\n')) {
    const ls = par.trim() ? pdf.splitTextToSize(par, W - 2 * M) : [''];
    for (const l of ls) { if (y > 275) { pdf.addPage(); y = 25; } pdf.text(l, M, y); y += 6; }
  }
  pdf.setFontSize(8); pdf.setTextColor(120);
  pdf.text('Documento gerado pelo SAMU Gestor. Conferir e assinar antes de enviar.', W / 2, 290, { align: 'center' });
  pdf.save(`oficio-${(s.numero || 'rascunho').replace('/', '-')}.pdf`);
}
async function pdfRelatorio(titulo, periodo, resumo, linhasTab) {
  if (!window.jspdf) return semPdf();
  const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  try { pdf.addImage(await logo(), 'PNG', 14, 8, 14, 17.3); } catch (e) { }
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(14); pdf.text(titulo, 32, 15);
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); pdf.text(`${periodo} · gerado em ${fmt(new Date())} por ${me.nome}`, 32, 21);
  pdf.text(resumo, 14, 32);
  pdf.autoTable({ startY: 36, head: [['Data e hora', 'Registro', 'Viatura / nº', 'Autor', 'Resumo']], body: linhasTab, styles: { fontSize: 8.5, cellPadding: 1.8 }, headStyles: { fillColor: [15, 47, 92] }, columnStyles: { 4: { cellWidth: 120 } } });
  pdf.save(`relatorio-samu-${periodo.replace(/[^\w-]+/g, '-')}.pdf`);
}

/* ---------- relatórios ---------- */
VIEWS.relatorios = async () => {
  if (!ui.rel) ui.rel = { modo: 'mes', dia: diaStr(), mes: mesStr() };
  const r = ui.rel, campo = r.modo === 'dia' ? 'dia' : 'mes', valor = r.modo === 'dia' ? r.dia : r.mes;
  const q = col => getDocs(query(C(col), where(campo, '==', valor))).then(rows);
  const [ck, mt, it] = await Promise.all([q('checklists'), q('materiais'), q('intercorrencias')]);
  let so = [];
  so = await q('solicitacoes');
  const tab_ = [
    ...ck.map(c => [c.quando, 'Checklist', c.viatura, c.userNome, pendencias(c).length ? pendencias(c).map(p => `${p.s === 'falta' ? 'FALTA' : 'Problema'}: ${p.n}${p.o ? ' (' + p.o + ')' : ''}`).join('; ') : 'Tudo OK']),
    ...mt.map(m => { const b = abaixoMin(m); return [m.quando, 'Contagem de material', m.viatura, m.userNome, `${m.momento} do plantão` + (b.length ? ' · abaixo do mínimo: ' + b.map(x => `${x.n} (${x.q}/${x.min})`).join(', ') : '')]; }),
    ...it.map(i => [i.quando, 'Intercorrência', i.viatura, i.userNome, `${i.tipo} · ${i.gravidade}: ${i.texto}`]),
    ...so.map(s => [s.quando, 'Ofício', s.numero, s.criadoPorNome || 'Coordenação', s.decisao + (s.motivosNomes?.length ? ': ' + s.motivosNomes.join(', ') : '') + ' · ' + s.setor])
  ];
  // guarda coleção e id para a administração poder corrigir
  [[ck, 'checklists'], [mt, 'materiais'], [it, 'intercorrencias'], [so, 'solicitacoes']].reduce((i, [arr, col]) => { arr.forEach((r, k) => { tab_[i + k].push(col, r.id); }); return i + arr.length; }, 0);
  tab_.sort((a, b) => (toDate(b[0]) || 0) - (toDate(a[0]) || 0));
  const resumo = `Checklists: ${ck.length} · Contagens: ${mt.length} · Intercorrências: ${it.length}${true ? ` · Autorizadas: ${so.filter(s => s.decisao === 'Autorizado').length} · Negadas: ${so.filter(s => s.decisao === 'Negado').length}` : ''}`;
  ui.relDados = Object.fromEntries([...ck.map(x => ['checklists/' + x.id, x]), ...mt.map(x => ['materiais/' + x.id, x]), ...it.map(x => ['intercorrencias/' + x.id, x])]);
  ui.relPdf = () => pdfRelatorio(r.modo === 'dia' ? 'Relatório diário · SAMU Vassouras' : 'Relatório mensal · SAMU Vassouras', r.modo === 'dia' ? fmtDia(r.dia) : fmtMes(r.mes), resumo, tab_.map(l => [fmt(l[0]), l[1], l[2], l[3], l[4]]));
  return `<div class="row" style="justify-content:space-between"><h1>Relatórios</h1>
    <div class="row"><div class="subtabs"><button id="rDia" ${r.modo === 'dia' ? 'class="primary"' : ''}>Dia</button><button id="rMes" ${r.modo === 'mes' ? 'class="primary"' : ''}>Mês</button></div>
    ${r.modo === 'dia' ? `<input type="date" id="rData" value="${r.dia}" style="width:auto">` : `<input type="month" id="rData" value="${r.mes}" style="width:auto">`}
    <button class="primary" id="rPdf">Baixar PDF</button></div></div>
  <div class="stats"><div class="stat"><span>Checklists</span><b>${ck.length}</b></div><div class="stat"><span>Contagens</span><b>${mt.length}</b></div><div class="stat"><span>Intercorrências</span><b>${it.length}</b></div>
  ${true ? `<div class="stat"><span>Autorizadas / negadas</span><b>${so.filter(s => s.decisao === 'Autorizado').length} / ${so.filter(s => s.decisao === 'Negado').length}</b></div>` : ''}</div>
  <div class="card"><h2>O que foi feito, quando e por quem</h2><div class="tablewrap"><table><tr><th>Data e hora</th><th>Registro</th><th>Viatura / nº</th><th>Autor</th><th>Resumo</th>${me.perfil === 'admin' ? '<th></th>' : ''}</tr>${tab_.map(l => `<tr><td class="num">${fmt(l[0])}</td><td>${esc(l[1])}</td><td>${esc(l[2])}</td><td>${esc(l[3])}</td><td>${esc(l[4])}${l[7] ? `<br><span class="small muted">${esc(l[7])}</span>` : ''}</td>${me.perfil === 'admin' ? `<td class="noprint">${l[5] === 'solicitacoes' ? '' : `<button class="ghost" data-corr="${l[5]}/${l[6]}">Corrigir</button>`}</td>` : ''}</tr>`).join('') || '<tr><td colspan="6" class="empty">Nada registrado neste período.</td></tr>'}</table></div>
  ${me.perfil === 'admin' ? '<p class="small muted">Administração: "Corrigir" permite ajustar o texto ou apagar um registro errado. Toda correção fica no Registro de ações. Ofícios se corrigem na aba Solicitações.</p>' : ''}</div>`;
};
BIND.relatorios = () => {
  $('rDia').onclick = () => { ui.rel.modo = 'dia'; render(); };
  $('rMes').onclick = () => { ui.rel.modo = 'mes'; render(); };
  $('rData').onchange = e => { if (!e.target.value) return; ui.rel[ui.rel.modo] = e.target.value; render(); };
  $('rPdf').onclick = () => ui.relPdf();
  document.querySelectorAll('[data-corr]').forEach(b => b.onclick = () => abrirCorrecao(b.dataset.corr, b.closest('tr')));
};
function abrirCorrecao(chave, tr) {
  const r = ui.relDados[chave]; if (!r) return;
  const [col, id] = chave.split('/');
  const campo = col === 'intercorrencias' ? 'texto' : 'obs';
  const linha = document.createElement('tr');
  linha.innerHTML = `<td colspan="6"><div class="card" style="gap:8px"><b>Corrigir ${esc(col === 'checklists' ? 'checklist' : col === 'materiais' ? 'contagem' : 'intercorrência')} de ${esc(r.userNome)}</b>
    <label>${campo === 'texto' ? 'Texto' : 'Observação'}<textarea id="corrTx">${esc(r[campo] || '')}</textarea></label>
    <label>Motivo da correção<input id="corrMot" placeholder="Ex.: funcionário pediu para ajustar"></label>
    <div class="row"><button class="primary" id="corrSalvar">Salvar correção</button><button id="corrApagar">Apagar registro</button><button class="ghost" id="corrFechar">Fechar</button></div>
    <p id="corrConf" class="small" hidden>Apagar não tem volta. <button class="primary" id="corrSim">Sim, apagar</button></p></div></td>`;
  tr.after(linha);
  const motivo = () => $('corrMot').value.trim();
  $('corrFechar').onclick = () => linha.remove();
  $('corrSalvar').onclick = async () => {
    if (!motivo()) { alertaErro('Escreva o motivo da correção.'); return; }
    try { await updateDoc(doc(db, col, id), { [campo]: $('corrTx').value, corrigidoPor: me.nome, corrigidoEm: serverTimestamp(), motivoCorrecao: motivo() }); registrarAcao(`Corrigiu ${col} de ${r.userNome} (${motivo()})`); toast('Correção salva'); render(); } catch (e) { alertaErro(msgErro(e)); }
  };
  $('corrApagar').onclick = () => { if (!motivo()) { alertaErro('Escreva o motivo antes de apagar.'); return; } $('corrConf').hidden = false; };
  $('corrSim').onclick = async () => {
    try { await deleteDoc(doc(db, col, id)); registrarAcao(`Apagou ${col} de ${r.userNome} de ${fmt(r.quando)} (${motivo()})`); toast('Registro apagado'); render(); } catch (e) { alertaErro(msgErro(e)); }
  };
}

/* ---------- escala (gestão) ---------- */
async function equipe() { return rows(await getDocs(C('users'))).sort((a, b) => a.nome.localeCompare(b.nome)); }
VIEWS.escalaGeral = async () => {
  if (!ui.escMes) ui.escMes = mesStr();
  const [lista, eq] = await Promise.all([doMes('escala', ui.escMes), equipe()]);
  lista.sort((a, b) => a.data.localeCompare(b.data) || a.userNome.localeCompare(b.userNome));
  ui.equipe = eq;
  const semCad = [...new Set(lista.filter(e => !e.user).map(e => e.userNome))];
  const ativos = eq.filter(u => u.ativo && u.perfil === 'plantonista');
  return `<h1>Escala</h1>
  <div class="card"><h2>Lançar plantões</h2><div class="grid2">
    <label>Funcionário<select id="eu">${ativos.map(u => `<option value="${u.id}">${esc(u.nome)}</option>`).join('')}</select></label>
    <label>Turno<select id="et">${(CFG.turnos || []).map(t => `<option>${esc(t)}</option>`).join('')}</select></label>
    <label>Viatura<select id="ev">${viaturas().map(v => `<option>${esc(v.id)}</option>`).join('')}</select></label>
    <label>Dias de ${fmtMes(ui.escMes)}<input id="ed" placeholder="Ex.: 1, 4, 7, 10" inputmode="numeric"></label></div>
    <button class="primary" id="eAdd">Lançar</button>
    <p class="small muted">Digite os dias separados por vírgula.</p></div>
  <div class="card"><h2>Importar escala do mês</h2>
    <p class="small muted">Escolha o <b>PDF da escala mensal</b> (o mesmo que a coordenação faz no Word e salva em PDF). O app lê os plantões de cada pessoa e liga cada plantão ao funcionário cujo <b>nome completo</b> no cadastro é igual ao da escala (acentos e maiúsculas não importam). Quem ainda não tem cadastro fica como "sem cadastro" e é ligado automaticamente quando for cadastrado com o mesmo nome. Importar de novo o mesmo mês substitui a importação anterior.</p>
    <input type="file" id="eArq"><p id="eArqInfo" class="small"></p></div>
  <div class="card"><div class="row" style="justify-content:space-between"><button id="mAnt">‹ Anterior</button><h2>${fmtMes(ui.escMes)} (${lista.length} plantões)</h2><button id="mProx">Próximo ›</button></div>
  ${semCad.length ? `<p class="small"><span class="pill bad">⚠ ${semCad.length} nome(s) da escala sem cadastro</span> ${esc(semCad.join(', '))}. Cadastre em Funcionários com o nome completo igual ao da escala.</p>` : ''}
  <div class="tablewrap"><table><tr><th>Data</th><th>Funcionário</th><th>Turno</th><th>Viatura</th><th></th></tr>${lista.map(e => `<tr><td class="num">${fmtDia(e.data)}</td><td>${esc(e.userNome)}${e.user ? '' : ' <span class="pill bad">⚠ sem cadastro</span>'}</td><td>${esc(e.turno)}</td><td>${esc(e.viatura)}</td><td><button class="ghost" data-del="${e.id}">Remover</button></td></tr>`).join('') || '<tr><td colspan="5" class="empty">Nenhum plantão lançado neste mês.</td></tr>'}</table></div></div>`;
};
BIND.escalaGeral = () => {
  $('mAnt').onclick = () => { ui.escMes = addMes(ui.escMes, -1); render(); };
  $('mProx').onclick = () => { ui.escMes = addMes(ui.escMes, 1); render(); };
  document.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { try { await deleteDoc(doc(db, 'escala', b.dataset.del)); registrarAcao('Removeu plantão da escala'); render(); } catch (e) { alertaErro(msgErro(e)); } });
  $('eArq').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    const info = $('eArqInfo');
    try {
      const info0 = $('eArqInfo'); info0.textContent = 'Lendo o arquivo…';
      const dados = /\.pdf$/i.test(f.name) || f.type === 'application/pdf' ? await lerPdf(f) : JSON.parse(await f.text());
      if (!dados.mes || !Array.isArray(dados.itens)) throw new Error('Arquivo de escala inválido.');
      info.textContent = 'Importando…';
      const eq = await equipe();
      const porNome = new Map(eq.map(u => [normNome(u.nome), u]));
      const achar = nome => porNome.get(normNome(nome)) || null;
      const antigos = (await doMes('escala', dados.mes)).filter(x => x.origem === 'importado');
      const ops = [...antigos.map(x => b => b.delete(doc(db, 'escala', x.id))), ...dados.itens.map(it => b => { const u = achar(it.nome); b.set(doc(C('escala')), { user: u ? u.id : null, userNome: u ? u.nome : it.nome, nomeEscala: normNome(it.nome), cargo: it.cargo || '', data: `${dados.mes}-${pad(it.dia)}`, mes: dados.mes, turno: it.turno, codigo: it.codigo, viatura: '', origem: 'importado', criadoPor: me.uid }); })];
      for (let i = 0; i < ops.length; i += 400) { const b = writeBatch(db); ops.slice(i, i + 400).forEach(op => op(b)); await b.commit(); }
      const lig = new Set(dados.itens.filter(it => achar(it.nome)).map(it => normNome(it.nome))).size, tot = new Set(dados.itens.map(it => normNome(it.nome))).size;
      registrarAcao(`Importou escala de ${fmtMes(dados.mes)} (${dados.itens.length} plantões)`);
      toast(`${dados.itens.length} plantões de ${fmtMes(dados.mes)} importados. ${lig} de ${tot} pessoas já ligadas a um cadastro.`);
      ui.escMes = dados.mes; render();
    } catch (err) { info.textContent = ''; alertaErro(msgErro(err)); }
  };
  async function lerPdf(f) {
    if (!window.pdfjsLib) await new Promise((ok, erro) => { const sc = document.createElement('script'); sc.src = PDFJS + 'pdf.min.js'; sc.onload = ok; sc.onerror = () => erro(new Error('Não consegui carregar o leitor de PDF. Verifique a internet.')); document.head.appendChild(sc); });
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js';
    const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
    const paginas = []; let todo = '';
    for (let i = 1; i <= pdf.numPages; i++) { const tc = await (await pdf.getPage(i)).getTextContent(); paginas.push(tc.items.map(it => ({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width }))); todo += tc.items.map(it => it.str).join(' ') + '\n'; }
    return lerEscalaPDF(paginas, todo);
  }
  $('eAdd').onclick = async () => {
    const u = ui.equipe.find(x => x.id === $('eu').value); if (!u) { alertaErro('Cadastre funcionários primeiro.'); return; }
    const [y, m] = ui.escMes.split('-').map(Number); const max = new Date(y, m, 0).getDate();
    const dias = [...new Set($('ed').value.split(/[^0-9]+/).filter(Boolean).map(Number))].filter(d => d >= 1 && d <= max);
    if (!dias.length) { alertaErro('Digite os dias do mês.'); return; }
    const b = writeBatch(db);
    dias.forEach(d => b.set(doc(C('escala')), { user: u.id, userNome: u.nome, data: `${ui.escMes}-${pad(d)}`, mes: ui.escMes, turno: $('et').value, viatura: $('ev').value, criadoPor: me.uid }));
    try { await b.commit(); registrarAcao(`Lançou ${dias.length} plantão(ões) para ${u.nome}`); toast(`${dias.length} plantão(ões) lançado(s)`); render(); } catch (e) { alertaErro(msgErro(e)); }
  };
};

/* ---------- funcionários ---------- */
VIEWS.funcionarios = async () => {
  const eq = await equipe(); ui.equipe = eq;
  const perfis = me.perfil === 'admin' ? ['plantonista', 'coordenador', 'admin'] : ['plantonista', 'coordenador'];
  const cadastrados = new Set(eq.map(u => normNome(u.nome)));
  const semCad = rows(await getDocs(query(C('escala'), where('user', '==', null))));
  const mapa = new Map();
  semCad.forEach(e => { const k = e.nomeEscala || normNome(e.userNome); if (!cadastrados.has(k) && !mapa.has(k)) mapa.set(k, { nome: nomeBonito(e.userNome), cargo: e.cargo || '', n: 0 }); if (mapa.has(k)) mapa.get(k).n++; });
  ui.pre = [...mapa.entries()].map(([k, v]) => ({ ...v, chave: k })).sort((a, b) => a.nome.localeCompare(b.nome));
  // sugere quem já tem cadastro com nome parecido (ex.: "Camillo" x "Camilo", nome abreviado)
  const simples = t => normNome(t).replace(/(.)\1/g, '$1').split(' ').filter(w => w.length > 2);
  const parecido = (a, b) => { const x = simples(a), y = simples(b); if (!x.length || !y.length) return 0; const comuns = x.filter(w => y.includes(w)).length; return (x[0] === y[0] ? 2 : 0) + comuns; };
  ui.pre.forEach(p => { let best = null, sc = 0; eq.forEach(u => { const v = parecido(p.nome, u.nome); if (v > sc) { sc = v; best = u; } }); p.sugestao = sc >= 3 ? best : null; });
  return `<h1>Funcionários</h1>
  ${ui.pre.length ? `<div class="card"><h2>Pré-cadastro da escala (${ui.pre.length} pessoas)</h2>
  <p class="small muted">Estas pessoas estão na escala mas ainda não têm acesso. Confira o cargo, digite o e-mail e clique em Cadastrar: a pessoa recebe o e-mail para criar a senha e os plantões dela já ficam ligados.</p>
  <div class="tablewrap"><table><tr><th>Nome (como na escala)</th><th>Cargo</th><th>E-mail</th><th>Perfil</th><th></th><th>Ou já tem cadastro?</th></tr>
  ${ui.pre.map((p, i) => `<tr><td><b>${esc(p.nome)}</b><br><span class="small muted">${p.n} plantão(ões)</span></td><td><input id="pf${i}" value="${esc(p.cargo)}" style="min-width:150px"></td><td><input id="pe${i}" type="email" placeholder="email@exemplo.com" style="min-width:200px"></td>
  <td><select id="pp${i}" style="width:auto">${perfis.map(x => `<option value="${x}">${perfilNome(x)}</option>`).join('')}</select></td><td><button class="primary" data-pre="${i}">Cadastrar</button></td>
  <td><div class="row" style="flex-wrap:nowrap"><select id="pl${i}" style="width:auto;max-width:190px"><option value="">— escolher —</option>${eq.map(u => `<option value="${u.id}" ${p.sugestao && p.sugestao.id === u.id ? 'selected' : ''}>${esc(u.nome)}</option>`).join('')}</select><button data-ligar="${i}">Ligar</button></div>${p.sugestao ? `<span class="small" style="color:var(--warn)">⚠ Parece ser ${esc(p.sugestao.nome)}</span>` : ''}</td></tr>`).join('')}</table></div>
  <p class="small muted">Se a pessoa já foi cadastrada com o nome escrito diferente (ex.: Camillo × Camilo), escolha o cadastro dela em "Ou já tem cadastro?" e clique em Ligar. Os plantões passam para ela na hora, sem novo e-mail.</p></div>` : ''}
  <div class="card"><h2>Cadastrar funcionário</h2><div class="grid2"><label>Nome<input id="fn"></label><label>E-mail<input id="fe" type="email"></label><label>Função<input id="ff" placeholder="Ex.: Técnico de enfermagem"></label>
  <label>Perfil<select id="fp">${perfis.map(p => `<option value="${p}">${perfilNome(p)}</option>`).join('')}</select></label></div>
  <button class="primary" id="fAdd">Cadastrar e enviar e-mail de senha</button>
  <p class="small muted">O funcionário recebe um e-mail para criar a própria senha (veja também a caixa de spam).</p></div>
  <div class="card"><h2>Equipe (${eq.filter(u => u.ativo).length} ativos)</h2><div class="tablewrap"><table><tr><th>Nome</th><th>E-mail</th><th>Função</th><th>Perfil</th><th>Situação</th><th></th></tr>
  ${eq.map(u => { const pode = me.perfil === 'admin' || u.perfil !== 'admin'; return `<tr><td>${esc(u.nome)}</td><td>${esc(u.email)}</td><td>${esc(u.funcao)}</td>
    <td>${pode && u.id !== me.uid ? `<select data-perfil="${u.id}" style="width:auto">${perfis.map(p => `<option value="${p}" ${p === u.perfil ? 'selected' : ''}>${perfilNome(p)}</option>`).join('')}</select>` : esc(perfilNome(u.perfil))}</td>
    <td>${u.ativo ? '<span class="pill ok">Ativo</span>' : '<span class="pill neutral">Desativado</span>'}</td>
    <td class="row" style="flex-wrap:nowrap">${pode && u.id !== me.uid ? `<button class="ghost" data-ativo="${u.id}">${u.ativo ? 'Desativar' : 'Reativar'}</button>` : ''}<button class="ghost" data-senha="${esc(u.email)}">Reenviar senha</button></td></tr>`; }).join('')}
  </table></div><p class="small muted">Desativar bloqueia o acesso imediatamente e mantém o histórico do funcionário.</p></div>`;
};
// Cria a conta, envia o e-mail de senha e liga os plantões da escala com o mesmo nome.
async function cadastrarFuncionario(nome, email, funcao, perfil) {
  const sec = initializeApp(firebaseConfig, 'cadastro-' + Date.now()); // instância separada para não desconectar quem cadastra
  try {
    const sauth = getAuth(sec);
    if (EMU) connectAuthEmulator(sauth, 'http://127.0.0.1:9099', { disableWarnings: true });
    const senhaTemp = crypto.getRandomValues(new Uint32Array(4)).join('-') + 'Aa!';
    const cred = await createUserWithEmailAndPassword(sauth, email, senhaTemp);
    await signOut(sauth);
    await setDoc(doc(db, 'users', cred.user.uid), { nome, email, funcao, perfil, ativo: true, criadoEm: serverTimestamp(), criadoPor: me.uid });
    await sendPasswordResetEmail(auth, email);
    const pend = rows(await getDocs(query(C('escala'), where('nomeEscala', '==', normNome(nome))))).filter(x => !x.user);
    for (let i = 0; i < pend.length; i += 400) { const b = writeBatch(db); pend.slice(i, i + 400).forEach(x => b.update(doc(db, 'escala', x.id), { user: cred.user.uid, userNome: nome })); await b.commit(); }
    registrarAcao(`Cadastrou ${nome} (${perfilNome(perfil)})${pend.length ? ` e ligou ${pend.length} plantão(ões) da escala` : ''}`);
    return pend.length;
  } finally { deleteApp(sec).catch(() => { }); }
}
const nomeBonito = t => String(t).toLowerCase().replace(/(^|\s)(\S)/g, (m, sp, c) => sp + c.toUpperCase()).replace(/ (Da|De|Do|Das|Dos|E) /g, m => m.toLowerCase());
BIND.funcionarios = () => {
  $('fAdd').onclick = async () => {
    const nome = $('fn').value.trim(), email = $('fe').value.trim().toLowerCase(), funcao = $('ff').value.trim(), perfil = $('fp').value;
    if (!nome || !email) { alertaErro('Preencha nome e e-mail'); return; }
    const btn = $('fAdd'); btn.disabled = true; btn.textContent = 'Cadastrando…';
    try { await cadastrarFuncionario(nome, email, funcao, perfil); toast(`${nome} cadastrado(a). E-mail de senha enviado.`); render(); }
    catch (e) { alertaErro(msgErro(e)); btn.disabled = false; btn.textContent = 'Cadastrar e enviar e-mail de senha'; }
  };
  document.querySelectorAll('[data-ligar]').forEach(b => b.onclick = async () => {
    const i = +b.dataset.ligar, p = ui.pre[i], u = ui.equipe.find(x => x.id === $('pl' + i).value);
    if (!u) { alertaErro('Escolha o cadastro da pessoa.'); return; }
    b.disabled = true;
    try {
      const pend = rows(await getDocs(query(C('escala'), where('nomeEscala', '==', p.chave)))).filter(x => !x.user);
      for (let k = 0; k < pend.length; k += 400) { const bt = writeBatch(db); pend.slice(k, k + 400).forEach(x => bt.update(doc(db, 'escala', x.id), { user: u.id, userNome: u.nome })); await bt.commit(); }
      registrarAcao(`Ligou ${pend.length} plantão(ões) de "${p.nome}" ao cadastro de ${u.nome}`);
      toast(`${pend.length} plantão(ões) ligados a ${u.nome}.`); render();
    } catch (e) { alertaErro(msgErro(e)); b.disabled = false; }
  });
  document.querySelectorAll('[data-pre]').forEach(b => b.onclick = async () => {
    const i = +b.dataset.pre, p = ui.pre[i];
    const email = $('pe' + i).value.trim().toLowerCase(), funcao = $('pf' + i).value.trim(), perfil = $('pp' + i).value;
    if (!/^\S+@\S+\.\S+$/.test(email)) { alertaErro('Digite um e-mail válido para ' + p.nome); return; }
    b.disabled = true; b.textContent = 'Cadastrando…';
    try { const n = await cadastrarFuncionario(p.nome, email, funcao, perfil); toast(`${p.nome} cadastrado(a), ${n} plantão(ões) ligados. E-mail de senha enviado.`); render(); }
    catch (e) { alertaErro(msgErro(e)); b.disabled = false; b.textContent = 'Cadastrar'; }
  });
  document.querySelectorAll('[data-perfil]').forEach(s => s.onchange = async () => {
    const u = ui.equipe.find(x => x.id === s.dataset.perfil);
    try { await updateDoc(doc(db, 'users', u.id), { perfil: s.value }); registrarAcao(`Mudou perfil de ${u.nome} para ${perfilNome(s.value)}`); toast('Perfil atualizado'); } catch (e) { alertaErro(msgErro(e)); render(); }
  });
  document.querySelectorAll('[data-ativo]').forEach(b => b.onclick = async () => {
    const u = ui.equipe.find(x => x.id === b.dataset.ativo);
    try { await updateDoc(doc(db, 'users', u.id), { ativo: !u.ativo }); registrarAcao(`${u.ativo ? 'Desativou' : 'Reativou'} ${u.nome}`); render(); } catch (e) { alertaErro(msgErro(e)); }
  });
  document.querySelectorAll('[data-senha]').forEach(b => b.onclick = async () => {
    try { await sendPasswordResetEmail(auth, b.dataset.senha); toast('E-mail de senha enviado'); } catch (e) { alertaErro(msgErro(e)); }
  });
};

/* ---------- listas e ofícios (configurações editáveis) ---------- */
VIEWS.config = async () => {
  if (!ui.motivos) ui.motivos = JSON.parse(JSON.stringify(CFG.motivos || []));
  const ta = (id, titulo, val, dica) => `<label>${titulo}<textarea id="${id}">${esc((val || []).join('\n'))}</textarea>${dica ? `<span class="small muted" style="font-weight:400">${dica}</span>` : ''}</label>`;
  return `<h1>Listas e ofícios</h1>
  <p class="muted">Aqui ficam as listas usadas no app. Um item por linha. Mudanças valem para os próximos registros; o que já foi enviado não muda.</p>
  ${CFG.exemplo ? '<div class="card" style="border-color:var(--bad)"><p><span class="pill bad">⚠ Exemplos</span> Estas listas ainda são de exemplo. Troque pelas listas oficiais do coordenador e salve.</p></div>' : ''}
  <div class="card lista-edit"><h2>Viaturas, checklists e materiais</h2><div class="grid2">
    ${ta('cViat', 'Viaturas', CFG.viaturas, 'Formato: nome; tipo (USB ou USA). Ex.: USB-01; USB')}
    ${ta('cTurnos', 'Turnos', CFG.turnos)}
    ${ta('cUSB', 'Checklist USB', CFG.checkUSB)}
    ${ta('cUSA', 'Checklist USA', CFG.checkUSA)}
    ${ta('cMat', 'Materiais para contagem', CFG.materiais, 'Opcional: ; quantidade mínima. Ex.: Gazes (pacotes); 10')}
    ${ta('cTipos', 'Tipos de intercorrência', CFG.tiposInter)}</div></div>
  <div class="card"><h2>Cabeçalho e textos do ofício</h2><div class="grid2">
    <label>Linha 1 do cabeçalho<input id="cCab1" value="${esc(CFG.cab1)}"></label><label>Linha 2 do cabeçalho<input id="cCab2" value="${esc(CFG.cab2)}"></label>
    <label>Cidade<input id="cCid" value="${esc(CFG.cidade)}"></label><label>Assinatura<input id="cAss" value="${esc(CFG.assinatura)}"></label></div>
    <label>Texto da autorização (use {paciente} onde entram as iniciais)<textarea id="cAut">${esc(CFG.textoAutorizacao)}</textarea></label>
    <label>Parágrafo final da negativa<textarea id="cFim">${esc(CFG.textoFinalNegativa)}</textarea></label></div>
  <div class="card"><h2>Motivos de negativa e base legal</h2>
    <p class="small muted">O texto do motivo entra depois de "considerando que…". As leis repetidas entre motivos aparecem uma vez só no ofício.</p>
    ${ui.motivos.map((m, i) => `<div class="motivo"><label>Nome do motivo<input data-mn="${i}" value="${esc(m.nome)}"></label>
      <label>Texto<textarea data-mt="${i}">${esc(m.texto)}</textarea></label>
      <label>Leis e portarias (uma por linha)<textarea data-mb="${i}" style="min-height:60px">${esc((m.base || []).join('\n'))}</textarea></label>
      <div><button class="ghost" data-mdel="${i}">Remover este motivo</button></div></div>`).join('')}
    <div><button id="mNovo">+ Adicionar motivo</button></div></div>
  ${CFG.exemplo ? '<label class="row" style="font-weight:500"><input type="checkbox" id="cOficial" style="width:auto"> Estas já são as listas oficiais (tira o aviso de "exemplo")</label>' : ''}
  <div class="row"><button class="primary" id="cSalvar">Salvar tudo</button><button class="ghost" id="cDesfazer">Descartar mudanças</button></div>`;
};
BIND.config = () => {
  const lerMotivos = () => ui.motivos.forEach((m, i) => { m.nome = document.querySelector(`[data-mn="${i}"]`).value.trim(); m.texto = document.querySelector(`[data-mt="${i}"]`).value.trim(); m.base = linhas(document.querySelector(`[data-mb="${i}"]`).value); });
  $('mNovo').onclick = () => { lerMotivos(); ui.motivos.push({ id: 'm' + Date.now().toString(36), nome: '', texto: '', base: [] }); render(); };
  document.querySelectorAll('[data-mdel]').forEach(b => b.onclick = () => { lerMotivos(); ui.motivos.splice(+b.dataset.mdel, 1); render(); });
  $('cDesfazer').onclick = () => { ui.motivos = null; render(); };
  $('cSalvar').onclick = async () => {
    lerMotivos();
    const novo = {
      viaturas: linhas($('cViat').value), turnos: linhas($('cTurnos').value), checkUSB: linhas($('cUSB').value), checkUSA: linhas($('cUSA').value),
      materiais: linhas($('cMat').value), tiposInter: linhas($('cTipos').value),
      cab1: $('cCab1').value.trim(), cab2: $('cCab2').value.trim(), cidade: $('cCid').value.trim(), assinatura: $('cAss').value.trim(),
      textoAutorizacao: $('cAut').value.trim(), textoFinalNegativa: $('cFim').value.trim(),
      motivos: ui.motivos.filter(m => m.nome && m.texto),
      exemplo: CFG.exemplo ? !($('cOficial') && $('cOficial').checked) : false,
      atualizadoEm: serverTimestamp(), atualizadoPor: me.nome
    };
    if (!novo.viaturas.length) { alertaErro('Cadastre ao menos uma viatura.'); return; }
    try { await setDoc(doc(db, 'config', 'listas'), novo); CFG = { ...PADRAO, ...novo }; ui.motivos = null; registrarAcao('Atualizou listas e ofícios'); toast('Listas salvas'); render(); }
    catch (e) { alertaErro(msgErro(e)); }
  };
};

/* ---------- admin: cópia de segurança e registro ---------- */
VIEWS.backup = async () => `<h1>Cópia de segurança</h1>
  <div class="card"><p>O plano gratuito do Firebase não faz backup automático. Uma vez por mês, baixe a cópia e guarde em local seguro (por exemplo, no seu Google Drive).</p>
  <p class="small muted">Por causa da LGPD, a cópia da administração não inclui as solicitações com dados de pacientes. Essas ficam só com o coordenador.</p>
  <button class="primary" id="bkBaixar">Baixar cópia de segurança (.json)</button></div>`;
BIND.backup = () => $('bkBaixar').onclick = async () => {
  const btn = $('bkBaixar'); btn.disabled = true; btn.textContent = 'Preparando…';
  try {
    const out = { geradoEm: new Date().toISOString(), por: me.nome };
    for (const c of ['users', 'checklists', 'materiais', 'intercorrencias', 'sugestoes', 'escala', 'log']) out[c] = rows(await getDocs(C(c))).map(d => JSON.parse(JSON.stringify(d, (k, v) => v && v.toDate ? v.toDate().toISOString() : v)));
    out.config = (await getDoc(doc(db, 'config', 'listas'))).data();
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' }));
    a.download = `samu-gestor-backup-${diaStr()}.json`; a.click();
    registrarAcao('Baixou cópia de segurança'); toast('Cópia baixada');
  } catch (e) { alertaErro(msgErro(e)); }
  btn.disabled = false; btn.textContent = 'Baixar cópia de segurança (.json)';
};
VIEWS.atividade = async () => {
  const log = rows(await getDocs(query(C('log'), orderBy('quando', 'desc'), limit(200))));
  return `<h1>Registro de ações</h1><div class="card"><div class="tablewrap"><table><tr><th>Quando</th><th>Quem</th><th>Ação</th></tr>${log.map(l => `<tr><td class="num">${fmt(l.quando)}</td><td>${esc(l.userNome)}</td><td>${esc(l.acao)}</td></tr>`).join('') || '<tr><td colspan="3" class="empty">Nenhuma ação registrada.</td></tr>'}</table></div><p class="small muted">Últimas 200 ações.</p></div>`;
};

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
