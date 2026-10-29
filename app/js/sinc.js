// Sincronização: guarda tudo no aparelho, trabalha sem internet e envia/recebe
// do Supabase quando há conexão. Também traduz entre o formato das telas
// (um "documento" por animal, com pesagens, venda e morte dentro) e as tabelas do banco.
(function () {
  'use strict';
  const N = () => window.Nuvem, CF = () => window.Cofre;
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() :
    '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)));
  const clone = o => o == null ? o : JSON.parse(JSON.stringify(o));
  const vazio = v => v === undefined || v === null || v === '';
  const txt = v => vazio(v) ? null : String(v);
  const numero = v => vazio(v) ? null : (typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.')));
  const data = v => vazio(v) ? null : String(v).slice(0, 10);
  const semNulos = o => { for (const k in o) if (o[k] === null || o[k] === undefined) delete o[k]; return o; };
  const resto = (o, fora) => { const r = {}; for (const k in o || {}) if (!fora.includes(k) && k !== '_id') r[k] = o[k]; return r; };

  // Tabelas que o app guarda e sincroniza
  const TABELAS = ['romaneios', 'animais', 'pesagens', 'vendas', 'vendas_valor', 'romaneio_valores', 'animais_valor', 'mortes', 'sanitario', 'pastos',
    'supl_fabrica', 'supl_cocho', 'atividades', 'financeiro', 'importacoes', 'painel'];
  const CHAVE_LINHA = { vendas_valor: 'venda_id', romaneio_valores: 'romaneio_id', animais_valor: 'animal_id', painel: 'chave' };
  // valores só para quem vê os totais (o banco também não entrega para os outros)
  const SO_TOTAIS = ['vendas_valor', 'romaneio_valores', 'animais_valor'];
  const pk = t => CHAVE_LINHA[t] || 'id';

  // Coleções simples das telas -> tabela do banco
  const SIMPLES = {
    fabrica: {
      tab: 'supl_fabrica', campos: ['d', 'tipo', 'dieta', 'kg', 'obs', 'resp'],
      linha: d => ({ data: data(d.d), tipo: d.tipo, dieta: d.dieta, kg: numero(d.kg), obs: txt(d.obs), responsavel: txt(d.resp) }),
      doc: r => ({ d: r.data, tipo: r.tipo, dieta: r.dieta, kg: +r.kg, obs: r.obs || '', resp: r.responsavel || '' })
    },
    cocho: {
      tab: 'supl_cocho', campos: ['d', 'pasto', 'dieta', 'kg', 'estado', 'resp'],
      linha: d => ({ data: data(d.d), pasto: d.pasto, dieta: d.dieta, kg: numero(d.kg), estado: txt(d.estado), responsavel: txt(d.resp) }),
      doc: r => semNulos({ d: r.data, pasto: r.pasto, dieta: r.dieta, kg: +r.kg, estado: r.estado, resp: r.responsavel || '' })
    },
    pastos: {
      tab: 'pastos', campos: ['nome', 'area', 'obs', 'tipo', 'cod'],
      linha: d => ({ nome: d.nome, area_ha: numero(d.area), obs: txt(d.obs), tipo: txt(d.tipo), cod: txt(d.cod) }),
      doc: r => semNulos({ nome: r.nome, area: r.area_ha === null ? null : +r.area_ha, obs: r.obs || '', tipo: r.tipo, cod: r.cod })
    },
    atividades: {
      tab: 'atividades', campos: ['tit', 'nivel', 'eq', 'resp', 'prazo', 'obs', 'st', 'fim'],
      linha: d => ({ titulo: d.tit, nivel: d.nivel, equipe: txt(d.eq), responsaveis: Array.isArray(d.resp) ? d.resp : (vazio(d.resp) ? [] : [String(d.resp)]),
        prazo: data(d.prazo), obs: txt(d.obs), situacao: +d.st || 0, concluida_em: data(d.fim) }),
      doc: r => ({ tit: r.titulo, nivel: r.nivel, eq: r.equipe || '', resp: r.responsaveis || [], prazo: r.prazo || '', obs: r.obs || '', st: r.situacao || 0, fim: r.concluida_em || null })
    },
    financeiro: {
      tab: 'financeiro', campos: ['d', 'tipo', 'grupo', 'sub', 'item', 'valor', 'obs', 'manual'],
      linha: d => ({ data: data(d.d), tipo: d.tipo, grupo: d.grupo, sub: txt(d.sub), item: d.item, valor: numero(d.valor), obs: txt(d.obs), origem: d.manual ? 'manual' : 'importacao' }),
      doc: r => ({ d: r.data, tipo: r.tipo, grupo: r.grupo, sub: r.sub || '', item: r.item, valor: +r.valor, obs: r.obs || '', manual: r.origem === 'manual' })
    },
    importacoes: {
      tab: 'importacoes', campos: ['arquivo', 'cnt'],
      linha: d => ({ arquivo: d.arquivo || 'planilha', contagens: d.cnt || {} }),
      doc: r => ({ arquivo: r.arquivo, cnt: r.contagens || {} })
    }
  };
  const COLECOES = ['animais', 'romaneios', ...Object.keys(SIMPLES)];

  // ------------------------------------------------------------------
  // Estado
  // ------------------------------------------------------------------
  let CLI = null, EU = null, PODE_TOTAIS = false, LER = TABELAS.slice(), obterToken = null, aoErro = () => {}, aoEstado = () => {};
  const T = {};            // tabela -> Map(chave -> linha)
  let fila = [];            // lançamentos esperando envio
  let cursores = {};        // tabela -> maior atualizado_em recebido
  const ouvintes = {};      // coleção -> [função]
  const sujas = new Set();  // coleções a redesenhar
  const tabSujas = new Set();
  let ultimaSinc = null, enviando = false, recebendo = false, timerDocs = 0, timerSalvar = 0;
  TABELAS.forEach(t => T[t] = new Map());

  const ativa = r => r && !r.excluido_em;
  const linhasDe = t => [...T[t].values()].filter(ativa);

  // Índices montados durante o processamento de um lote (importações grandes)
  let IX = null;
  function montarIndices() {
    IX = { brinco: new Map(), chave: {}, filhos: {} };
    for (const r of linhasDe('animais')) IX.brinco.set(r.brinco, r);
    for (const t of ['romaneios', 'pastos', 'supl_fabrica', 'supl_cocho', 'atividades', 'financeiro', 'importacoes']) {
      IX.chave[t] = new Map(); for (const r of linhasDe(t)) IX.chave[t].set(r.chave, r);
    }
    for (const t of ['pesagens', 'sanitario', 'vendas', 'mortes']) {
      const m = IX.filhos[t] = new Map();
      for (const r of linhasDe(t)) { if (!m.has(r.animal_id)) m.set(r.animal_id, []); m.get(r.animal_id).push(r); }
    }
  }
  function indexar(tab, r, sai) {
    if (!IX) return;
    if (tab === 'animais') { if (sai) IX.brinco.delete(r.brinco); else IX.brinco.set(r.brinco, r); }
    else if (IX.chave[tab]) { if (sai) IX.chave[tab].delete(r.chave); else IX.chave[tab].set(r.chave, r); }
    else if (IX.filhos[tab]) {
      const m = IX.filhos[tab], l = m.get(r.animal_id) || [];
      if (sai) m.set(r.animal_id, l.filter(x => x !== r)); else { l.push(r); m.set(r.animal_id, l); }
    }
  }

  // ------------------------------------------------------------------
  // Gravação local + fila
  // ------------------------------------------------------------------
  function marcar(tab) {
    tabSujas.add(tab);
    const c = { romaneios: ['romaneios'], supl_fabrica: ['fabrica'], supl_cocho: ['cocho'], pastos: ['pastos'], atividades: ['atividades'],
      financeiro: ['financeiro'], importacoes: ['importacoes'], vendas_valor: ['animais', 'romaneios'], romaneio_valores: ['animais', 'romaneios'], animais_valor: ['animais', 'romaneios'], painel: ['painel'] }[tab] || ['animais'];
    c.forEach(x => sujas.add(x));
    clearTimeout(timerSalvar); timerSalvar = setTimeout(salvarTabelas, 1200);
  }
  function enfileirar(op) {
    op.u = EU; op.c = CLI; op.n = Date.now() + Math.random();
    if (op.op === 'upd') {
      const p = fila.find(o => !o.voando && o.tab === op.tab && o.id === op.id && o.u === op.u);
      if (p) { Object.assign(p.op === 'ins' ? p.linha : p.campos, op.campos); return; }
    }
    fila.push(op);
  }
  function inserirLocal(tab, linha) {
    linha.cliente_id = CLI;
    if (tab !== 'vendas_valor' && tab !== 'painel') linha.criado_por = EU;
    const nova = Object.assign({ atualizado_em: new Date().toISOString(), excluido_em: null }, linha);
    T[tab].set(linha[pk(tab)], nova); indexar(tab, nova);
    enfileirar({ op: 'ins', tab, id: linha[pk(tab)], linha: clone(linha) });
    marcar(tab);
  }
  // texto canônico (chaves em ordem), porque o banco reordena os campos de jsonb
  const canon = v => v === null || typeof v !== 'object' ? JSON.stringify(v === undefined ? null : v)
    : Array.isArray(v) ? '[' + v.map(canon).join(',') + ']'
    : '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  function igual(a, b) {
    if ((a === null || a === undefined) && (b === null || b === undefined)) return true;
    if (typeof a === 'number' || typeof b === 'number') return numero(a) === numero(b);
    return canon(a) === canon(b);
  }
  function alterarLocal(tab, atual, nova) {
    const campos = {};
    for (const k in nova) if (!igual(atual[k], nova[k])) campos[k] = nova[k];
    if (!Object.keys(campos).length) return false;
    Object.assign(atual, campos);
    enfileirar({ op: 'upd', tab, id: atual[pk(tab)], campos: clone(campos) });
    marcar(tab);
    return true;
  }
  function excluirLocal(tab, atual) {
    if (!atual || atual.excluido_em) return;
    const agora = new Date().toISOString();
    atual.excluido_em = agora; indexar(tab, atual, true);
    enfileirar({ op: 'upd', tab, id: atual.id, campos: { excluido_em: agora } });
    marcar(tab);
  }
  const porChave = (tab, chave) => IX && IX.chave[tab] ? (IX.chave[tab].get(chave) || null) : (linhasDe(tab).find(r => r.chave === chave) || null);

  // ------------------------------------------------------------------
  // Documentos das telas -> linhas
  // ------------------------------------------------------------------
  function aplicarSimples(col, docId, doc) {
    const M = SIMPLES[col], chave = String(docId), atual = porChave(M.tab, chave);
    if (doc === null) { excluirLocal(M.tab, atual); return; }
    const linha = M.linha(doc);
    linha.chave = chave;
    linha.extra = resto(doc, ['id', ...M.campos]);
    if (atual) {
      // "lançado por" fica como foi gravado na primeira vez
      if (atual.extra && atual.extra.por !== undefined) linha.extra.por = atual.extra.por; else delete linha.extra.por;
      alterarLocal(M.tab, atual, linha);
    } else inserirLocal(M.tab, Object.assign({ id: uuid() }, linha));
  }

  function aplicarRomaneio(docId, doc) {
    const chave = String(docId), atual = porChave('romaneios', chave);
    if (doc === null) { excluirLocal('romaneios', atual); idxRom = null; return; }
    const info = clone(doc);
    delete info.val; delete info._rid;   // valores ficam na tabela protegida, nunca no romaneio
    // valores individuais de venda não ficam no romaneio (quem não vê totais lê o romaneio)
    if (info.tipo === 'Venda') (info.it || []).forEach(i => { delete i.valor; });
    const lin = +((doc.info || {}).lin) || 10;
    const linha = { tipo: doc.tipo, data: data(doc.d), linhas: [10, 15, 20, 25, 30].includes(lin) ? lin : 10,
      responsavel: txt((doc.info || {}).resp), info, chave };
    if (atual) alterarLocal('romaneios', atual, linha); else inserirLocal('romaneios', Object.assign({ id: uuid() }, linha));
    idxRom = null;
  }

  let idxRom = null;
  function romaneioDe(tipo, d, brinco) {
    if (!idxRom) {
      idxRom = new Map();
      for (const r of linhasDe('romaneios')) for (const i of ((r.info || {}).it || [])) idxRom.set(r.tipo + '|' + r.data + '|' + i.id, r.id);
    }
    return idxRom.get(tipo + '|' + d + '|' + brinco) || null;
  }

  const FILHOS = {
    pesagens: {
      itens: a => a.pes || [], tipoRom: () => 'Pesagem',
      linha: x => ({ data: data(x.d), peso: numero(x.p), tipo: x.t || 'Rotina', responsavel: txt(x.resp), obs: txt(x.obs), extra: resto(x, ['d', 'p', 't', 'resp', 'obs']) })
    },
    sanitario: {
      itens: a => a.san || [], tipoRom: (a, x) => x.d === a.ent.d ? 'Entrada' : 'Pesagem',
      linha: x => ({ data: data(x.d), itens: (x.i || []).map(String), extra: resto(x, ['d', 'i']) })
    },
    vendas: {
      itens: a => a.venda ? [a.venda] : [], tipoRom: () => 'Venda',
      linha: x => ({ data: data(x.d), peso: numero(x.p), comprador: x.comp || 'Não informado', destino: txt(x.dest),
        responsavel: txt(x.resp), extra: resto(x, ['d', 'p', 'arr', 'parr', 'comp', 'dest', 'resp', 'valor']) })
    },
    mortes: {
      itens: a => a.morte ? [a.morte] : [], tipoRom: () => 'Morte',
      linha: x => ({ data: data(x.d), causa: txt(x.causa), responsavel: txt(x.resp), extra: resto(x, ['d', 'causa', 'resp']) })
    }
  };
  const semExtra = l => { const c = Object.assign({}, l); delete c.extra; for (const k in c) if (typeof c[k] === 'number' || /^\d+(\.\d+)?$/.test(c[k])) c[k] = numero(c[k]); return canon(c); };

  function filhosDe(tab, animalId) { return IX ? (IX.filhos[tab].get(animalId) || []).slice() : linhasDe(tab).filter(r => r.animal_id === animalId); }

  function aplicarAnimal(brinco, doc) {
    const atual = IX ? (IX.brinco.get(String(brinco)) || null) : (linhasDe('animais').find(r => r.brinco === String(brinco)) || null);
    if (doc === null) {
      if (!atual) return;
      for (const t of Object.keys(FILHOS)) filhosDe(t, atual.id).forEach(r => excluirLocal(t, r));
      excluirLocal('animais', atual);
      return;
    }
    const ent = doc.ent || {};
    const linha = { brinco: String(doc.id), sexo: doc.sexo === 'Fêmea' ? 'Fêmea' : 'Macho', raca: txt(doc.raca), fornecedor: txt(doc.forn),
      lote: txt(doc.lote), ent_data: data(ent.d), ent_peso: numero(ent.p),
      responsavel: txt(ent.resp || doc.resp),
      extra: Object.assign(resto(doc, ['id', 'sexo', 'raca', 'forn', 'lote', 'preco', 'parr', 'ent', 'pes', 'san', 'venda', 'morte', 'resp']),
        Object.keys(resto(ent, ['d', 'p', 'resp'])).length ? { ent_extra: resto(ent, ['d', 'p', 'resp']) } : {}) };
    let aid;
    if (atual) { aid = atual.id; alterarLocal('animais', atual, linha); }
    else {
      aid = uuid();
      inserirLocal('animais', Object.assign({ id: aid, romaneio_id: romaneioDe('Entrada', linha.ent_data, linha.brinco) }, linha));
    }
    for (const [tab, F] of Object.entries(FILHOS)) {
      const existentes = filhosDe(tab, aid), usados = new Set();
      for (const x of F.itens(doc)) {
        const l = F.linha(x);
        let r = x._id && existentes.find(e => e.id === x._id && !usados.has(e.id));
        if (!r) r = existentes.find(e => !usados.has(e.id) && semExtra(l) === semExtra(pegar(e, l)));
        if (!r && (tab === 'vendas' || tab === 'mortes')) r = existentes.find(e => !usados.has(e.id));
        if (r) {
          usados.add(r.id); x._id = r.id;
          if (!r.romaneio_id) { const rid = romaneioDe(F.tipoRom(doc, x), l.data, linha.brinco); if (rid) l.romaneio_id = rid; }
          alterarLocal(tab, r, l);
        } else {
          const id = uuid(); x._id = id; usados.add(id);
          inserirLocal(tab, Object.assign({ id, animal_id: aid, romaneio_id: romaneioDe(F.tipoRom(doc, x), l.data, linha.brinco) }, l));
        }
      }
      existentes.filter(e => !usados.has(e.id)).forEach(e => excluirLocal(tab, e));
    }
  }
  const pegar = (r, modelo) => { const o = {}; for (const k in modelo) o[k] = r[k]; return o; };

  // Fila de documentos gravados pelas telas, processada em lote
  const pendDocs = new Map(); let timerProc = 0;
  const ORDEM = ['romaneios', 'pastos', 'importacoes', 'animais', 'fabrica', 'cocho', 'atividades', 'financeiro'];
  function gravarDoc(caminho, valor) {
    pendDocs.set(caminho, valor === null ? null : valor);
    clearTimeout(timerProc); timerProc = setTimeout(processar, 0);
    return Promise.resolve();
  }
  function processar() {
    const itens = [...pendDocs.entries()]; pendDocs.clear();
    const inicio = fila.length;
    montarIndices();
    itens.sort((a, b) => ORDEM.indexOf(a[0].split('/')[0]) - ORDEM.indexOf(b[0].split('/')[0]));
    for (const [cam, v] of itens) {
      const i = cam.indexOf('/'), col = cam.slice(0, i), id = cam.slice(i + 1);
      try {
        if (col === 'animais') aplicarAnimal(id, v);
        else if (col === 'romaneios') aplicarRomaneio(id, v);
        else if (SIMPLES[col]) aplicarSimples(col, id, v);
      } catch (e) { console.error(e); aoErro('Não foi possível gravar um lançamento neste aparelho.'); }
    }
    IX = null;
    // valores de venda vão depois das vendas, para os cadastros subirem em lotes
    const novos = fila.splice(inicio);
    fila.push(...novos.filter(o => o.tab !== 'vendas_valor'), ...novos.filter(o => o.tab === 'vendas_valor'));
    salvarFila(); agendarDocs(); aoEstado(estado());
    enviar();
  }

  // ------------------------------------------------------------------
  // Linhas -> documentos das telas
  // ------------------------------------------------------------------
  function docsAnimais() {
    const por = {};
    for (const t of Object.keys(FILHOS)) for (const r of linhasDe(t)) (por[r.animal_id] = por[r.animal_id] || {})[t] = ((por[r.animal_id] || {})[t] || []).concat(r);
    const out = [];
    for (const a of linhasDe('animais')) {
      const f = por[a.id] || {}, ex = a.extra || {}, av = T.animais_valor.get(a.id);
      const d = Object.assign(resto(ex, ['ent_extra']), {
        id: a.brinco, sexo: a.sexo, raca: a.raca || '', forn: a.fornecedor || '', lote: a.lote || '', preco: av ? +av.valor || 0 : 0,
        ent: semNulos(Object.assign({}, ex.ent_extra || {}, { d: a.ent_data, p: +a.ent_peso, resp: a.responsavel || undefined })),
        pes: (f.pesagens || []).sort((x, y) => x.data < y.data ? -1 : x.data > y.data ? 1 : 0)
          .map(r => semNulos(Object.assign({}, r.extra, { d: r.data, p: +r.peso, t: r.tipo, resp: r.responsavel, obs: r.obs, _id: r.id }))),
        san: (f.sanitario || []).sort((x, y) => x.data < y.data ? -1 : 1).map(r => Object.assign({}, r.extra, { d: r.data, i: r.itens || [], _id: r.id })),
        venda: null
      });
      if (av && +av.preco_arroba > 0) d.parr = +av.preco_arroba;
      const v = (f.vendas || [])[0];
      if (v) {
        const vv = T.vendas_valor.get(v.id);
        d.venda = semNulos(Object.assign({}, v.extra, { d: v.data, p: +v.peso, comp: v.comprador, dest: v.destino || '',
          resp: v.responsavel, valor: vv && vv.valor !== null ? +vv.valor : undefined, parr: vv && vv.preco_arroba !== null && vv.preco_arroba !== undefined ? +vv.preco_arroba : undefined, _id: v.id }));
      }
      const m = (f.mortes || [])[0];
      if (m) d.morte = semNulos(Object.assign({}, m.extra, { d: m.data, causa: m.causa || '', resp: m.responsavel, _id: m.id }));
      out.push(d);
    }
    return out;
  }
  function docsRomaneios(animais) {
    const val = new Map();
    for (const a of animais) if (a.venda && a.venda.valor !== undefined) val.set(a.id, a.venda.valor);
    return linhasDe('romaneios').map(r => {
      const d = clone(r.info || {});
      if (d.tipo === 'Venda' && PODE_TOTAIS) (d.it || []).forEach(i => { if (val.has(i.id)) i.valor = val.get(i.id); });
      if (d.id === undefined) d.id = isNaN(+r.chave) ? r.chave : +r.chave;
      // valor lançado na aba Romaneios (só chega para quem vê os totais)
      const rv = T.romaneio_valores.get(r.id);
      if (rv && !rv.excluido_em) d.val = { animais: numero(rv.valor_animais), frete: +rv.frete || 0, comissao: +rv.comissao || 0, total: +rv.total,
        arrobas: numero(rv.arrobas), parr: numero(rv.preco_arroba), carc: numero(rv.arrobas_carcaca), parrc: numero(rv.preco_arroba_carcaca),
        rateio: rv.rateio !== false, por: rv.lancado_nome || '', eu: rv.lancado_por === EU };
      d._rid = r.id;
      return d;
    });
  }
  function docsSimples(col) {
    const M = SIMPLES[col];
    return linhasDe(M.tab).map(r => Object.assign({}, r.extra || {}, M.doc(r), { id: r.chave }));
  }
  function docsDe(col, cacheAnimais) {
    if (col === 'animais') return cacheAnimais || docsAnimais();
    if (col === 'romaneios') return docsRomaneios(cacheAnimais || docsAnimais());
    if (SIMPLES[col]) return docsSimples(col);
    return [];
  }
  function agendarDocs() { clearTimeout(timerDocs); timerDocs = setTimeout(avisarOuvintes, 80); }
  function avisarOuvintes() {
    const cols = [...sujas]; sujas.clear();
    let anim = null;
    for (const col of cols) {
      if (col === 'painel') { (ouvintes.painel || []).forEach(f => f(painel())); continue; }
      if (!ouvintes[col] || !ouvintes[col].length) continue;
      if ((col === 'animais' || col === 'romaneios') && !anim) anim = docsAnimais();
      const docs = docsDe(col, anim).map(d => ({ id: String(d.id), data: () => d }));
      ouvintes[col].forEach(f => { try { f({ docs }); } catch (e) { console.error(e); } });
    }
  }
  function painel() { const o = {}; for (const r of T.painel.values()) o[r.chave] = r.dados; return o; }

  // Objeto no formato que as telas esperam: db.collection(x).onSnapshot / db.doc('x/id').set
  const db = {
    collection(col) {
      return {
        onSnapshot(cb) {
          (ouvintes[col] = ouvintes[col] || []).push(cb);
          sujas.add(col); agendarDocs();
          return () => { ouvintes[col] = ouvintes[col].filter(f => f !== cb); };
        }
      };
    },
    doc(caminho) {
      return { set: v => gravarDoc(caminho, clone(v)), delete: () => gravarDoc(caminho, null) };
    }
  };

  // ------------------------------------------------------------------
  // Guardar no aparelho
  // ------------------------------------------------------------------
  const k = s => 'dados:' + CLI + ':' + s;
  async function salvarTabelas() {
    const ts = [...tabSujas]; tabSujas.clear();
    for (const t of ts) { try { await CF().gravar(k(t), [...T[t].values()]); } catch (e) { console.error(e); } }
    try { await CF().gravar(k('cursores'), cursores); } catch (e) {}
  }
  let salvandoFila = Promise.resolve();
  function salvarFila() {
    const copia = fila.map(o => Object.assign({}, o, { voando: false }));
    salvandoFila = salvandoFila.then(() => CF().gravar('fila', copia)).catch(() => {});
    return salvandoFila;
  }

  // ------------------------------------------------------------------
  // Envio para a nuvem
  // ------------------------------------------------------------------
  const errosVistos = [];
  async function enviar() {
    if (enviando || !navigator.onLine || !fila.length) return;
    enviando = true; aoEstado(estado());
    try {
      while (fila.length) {
        const op = fila[0];
        let token;
        try { token = await obterToken(op.u); } catch (e) { token = null; }
        if (!token) break;
        let lote = [op];
        if (op.op === 'ins' && !op.sozinho) {
          for (let i = 1; i < fila.length && lote.length < 500; i++) {
            const o = fila[i];
            if (o.op !== 'ins' || o.tab !== op.tab || o.u !== op.u || o.c !== op.c || o.sozinho) break;
            lote.push(o);
          }
        }
        lote.forEach(o => o.voando = true);
        try {
          if (op.op === 'ins') await N().inserir(token, op.tab, lote.map(o => o.linha));
          else await N().alterar(token, op.tab, pk(op.tab) + '=eq.' + encodeURIComponent(op.id), op.campos);
          fila.splice(0, lote.length);
          await salvarFila();
        } catch (e) {
          lote.forEach(o => o.voando = false);
          if (e.rede || e.status >= 500 || e.status === 401 || e.status === 429) break;
          if (lote.length > 1) { lote.forEach(o => o.sozinho = true); continue; }
          // Recusado pelo banco: desfaz no aparelho e avisa
          fila.shift(); await salvarFila();
          await desfazer(op, token);
          if (!errosVistos.includes(e.message)) { errosVistos.push(e.message); setTimeout(() => errosVistos.splice(errosVistos.indexOf(e.message), 1), 10000); aoErro(e.message); }
        }
      }
    } finally {
      enviando = false; aoEstado(estado());
    }
    if (!fila.length) receber();
  }
  async function desfazer(op, token) {
    if (op.op === 'ins') {
      T[op.tab].delete(op.id);
      // o que dependia deste registro também não vai entrar
      const dep = fila.filter(o => o.op === 'ins' && o.linha && (o.linha.animal_id === op.id || o.linha.romaneio_id === op.id));
      dep.forEach(o => { fila.splice(fila.indexOf(o), 1); T[o.tab].delete(o.id); });
      if (op.tab === 'vendas') T.vendas_valor.delete(op.id);
      if (dep.length) await salvarFila();
    } else {
      try {
        const r = await N().ler(token, op.tab, pk(op.tab) + '=eq.' + encodeURIComponent(op.id) + '&select=*');
        if (r[0]) T[op.tab].set(op.id, r[0]); else T[op.tab].delete(op.id);
      } catch (e) {}
    }
    marcar(op.tab); agendarDocs();
  }

  // ------------------------------------------------------------------
  // Recebimento da nuvem
  // ------------------------------------------------------------------
  async function receber() {
    if (recebendo || !navigator.onLine) return;
    recebendo = true; aoEstado(estado());
    try {
      const token = await obterToken(EU);
      if (!token) return;
      const pendentes = new Set(fila.map(o => o.tab + '|' + o.id));
      for (const t of LER) {
        if (SO_TOTAIS.includes(t) && !PODE_TOTAIS) continue;
        const cur = cursores[t];
        const desde = cur ? new Date(new Date(cur).getTime() - 5000).toISOString() : null;
        let pag = 0, maior = cur || null;
        for (;;) {
          const q = 'select=*&cliente_id=eq.' + CLI + (desde ? '&atualizado_em=gte.' + encodeURIComponent(desde) : '') +
            '&order=atualizado_em.asc' + (t === 'painel' ? '' : ',' + pk(t) + '.asc') + '&limit=1000&offset=' + pag * 1000;
          const linhas = await N().ler(token, t, q);
          for (const r of linhas) {
            if (!maior || r.atualizado_em > maior) maior = r.atualizado_em;
            const id = r[pk(t)];
            if (pendentes.has(t + '|' + id)) continue;
            T[t].set(id, r);
          }
          if (linhas.length) { marcar(t); if (t === 'romaneios') idxRom = null; }
          if (linhas.length < 1000) break;
          pag++;
        }
        cursores[t] = maior;
      }
      ultimaSinc = new Date();
      clearTimeout(timerSalvar); salvarTabelas();
      agendarDocs();
    } catch (e) {
      if (!e.rede) aoErro(e.message);
    } finally {
      recebendo = false; aoEstado(estado());
    }
  }

  function estado() {
    const meus = fila.filter(o => o.c === CLI);
    const maisAntigo = meus.length ? Math.min(...meus.map(o => Math.floor(o.n || Date.now()))) : null;
    return { pendentes: meus.length, outros: fila.filter(o => o.c !== CLI).length,
      enviando, recebendo, online: navigator.onLine, ultimaSinc, maisAntigo };
  }

  async function iniciar(op) {
    CLI = op.cliente; EU = op.usuario; PODE_TOTAIS = !!op.podeTotais; obterToken = op.obterToken;
    LER = op.tabelas || TABELAS.slice();
    aoErro = op.aoErro || aoErro; aoEstado = op.aoEstado || aoEstado;
    for (const t of TABELAS) {
      const ls = await CF().ler(k(t));
      T[t] = new Map((ls || []).map(r => [r[pk(t)], r]));
    }
    cursores = (await CF().ler(k('cursores'))) || {};
    fila = ((await CF().ler('fila')) || []).map(o => Object.assign(o, { voando: false }));
    // reaplica no aparelho o que ainda não subiu (caso a cópia local esteja mais velha)
    for (const o of fila) {
      if (o.c !== CLI) continue;
      const r = T[o.tab].get(o.id);
      if (o.op === 'ins' && !r) T[o.tab].set(o.id, Object.assign({ atualizado_em: new Date().toISOString(), excluido_em: null }, o.linha));
      if (o.op === 'upd' && r) Object.assign(r, o.campos);
    }
    COLECOES.forEach(c => sujas.add(c)); sujas.add('painel');
    const temDados = TABELAS.some(t => T[t].size);
    window.addEventListener('online', () => { enviar(); receber(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { enviar(); receber(); } });
    setInterval(() => { enviar(); receber(); }, (window.ISM_CONFIG.SEGUNDOS_SINCRONIA || 60) * 1000);
    return { temDados };
  }
  async function sincronizarAgora() { await enviar(); await receber(); }
  async function primeiraCarga() { await receber(); }
  function aoPainel(cb) { (ouvintes.painel = ouvintes.painel || []).push(cb); cb(painel()); }
  async function apagarCliente(cli) { for (const kk of await CF().chaves('dados:' + cli + ':')) await CF().apagar(kk); }

  window.Sinc = { iniciar, db, sincronizarAgora, primeiraCarga, estado, aoPainel, painel, enviar, receber, apagarCliente,
    // para testes
    _T: T, _fila: () => fila, _processar: processar, _docsAnimais: docsAnimais };
})();
