/* Edição de lançamentos: romaneios (entrada, pesagem, venda, morte), caixa, fábrica e cocho.
   Usa as variáveis das telas (A, R, C, USER, can, putA, putR, putC...). Carregado depois de telas.js. */
(function () {
  'use strict';
  const H = s => esc(s == null ? '' : s);

  // ---------- janela de edição ----------
  function janela(titulo, corpo, salvar) {
    const d = document.createElement('div');
    d.className = 'login'; d.id = 'janela-edicao';
    d.innerHTML = '<div class="lbox"><h2 class="ct">' + titulo + '</h2><form class="eform" novalidate>' + corpo +
      '<button class="btn wide" type="submit">Salvar alterações</button><button class="btn ghost wide" type="button" data-fechar>Cancelar</button></form></div>';
    document.body.appendChild(d);
    d.querySelector('[data-fechar]').onclick = () => d.remove();
    d.querySelector('form').onsubmit = e => { e.preventDefault(); if (!certeza('Salvar as alterações?')) return; if (salvar(new FormData(e.target)) !== false) d.remove(); };
    return d;
  }
  const opc = (lista, atual) => lista.map(v => { const [val, txt] = Array.isArray(v) ? v : [v, v]; return '<option value="' + H(val) + '"' + (String(val) === String(atual ?? '') ? ' selected' : '') + '>' + H(txt) + '</option>'; }).join('');
  const campo = (rot, nome, val, tipo, extra) => '<label>' + rot + '<input name="' + nome + '" type="' + (tipo || 'text') + '" value="' + H(val) + '"' + (extra || '') + '></label>';
  const escolha = (rot, nome, lista, val) => '<label>' + rot + '<select name="' + nome + '">' + opc(lista, val) + '</select></label>';
  const pessoas = atual => [['', '—'], ...RESP.concat(atual && !RESP.includes(atual) ? [atual] : [])];
  const lista = v => String(v || '').split(/[,;]/).map(s => s.trim()).filter(Boolean);
  const estilo = 'min-height:40px;border:1px solid var(--line);border-radius:8px;padding:6px 8px;background:var(--card);width:100%';

  // ---------- caixa, fábrica e cocho ----------
  const SIMPLES = {
    financeiro: {
      pode: () => can('fin_editar'), titulo: 'Editar lançamento do caixa',
      campos: x => campo('Data', 'd', x.d, 'date') + escolha('Tipo', 'tipo', ['Receita', 'Despesa', 'Investimento'], x.tipo) +
        '<label>Centro de custo<select name="grupo"></select></label><label>Subcentro<select name="sub"></select></label>' +
        '<label>Item<select name="item"></select></label><label data-novo hidden>Nome do item novo<input name="novo" autocomplete="off"></label>' +
        campo('Valor (R$)', 'valor', String(x.valor).replace('.', ','), 'text', ' inputmode="decimal"') +
        campo('Fornecedor (opcional)', 'forn', x.forn, 'text', ' list="ed-forns" autocomplete="off"') +
        '<datalist id="ed-forns">' + cxFornecedores().map(v => '<option value="' + H(v) + '">').join('') + '</datalist>' +
        campo('Nota fiscal (opcional)', 'nf', x.nf, 'text', ' inputmode="numeric" autocomplete="off"') + campo('Observação', 'obs', x.obs),
      montar: (d, x) => {
        const q = n => d.querySelector('[name="' + n + '"]');
        const el = { grupo: q('grupo'), sub: q('sub'), item: q('item'), novoF: d.querySelector('[data-novo]') };
        const tp = () => q('tipo').value;
        cxCascata(el, tp(), { grupo: x.grupo, sub: x.sub || '', item: x.item });
        q('tipo').onchange = () => cxCascata(el, tp(), { grupo: '', sub: null, item: '' });
        el.grupo.onchange = () => cxCascata(el, tp(), { grupo: el.grupo.value, sub: null, item: '' });
        el.sub.onchange = () => cxCascata(el, tp(), { grupo: el.grupo.value, sub: el.sub.value, item: '' });
        el.item.onchange = () => { el.novoF.hidden = el.item.value !== CX_OUTRO; };
      },
      ler: (f, x) => {
        const v = num(f.get('valor')); if (!f.get('d')) return 'Informe a data.'; if (!(v > 0)) return 'Informe o valor.';
        const item = String(f.get('item') === CX_OUTRO ? f.get('novo') || '' : f.get('item') || '').trim();
        if (!item) return f.get('item') === CX_OUTRO ? 'Digite o nome do item novo.' : 'Informe o item.';
        const n = { ...x, d: f.get('d'), tipo: f.get('tipo'), grupo: String(f.get('grupo') || '').trim() || x.grupo, sub: String(f.get('sub') || '').trim(), item, valor: v, obs: String(f.get('obs')).trim() };
        const forn = String(f.get('forn') || '').trim(), nf = String(f.get('nf') || '').trim();
        if (forn) n.forn = forn; else delete n.forn; if (nf) n.nf = nf; else delete n.nf;
        return n;
      }
    },
    fabrica: {
      pode: () => can('corrigir'), titulo: 'Editar movimento da fábrica',
      campos: x => campo('Data', 'd', x.d, 'date') + escolha('Tipo', 'tipo', ['Produção', 'Saída'], x.tipo) +
        escolha('Suplemento', 'dieta', [...new Set(dietas().concat([x.dieta]))], x.dieta) +
        campo('Quantidade (kg)', 'kg', String(x.kg).replace('.', ','), 'text', ' inputmode="decimal"') +
        escolha('Responsável', 'resp', pessoas(x.resp), x.resp) + campo('Observação', 'obs', x.obs),
      ler: (f, x) => { const kg = num(f.get('kg')); if (!f.get('d')) return 'Informe a data.'; if (!(kg > 0)) return 'Informe os quilos.';
        return { ...x, d: f.get('d'), tipo: f.get('tipo'), dieta: f.get('dieta'), kg, resp: f.get('resp'), obs: String(f.get('obs')).trim() }; }
    },
    cocho: {
      pode: () => can('corrigir'), titulo: 'Editar trato no cocho',
      campos: x => campo('Data', 'd', x.d, 'date') + escolha('Pasto', 'pasto', [...new Set(pastos().map(p => p.nome).concat([x.pasto]))], x.pasto) +
        escolha('Suplemento', 'dieta', [...new Set(dietas().concat([x.dieta]))], x.dieta) +
        campo('Quantidade (kg)', 'kg', String(x.kg).replace('.', ','), 'text', ' inputmode="decimal"') +
        escolha('Cocho', 'estado', [['', '—'], 'Limpo', 'Sobrou'], x.estado) + escolha('Responsável', 'resp', pessoas(x.resp), x.resp),
      ler: (f, x) => { const kg = num(f.get('kg')); if (!f.get('d')) return 'Informe a data.'; if (!(kg > 0)) return 'Informe os quilos.';
        const n = { ...x, d: f.get('d'), pasto: f.get('pasto'), dieta: f.get('dieta'), kg, resp: f.get('resp') };
        if (f.get('estado')) n.estado = f.get('estado'); else delete n.estado; return n; }
    }
  };
  function editarSimples(col, id) {
    const M = SIMPLES[col], x = (C[col] || []).find(y => String(y.id) === String(id));
    if (!M || !x || !M.pode() || !canW()) return;
    const d = janela(M.titulo, M.campos(x), f => {
      const n = M.ler(f, x);
      if (typeof n === 'string') { msg(n); return false; }
      if (n.d > today()) { msg('A data não pode ser no futuro.'); return false; }
      putC(col, n); msg('Lançamento alterado.'); redraw();
    });
    if (M.montar) M.montar(d, x);
  }
  window.botaoEditar = (col, id) => SIMPLES[col] && SIMPLES[col].pode() ? '<button type="button" class="x" data-ed="' + col + '/' + H(id) + '">Editar</button>' : '';
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-ed]'); if (!b) return;
    const i = b.dataset.ed.indexOf('/'); editarSimples(b.dataset.ed.slice(0, i), b.dataset.ed.slice(i + 1));
  });

  // ---------- romaneios ----------
  function cabecalho(r) {
    const i = r.info || {}, d = campo('Data', 'd', r.d, 'date', ' max="' + today() + '"');
    const san = campo('Protocolo sanitário (separe por vírgula; vazio = nenhum)', 'san', (i.san || []).join(', '));
    const resp = escolha('Responsável', 'resp', pessoas(i.resp), i.resp);
    if (r.tipo === 'Entrada') return d + campo('Fornecedor', 'forn', i.forn) + campo('Lote', 'lote', i.lote) +
      campo('Valor por animal (R$)', 'preco', i.preco ? String(i.preco).replace('.', ',') : '', 'text', ' inputmode="decimal"') +
      escolha('Sexo', 'sexo', ['Macho', 'Fêmea'], i.sexo || 'Macho') + san + resp;
    if (r.tipo === 'Pesagem') return d + campo('Tipo de pesagem', 'tipo', i.tipo || 'Rotina') + san + resp;
    if (r.tipo === 'Venda') return d + campo('Comprador', 'comp', i.comp) +
      escolha('Destino', 'dest', [...new Set(['Frigorífico', 'Outra fazenda', 'Atravessador'].concat(i.dest ? [i.dest] : []))], i.dest) +
      campo('Valor da @ (R$)', 'arr', String(i.arr || '').replace('.', ','), 'text', ' inputmode="decimal"') + resp;
    return d;
  }
  function linhas(r) {
    const ent = r.tipo === 'Entrada', mor = r.tipo === 'Morte';
    return '<div class="tw"><table class="ft"><tr class="h"><td>Brinco</td>' + (mor ? '<td>Causa</td>' : '<td>Peso (kg)</td>') + '<td>Tirar</td></tr>' +
      r.it.map((x, k) => '<tr><td>' + (ent ? '<input name="b' + k + '" value="' + H(x.id) + '" style="' + estilo + ';max-width:110px">' : tag(x.id)) + '</td><td>' +
        (mor ? '<input name="c' + k + '" value="' + H(x.causa) + '" style="' + estilo + '">'
             : '<input name="p' + k + '" value="' + H(String(x.p).replace('.', ',')) + '" inputmode="decimal" style="' + estilo + ';max-width:110px">') +
        '</td><td><input type="checkbox" name="r' + k + '" aria-label="Tirar o brinco ' + H(x.id) + ' do romaneio"></td></tr>').join('') +
      '</table></div><p class="hint" style="margin:0">Marcar <b>Tirar</b> desfaz o lançamento daquele animal' +
      (ent ? ' (o animal sai do rebanho; só dá se ele ainda não tiver pesagem, venda ou morte).' : '.') + '</p>';
  }

  function salvarRomaneio(r, f) {
    const od = r.d, nd = f.get('d'), i0 = r.info || {};
    if (!nd) return 'Informe a data.';
    if (nd > today()) return 'A data não pode ser no futuro.';
    const cab = { san: lista(f.get('san')), resp: f.get('resp') || '' };
    if (r.tipo === 'Entrada') Object.assign(cab, { forn: String(f.get('forn') || '').trim(), lote: String(f.get('lote') || '').trim(), preco: num(f.get('preco')) || 0, sexo: f.get('sexo') });
    if (r.tipo === 'Pesagem') cab.tipo = String(f.get('tipo') || '').trim() || 'Rotina';
    if (r.tipo === 'Venda') { Object.assign(cab, { comp: String(f.get('comp') || '').trim(), dest: f.get('dest'), arr: num(f.get('arr')) }); if (!cab.comp) return 'Informe o comprador.'; if (!(cab.arr > 0)) return 'Informe o valor da @.'; }
    if (r.tipo === 'Entrada' && !cab.forn) return 'Informe o fornecedor.';
    const prob = [], muda = [], novoIt = [], novosIds = new Set();
    r.it.forEach((x, k) => {
      const tira = f.get('r' + k) === 'on', a = findA(String(x.id));
      if (!a) { if (!tira) prob.push(x.id + ' (animal não encontrado)'); return; }
      const n = clone(a), p = r.tipo === 'Morte' ? null : num(f.get('p' + k));
      if (!tira && r.tipo !== 'Morte' && !(p > 0)) { prob.push(x.id + ' (peso inválido)'); return; }
      const semDia = (arr, d) => (arr || []).filter(y => y.d !== d);
      if (r.tipo === 'Entrada') {
        const outros = [...(n.pes || []).map(y => y.d), n.venda && n.venda.d, n.morte && n.morte.d].filter(Boolean).sort();
        if (tira) { if (outros.length) prob.push(x.id + ' (tem outros lançamentos; tire-os antes)'); else muda.push([a.id, null]); return; }
        if (outros[0] && outros[0] < nd) { prob.push(x.id + ' (tem lançamento em ' + fd(outros[0]) + ', antes da nova data)'); return; }
        const nb = String(f.get('b' + k) || '').trim().replace(/\.0+$/, '');
        if (!nb) { prob.push('brinco vazio na linha ' + (k + 1)); return; }
        if (nb !== a.id && (findA(nb) || novosIds.has(nb))) { prob.push('brinco ' + nb + ' já existe'); return; }
        novosIds.add(nb);
        n.id = nb; n.ent.d = nd; n.ent.p = p; n.forn = cab.forn; n.lote = cab.lote; n.preco = cab.preco; n.sexo = cab.sexo;
        if (n.cat) n.cat = catPeso(p);
        n.san = semDia(n.san, od); if (cab.san.length) n.san.push({ d: nd, i: cab.san });
        muda.push([a.id, n]); novoIt.push({ ...x, id: isNaN(+nb) ? nb : +nb, p });
      } else if (r.tipo === 'Pesagem') {
        const y = (n.pes || []).find(y => y.d === od && Math.abs(num(y.p) - num(x.p)) < 0.01);
        if (!y) { prob.push(x.id + ' (pesagem não encontrada)'); return; }
        if (tira) { n.pes = n.pes.filter(z => z !== y); if ((i0.san || []).length) n.san = semDia(n.san, od); muda.push([a.id, n]); return; }
        if (nd < n.ent.d) { prob.push(x.id + ' (entrada em ' + fd(n.ent.d) + ')'); return; }
        const fim = (n.venda && n.venda.d) || (n.morte && n.morte.d);
        if (fim && fim < nd) { prob.push(x.id + ' (saiu do rebanho em ' + fd(fim) + ')'); return; }
        y.d = nd; y.p = p; y.t = cab.tipo; if (cab.resp) y.resp = cab.resp;
        n.san = semDia(n.san, od); if (cab.san.length) n.san.push({ d: nd, i: cab.san });
        muda.push([a.id, n]); novoIt.push({ ...x, p, g: gmd(n.ent, { d: nd, p }) });
      } else if (r.tipo === 'Venda') {
        if (!n.venda || n.venda.d !== od) { prob.push(x.id + ' (venda não encontrada)'); return; }
        if (tira) { n.venda = null; muda.push([a.id, n]); return; }
        if (nd < n.ent.d) { prob.push(x.id + ' (entrada em ' + fd(n.ent.d) + ')'); return; }
        const valor = p / 30 * cab.arr;
        Object.assign(n.venda, { d: nd, p, comp: cab.comp, dest: cab.dest, arr: cab.arr, valor }); if (cab.resp) n.venda.resp = cab.resp;
        muda.push([a.id, n]); novoIt.push({ ...x, p, valor, g: gmd(n.ent, { d: nd, p }) });
      } else {
        if (!n.morte || n.morte.d !== od) { prob.push(x.id + ' (morte não encontrada)'); return; }
        if (tira) { n.morte = null; muda.push([a.id, n]); return; }
        if (nd < n.ent.d) { prob.push(x.id + ' (entrada em ' + fd(n.ent.d) + ')'); return; }
        const causa = String(f.get('c' + k) || '').trim();
        n.morte.d = nd; n.morte.causa = causa;
        muda.push([a.id, n]); novoIt.push({ ...x, causa });
      }
    });
    if (prob.length) return 'Não foi possível salvar: ' + prob.slice(0, 4).join('; ') + (prob.length > 4 ? ' e mais ' + (prob.length - 4) : '') + '.';
    const fora = novoIt.filter(x => x.p > 0 && (x.p < 100 || x.p > 600));
    if (fora.length && !certeza('ATENÇÃO AO PESO: ' + fora.slice(0, 5).map(x => 'brinco ' + x.id + ' com ' + x.p + ' kg').join(', ') + (fora.length > 5 ? ' e mais ' + (fora.length - 5) : '') + ' (fora de 100 a 600 kg).\n\nTem certeza que quer salvar estes pesos?')) return false;
    const tirados = r.it.length - novoIt.length;
    if (!novoIt.length && !confirm('Todos os animais foram tirados. Apagar o romaneio inteiro?')) return false;
    if (tirados && novoIt.length && !confirm(tirados + ' animal(is) serão tirados deste romaneio. Confirmar?')) return false;
    // grava: primeiro os animais, depois o romaneio
    for (const [velho, n] of muda) {
      if (!n) { A = A.filter(a => a.id !== velho); delA(velho); continue; }
      if (n.id !== velho) { A = A.filter(a => a.id !== velho); delA(velho); A.push(n); }
      else { const k = A.findIndex(a => a.id === velho); if (k >= 0) A[k] = n; }
      putA(n);
    }
    if (!novoIt.length) { R = R.filter(x => x !== r); delR(r); }
    else { r.d = nd; r.info = { ...i0, ...cab }; r.it = novoIt; putR(r); }
    return true;
  }

  function editarRomaneio(id) {
    const r = R.find(x => String(x.id) === String(id));
    if (!r || !podeCorrRom(r) || !canW()) return;
    janela('Editar romaneio de ' + r.tipo.toLowerCase() + ' · ' + fd(r.d), cabecalho(r) + linhas(r), f => {
      const ok = salvarRomaneio(r, f);
      if (ok === false) return false;
      if (typeof ok === 'string') { msg(ok); return false; }
      msg('Romaneio alterado.'); refresh(); rrender();
    });
  }
  window.editarRomaneio = editarRomaneio;
  window.salvarRomaneio = salvarRomaneio;
  document.addEventListener('click', e => { const b = e.target.closest('[data-er]'); if (b) { e.stopPropagation(); editarRomaneio(b.dataset.er); } }, true);
})();
