import { createRequire } from 'module'; const { chromium } = createRequire(import.meta.url)('playwright');
import { spawn } from 'child_process';
const srv = spawn('python3', ['-m', 'http.server', '5050', '--bind', '127.0.0.1', '--directory', 'site'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));
const URL = 'http://localhost:5050/?emulador=1';
const SHOTS = process.env.SHOTS || 'shots';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const erros = [];
page.on('pageerror', e => erros.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') erros.push('console: ' + m.text() + ' @ ' + JSON.stringify(m.location())); });
const step = async (n, f) => { try { await f(); console.log('✓', n); } catch (e) { console.log('✗', n, e.message.split('\n')[0]); await page.screenshot({ path: `${SHOTS}/ERRO-${n.replace(/\W+/g, '_')}.png`, fullPage: true }); } };
const shot = n => page.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: true });
const tab = async t => { await page.locator('[data-tab]:visible', { hasText: t }).first().click(); await page.waitForSelector('#main h1'); await page.waitForTimeout(300); };
const setPass = async (email, pw) => {
  const codes = (await (await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-samu/oobCodes')).json()).oobCodes.filter(c => c.email === email && c.requestType === 'PASSWORD_RESET');
  const r = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:resetPassword?key=fake-key', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ oobCode: codes.at(-1).oobCode, newPassword: pw }) });
  if (!r.ok) throw new Error(await r.text());
};
const login = async (email, pw) => { await page.goto(URL); await page.fill('#lemail', email); await page.fill('#lsenha', pw); await page.click('#flogin button[type=submit]'); await page.waitForSelector('[data-tab]'); };
const sair = async () => { await page.click('#sair'); await page.waitForSelector('#flogin'); };

await step('primeiro acesso', async () => {
  await page.goto(URL); await page.waitForSelector('#fsetup'); await shot('01-login-primeiro-acesso');
  await page.fill('#snome', 'Denise Stefanon'); await page.fill('#semail', 'denise@teste.com'); await page.fill('#ssenha', 'senha123');
  await page.click('#fsetup button'); await page.waitForSelector('[data-tab]', { timeout: 15000 }); await shot('02-admin-painel');
});
await step('admin cadastra coordenador e plantonista', async () => {
  await tab('Funcionários');
  for (const [n, e, f, p] of [['Chefe Coordenador', 'coord@teste.com', 'Coordenador do SAMU', 'coordenador'], ['Carla Mendes', 'carla@teste.com', 'Técnica de enfermagem', 'plantonista'], ['Rafael Lima', 'rafael@teste.com', 'Condutor socorrista', 'plantonista']]) {
    await page.fill('#fn', n); await page.fill('#fe', e); await page.fill('#ff', f); await page.selectOption('#fp', p);
    await page.click('#fAdd'); await page.waitForSelector(`td:has-text("${e}")`, { timeout: 15000 });
  }
  await shot('03-funcionarios');
  await page.waitForSelector('text=Denise Stefanon');
});
await step('admin edita listas', async () => {
  await tab('Listas e ofícios'); await page.click('summary:has-text("Viaturas e turnos")'); await shot('04-listas');
  await page.fill('#cViat', 'USB-01; USB\nUSB-02; USB\nUSA-01; USA\nUSB-03; USB');
  await page.click('#cSalvar'); await page.waitForTimeout(800);
  await tab('Listas e ofícios'); await page.click('summary:has-text("Viaturas e turnos")');
  if (!(await page.inputValue('#cViat')).includes('USB-03')) throw new Error('lista não salvou');
});
await step('admin importa escala e liga Carla', async () => {
  const fs = await import('fs'); const m = new Date(); const mes = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;
  fs.writeFileSync(`${SHOTS}/escala-teste.json`, JSON.stringify({ mes, itens: [{ nome: 'CARLA MENDES', dia: m.getDate(), codigo: 'DN6', turno: 'Plantão 24h (diurno/noturno)' }, { nome: 'Fulano Sem Cadastro', dia: 2, codigo: 'DN6', turno: 'Plantão 24h' }] }));
  await tab('Escala'); await page.setInputFiles('#eArq', `${SHOTS}/escala-teste.json`);
  await page.waitForSelector('text=sem cadastro', { timeout: 15000 }); await page.waitForSelector('td:has-text("Carla Mendes")'); await shot('04b-escala-importada');
});
await step('cadastro liga plantões da escala', async () => {
  await tab('Funcionários'); await page.fill('#fn', 'Fulano sem cadastro'); await page.fill('#fe', 'fulano@teste.com'); await page.selectOption('#fp', 'plantonista');
  await page.click('#fAdd'); await page.waitForSelector('td:has-text("fulano@teste.com")', { timeout: 15000 });
  await tab('Escala'); if (await page.$('.pill:has-text("sem cadastro")')) throw new Error('ainda sem cadastro');
});
if (process.env.ESCALA_PDF) await step('admin importa o PDF da escala', async () => {
  await tab('Escala'); await page.setInputFiles('#eArq', process.env.ESCALA_PDF);
  await page.waitForSelector('h2:has-text("(186 plantões)")', { timeout: 30000 }); await shot('04c-escala-pdf');
});
if (process.env.ESCALA_PDF) await step('pré-cadastro a partir da escala', async () => {
  await tab('Funcionários'); await page.waitForSelector('h2:has-text("Pré-cadastro da escala (27 pessoas)")'); await shot('03b-pre-cadastro');
  await page.fill('#pe0', 'pessoa0@teste.com'); await page.click('[data-pre="0"]');
  await page.waitForSelector('h2:has-text("Pré-cadastro da escala (26 pessoas)")', { timeout: 15000 });
});
if (process.env.ESCALA_PDF) await step('ligar nome escrito diferente (Camillo)', async () => {
  await page.fill('#fn', 'Camillo Vasconcellos'); await page.fill('#fe', 'camillo@teste.com'); await page.click('#fAdd');
  await page.waitForSelector('td:has-text("camillo@teste.com")', { timeout: 15000 });
  const row = page.locator('.precard', { hasText: 'Camilo Vasconcellos' }); await row.locator('text=Parece ser Camillo').waitFor();
  await row.locator('[data-ligar]').click(); await page.waitForSelector('h2:has-text("Pré-cadastro da escala (25 pessoas)")', { timeout: 15000 });
});
await step('admin vê aba de solicitações', async () => { await page.waitForSelector('[data-tab="solicitacoes"]'); });
await step('admin cópia de segurança', async () => { await tab('Cópia de segurança'); const [d] = await Promise.all([page.waitForEvent('download'), page.click('#bkBaixar')]); await d.saveAs(`${SHOTS}/backup.json`); });
await step('celular: menu inferior da gestão', async () => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300);
  await page.click('#maisBtn'); await page.waitForSelector('#folha:not([hidden])'); await shot('30-celular-mais');
  await page.click('#folha [data-tab="funcionarios"]'); await page.waitForSelector('#main h1'); await page.waitForTimeout(400); await shot('31-celular-precad');
  await page.locator('nav.bottom [data-tab="painel"]').click(); await page.waitForSelector('h2:has-text("Escala de hoje")'); await shot('32-celular-painel');
  await page.setViewportSize({ width: 1200, height: 900 });
});
await step('listas em seções', async () => { await tab('Listas e ofícios'); await page.click('summary:has-text("Motivos de negativa")'); await page.locator('details.motivo summary').first().click(); await shot('33-listas-secoes'); });
await sair();
await setPass('coord@teste.com', 'coord123'); await setPass('carla@teste.com', 'carla123');

await step('coordenador lança escala', async () => {
  await login('coord@teste.com', 'coord123'); await tab('Escala');
  const d = new Date(); const hoje = d.getDate(); const amanha = hoje + 1 <= new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() ? hoje + 1 : hoje;
  await page.selectOption('#eu', { label: 'Carla Mendes' }); await page.fill('#ed', `${hoje}, ${amanha}`); await page.click('#eAdd');
  await page.waitForSelector('td:has-text("Carla Mendes")'); await shot('05-escala-coord');
});
await sair();
await step('plantonista: início e checklist com falta', async () => {
  await login('carla@teste.com', 'carla123'); await page.waitForSelector('text=Plantão de hoje'); await shot('06-plant-inicio');
  await tab('Checklist');
  await page.click('[data-i="2"][data-s="falta"]'); await page.fill('[data-obs="2"]', 'Cilindro vazio');
  await page.click('[data-i="5"][data-s="prob"]'); await page.fill('[data-obs="5"]', 'Fazendo barulho');
  await shot('07-plant-checklist');
  await page.click('#ckEnviar'); await page.waitForSelector('text=Checklist de hoje enviado', { timeout: 10000 });
});
await step('plantonista: material abaixo do mínimo', async () => {
  await tab('Material'); for (let i = 0; i < 10; i++) await page.fill('#mq' + i, i === 0 ? '5' : '50');
  await page.click('#mEnviar'); await page.waitForSelector('text=abaixo do mínimo', { timeout: 10000 }); await shot('08-plant-material');
});
await step('plantonista: intercorrência', async () => {
  await tab('Ocorrência'); await page.fill('#itx', 'Monitor desligou durante o transporte.'); await page.selectOption('#ig', 'Média');
  await page.click('#iEnviar'); await page.waitForSelector('p:has-text("Monitor desligou")', { timeout: 10000 });
});
await step('plantonista: escala e sugestão', async () => {
  await tab('Escala'); await page.locator('td[data-dia].tem').first().click(); await page.waitForSelector('h2:has-text("Plantão de")'); await shot('09-plant-escala');
  await tab('Ideias'); await page.fill('#stx', 'Anexar foto quando algo quebrar'); await page.click('#sEnviar'); await page.waitForSelector('p:has-text("Anexar foto")', { timeout: 10000 });
});
await step('plantonista: lança extra e troca', async () => {
  await tab('Escala'); await page.click('[data-tp="extra"]'); await page.fill('#pdData', '2026-11-29'); await page.click('#pdEnviar');
  await page.waitForSelector('text=Extra · 29/11/2026', { timeout: 10000 });
  await page.click('[data-tp="troca"]'); await page.selectOption('#pdCol', { label: 'Rafael Lima' }); await page.click('#pdEnviar');
  await page.waitForSelector('text=assumiu: Rafael Lima', { timeout: 10000 }); await shot('09b-troca-extra');
});
await sair();
await step('coordenador: painel com pendências', async () => {
  await login('coord@teste.com', 'coord123'); await page.waitForSelector('text=Cilindro vazio'); await page.waitForSelector('text=⚠ Abaixo do mínimo'); await shot('10-coord-painel');
  page.once('dialog', d => d.accept('Pedido feito')); await page.selectOption('[data-and]', 'Em andamento'); await page.waitForSelector('text=Em andamento: Pedido feito', { timeout: 10000 });
});
await step('coordenador vê trocas e extras', async () => { await tab('Escala'); await page.waitForSelector('text=Lançado por Carla Mendes'); await page.waitForSelector('.pill:has-text("extra")'); await shot('09c-coord-trocas'); });
await step('coordenador: negativa com ofício PDF', async () => {
  await tab('Solicitações e ofícios'); await page.click('#novaSol');
  await page.fill('#sp', 'J. S.'); await page.fill('#ss', 'Hospital Exemplo'); await page.fill('#sq', 'Consulta eletiva');
  await page.click('#negar'); await page.click('[data-mot="m2"]'); await page.waitForSelector('[data-mot="m2"][aria-pressed="true"]'); await page.click('[data-mot="m3"]'); await page.waitForSelector('details.motdet >> nth=1');
  await shot('11-coord-oficio');
  const [d] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click('#salvarOf')]);
  await d.saveAs(`${SHOTS}/oficio.pdf`);
  await page.waitForSelector('td:has-text("001/")');
});
await step('coordenador: autorização numera 002', async () => {
  await page.click('#novaSol'); await page.fill('#sp', 'M. A.'); await page.fill('#ss', 'UPA'); await page.click('#autorizar');
  const [d] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click('#salvarOf')]);
  await d.saveAs(`${SHOTS}/oficio2.pdf`); await page.waitForSelector('td:has-text("002/")'); await shot('12-coord-historico');
});
await step('coordenador: relatório PDF', async () => {
  await tab('Relatórios'); await shot('13-coord-relatorio');
  const [d] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click('#rPdf')]); await d.saveAs(`${SHOTS}/relatorio.pdf`);
});
await step('coordenador: muda cargo', async () => { await tab('Funcionários'); page.once('dialog', d => d.accept('Enfermeira')); await page.locator('tr', { hasText: 'Carla Mendes' }).locator('[data-cargo]').click(); await page.waitForSelector('tr:has-text("Carla Mendes") >> text=Enfermeira'); });
await step('coordenador: desativa Rafael', async () => {
  await tab('Funcionários'); const row = page.locator('tr', { hasText: 'Rafael Lima' }); await row.locator('[data-ativo]').click(); await page.waitForSelector('tr:has-text("Rafael Lima") >> text=Desativado');
});
await step('coordenador: muda status sugestão', async () => { await tab('Sugestões'); await page.selectOption('[data-sug]', 'Em análise'); await page.waitForTimeout(500); });
await sair();
await step('admin vê registro de ações', async () => { await login('denise@teste.com', 'senha123'); await tab('Registro de ações'); await page.waitForSelector('td:has-text("Ofício 001")'); await shot('14-admin-log'); });
await step('admin corrige intercorrência', async () => {
  await tab('Relatórios'); await page.locator('tr', { hasText: 'Monitor desligou' }).locator('[data-corr]').click();
  await page.fill('#corrTx', 'Monitor desligou e voltou após trocar bateria.'); await page.fill('#corrMot', 'teste'); await page.click('#corrSalvar');
  await page.waitForSelector('td:has-text("trocar bateria")', { timeout: 10000 }); await shot('14b-admin-correcao');
});
await step('admin troca para modo plantonista e volta', async () => {
  await page.selectOption('#modoSel', 'coordenador'); await page.waitForSelector('[data-tab="painel"]'); await page.waitForSelector('#main h1');
  await page.selectOption('#modoSel', 'plantonista'); await page.waitForSelector('nav.bottom'); await page.waitForSelector('text=Plantão de hoje'); await shot('14c-admin-modo-plantonista');
  await page.selectOption('#modoSel', 'admin'); await page.waitForSelector('[data-tab="backup"]');
});
await step('admin vê ofícios', async () => { await tab('Solicitações e ofícios'); await page.waitForSelector('td:has-text("001/")'); });
await step('celular: tela do plantonista', async () => {
  await sair(); await page.setViewportSize({ width: 390, height: 844 }); await login('carla@teste.com', 'carla123'); await shot('15-celular-inicio');
  await tab('Checklist'); await shot('16-celular-checklist');
});
console.log('\nErros no navegador:', erros.length ? erros.join('\n') : 'nenhum');
await browser.close(); srv.kill();
