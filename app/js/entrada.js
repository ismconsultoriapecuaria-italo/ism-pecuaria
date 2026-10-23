// Entrada no app: login, verificação em duas etapas, escolha da fazenda,
// modo de aparelho compartilhado e carga dos dados antes de abrir as telas.
(function () {
  'use strict';
  const CFG = window.ISM_CONFIG, N = window.Nuvem, CF = window.Cofre;
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const FORTES = ['ISM', 'Proprietário', 'Administrativo'];
  // ação no banco -> nome usado nas telas
  const ACOES = { fin_ver: ['fin_ver'], fin_lancar: ['fin_lancar'], fin_editar: ['fin_editar'], ver_totais: ['rs'], manejo_lancar: ['manejo'],
    rebanho_ver: ['rebanho'], suplemento: ['cocho', 'fabrica'], corrigir: ['corrigir'], importar: ['importar'], exportar: ['exportar'],
    pastos_editar: ['pastos'], atv_estrategico: ['atv_todas'], atv_tatico: ['atv_tatico'], atv_criar: ['atv_criar'], usuarios: ['usuarios'], auditoria: ['auditoria'] };

  let contas = {}, aparelho = { compartilhado: false, ultimo: null };
  const travas = {};

  const salvarContas = () => CF.gravar('contas', contas);
  const salvarAparelho = () => CF.gravar('aparelho', aparelho);

  // ---------------- tela de entrada ----------------
  function tela(html) { const e = $('#entrada'); e.hidden = false; $('#entrada-corpo').innerHTML = html; }
  function aviso(t, tipo) { const e = $('#entrada-aviso'); if (!e) return; e.textContent = t || ''; e.className = 'eaviso ' + (tipo || ''); }
  function ocupado(b, sim, texto) { if (!b) return; b.disabled = sim; if (texto) { b.dataset.t = b.dataset.t || b.textContent; b.textContent = sim ? texto : b.dataset.t; } }

  function telaLogin(msg) {
    tela(`<h2 class="ct">Entrar</h2>
      <p class="hint">Use o login e a senha que a ISM passou para você.</p>
      <form id="flogin" class="eform" autocomplete="on">
        <label>Login<input name="login" autocomplete="username" autocapitalize="none" spellcheck="false" required></label>
        <label>Senha<input name="senha" type="password" autocomplete="current-password" required></label>
        <label class="chip ech"><input type="checkbox" name="comp" ${aparelho.compartilhado ? 'checked' : ''}><span>Aparelho compartilhado (tablet da fazenda): pedir senha sempre</span></label>
        <button class="btn wide" type="submit">Entrar</button>
      </form>
      <p id="entrada-aviso" class="eaviso"></p>
      ${N.configurado() ? '' : '<p class="eaviso erro">O app ainda não foi ligado ao banco de dados. Preencha o arquivo js/config.js.</p>'}`);
    if (msg) aviso(msg.t || msg, msg.tipo || 'erro');
    const f = $('#flogin');
    f.login.value = (aparelho.ultimo && contas[aparelho.ultimo] && !aparelho.compartilhado) ? contas[aparelho.ultimo].login : '';
    (f.login.value ? f.senha : f.login).focus();
    f.onsubmit = async e => {
      e.preventDefault();
      const login = f.login.value.trim(), senha = f.senha.value, b = f.querySelector('button');
      aparelho.compartilhado = f.comp.checked; await salvarAparelho();
      ocupado(b, true, 'Entrando…'); aviso('');
      try { await entrarComSenha(login, senha); }
      catch (err) { ocupado(b, false); aviso(err.message || 'Não foi possível entrar.', 'erro'); }
    };
  }

  async function entrarComSenha(login, senha) {
    const email = N.emailDe(login);
    let s;
    try { s = await N.entrar(login, senha); }
    catch (e) {
      if (!e.rede) throw e;
      // sem internet: confere a senha com o resumo guardado neste aparelho
      const c = Object.values(contas).find(x => x.email === email);
      if (!c || !c.verificador) throw new Error('Sem internet. Para entrar sem internet, entre uma vez com internet neste aparelho.');
      if (!(await CF.conferirSenha(senha, c.verificador))) throw new Error('Login ou senha incorretos.');
      return abrirConta(c.uid, { offline: true });
    }
    const uid = s.user.id;
    const c = contas[uid] = Object.assign(contas[uid] || {}, { uid, email, login, refresh: s.refresh_token, access: s.access_token, expira: s.expira });
    c.verificador = await CF.resumoSenha(senha);
    await salvarContas();
    await garantirDuasEtapas(c);
  }

  // ---------------- tokens ----------------
  async function tokenDe(uid) {
    const c = contas[uid];
    if (!c) return null;
    if (c.access && c.expira - 60000 > Date.now()) return c.access;
    if (!c.refresh) return null;
    if (travas[uid]) return travas[uid];
    travas[uid] = (async () => {
      try {
        const s = await N.renovar(c.refresh);
        Object.assign(c, { refresh: s.refresh_token, access: s.access_token, expira: s.expira });
        await salvarContas();
        return c.access;
      } catch (e) {
        if (e.rede || e.status >= 500) return null;
        c.refresh = null; c.access = null; await salvarContas();
        if (uid === aparelho.ultimo && window.ISM && window.ISM.user) sessaoTerminou();
        return null;
      } finally { delete travas[uid]; }
    })();
    return travas[uid];
  }
  function sessaoTerminou() {
    aparelho.ultimo = null; salvarAparelho();
    alert('Sua sessão terminou. Entre de novo com login e senha.');
    location.reload();
  }

  // ---------------- verificação em duas etapas ----------------
  async function perfisGerais(token, uid) {
    const [cfg, ism, mem] = await Promise.all([
      N.ler(token, 'config', 'select=chave,valor'),
      N.ler(token, 'ism_equipe', 'select=nome&user_id=eq.' + uid),
      N.ler(token, 'membros', 'select=*&user_id=eq.' + uid)
    ]);
    const exigir = (cfg.find(x => x.chave === 'exigir_mfa') || {}).valor !== 'nao';
    const ativos = mem.filter(m => m.ativo);
    const forte = ism.length > 0 || ativos.some(m => !m.dispensa_mfa && m.perfis.some(p => FORTES.includes(p)));
    return { exigir, forte, ism: ism[0] || null, membros: ativos, bloqueado: !ism.length && !ativos.length };
  }

  async function garantirDuasEtapas(c) {
    const g = await perfisGerais(c.access, c.uid);
    if (g.bloqueado) {
      c.refresh = null; c.access = null; await salvarContas();
      throw new Error('Seu acesso não está liberado. Fale com a ISM.');
    }
    const aal = N.lerToken(c.access).aal;
    if (!g.exigir || !g.forte || aal === 'aal2') return abrirConta(c.uid);
    const u = await N.usuario(c.access);
    const fator = (u.factors || []).find(f => f.factor_type === 'totp' && f.status === 'verified');
    if (fator) return telaCodigo(c, fator.id);
    // ainda não tem: cadastra o aplicativo autenticador
    for (const f of (u.factors || []).filter(f => f.status !== 'verified')) await N.removerFator(c.access, f.id);
    const novo = await N.inscreverTotp(c.access);
    telaCodigo(c, novo.id, novo.totp);
  }

  // o Supabase manda o QR como "data:image/svg+xml;utf-8,<svg...>" sem codificar
  function qrSrc(q) {
    const i = q.indexOf(',');
    if (q.startsWith('data:image/svg+xml') && !/;base64,/.test(q.slice(0, i + 1))) return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(q.slice(i + 1));
    if (q.trim().startsWith('<svg')) return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(q);
    return q;
  }
  function telaCodigo(c, fatorId, totp) {
    tela(`<h2 class="ct">Verificação em duas etapas</h2>
      ${totp ? `<p class="hint">Seu perfil vê dados financeiros, então pede uma segunda proteção. Instale um aplicativo autenticador
        (Google Authenticator ou Microsoft Authenticator), toque em "adicionar" e leia o código abaixo.</p>
        <div class="eqr">${totp.qr_code ? `<img alt="Código para o aplicativo autenticador" src="${esc(qrSrc(totp.qr_code))}">` : ''}</div>
        <p class="hint">Sem câmera? Digite esta chave no aplicativo: <b class="mono">${esc(totp.secret)}</b></p>`
      : '<p class="hint">Abra o aplicativo autenticador e digite o código de 6 números do ISM Pecuária.</p>'}
      <form id="fcod" class="eform"><label>Código<input name="cod" inputmode="numeric" autocomplete="one-time-code" maxlength="8" required></label>
      <button class="btn wide" type="submit">Confirmar</button></form>
      <p id="entrada-aviso" class="eaviso"></p>
      <button class="btn ghost wide" type="button" id="evolta">Voltar</button>`);
    $('#evolta').onclick = () => telaLogin();
    const f = $('#fcod'); f.cod.focus();
    f.onsubmit = async e => {
      e.preventDefault(); const b = f.querySelector('button'); ocupado(b, true, 'Conferindo…'); aviso('');
      try {
        const d = await N.desafiar(c.access, fatorId);
        const s = await N.verificar(c.access, fatorId, d.id, f.cod.value);
        Object.assign(c, { refresh: s.refresh_token, access: s.access_token, expira: s.expira });
        await salvarContas();
        await abrirConta(c.uid);
      } catch (err) { ocupado(b, false); aviso(err.message, 'erro'); f.cod.select(); }
    };
  }

  // ---------------- escolha da fazenda e perfil ----------------
  async function carregarClientes(c) {
    const token = await tokenDe(c.uid);
    const lista = await N.ler(token, 'clientes', 'select=id,nome,tipo,modulos&order=nome');
    c.clientes = lista; await salvarContas();
    return lista;
  }

  async function perfilNoCliente(c, cli) {
    const token = await tokenDe(c.uid);
    const [ism, mem, regras, todos] = await Promise.all([
      N.ler(token, 'ism_equipe', 'select=nome&user_id=eq.' + c.uid),
      N.ler(token, 'membros', 'select=nome,funcao,perfis,ativo&cliente_id=eq.' + cli.id + '&user_id=eq.' + c.uid),
      N.ler(token, 'permissoes', 'select=acao,perfil'),
      N.ler(token, 'membros', 'select=nome,ativo&cliente_id=eq.' + cli.id + '&order=nome')
    ]);
    const m = mem.find(x => x.ativo);
    let user;
    if (ism.length) user = { n: ism[0].nome, f: 'Consultor ISM', r: ['ISM'] };
    else if (m) user = { n: m.nome, f: m.funcao || m.perfis.join(' + '), r: m.perfis };
    else return null;
    const perm = {};
    for (const p of regras) for (const k of (ACOES[p.acao] || [p.acao])) (perm[k] = perm[k] || []).push(p.perfil);
    return { user, perm, nomes: todos.filter(x => x.ativo).map(x => x.nome), quando: Date.now() };
  }

  async function abrirConta(uid, op = {}) {
    const c = contas[uid];
    aparelho.ultimo = uid; await salvarAparelho();
    let lista = c.clientes || [];
    if (!op.offline && navigator.onLine) {
      try { lista = await carregarClientes(c); } catch (e) { if (!e.rede) throw e; }
    }
    if (!lista.length) throw new Error('Nenhuma fazenda liberada para você. Fale com a ISM.');
    const salvo = lista.find(x => x.id === c.cliente);
    if (salvo && !op.escolher) return abrirCliente(c, salvo, op);
    if (lista.length === 1) return abrirCliente(c, lista[0], op);
    tela(`<h2 class="ct">Qual fazenda?</h2><div class="ulist">${lista.map((x, i) =>
      `<button type="button" class="ucard" data-i="${i}"><b>${esc(x.nome)}</b><span>${x.tipo === 'corretor' ? 'Corretor' : 'Fazenda'}</span></button>`).join('')}</div>
      <p id="entrada-aviso" class="eaviso"></p>`);
    $('#entrada-corpo').onclick = e => { const b = e.target.closest('[data-i]'); if (b) abrirCliente(c, lista[+b.dataset.i], op).catch(err => aviso(err.message, 'erro')); };
  }

  async function abrirCliente(c, cli, op) {
    c.cliente = cli.id; await salvarContas();
    tela(`<h2 class="ct">${esc(cli.nome)}</h2><p class="hint" id="eprog">Preparando…</p><p id="entrada-aviso" class="eaviso"></p>`);
    const prog = t => { const e = $('#eprog'); if (e) e.textContent = t; };
    c.perfis = c.perfis || {};
    let P = c.perfis[cli.id];
    if (!op.offline && navigator.onLine) {
      try {
        prog('Conferindo seu acesso…');
        const novo = await perfilNoCliente(c, cli);
        if (!novo) {
          delete c.perfis[cli.id]; await salvarContas(); await window.Sinc.apagarCliente(cli.id);
          throw new Error('Seu acesso a ' + cli.nome + ' foi bloqueado. Fale com a ISM.');
        }
        P = c.perfis[cli.id] = novo; await salvarContas();
      } catch (e) { if (!e.rede) throw e; }
    }
    if (!P) throw new Error('Sem internet. Entre uma vez com internet para baixar os dados de ' + cli.nome + '.');

    const pode = k => P.user.r.some(r => (P.perm[k] || []).includes(r));
    const tabelas = ['painel', 'pastos', 'importacoes'];
    if (pode('rebanho') || pode('manejo') || pode('importar')) tabelas.push('romaneios', 'animais', 'pesagens', 'vendas', 'vendas_valor', 'mortes', 'sanitario');
    if (pode('cocho')) tabelas.push('supl_fabrica', 'supl_cocho');
    tabelas.push('atividades');
    if (pode('fin_ver')) tabelas.push('financeiro');

    const r = await window.Sinc.iniciar({
      cliente: cli.id, usuario: c.uid, podeTotais: pode('rs'), obterToken: tokenDe, tabelas,
      aoErro: t => window.ISM && window.ISM.aviso ? window.ISM.aviso(t) : aviso(t, 'erro'),
      aoEstado: st => window.ISM && window.ISM.estado && window.ISM.estado(st)
    });
    if (!r.temDados && navigator.onLine) { prog('Baixando os dados pela primeira vez… pode levar um minuto.'); await window.Sinc.primeiraCarga(); }
    else if (navigator.onLine) window.Sinc.sincronizarAgora();
    prog('Abrindo…');
    iniciarTelas(c, cli, P);
  }

  // ---------------- telas ----------------
  function vazioD() {
    const d = new Date(), m = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    const z = [0];
    return { m: [m], k: [], i: { animais: z, custeio: z, nutricao: z, producao: z, sanidade: z, mo: z, pasto: z, arroba: z, gmd: z } };
  }

  function iniciarTelas(c, cli, P) {
    const pn = window.Sinc.painel(), marca = pn.marca || {};
    const mods = cli.modulos && cli.modulos.length ? cli.modulos : ['financeiro', 'rebanho', 'suplemento', 'atividades', 'mapa'];
    let ultimoEstado = null;
    window.ISM = {
      cliente: cli, user: P.user, perm: P.perm, nomes: P.nomes.length ? P.nomes : [P.user.n],
      D: pn.D && pn.D.m && pn.D.m.length ? pn.D : vazioD(), V: pn.V || [], SUP: pn.SUP || [],
      marca, mod: k => mods.includes(k),
      aviso: t => { const e = document.getElementById('toast'); if (!e) return; e.textContent = t; e.hidden = false; clearTimeout(e._t); e._t = setTimeout(() => e.hidden = true, 6000); },
      estado: st => { ultimoEstado = st; desenharEstado(st); },
      menu: () => menuConta(c, cli),
      sincronizar: () => window.Sinc.sincronizarAgora()
    };
    // marca do cliente
    document.title = cli.nome + ' · ISM Pecuária';
    document.querySelectorAll('[data-cli-nome]').forEach(e => e.textContent = cli.nome);
    document.querySelectorAll('[data-marca-horiz]').forEach(e => { e.outerHTML = marca.horiz || '<b class="nomecli">' + esc(cli.nome) + '</b>'; });
    document.querySelectorAll('[data-marca-selo]').forEach(e => e.innerHTML = marca.selo || '');
    const own = $('#own'); if (own) own.textContent = marca.subtitulo || 'Gestão pecuária';
    const mi = $('#mapimg');
    if (mi) { if (pn.mapa && pn.mapa.img) { mi.src = pn.mapa.img; mi.alt = pn.mapa.alt || 'Mapa da fazenda'; } else mi.closest('.mapv').innerHTML = '<p class="mut" style="padding:20px">Mapa ainda não cadastrado para esta fazenda.</p>'; }
    const md = $('#mapdesc'); if (md && pn.mapa) md.innerHTML = (pn.mapa.info || []).map(([k, v]) => '<div><small>' + esc(k) + '</small><b>' + esc(v) + '</b></div>').join('');
    const mt = $('#maptit'); if (mt && pn.mapa && pn.mapa.titulo) mt.textContent = pn.mapa.titulo;
    // atualizações do painel (caixa, marca) chegam pela sincronização
    window.Sinc.aoPainel(novo => {
      if (!window.ISM.iniciado) return;
      if (JSON.stringify(novo.D || null) !== JSON.stringify(pn.D || null)) window.ISM.aviso('Painel financeiro atualizado. Feche e abra o app para ver.');
    });
    // duas classes de aparelho
    if (aparelho.compartilhado) vigiarInatividade();
    $('#entrada').hidden = true;
    const s = document.createElement('script');
    s.src = 'js/telas.js?v=' + (window.ISM_VERSAO || '1');
    s.onload = () => {
      const e = document.createElement('script');
      e.src = 'js/edicao.js?v=' + (window.ISM_VERSAO || '1');
      e.onload = () => { window.ISM.iniciado = true; if (ultimoEstado) desenharEstado(ultimoEstado); };
      document.body.appendChild(e);
    };
    document.body.appendChild(s);
  }

  function desenharEstado(st) {
    const e = document.getElementById('sincst'); if (!e) return;
    let t, cls = '';
    if (!st.online) { t = st.pendentes ? st.pendentes + ' aguardando internet' : 'Sem internet'; cls = 'off'; }
    else if (st.enviando || st.recebendo) t = 'Sincronizando…';
    else if (st.pendentes) { t = st.pendentes + ' a enviar'; cls = 'off'; }
    else t = st.ultimaSinc ? 'Sincronizado ' + st.ultimaSinc.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'Sincronizado';
    e.textContent = t; e.className = 'sincst ' + cls;
    // aviso forte quando há lançamentos parados no aparelho há mais de 12 horas
    let f = document.getElementById('faixapend');
    const velho = st.pendentes && st.maisAntigo && Date.now() - st.maisAntigo > 12 * 3600e3;
    if (velho) {
      if (!f) { f = document.createElement('div'); f.id = 'faixapend'; f.className = 'faixapend'; f.setAttribute('role', 'alert'); document.body.prepend(f); }
      const d = new Date(st.maisAntigo);
      f.innerHTML = '<b>' + st.pendentes + ' lançamento(s) só neste celular</b> desde ' + d.toLocaleDateString('pt-BR') + ' ' +
        d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + '. Conecte à internet e abra o app para enviar. Se o celular quebrar ou for limpo, eles se perdem.';
    } else if (f) f.remove();
  }

  let timerInativo = 0;
  function vigiarInatividade() {
    const min = CFG.MINUTOS_INATIVO_COMPARTILHADO || 15;
    const zera = () => { clearTimeout(timerInativo); timerInativo = setTimeout(() => sair(false), min * 60000); };
    ['pointerdown', 'keydown', 'scroll'].forEach(ev => document.addEventListener(ev, zera, { passive: true }));
    zera();
  }

  async function sair(perguntar) {
    const st = window.Sinc.estado();
    if (perguntar && st.pendentes && !confirm(st.pendentes + ' lançamento(s) ainda não foram enviados. Eles ficam guardados e sobem quando houver internet. Sair mesmo assim?')) return;
    aparelho.ultimo = null; await salvarAparelho();
    location.reload();
  }

  function menuConta(c, cli) {
    const st = window.Sinc.estado(), varios = (c.clientes || []).length > 1;
    const d = document.createElement('div');
    d.className = 'login'; d.id = 'menuconta';
    d.innerHTML = `<div class="lbox"><h2 class="ct">${esc(window.ISM.user.n)}</h2>
      <p class="hint">${esc(window.ISM.user.f)} · ${esc(cli.nome)}<br>${st.pendentes ? st.pendentes + ' lançamento(s) esperando envio.' : 'Tudo enviado.'}
      ${st.ultimaSinc ? ' Última sincronização: ' + st.ultimaSinc.toLocaleString('pt-BR') + '.' : ''}</p>
      <button class="btn wide" data-a="sinc">Sincronizar agora</button>
      ${varios ? '<button class="btn ghost wide" data-a="faz">Trocar de fazenda</button>' : ''}
      <button class="btn ghost wide" data-a="senha">Trocar minha senha</button>
      <button class="btn ghost wide" data-a="sair">Sair</button>
      <button class="btn ghost wide" data-a="apagar">Sair e apagar os dados deste aparelho</button>
      <button class="btn ghost wide" data-a="fechar">Fechar</button>
      <p class="hint" style="font-size:12px">ISM Pecuária · versão ${esc(window.ISM_VERSAO || '1')}</p></div>`;
    document.body.appendChild(d);
    d.onclick = async e => {
      const a = (e.target.closest('[data-a]') || {}).dataset?.a;
      if (!a) { if (e.target === d) d.remove(); return; }
      if (a === 'fechar') d.remove();
      if (a === 'sinc') { d.remove(); window.ISM.aviso('Sincronizando…'); await window.Sinc.sincronizarAgora(); }
      if (a === 'faz') { c.cliente = null; await salvarContas(); location.reload(); }
      if (a === 'sair') { d.remove(); sair(true); }
      if (a === 'senha') { d.remove(); trocarSenha(c); }
      if (a === 'apagar') {
        if (st.pendentes) { alert('Ainda há ' + st.pendentes + ' lançamento(s) sem enviar. Conecte à internet e sincronize antes de apagar.'); return; }
        if (!confirm('Apagar todos os dados do ISM Pecuária deste aparelho? Os dados continuam na nuvem.')) return;
        await CF.limparTudo(); location.reload();
      }
    };
  }

  async function trocarSenha(c) {
    const nova = prompt('Nova senha (pelo menos 8 caracteres, com letras e números):');
    if (!nova) return;
    if (nova.length < 8) return window.ISM.aviso('A senha precisa ter pelo menos 8 caracteres.');
    if (prompt('Digite a nova senha de novo:') !== nova) return window.ISM.aviso('As senhas não conferem.');
    try {
      await N.trocarSenha(await tokenDe(c.uid), nova);
      c.verificador = await CF.resumoSenha(nova); await salvarContas();
      window.ISM.aviso('Senha trocada.');
    } catch (e) { window.ISM.aviso(e.message); }
  }

  // ---------------- início ----------------
  async function iniciar() {
    if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('sw.js').catch(() => {});
    // pede ao Android para não apagar os dados do app quando faltar espaço no celular
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persisted().then(j => j || navigator.storage.persist()); } catch (e) {}
    try {
      contas = (await CF.ler('contas')) || {};
      aparelho = Object.assign(aparelho, (await CF.ler('aparelho')) || {});
    } catch (e) { telaLogin('Este navegador não deixa guardar dados. Use o Chrome atualizado.'); return; }
    const u = aparelho.ultimo && contas[aparelho.ultimo];
    if (u && !aparelho.compartilhado && (u.refresh || u.perfis)) {
      try {
        if (navigator.onLine) {
          const t = await tokenDe(u.uid);
          if (!t && !u.refresh) return telaLogin();
          if (t) {
            // continua exigindo a segunda etapa para perfis fortes
            return await garantirDuasEtapas(u);
          }
        }
        return await abrirConta(u.uid, { offline: true });
      } catch (e) { return telaLogin(e.message); }
    }
    telaLogin();
  }
  window.ISM_ENTRADA = { iniciar, tokenDe };
  document.addEventListener('DOMContentLoaded', iniciar);
})();
