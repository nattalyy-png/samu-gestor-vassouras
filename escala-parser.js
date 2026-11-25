// Lê as palavras de cada página do PDF da escala e devolve {mes, itens:[{nome,cargo,dia,codigo,turno}]}
export function lerEscalaPDF(paginas, textoTodo) {
  const MESES = ['JANEIRO', 'FEVEREIRO', 'MARCO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
  const norm = t => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  const T = norm(textoTodo);
  const mIdx = MESES.findIndex(m => new RegExp('MES:?\\s*' + m).test(T));
  const ano = (T.match(/ANO:?\s*(20\d\d)/) || [])[1];
  if (mIdx < 0 || !ano) throw new Error('Não encontrei o mês e o ano no PDF.');
  const mes = `${ano}-${String(mIdx + 1).padStart(2, '0')}`;
  const LBL = { DN: 'Plantão 24h (diurno/noturno)', D: 'Plantão diurno 12h', N: 'Plantão noturno 12h', M: 'Jornada matutina', T: 'Jornada vespertina', MT: 'Jornada diurna 8h', TN: 'Jornada 8h (tarde/noite)' };
  const SECOES = [['ENFERMEIROS', 'Enfermeiro(a)'], ['TECNICO DE ENFERMAGEM', 'Técnico(a) de enfermagem'], ['FARMACEUTICO', 'Farmacêutico(a)'], ['CONDUTORES', 'Condutor(a)'], ['TELEFONISTAS', 'Telefonista'], ['AUXILIAR DE SERVICOS', 'Auxiliar de serviços gerais']];
  const itens = []; let cargo = '';
  for (const words of paginas) {
    // agrupa palavras em linhas pela altura
    const linhas = [];
    for (const w of words.filter(w => w.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x)) {
      const l = linhas.find(l => Math.abs(l.y - w.y) < 3);
      if (l) l.w.push(w); else linhas.push({ y: w.y, w: [w] });
    }
    linhas.forEach(l => l.w.sort((a, b) => a.x - b.x));
    // colunas dos dias: linha com 1..N
    let cols = null;
    for (const l of linhas) {
      const nums = l.w.flatMap(w => w.str.trim().split(/\s+/).length > 1 ? [] : [w]).filter(w => /^\d{1,2}$/.test(w.str.trim()));
      const seq = nums.map(n => +n.str.trim());
      const i = seq.indexOf(1);
      if (i >= 0 && seq.length - i >= 28 && seq.slice(i, i + 28).every((v, k) => v === k + 1)) { cols = nums.slice(i).filter((n, k) => +n.str.trim() === k + 1).map(n => ({ x: n.x + n.w / 2, d: +n.str.trim() })); break; }
    }
    if (!cols) continue;
    const xMin = cols[0].x - (cols[1].x - cols[0].x) * 0.6;
    for (const l of linhas) {
      const txt = norm(l.w.map(w => w.str).join(' ')).trim();
      for (const [k, v] of SECOES) if (txt.startsWith(k)) cargo = v;
      const antes = l.w.filter(w => w.x + (w.w || 0) < xMin);
      const nomeWs = [];
      for (const w of antes) { if (/^[A-ZÀ-Ú' ]+$/.test(w.str.trim()) && !/\d/.test(w.str)) nomeWs.push(w.str.trim()); else break; }
      let nome = nomeWs.join(' ').replace(/\s+/g, ' ').trim();
      // tira siglas de cargo/vínculo coladas no fim (ENF, TE, MT, RJU...)
      nome = nome.replace(/(\s+(ENF|TE|MT|TF|FAR|ASG|RJU|CLT))+$/, '');
      if (nome.split(' ').length < 2 || norm(nome).startsWith('TOTAL')) continue;
      const codigos = l.w.filter(w => w.x >= xMin).flatMap(w => { const parts = w.str.trim().split(/\s+/); const step = (w.w || 0) / Math.max(parts.length, 1); return parts.map((p, k) => ({ p, cx: w.x + step * k + step / 2 })); }).filter(c => /^[A-Z]{1,5}\d{1,2}$/.test(c.p));
      for (const c of codigos) {
        const letras = c.p.match(/^[A-Z]+/)[0];
        if (!LBL[letras]) continue; // férias, afastamentos e abonos não entram
        const dia = cols.reduce((b, k) => Math.abs(k.x - c.cx) < Math.abs(b.x - c.cx) ? k : b).d;
        if (!itens.some(i => i.nome === nome && i.dia === dia)) itens.push({ nome, cargo, dia, codigo: c.p, turno: LBL[letras] });
      }
    }
  }
  if (!itens.length) throw new Error('Não encontrei plantões neste PDF.');
  return { mes, itens };
}
