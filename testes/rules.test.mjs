import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { doc, getDoc, setDoc, addDoc, updateDoc, collection, query, where, getDocs, serverTimestamp, writeBatch } from 'firebase/firestore';
const env = await initializeTestEnvironment({ projectId: 'demo-samu', firestore: { rules: readFileSync('rules-copy.rules', 'utf8'), host: '127.0.0.1', port: 8080 } });
let ok = 0, fail = 0;
const t = async (name, p) => { try { await p; ok++; console.log('✓', name); } catch (e) { fail++; console.log('✗', name, e.message); } };
const _c={}; const db = uid => (_c[uid] ||= env.authenticatedContext(uid).firestore());
const anon = env.unauthenticatedContext().firestore();
const reg = (uid, extra = {}) => ({ user: uid, userNome: 'X', quando: serverTimestamp(), dia: '2026-11-25', mes: '2026-11', ...extra });

// bootstrap
await t('anônimo lê setup', assertSucceeds(getDoc(doc(anon, 'config/setup'))));
await t('anônimo não lê listas', assertFails(getDoc(doc(anon, 'config/listas'))));
{ const b = writeBatch(db('denise')); b.set(doc(db('denise'), 'users/denise'), { nome: 'Denise', email: 'd@x', perfil: 'admin', ativo: true, funcao: 'a' }); b.set(doc(db('denise'), 'config/setup'), { a: 1 }); b.set(doc(db('denise'), 'config/listas'), { x: 1 });
  await t('primeiro acesso vira admin', assertSucceeds(b.commit())); }
{ const d = db('intruso'); const b = writeBatch(d); b.set(doc(d, 'users/intruso'), { nome: 'I', email: 'i@x', perfil: 'admin', ativo: true }); b.set(doc(d, 'config/setup'), { a: 2 });
  await t('segundo bootstrap bloqueado', assertFails(b.commit())); }
await t('intruso não cria próprio perfil', assertFails(setDoc(doc(db('intruso'), 'users/intruso'), { nome: 'I', email: 'i@x', perfil: 'plantonista', ativo: true })));
// admin cadastra
await t('admin cria coordenador', assertSucceeds(setDoc(doc(db('denise'), 'users/coord'), { nome: 'Coord', email: 'c@x', perfil: 'coordenador', ativo: true })));
await t('coord cria plantonista', assertSucceeds(setDoc(doc(db('coord'), 'users/p1'), { nome: 'P1', email: 'p1@x', perfil: 'plantonista', ativo: true })));
await t('coord cria plantonista 2', assertSucceeds(setDoc(doc(db('coord'), 'users/p2'), { nome: 'P2', email: 'p2@x', perfil: 'plantonista', ativo: true })));
await t('coord NÃO cria admin', assertFails(setDoc(doc(db('coord'), 'users/x'), { nome: 'X', email: 'x@x', perfil: 'admin', ativo: true })));
await t('coord NÃO rebaixa admin', assertFails(updateDoc(doc(db('coord'), 'users/denise'), { perfil: 'plantonista' })));
await t('plantonista não se promove', assertFails(updateDoc(doc(db('p1'), 'users/p1'), { perfil: 'coordenador' })));
await t('plantonista lê o próprio perfil', assertSucceeds(getDoc(doc(db('p1'), 'users/p1'))));
await t('plantonista não lê perfil alheio', assertFails(getDoc(doc(db('p1'), 'users/p2'))));
await t('plantonista lê listas', assertSucceeds(getDoc(doc(db('p1'), 'config/listas'))));
await t('plantonista não altera listas', assertFails(setDoc(doc(db('p1'), 'config/listas'), { y: 1 })));
await t('admin altera listas', assertSucceeds(setDoc(doc(db('denise'), 'config/listas'), { y: 1 })));
// registros
await t('p1 envia checklist', assertSucceeds(addDoc(collection(db('p1'), 'checklists'), reg('p1'))));
await t('p2 envia checklist', assertSucceeds(addDoc(collection(db('p2'), 'checklists'), reg('p2'))));
await t('p1 não envia em nome de p2', assertFails(addDoc(collection(db('p1'), 'checklists'), reg('p2'))));
await t('hora falsa bloqueada', assertFails(addDoc(collection(db('p1'), 'checklists'), reg('p1', { quando: new Date(2020, 1, 1) }))));
await t('p1 lista os seus', getDocs(query(collection(db('p1'), 'checklists'), where('user', '==', 'p1'), where('mes', '==', '2026-11'))).then(s => { if (s.size !== 1) throw new Error('size ' + s.size); }));
await t('p1 não lista tudo', assertFails(getDocs(collection(db('p1'), 'checklists'))));
await t('coord lista tudo do dia', getDocs(query(collection(db('coord'), 'checklists'), where('dia', '==', '2026-11-25'))).then(s => { if (s.size !== 2) throw new Error('size ' + s.size); }));
await t('admin lista tudo', assertSucceeds(getDocs(collection(db('denise'), 'intercorrencias'))));
// solicitações
await t('coord cria solicitação', assertSucceeds(setDoc(doc(db('coord'), 'solicitacoes/s1'), { paciente: 'J.S.' })));
await t('coord numera ofício', assertSucceeds(setDoc(doc(db('coord'), 'config/contador'), { ano: 2026, seq: 1 })));
await t('admin vê solicitações', assertSucceeds(getDoc(doc(db('denise'), 'solicitacoes/s1'))));
await t('admin corrige checklist', getDocs(query(collection(db('denise'), 'checklists'), where('user', '==', 'p1'))).then(s => updateDoc(s.docs[0].ref, { obs: 'corrigido' })));
await t('coord NÃO corrige checklist', getDocs(query(collection(db('coord'), 'checklists'), where('user', '==', 'p1'))).then(s => assertFails(updateDoc(s.docs[0].ref, { obs: 'x' }))));
await t('coord lança escala sem cadastro', assertSucceeds(setDoc(doc(db('coord'), 'escala/e9'), { user: null, userNome: 'Fulano', mes: '2026-11', data: '2026-11-02' })));
await t('plantonista NÃO vê solicitações', assertFails(getDoc(doc(db('p1'), 'solicitacoes/s1'))));
// escala
await t('coord lança escala', assertSucceeds(setDoc(doc(db('coord'), 'escala/e1'), { user: 'p1', mes: '2026-11', data: '2026-11-26' })));
await t('p1 vê a própria escala', getDocs(query(collection(db('p1'), 'escala'), where('user', '==', 'p1'), where('mes', '==', '2026-11'))).then(s => { if (s.size !== 1) throw new Error(); }));
await t('p2 não lança escala', assertFails(setDoc(doc(db('p2'), 'escala/e2'), { user: 'p2' })));
// sugestões
await t('p1 sugere', assertSucceeds(setDoc(doc(db('p1'), 'sugestoes/g1'), reg('p1', { texto: 'a', status: 'Nova' }))));
await t('coord muda status', assertSucceeds(updateDoc(doc(db('coord'), 'sugestoes/g1'), { status: 'Feita' })));
await t('coord não muda texto', assertFails(updateDoc(doc(db('coord'), 'sugestoes/g1'), { texto: 'b' })));
// log
await t('p1 registra ação', assertSucceeds(addDoc(collection(db('p1'), 'log'), { user: 'p1', acao: 'x', quando: serverTimestamp() })));
await t('p1 não lê log', assertFails(getDocs(collection(db('p1'), 'log'))));
// desativação
await t('admin desativa p2', assertSucceeds(updateDoc(doc(db('denise'), 'users/p2'), { ativo: false })));
await t('p2 desativado não envia', assertFails(addDoc(collection(db('p2'), 'checklists'), reg('p2'))));
console.log(`\n${ok} ok, ${fail} falhas`);
await env.cleanup(); process.exit(fail ? 1 : 0);
