// Painel da ISM: depois do login, a ISM escolhe o cliente e a fazenda, e gerencia
// clientes, fazendas e pessoas (logins, perfis, senhas, duas etapas, ações extras).
// Tudo passa por funções do banco que só aceitam a ISM com duas etapas (migração 008).
(function () {
  'use strict';
  const PERFIS = ['Proprietário', 'Administrativo', 'Gerente', 'Vaqueiro', 'Fábrica de ração', 'Serviços gerais'];
  const MODULOS = [['financeiro', 'Financeiro'], ['rebanho', 'Rebanho e manejo'], ['suplemento', 'Suplemento'], ['atividades', 'Atividades'], ['mapa', 'Mapa']];
  const ACOES = [['fin_ver', 'Ver o caixa'], ['fin_lancar', 'Lançar no caixa'], ['fin_editar', 'Editar o caixa'], ['ver_totais', 'Ver totais de venda'],
    ['rebanho_ver', 'Ver o rebanho'], ['manejo_lancar', 'Lançar manejo'], ['corrigir', 'Corrigir romaneios, fábrica e cocho'],
    ['suplemento', 'Lançar suplemento'], ['pastos_editar', 'Editar pastos'], ['atv_estrategico', 'Atividades estratégicas'],
    ['atv_tatico', 'Atividades táticas'], ['atv_criar', 'Criar atividades'], ['importar', 'Importar planilhas'], ['exportar', 'Exportar relatórios']];

  let X = null;            // contexto vindo da entrada: tela, aviso, ocupado, esc, $, rpc, dominio, abrirFazenda, recarregarFazendas, nome
  let LISTA = [];          // clientes com fazendas

  const esc = v => X.esc(v);
  const chk = (nome, val, txt, marcado) => '<label class="chip ech"><input type="checkbox" name="' + nome + '" value="' + esc(val) + '"' + (marcado ? ' checked' : '') + '><span>' + esc(txt) + '</span></label>';
  const senhaSugerida = () => { const a = 'abcdefghjkmnpqrstuvwxyz', n = '23456789'; let s = ''; for (let i = 0; i < 6; i++) s += a[Math.floor(Math.random() * a.length)]; for (let i = 0; i < 3; i++) s += n[Math.floor(Math.random() * n.length)]; return s; };
  async function chamar(nome, args, b) {
    if (b) X.ocupado(b, true);
    try { return await X.rpc(nome, args); }
    catch (e) { X.aviso(e.message || 'Não foi possível concluir.', 'erro'); throw e; }
    finally { if (b) X.ocupado(b, false); }
  }

  // ---------------- tela 1: clientes e fazendas ----------------
  async function painel(msg) {
    X.tela('<h2 class="ct">Painel da ISM</h2><p class="hint">Carregando clientes…</p><p id="entrada-aviso" class="eaviso"></p>');
    try { LISTA = await X.rpc('ism_clientes', {}); }
    catch (e) {
      if (e.rede) return X.semInternet();
      X.tela('<h2 class="ct">Painel da ISM</h2><p id="entrada-aviso" class="eaviso erro"></p><button class="btn ghost wide" id="ism-faz">Ver só as fazendas</button>');
      X.aviso(/ism_clientes|function|não existe|does not exist/i.test(e.message) ? 'O painel ainda não foi instalado no banco (atualização 008).' : e.message, 'erro');
      X.$('#ism-faz').onclick = () => X.semInternet();
      return;
    }
    X.tela(`<h2 class="ct">Painel da ISM</h2>
      <p class="hint">Olá, ${esc(X.nome)}. Escolha o cliente e a fazenda para abrir, ou gerencie fazendas e pessoas.</p>
      <p id="entrada-aviso" class="eaviso"></p>
      <div class="ism-cli">${LISTA.map((g, i) => `
        <section class="ism-g">
          <header><b>${esc(g.nome)}</b>${g.id ? `<button type="button" class="lnk" data-ren="${i}">Renomear</button>` : ''}</header>
          <div class="ulist">${g.fazendas.map(f => `
            <div class="ucard ism-f"><b>${esc(f.nome)}</b><span>${(f.modulos || []).includes('demonstracao') ? 'Demonstração · dados fictícios' : (f.pessoas + ' pessoa(s) · ' + ((f.modulos || []).filter(m => m !== 'demonstracao').length) + ' módulo(s)')}</span>
              <div class="ism-ac"><button type="button" class="btn sm" data-abrir="${esc(f.id)}">Abrir</button><button type="button" class="btn ghost sm" data-ger="${esc(f.id)}">Gerenciar</button></div></div>`).join('')}
            ${g.id ? `<button type="button" class="ucard ism-nova" data-novaf="${i}"><b>+ Nova fazenda</b><span>para ${esc(g.nome)}</span></button>` : ''}
          </div>
        </section>`).join('')}</div>
      <button type="button" class="btn wide" id="ism-novoc">+ Novo cliente</button>
      <button type="button" class="btn ghost wide" id="ism-sair">Sair</button>`);
    if (msg) X.aviso(msg, 'ok');
    const corpo = X.$('#entrada-corpo');
    corpo.onclick = async e => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.dataset.abrir) return X.abrirFazenda(t.dataset.abrir);
      if (t.dataset.ger) return fazenda(t.dataset.ger);
      if (t.dataset.novaf) return formFazenda(LISTA[+t.dataset.novaf]);
      if (t.dataset.ren) {
        const g = LISTA[+t.dataset.ren], n = prompt('Novo nome do cliente:', g.nome);
        if (!n || n.trim() === g.nome) return;
        await chamar('ism_salvar_cliente', { p_id: g.id, p_nome: n.trim() }, t); return painel('Cliente renomeado.');
      }
      if (t.id === 'ism-novoc') {
        const n = prompt('Nome do novo cliente (ex.: nome do dono ou da empresa):');
        if (!n || !n.trim()) return;
        if (!confirm('Cadastrar o cliente "' + n.trim() + '"?')) return;
        await chamar('ism_salvar_cliente', { p_id: null, p_nome: n.trim() }, t); return painel('Cliente ' + n.trim() + ' cadastrado. Agora cadastre a fazenda dele.');
      }
      if (t.id === 'ism-sair') return X.sair();
    };
  }

  const achaFaz = id => { for (const g of LISTA) for (const f of g.fazendas) if (f.id === id) return { g, f }; return {}; };

  // ---------------- nova fazenda / módulos ----------------
  function formFazenda(g, f) {
    const mods = f ? f.modulos || [] : ['financeiro', 'rebanho', 'suplemento', 'atividades', 'mapa'];
    X.tela(`<h2 class="ct">${f ? 'Fazenda ' + esc(f.nome) : 'Nova fazenda'}</h2>
      <p class="hint">Cliente: <b>${esc(g.nome)}</b>.${f ? '' : ' A fazenda começa com o plano de contas do caixa da Barramas (só os nomes dos centros e itens).'}</p>
      <form class="eform" id="ism-ff">
        <label>Nome da fazenda<input name="nome" required value="${esc(f ? f.nome : '')}" placeholder="Ex.: Fazenda Santa Rita"></label>
        <fieldset><legend>Pacote: abas que a fazenda usa</legend>${MODULOS.map(([k, t]) => chk('mod', k, t, mods.includes(k))).join('')}</fieldset>
        <button class="btn wide" type="submit">${f ? 'Salvar' : 'Cadastrar fazenda'}</button>
        <button class="btn ghost wide" type="button" id="ism-volta">Voltar</button>
      </form><p id="entrada-aviso" class="eaviso"></p>`);
    X.$('#ism-volta').onclick = () => f ? fazenda(f.id) : painel();
    X.$('#ism-ff').onsubmit = async e => {
      e.preventDefault(); const fd = new FormData(e.target), nome = String(fd.get('nome') || '').trim();
      let m = fd.getAll('mod'); if (f && (f.modulos || []).includes('demonstracao')) m = m.concat('demonstracao');
      if (!nome) return X.aviso('Informe o nome da fazenda.', 'erro');
      if (!m.length) return X.aviso('Marque pelo menos uma aba.', 'erro');
      if (!confirm((f ? 'Salvar a fazenda ' : 'Cadastrar a fazenda ') + nome + ' para ' + g.nome + '?')) return;
      const id = await chamar('ism_salvar_fazenda', { p_id: f ? f.id : null, p_grupo: g.id, p_nome: nome, p_modulos: m }, e.target.querySelector('button'));
      await X.recarregarFazendas(); LISTA = await X.rpc('ism_clientes', {});
      fazenda(id, f ? 'Fazenda salva.' : 'Fazenda ' + nome + ' cadastrada. Agora cadastre as pessoas.');
    };
  }

  // ---------------- tela 2: fazenda e pessoas ----------------
  async function fazenda(id, msg) {
    const { g, f } = achaFaz(id); if (!f) return painel();
    X.tela('<h2 class="ct">' + esc(f.nome) + '</h2><p class="hint">Carregando pessoas…</p><p id="entrada-aviso" class="eaviso"></p>');
    let P = [];
    try { P = await X.rpc('ism_pessoas', { p_fazenda: id }); } catch (e) { X.aviso(e.message, 'erro'); }
    const sit = p => [!p.ativo ? '<b class="neg">bloqueado</b>' : '', p.provisoria ? 'senha provisória' : '', p.dispensa_mfa ? 'sem duas etapas' : '',
      (p.extras || []).length ? 'extras: ' + p.extras.map(a => (ACOES.find(x => x[0] === a) || [a, a])[1].toLowerCase()).join(', ') : '',
      (p.outras || []).length ? 'também em ' + p.outras.join(', ') : ''].filter(Boolean).join(' · ');
    X.tela(`<h2 class="ct">${esc(f.nome)}</h2>
      <p class="hint">Cliente: <b>${esc(g.nome)}</b> · Abas: ${esc((f.modulos || []).filter(m => m !== 'demonstracao').map(m => (MODULOS.find(x => x[0] === m) || [m, m])[1]).join(', ') || 'nenhuma')}</p>
      <p id="entrada-aviso" class="eaviso"></p>
      <div class="ism-ac"><button type="button" class="btn sm" id="ism-abrir">Abrir a fazenda</button><button type="button" class="btn ghost sm" id="ism-mods">Nome e abas</button></div>
      <h3 class="sub" style="margin-top:8px">Pessoas (${P.filter(p => p.ativo).length} ativas)</h3>
      <div class="ulist">${P.map((p, i) => `<button type="button" class="ucard" data-p="${i}"><b>${esc(p.nome)}</b><span>${esc(p.login || '')} · ${esc((p.perfis || []).join(' + '))}${p.funcao ? ' · ' + esc(p.funcao) : ''}</span>${sit(p) ? '<span>' + sit(p) + '</span>' : ''}</button>`).join('') || '<p class="mut">Ninguém cadastrado ainda.</p>'}</div>
      <button type="button" class="btn wide" id="ism-novap">+ Nova pessoa</button>
      <button type="button" class="btn ghost wide" id="ism-volta">Voltar aos clientes</button>`);
    if (msg) X.aviso(msg, 'ok');
    X.$('#ism-abrir').onclick = () => X.abrirFazenda(id);
    X.$('#ism-mods').onclick = () => formFazenda(g, f);
    X.$('#ism-volta').onclick = () => painel();
    X.$('#ism-novap').onclick = () => formPessoa(f);
    X.$('#entrada-corpo').onclick = e => { const b = e.target.closest('[data-p]'); if (b) editarPessoa(f, P[+b.dataset.p]); };
  }

  function formPessoa(f) {
    const sug = senhaSugerida();
    X.tela(`<h2 class="ct">Nova pessoa · ${esc(f.nome)}</h2>
      <p class="hint">A pessoa entra com o login e a senha provisória e cria a própria senha no primeiro acesso. Se o login já existir (ex.: o dono de duas fazendas), ela só é ligada a esta fazenda e continua com a senha dela.</p>
      <form class="eform" id="ism-fp" autocomplete="off">
        <label>Nome (como aparece no app)<input name="nome" required placeholder="Ex.: João"></label>
        <label>Login<input name="login" required autocapitalize="none" spellcheck="false" placeholder="Ex.: joao.silva"></label>
        <label>Senha provisória<input name="senha" value="${sug}" autocapitalize="none" spellcheck="false"></label>
        <label>Função<input name="funcao" placeholder="Ex.: Vaqueiro, Tratorista"></label>
        <fieldset><legend>Perfil</legend>${PERFIS.map(p => chk('perfil', p, p, false)).join('')}</fieldset>
        <button class="btn wide" type="submit">Cadastrar pessoa</button>
        <button class="btn ghost wide" type="button" id="ism-volta">Voltar</button>
      </form><p id="entrada-aviso" class="eaviso"></p>`);
    X.$('#ism-volta').onclick = () => fazenda(f.id);
    X.$('#ism-fp').onsubmit = async e => {
      e.preventDefault(); const fd = new FormData(e.target);
      const nome = String(fd.get('nome') || '').trim(), login = String(fd.get('login') || '').trim().toLowerCase(), senha = String(fd.get('senha') || ''), perfis = fd.getAll('perfil');
      if (!nome || !login) return X.aviso('Informe o nome e o login.', 'erro');
      if (!/^[a-z0-9._-]+$/.test(login)) return X.aviso('Login só com letras minúsculas sem acento, números, ponto ou traço.', 'erro');
      if (!perfis.length) return X.aviso('Marque pelo menos um perfil.', 'erro');
      if (!confirm('Cadastrar ' + nome + ' (' + perfis.join(' + ') + ') na ' + f.nome + ' com o login "' + login + '"?')) return;
      const r = await chamar('ism_criar_pessoa', { p_fazenda: f.id, p_nome: nome, p_email: login + '@' + X.dominio, p_senha: senha, p_funcao: String(fd.get('funcao') || ''), p_perfis: perfis }, e.target.querySelector('button'));
      LISTA = await X.rpc('ism_clientes', {});
      X.tela(`<h2 class="ct">${esc(nome)} cadastrado(a)</h2>
        ${r.novo ? `<p class="hint">Passe estes dados para a pessoa. No primeiro acesso o app pede para ela criar a própria senha.</p>
          <div class="ism-cred"><div><small>Login</small><b class="mono">${esc(r.login)}</b></div><div><small>Senha provisória</small><b class="mono">${esc(senha)}</b></div></div>`
          : `<p class="hint">O login <b>${esc(r.login)}</b> já existia: a pessoa foi ligada a esta fazenda e continua entrando com a senha dela.</p>`}
        <button class="btn wide" id="ism-ok">Voltar para a fazenda</button>`);
      X.$('#ism-ok').onclick = () => fazenda(f.id);
    };
  }

  function editarPessoa(f, p) {
    X.tela(`<h2 class="ct">${esc(p.nome)}</h2>
      <p class="hint">Login: <b class="mono">${esc(p.login || '')}</b> · ${esc(f.nome)}${(p.outras || []).length ? ' · também em ' + esc(p.outras.join(', ')) : ''}</p>
      <form class="eform" id="ism-ep">
        <label>Função<input name="funcao" value="${esc(p.funcao || '')}"></label>
        <fieldset><legend>Perfil</legend>${PERFIS.map(x => chk('perfil', x, x, (p.perfis || []).includes(x))).join('')}</fieldset>
        <fieldset><legend>Ações a mais, só para esta pessoa</legend>${ACOES.map(([k, t]) => chk('extra', k, t, (p.extras || []).includes(k))).join('')}</fieldset>
        <fieldset><legend>Acesso</legend>
          ${chk('dispensa', '1', 'Dispensar a verificação em duas etapas', p.dispensa_mfa)}
          ${chk('bloq', '1', 'Bloquear o acesso (saiu da fazenda)', !p.ativo)}</fieldset>
        <button class="btn wide" type="submit">Salvar alterações</button>
      </form>
      <button class="btn ghost wide" id="ism-senha">Nova senha provisória</button>
      <button class="btn ghost wide" id="ism-autent">Celular perdido: apagar o autenticador</button>
      <button class="btn ghost wide" id="ism-volta">Voltar</button>
      <p id="entrada-aviso" class="eaviso"></p>`);
    X.$('#ism-volta').onclick = () => fazenda(f.id);
    X.$('#ism-ep').onsubmit = async e => {
      e.preventDefault(); const fd = new FormData(e.target), perfis = fd.getAll('perfil');
      if (!perfis.length) return X.aviso('Marque pelo menos um perfil.', 'erro');
      const bloq = !!fd.get('bloq');
      if (!confirm(bloq && p.ativo ? 'BLOQUEAR o acesso de ' + p.nome + '? Ele(a) não entra mais e os dados somem do celular dele(a).' : 'Salvar as alterações de ' + p.nome + '?')) return;
      await chamar('ism_editar_pessoa', { p_membro: p.id, p_funcao: String(fd.get('funcao') || ''), p_perfis: perfis, p_extras: fd.getAll('extra'),
        p_dispensa_mfa: !!fd.get('dispensa'), p_ativo: !bloq }, e.target.querySelector('button'));
      LISTA = await X.rpc('ism_clientes', {});
      fazenda(f.id, p.nome + ': alterações salvas.');
    };
    X.$('#ism-senha').onclick = async e => {
      const s = prompt('Senha provisória para ' + p.nome + ' (mínimo 8 caracteres):', senhaSugerida());
      if (!s) return; if (s.length < 8) return X.aviso('A senha precisa ter pelo menos 8 caracteres.', 'erro');
      if (!confirm('Trocar a senha de ' + p.nome + ' para "' + s + '"? No próximo acesso ele(a) cria uma senha nova.')) return;
      await chamar('ism_redefinir_senha', { p_membro: p.id, p_senha: s }, e.target);
      X.aviso('Senha provisória de ' + p.nome + ': ' + s + ' (passe para a pessoa).', 'ok');
    };
    X.$('#ism-autent').onclick = async e => {
      if (!confirm('Apagar o aplicativo autenticador de ' + p.nome + '? No próximo acesso ele(a) cadastra de novo, lendo o código no celular novo.')) return;
      await chamar('ism_zerar_autenticador', { p_membro: p.id }, e.target);
      X.aviso('Autenticador de ' + p.nome + ' apagado.', 'ok');
    };
  }

  window.ISM_PAINEL = { abrir: (ctx, msg) => { X = ctx; return painel(msg); } };
})();
