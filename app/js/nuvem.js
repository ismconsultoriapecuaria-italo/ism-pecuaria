// Conversa com o Supabase (login, verificação em duas etapas e banco), só com fetch.
(function () {
  'use strict';
  const CFG = window.ISM_CONFIG;
  const base = CFG.SUPABASE_URL.replace(/\/+$/, '');

  class ErroNuvem extends Error {
    constructor(msg, status, codigo, rede) { super(msg); this.status = status; this.codigo = codigo; this.rede = !!rede; }
  }

  function traduzir(status, corpo) {
    const c = corpo || {}, cod = c.code || c.error_code || c.error || '', m = c.message || c.msg || c.error_description || '';
    if (cod === 'invalid_grant' || cod === 'invalid_credentials' || /invalid login/i.test(m)) return 'Login ou senha incorretos.';
    if (cod === '42501' || /row-level security/i.test(m)) return 'Seu perfil não permite este lançamento.';
    if (cod === '23505') return 'Registro repetido: já existe um igual.';
    if (cod === '23514') return 'Algum valor está fora do permitido.';
    if (cod === '23503') return 'O registro ligado a este lançamento não existe mais.';
    if (cod === 'P0001' && m) return m;                       // mensagens dos gatilhos, já em português
    if (/invalid totp|invalid code|mfa_verification_failed/i.test(cod + ' ' + m)) return 'Código incorreto. Confira no aplicativo autenticador.';
    if (/weak_password|password should be/i.test(cod + ' ' + m)) return 'Senha fraca: use pelo menos 8 caracteres, com letras e números.';
    if (status === 401 || /jwt expired/i.test(m)) return 'Sessão expirada. Entre de novo.';
    if (status === 429) return 'Muitas tentativas. Espere um minuto e tente de novo.';
    if (status >= 500) return 'O servidor não respondeu direito. Tente de novo daqui a pouco.';
    return 'Não foi possível concluir (' + (m || status) + ').';
  }

  async function chamar(caminho, { metodo = 'GET', token, corpo, prefer, cabecalhos } = {}) {
    const h = { apikey: CFG.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + (token || CFG.SUPABASE_ANON_KEY) };
    if (corpo !== undefined) h['Content-Type'] = 'application/json';
    if (prefer) h.Prefer = prefer;
    Object.assign(h, cabecalhos || {});
    let r;
    try {
      r = await fetch(base + caminho, { method: metodo, headers: h, body: corpo === undefined ? undefined : JSON.stringify(corpo), cache: 'no-store' });
    } catch (e) {
      throw new ErroNuvem('Sem conexão com a internet.', 0, 'rede', true);
    }
    const txt = await r.text();
    let j = null;
    try { j = txt ? JSON.parse(txt) : null; } catch (e) { j = null; }
    if (!r.ok) throw new ErroNuvem(traduzir(r.status, j), r.status, (j && (j.code || j.error_code || j.error)) || '');
    return { dados: j, cabecalhos: r.headers };
  }

  const emailDe = login => {
    const l = String(login || '').trim().toLowerCase();
    return l.includes('@') ? l : l + '@' + CFG.DOMINIO_LOGIN;
  };
  const sessao = d => ({ access_token: d.access_token, refresh_token: d.refresh_token,
    expira: Date.now() + (d.expires_in || 3600) * 1000, user: d.user });

  function lerToken(t) {
    try { return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch (e) { return {}; }
  }

  window.Nuvem = {
    ErroNuvem, emailDe, lerToken,
    configurado: () => !/SEU-PROJETO|COLE-AQUI/.test(CFG.SUPABASE_URL + CFG.SUPABASE_ANON_KEY),
    async entrar(login, senha) {
      const { dados } = await chamar('/auth/v1/token?grant_type=password', { metodo: 'POST', corpo: { email: emailDe(login), password: senha } });
      return sessao(dados);
    },
    async renovar(refresh) {
      const { dados } = await chamar('/auth/v1/token?grant_type=refresh_token', { metodo: 'POST', corpo: { refresh_token: refresh } });
      return sessao(dados);
    },
    async sair(token) { try { await chamar('/auth/v1/logout', { metodo: 'POST', token, corpo: {} }); } catch (e) {} },
    async usuario(token) { return (await chamar('/auth/v1/user', { token })).dados; },
    async trocarSenha(token, nova) { return (await chamar('/auth/v1/user', { metodo: 'PUT', token, corpo: { password: nova } })).dados; },
    async inscreverTotp(token) {
      return (await chamar('/auth/v1/factors', { metodo: 'POST', token, corpo: { factor_type: 'totp', friendly_name: 'ISM Pecuária ' + Date.now().toString(36) } })).dados;
    },
    async desafiar(token, fator) { return (await chamar('/auth/v1/factors/' + fator + '/challenge', { metodo: 'POST', token, corpo: {} })).dados; },
    async verificar(token, fator, desafio, codigo) {
      const { dados } = await chamar('/auth/v1/factors/' + fator + '/verify', { metodo: 'POST', token, corpo: { challenge_id: desafio, code: String(codigo).replace(/\D/g, '') } });
      return sessao(dados);
    },
    async removerFator(token, fator) { try { await chamar('/auth/v1/factors/' + fator, { metodo: 'DELETE', token }); } catch (e) {} },
    // Banco (PostgREST)
    async ler(token, tabela, consulta) { return (await chamar('/rest/v1/' + tabela + '?' + consulta, { token })).dados || []; },
    async inserir(token, tabela, linhas) {
      return chamar('/rest/v1/' + tabela, { metodo: 'POST', token, corpo: linhas, prefer: 'return=minimal,resolution=ignore-duplicates' });
    },
    async alterar(token, tabela, filtro, campos) {
      // pede de volta as linhas alteradas: se o banco não alterou nenhuma, é porque o perfil não pode
      const { dados } = await chamar('/rest/v1/' + tabela + '?' + filtro + '&select=' + (tabela === 'vendas_valor' ? 'venda_id' : tabela === 'painel' ? 'chave' : 'id'),
        { metodo: 'PATCH', token, corpo: campos, prefer: 'return=representation' });
      if (!Array.isArray(dados) || !dados.length) throw new ErroNuvem('Seu perfil não permite alterar este lançamento.', 403, '42501');
      return dados;
    },
    async funcao(token, nome, args) { return (await chamar('/rest/v1/rpc/' + nome, { metodo: 'POST', token, corpo: args || {} })).dados; }
  };
})();
