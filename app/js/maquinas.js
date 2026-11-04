/* Maquinário (migração 012): horas trabalhadas por máquina com foto do horímetro,
   manutenção com alerta e total do mês. Carregado depois de telas.js e usa as
   variáveis e funções dela (C, putC, delC, can, USER, msg, certeza, esc, fd, today, num, nf, uid, seg).
   Acesso: 'maquinas' (ISM, Proprietário e o tratorista); 'maquinas_gerir' (ISM e Proprietário):
   veem as inconsistências, conferem as fotos e corrigem mês fechado. */
(function () {
  'use strict';
  const H = s => esc(s == null ? '' : s);
  const AVISO_MANUT = 50;   // horas antes da próxima manutenção
  const MAX_USO = 14;       // mais que isso num uso só é estranho
  const TOL = 0.5;          // diferença aceita entre fim de um uso e início do próximo
  const $ = s => document.querySelector(s);
  const gerir = () => can('maquinas_gerir');
  const pode = () => can('maquinas');
  const hf = v => v == null || isNaN(v) ? '–' : nf(+v, 1);
  const mes = d => String(d || '').slice(0, 7);
  const mesAtual = () => today().slice(0, 7);
  const mesLab = m => { const [y, mm] = m.split('-'); return ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][+mm - 1] + '/' + y; };

  const maqs = () => (C.maquinas || []).filter(m => m.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const nomeM = k => { const m = (C.maquinas || []).find(x => String(x.id) === String(k)); return m ? m.nome : String(k); };
  const usos = k => (C.mhoras || []).filter(x => !k || String(x.maq) === String(k)).sort((a, b) => a.d.localeCompare(b.d) || a.ini - b.ini);
  const manuts = k => (C.mmanut || []).filter(x => !k || String(x.maq) === String(k)).sort((a, b) => a.d.localeCompare(b.d) || a.hor - b.hor);
  const horasUso = x => x.fim != null ? Math.max(0, x.fim - x.ini) : 0;
  const aberto = k => usos(k).filter(x => x.fim == null).pop() || null;
  const ultimoFim = k => { const l = usos(k).filter(x => x.fim != null); return l.length ? l[l.length - 1] : null; };
  function horimetro(k) {
    let h = null;
    for (const x of usos(k)) h = Math.max(h ?? 0, x.fim ?? x.ini);
    for (const m of manuts(k)) h = Math.max(h ?? 0, m.hor);
    return h;
  }
  const podeMexer = x => gerir() || (mes(x.d) === mesAtual());

  // ---------- conferência: o que não fecha num lançamento de horas ----------
  function problemas(x) {
    if (x.conf === 'ok') return [];
    const p = [];
    const ant = usos(x.maq).filter(y => y !== x && y.id !== x.id && y.fim != null && (y.d < x.d || (y.d === x.d && y.ini < x.ini))).pop();
    if (ant && Math.abs(ant.fim - x.ini) > TOL) p.push('início (' + hf(x.ini) + ' h) não continua do fim do uso anterior (' + hf(ant.fim) + ' h em ' + fd(ant.d) + ')');
    if (x.fim != null && x.fim - x.ini > MAX_USO) p.push('mais de ' + MAX_USO + ' h num uso só (' + hf(x.fim - x.ini) + ' h)');
    if (x.fim == null && x.d < today()) p.push('uso de ' + fd(x.d) + ' ficou sem horímetro final');
    if (!x.fi) p.push('sem foto do horímetro inicial');
    if (x.fim != null && !x.ff) p.push('sem foto do horímetro final');
    if (x.oi === 'dif') p.push('foto do início mostra ' + hf(x.li) + ' h, mas foi digitado ' + hf(x.ini) + ' h');
    if (x.of === 'dif') p.push('foto do final mostra ' + hf(x.lf) + ' h, mas foi digitado ' + hf(x.fim) + ' h');
    if (x.oi === 'nl') p.push('o app não conseguiu ler a foto do início: confira');
    if (x.of === 'nl') p.push('o app não conseguiu ler a foto do final: confira');
    if (x.conf === 'div') p.push('marcado como divergente' + (x.confp ? ' por ' + x.confp : ''));
    return p;
  }
  const comProblema = () => usos().filter(x => problemas(x).length);

  // ---------- leitura automática do número na foto (Tesseract.js, carregado só quando precisa) ----------
  let OCRP = null, WK = null, FILA = Promise.resolve();
  function ocrLib() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (!navigator.onLine) return Promise.reject(new Error('sem internet'));
    if (!OCRP) OCRP = new Promise((ok, no) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
      s.onload = () => window.Tesseract ? ok(window.Tesseract) : (OCRP = null, no(new Error('leitor não carregou')));
      s.onerror = () => { OCRP = null; no(new Error('leitor não carregou')); };
      document.head.appendChild(s);
    });
    return OCRP;
  }
  async function lerTexto(img) {
    const T = await ocrLib();
    if (!WK) { WK = await T.createWorker('eng'); await WK.setParameters({ tessedit_char_whitelist: '0123456789.,' }); }
    const r = await WK.recognize(img);
    return (r && r.data && r.data.text) || '';
  }
  // compara o texto lido com o digitado: 'ok', 'dif' (leu outro número) ou 'nl' (não leu)
  function confere(txt, dig) {
    const limpo = String(txt || '').replace(/[^0-9.,]+/g, ' ').trim(), so = limpo.replace(/[^0-9]/g, '');
    if (so.length < 2) return { st: 'nl', v: null };
    const inteiro = String(Math.floor(dig)), decimo = String(Math.round(dig * 10));
    if (so.includes(decimo) || so.includes(inteiro)) return { st: 'ok', v: +dig };
    const nums = (limpo.match(/\d+(?:[.,]\d+)?/g) || []).map(t => parseFloat(t.replace(',', '.'))).filter(n => !isNaN(n));
    nums.sort((a, b) => String(b).length - String(a).length);
    return { st: 'dif', v: nums.length ? nums[0] : null };
  }
  function lerFotos(id) {
    FILA = FILA.then(async () => {
      for (const lado of ['i', 'f']) {
        const x = (C.mhoras || []).find(y => y.id === id);
        if (!x || !podeMexer(x)) return;
        const foto = lado === 'i' ? x.fi : x.ff, dig = lado === 'i' ? x.ini : x.fim, k = lado === 'i' ? 'oi' : 'of';
        if (!foto || dig == null || x[k]) continue;
        try {
          const img = await Sinc.foto(foto); if (!img) continue;
          const r = confere(await lerTexto(img), dig);
          const y = (C.mhoras || []).find(z => z.id === id); if (!y) return;
          putC('mhoras', Object.assign({}, y, { [k]: r.st, [lado === 'i' ? 'li' : 'lf']: r.v }));
        } catch (e) { return; }   // sem internet ou leitor indisponível: tenta de novo depois
      }
    });
    return FILA;
  }
  // quem confere (ISM/proprietário) lê as fotos que ainda não foram lidas
  let lendo = false;
  function lerPendentes() {
    if (lendo || !gerir() || !navigator.onLine) return;
    const l = usos().filter(x => (x.fi && !x.oi) || (x.ff && x.fim != null && !x.of)).slice(-20);
    if (!l.length) return;
    lendo = true;
    l.reduce((p, x) => p.then(() => lerFotos(x.id)), Promise.resolve()).finally(() => { lendo = false; });
  }

  // ---------- foto do painel ----------
  async function reduzir(f) {
    const b = await createImageBitmap(f);
    const k = Math.min(1, 1280 / Math.max(b.width, b.height));
    const c = document.createElement('canvas'); c.width = Math.round(b.width * k); c.height = Math.round(b.height * k);
    c.getContext('2d').drawImage(b, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.6);
  }
  let FOTO = null, MM_FOTO = null;
  async function aoEscolherFoto(inp, prev) {
    const f = inp.files && inp.files[0]; if (!f) return null;
    try { const d = await reduzir(f); prev.src = d; prev.hidden = false; return d; }
    catch (e) { msg('Não foi possível usar a foto. Tente de novo.'); return null; }
    finally { inp.value = ''; }
  }

  // ---------- telas ----------
  const MQT = [['horas', 'Horas'], ['manut', 'Manutenção'], ['mes', 'Total do mês']];
  let MQP = 'horas';
  function maqDraw() {
    if (!$('#v-maq')) return;
    seg('#mqseg', MQT, MQP, k => { MQP = k; maqDraw(); });
    MQT.forEach(([k]) => $('#mq-' + k).hidden = k !== MQP);
    alertasDraw();
    if (MQP === 'horas') horasDraw();
    if (MQP === 'manut') manutDraw();
    if (MQP === 'mes') mesDraw();
    lerPendentes();
  }
  const opcoes = (sel, val) => { const e = $(sel), v = val || e.value; e.innerHTML = maqs().map(m => '<option value="' + H(m.id) + '">' + H(m.nome) + '</option>').join(''); if (v && maqs().some(m => String(m.id) === String(v))) e.value = v; };

  // manutenção: situação de cada máquina
  function situacaoManut(k) {
    const l = manuts(k), u = l[l.length - 1], h = horimetro(k);
    if (!u || u.prox == null) return { u, h, falta: null, nivel: 'sem' };
    const falta = u.prox - (h ?? u.hor);
    return { u, h, falta, nivel: falta <= 0 ? 'venc' : falta <= AVISO_MANUT ? 'prox' : 'ok' };
  }
  function avisosLista() {
    const a = [];
    for (const m of maqs()) {
      const s = situacaoManut(m.id);
      if (s.nivel === 'venc') a.push({ t: 'erro', h: '<b>' + H(m.nome) + '</b>: manutenção vencida (era com ' + hf(s.u.prox) + ' h; horímetro em ' + hf(s.h) + ' h).' });
      else if (s.nivel === 'prox') a.push({ t: 'aviso', h: '<b>' + H(m.nome) + '</b>: manutenção próxima, faltam ' + hf(s.falta) + ' h (com ' + hf(s.u.prox) + ' h).' });
    }
    if (gerir()) { const n = comProblema().length; if (n) a.push({ t: 'erro', h: '<b>' + n + (n === 1 ? ' lançamento de horas' : ' lançamentos de horas') + '</b> com algo que não bate: veja em Maquinário › Total do mês.' }); }
    return a;
  }
  function alertasDraw() {
    const a = avisosLista();
    $('#mq-alertas').innerHTML = a.map(x => '<div class="mqal ' + x.t + '">' + x.h + '</div>').join('');
  }
  // aviso no topo do app, em qualquer aba, para quem tem acesso ao maquinário
  function maqAvisos() {
    let e = $('#mq-aviso-geral');
    if (!pode() || !ISM.mod('maquinas')) { if (e) e.remove(); return; }
    const a = avisosLista();
    if (!e) { e = document.createElement('button'); e.type = 'button'; e.id = 'mq-aviso-geral'; e.className = 'mqgeral'; e.onclick = () => { go('maq'); window.scrollTo(0, 0); }; const m = document.querySelector('main'); m.insertBefore(e, m.firstChild); }
    e.hidden = !a.length || VIEW === 'maq';
    e.innerHTML = a.length ? '⚠ Maquinário: ' + a.map(x => x.h).join(' ') : '';
  }

  // ----- Horas -----
  function modoForm() {
    const k = $('#mq-maq').value, ab = k ? aberto(k) : null, ul = k ? ultimoFim(k) : null;
    $('#fmq').dataset.modo = ab ? 'fim' : 'ini';
    $('#mq-tit').textContent = ab ? 'Encerrar uso' : 'Iniciar uso';
    $('#mq-hor-l').textContent = ab ? 'Horímetro final (h)' : 'Horímetro inicial (h)';
    $('#mq-go').textContent = ab ? 'Encerrar uso' : 'Iniciar uso';
    $('#mq-data-f').hidden = !!ab;
    $('#mq-hint').textContent = ab ? 'Em uso desde ' + fd(ab.d) + ', com o horímetro em ' + hf(ab.ini) + ' h. Digite o horímetro de agora e tire a foto do painel.'
      : 'Digite o horímetro do painel antes de começar e tire a foto. ' + (ul ? 'Último final desta máquina: ' + hf(ul.fim) + ' h (' + fd(ul.d) + ').' : '');
  }
  function linhaUso(x) {
    const p = gerir() ? problemas(x) : [];
    const est = x.fim == null ? '<span class="mqpill uso">em uso</span>' : x.conf === 'ok' ? '<span class="mqpill ok">conferido</span>' : p.length ? '<span class="mqpill err">conferir</span>' : '';
    return '<div class="rowl mqrow"><span class="d">' + fd(x.d).slice(0, 5) + '</span><span><b>' + H(nomeM(x.maq)) + '</b>' +
      '<span class="sub2">' + hf(x.ini) + ' → ' + (x.fim != null ? hf(x.fim) + ' h · <b>' + hf(horasUso(x)) + ' h</b>' : '…') + (x.resp ? ' · ' + H(x.resp) : '') + '</span>' +
      (p.length ? '<span class="mqprob">' + p.map(H).join('<br>') + '</span>' : '') + '</span>' +
      '<span style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">' + est + '<button type="button" class="x" data-mqver="' + H(x.id) + '">Fotos</button>' +
      (podeMexer(x) ? '<button type="button" class="x" data-mqdel="' + H(x.id) + '">Excluir</button>' : '') + '</span></div>';
  }
  function horasDraw() {
    opcoes('#mq-maq');
    if (!gerir()) $('#mq-data').min = mesAtual() + '-01'; else $('#mq-data').removeAttribute('min');
    $('#mq-data').max = today(); if (!$('#mq-data').value) $('#mq-data').value = today();
    modoForm();
    const l = usos().slice().reverse().slice(0, 30);
    $('#mq-lista').innerHTML = '<h3 class="sub">Últimos usos</h3>' + (l.length ? l.map(linhaUso).join('') : '<p class="mut">Nenhum uso lançado ainda.</p>');
  }
  $('#mq-maq').onchange = () => { modoForm(); };
  $('#mq-foto').onchange = async () => { FOTO = await aoEscolherFoto($('#mq-foto'), $('#mq-prev')); };
  $('#fmq').onsubmit = e => {
    e.preventDefault();
    if (!pode()) return;
    const k = $('#mq-maq').value, h = num($('#mq-hor').value), modo = $('#fmq').dataset.modo;
    if (!k) return msg('Escolha a máquina.');
    if (isNaN(h) || h < 0) return msg('Digite o horímetro do painel.');
    if (!FOTO) return msg('Tire a foto do painel com o horímetro.');
    const fid = (crypto.randomUUID ? crypto.randomUUID() : null);
    if (!fid) return msg('Este aparelho não consegue guardar a foto. Atualize o navegador.');
    if (modo === 'fim') {
      const ab = aberto(k); if (!ab) return modoForm();
      if (h < ab.ini) return msg('O horímetro final (' + hf(h) + ' h) não pode ser menor que o inicial (' + hf(ab.ini) + ' h).');
      if (h - ab.ini > MAX_USO && !certeza('Foram ' + hf(h - ab.ini) + ' h num uso só. Está certo?')) return;
      if (!certeza('Encerrar o uso da ' + nomeM(k) + ' com ' + hf(h) + ' h (' + hf(h - ab.ini) + ' h trabalhadas)?')) return;
      Sinc.salvarFoto(fid, FOTO);
      putC('mhoras', Object.assign({}, ab, { fim: h, ff: fid }));
      msg('Uso encerrado: ' + hf(h - ab.ini) + ' h na ' + nomeM(k) + '.');
      lerFotos(ab.id);
    } else {
      const d = $('#mq-data').value || today();
      if (!gerir() && mes(d) !== mesAtual()) return msg('Só dá para lançar no mês atual.');
      if (d > today()) return msg('A data não pode ser no futuro.');
      const ul = ultimoFim(k);
      if (ul && Math.abs(ul.fim - h) > TOL && !certeza('O último uso da ' + nomeM(k) + ' terminou com ' + hf(ul.fim) + ' h e agora você digitou ' + hf(h) + ' h. Está certo?')) return;
      if (!certeza('Iniciar o uso da ' + nomeM(k) + ' com o horímetro em ' + hf(h) + ' h?')) return;
      const id = uid();
      Sinc.salvarFoto(fid, FOTO);
      putC('mhoras', { id, maq: k, d, ini: h, fi: fid, resp: USER.n });
      msg('Uso iniciado na ' + nomeM(k) + ' com ' + hf(h) + ' h. No fim, lance o horímetro final.');
      lerFotos(id);
    }
    FOTO = null; $('#mq-prev').hidden = true; $('#mq-hor').value = '';
    maqDraw();
  };

  // janela com as fotos e a conferência
  async function verFotos(id) {
    const x = (C.mhoras || []).find(y => y.id === id); if (!x) return;
    const d = document.createElement('div'); d.className = 'login'; d.id = 'janela-mq';
    const p = gerir() ? problemas(x) : [];
    const lado = (t, dig, lido, st, foto) => '<div class="mqfotobox"><b>' + t + ': ' + hf(dig) + ' h</b>' +
      (gerir() && st ? '<span class="mut">' + (st === 'ok' ? 'foto confere' : st === 'dif' ? 'foto mostra ' + hf(lido) + ' h' : 'foto não lida') + '</span>' : '') +
      (foto ? '<img data-foto="' + H(foto) + '" alt="Foto do horímetro ' + t.toLowerCase() + '">' : '<span class="mut">sem foto</span>') + '</div>';
    d.innerHTML = '<div class="lbox"><h2 class="ct">' + H(nomeM(x.maq)) + ' · ' + fd(x.d) + '</h2>' +
      lado('Início', x.ini, x.li, x.oi, x.fi) + (x.fim != null ? lado('Final', x.fim, x.lf, x.of, x.ff) : '') +
      (p.length ? '<p class="mqprob">' + p.map(H).join('<br>') + '</p>' : '') +
      (gerir() ? '<div class="row2"><button class="btn" type="button" data-conf="ok">Conferido, está certo</button><button class="btn ghost" type="button" data-conf="div">Marcar divergente</button></div>' : '') +
      '<button class="btn ghost wide" type="button" data-fechar>Fechar</button></div>';
    document.body.appendChild(d);
    d.querySelector('[data-fechar]').onclick = () => d.remove();
    d.querySelectorAll('[data-conf]').forEach(b => b.onclick = () => {
      const ok = b.dataset.conf === 'ok';
      if (!certeza(ok ? 'Marcar este lançamento como conferido? O alerta some.' : 'Marcar este lançamento como divergente? O alerta continua.')) return;
      putC('mhoras', Object.assign({}, x, { conf: b.dataset.conf, confp: USER.n }));
      d.remove(); msg(ok ? 'Lançamento conferido.' : 'Lançamento marcado como divergente.'); maqDraw();
    });
    for (const im of d.querySelectorAll('img[data-foto]')) {
      try { const s = await Sinc.foto(im.dataset.foto); if (s) im.src = s; else im.replaceWith(Object.assign(document.createElement('span'), { className: 'mut', textContent: 'foto ainda não chegou ao banco' })); }
      catch (e) { im.replaceWith(Object.assign(document.createElement('span'), { className: 'mut', textContent: 'sem internet para abrir a foto' })); }
    }
  }
  document.addEventListener('click', e => {
    const v = e.target.closest('[data-mqver]'); if (v) return verFotos(v.dataset.mqver);
    const x = e.target.closest('[data-mqdel]');
    if (x) {
      const r = (C.mhoras || []).find(y => y.id === x.dataset.mqdel); if (!r || !podeMexer(r)) return;
      if (!certeza('Excluir o uso da ' + nomeM(r.maq) + ' de ' + fd(r.d) + ' (' + hf(r.ini) + ' → ' + hf(r.fim) + ' h)?')) return;
      delC('mhoras', r.id); msg('Uso excluído.'); maqDraw();
    }
    const m = e.target.closest('[data-mmdel]');
    if (m) {
      const r = (C.mmanut || []).find(y => y.id === m.dataset.mmdel); if (!r) return;
      if (!certeza('Excluir a manutenção da ' + nomeM(r.maq) + ' de ' + fd(r.d) + '?')) return;
      delC('mmanut', r.id); msg('Manutenção excluída.'); maqDraw();
    }
  });

  // ----- Manutenção -----
  function prevManut() {
    const h = num($('#mm-hor').value), i = num($('#mm-int').value);
    $('#mm-prev').textContent = h >= 0 && i > 0 ? 'Próxima manutenção com ' + hf(h + i) + ' h no horímetro.' : '';
  }
  function manutDraw() {
    opcoes('#mm-maq');
    if (!$('#mm-data').value) $('#mm-data').value = today();
    const h = horimetro($('#mm-maq').value);
    $('#mm-hor').placeholder = h != null ? 'horímetro atual: ' + hf(h) : '';
    prevManut();
    $('#mm-sit').innerHTML = maqs().map(m => {
      const s = situacaoManut(m.id);
      const cls = s.nivel === 'venc' ? 'err' : s.nivel === 'prox' ? 'aviso' : 'ok';
      return '<div class="mqsit ' + cls + '"><b>' + H(m.nome) + '</b>' + (s.h != null ? '<span>Horímetro: ' + hf(s.h) + ' h</span>' : '<span class="mut">Sem horas lançadas</span>') +
        (s.u ? '<span>Última: ' + fd(s.u.d) + ' com ' + hf(s.u.hor) + ' h · ' + H(s.u.desc) + '</span>' : '<span class="mut">Nenhuma manutenção lançada</span>') +
        (s.falta != null ? '<span>Próxima com <b>' + hf(s.u.prox) + ' h</b> · ' + (s.falta <= 0 ? '<b>vencida há ' + hf(-s.falta) + ' h</b>' : 'faltam <b>' + hf(s.falta) + ' h</b>') + '</span>' : '') + '</div>';
    }).join('');
    const l = manuts().slice().reverse().slice(0, 30);
    $('#mm-lista').innerHTML = '<h3 class="sub">Manutenções lançadas</h3>' + (l.length ? l.map(x => '<div class="rowl"><span class="d">' + fd(x.d).slice(0, 5) + '</span><span><b>' + H(nomeM(x.maq)) + '</b><span class="sub2">' +
      hf(x.hor) + ' h · ' + H(x.desc) + (x.prox != null ? ' · próxima com ' + hf(x.prox) + ' h' : '') + (x.resp ? ' · ' + H(x.resp) : '') + '</span></span><span></span>' +
      '<button type="button" class="x" data-mmdel="' + H(x.id) + '">Excluir</button></div>').join('') : '<p class="mut">Nenhuma manutenção lançada ainda.</p>');
  }
  $('#mm-maq').onchange = manutDraw;
  $('#mm-hor').oninput = $('#mm-int').oninput = prevManut;
  $('#fmm').onsubmit = e => {
    e.preventDefault();
    if (!pode()) return;
    const k = $('#mm-maq').value, d = $('#mm-data').value, h = num($('#mm-hor').value), i = num($('#mm-int').value), desc = String($('#mm-desc').value || '').trim();
    if (!k) return msg('Escolha a máquina.');
    if (!d) return msg('Informe a data da manutenção.');
    if (d > today()) return msg('A data não pode ser no futuro.');
    if (isNaN(h) || h < 0) return msg('Informe o horímetro em que a manutenção foi feita.');
    if (!desc) return msg('Descreva o que foi feito na manutenção.');
    if (!(i > 0)) return msg('Informe daqui a quantas horas fazer de novo.');
    if (!certeza('Lançar a manutenção da ' + nomeM(k) + ' em ' + fd(d) + ' com ' + hf(h) + ' h?\nPróxima com ' + hf(h + i) + ' h.')) return;
    putC('mmanut', { id: uid(), maq: k, d, hor: h, desc, int: i, prox: Math.round((h + i) * 10) / 10, resp: USER.n });
    msg('Manutenção lançada. Próxima com ' + hf(h + i) + ' h.');
    $('#mm-hor').value = ''; $('#mm-int').value = ''; $('#mm-desc').value = '';
    maqDraw();
  };

  // ----- Total do mês -----
  function mesDraw() {
    const sel = $('#mq-mes-sel'); if (!sel.value) sel.value = mesAtual();
    const m = sel.value, fechado = m < mesAtual();
    const doMes = usos().filter(x => mes(x.d) === m);
    let tot = 0;
    const linhas = maqs().map(q => {
      const l = doMes.filter(x => String(x.maq) === String(q.id)), h = l.reduce((s, x) => s + horasUso(x), 0); tot += h;
      return '<tr><td>' + H(q.nome) + '</td><td>' + l.length + '</td><td><b>' + hf(h) + ' h</b></td></tr>';
    }).join('');
    $('#mq-tot').innerHTML = '<p class="mut">' + mesLab(m) + ' · ' + (fechado ? '<b>mês fechado</b>' + (gerir() ? ' (só ISM e proprietário corrigem)' : '') : 'mês em aberto: as horas vão somando a cada uso') + '</p>' +
      '<div class="tw"><table class="pt"><tr><th>Máquina</th><th>Usos</th><th>Horas</th></tr>' + linhas + '<tr><td><b>Total</b></td><td>' + doMes.length + '</td><td><b>' + hf(tot) + ' h</b></td></tr></table></div>';
    const pr = gerir() ? comProblema() : [];
    $('#mq-conf').hidden = !gerir();
    $('#mq-conf').innerHTML = '<h3 class="sub">Para conferir</h3>' + (pr.length ? '<p class="hint">O app compara o horímetro digitado com a foto do painel e com o fim do uso anterior.</p>' + pr.slice().reverse().map(linhaUso).join('') : '<p class="mut">Nada para conferir: tudo bate.</p>');
  }
  $('#mq-mes-sel').onchange = mesDraw;

  window.maqDraw = maqDraw;
  window.maqAvisos = maqAvisos;
  window.Maq = { confere, problemas };   // para os testes
  maqAvisos();
  if (VIEW === 'maq') maqDraw();
})();
