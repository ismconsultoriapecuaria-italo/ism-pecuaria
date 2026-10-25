-- =====================================================================
-- ISM Pecuária · 008 · Painel da ISM: clientes, fazendas e pessoas pelo app
-- Cliente da ISM (ex.: Wilmington Viana) → uma ou mais fazendas (tabela
-- "clientes", que já existia) → pessoas de cada fazenda (membros).
-- Só a ISM, com duas etapas, usa estas funções. Rode uma vez no SQL Editor.
-- =====================================================================

-- Clientes da ISM (donos de uma ou mais fazendas)
create table if not exists public.grupos (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null unique,
  criado_em timestamptz not null default now()
);
alter table public.grupos enable row level security;
drop policy if exists ver on public.grupos;
create policy ver on public.grupos for select to authenticated using (public.sou_ism());
grant select on public.grupos to authenticated;
alter table public.clientes add column if not exists grupo_id uuid references public.grupos(id);

insert into public.grupos (nome) values ('Wilmington Viana'), ('ISM · Demonstração') on conflict (nome) do nothing;
update public.clientes set grupo_id = (select id from public.grupos where nome = 'Wilmington Viana')
 where nome = 'Fazenda Barramas' and grupo_id is null;
update public.clientes set grupo_id = (select id from public.grupos where nome = 'ISM · Demonstração')
 where nome = 'Fazenda Demonstração' and grupo_id is null;

-- Senha provisória: quem está aqui precisa criar a própria senha ao entrar
create table if not exists public.senha_provisoria (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  criado_em timestamptz not null default now()
);
alter table public.senha_provisoria enable row level security;

create or replace function public.preciso_trocar_senha() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.senha_provisoria where user_id = auth.uid())
$$;
create or replace function public.senha_trocada() returns void
language sql security definer set search_path = public as $$
  delete from public.senha_provisoria where user_id = auth.uid()
$$;
grant execute on function public.preciso_trocar_senha(), public.senha_trocada() to authenticated;

-- Só a ISM, com duas etapas
create or replace function public.ism_exige() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.sou_ism() or not public.mfa_ok() then raise exception 'Só a ISM (com duas etapas) pode fazer isso'; end if;
end $$;

-- Lista para o painel: clientes, fazendas e quantas pessoas ativas
create or replace function public.ism_fazendas_de(p_grupo uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome, 'tipo', c.tipo, 'modulos', c.modulos,
           'pessoas', (select count(*) from public.membros m where m.cliente_id = c.id and m.ativo)) order by c.nome), '[]')
    from public.clientes c where c.grupo_id is not distinct from p_grupo
$$;
create or replace function public.ism_clientes() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.ism_exige();
  return coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'nome', x.nome, 'fazendas', public.ism_fazendas_de(x.id)) order by x.ord, x.nome)
    from (select 0 as ord, id, nome from public.grupos
          union all
          select 1, null, 'Sem cliente' where exists (select 1 from public.clientes where grupo_id is null)) x), '[]');
end $$;

create or replace function public.ism_salvar_cliente(p_id uuid, p_nome text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  perform public.ism_exige();
  if coalesce(trim(p_nome), '') = '' then raise exception 'Informe o nome do cliente'; end if;
  if p_id is null then insert into public.grupos (nome) values (trim(p_nome)) returning id into v;
  else update public.grupos set nome = trim(p_nome) where id = p_id returning id into v; end if;
  return v;
end $$;

-- Cria ou altera uma fazenda; fazenda nova recebe o plano de contas da Barramas (só os nomes)
create or replace function public.ism_salvar_fazenda(p_id uuid, p_grupo uuid, p_nome text, p_modulos text[], p_tipo text default 'fazenda')
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid; plano jsonb;
begin
  perform public.ism_exige();
  if coalesce(trim(p_nome), '') = '' then raise exception 'Informe o nome da fazenda'; end if;
  if exists (select 1 from unnest(p_modulos) x where x not in ('financeiro','rebanho','suplemento','atividades','mapa','demonstracao')) then
    raise exception 'Módulo desconhecido';
  end if;
  if p_id is null then
    insert into public.clientes (nome, tipo, modulos, grupo_id) values (trim(p_nome), coalesce(p_tipo, 'fazenda'), p_modulos, p_grupo) returning id into v;
    select jsonb_agg(distinct jsonb_build_array(e -> 0, e -> 1, e -> 2, e -> 3)) into plano
      from public.painel p, jsonb_array_elements(p.dados -> 'k') e
     where p.chave = 'D' and p.cliente_id = (select id from public.clientes where nome = 'Fazenda Barramas');
    if plano is not null then insert into public.painel (cliente_id, chave, dados) values (v, 'plano', plano); end if;
    insert into public.painel (cliente_id, chave, dados) values (v, 'marca', jsonb_build_object('subtitulo', 'Gestão pecuária'))
      on conflict do nothing;
  else
    update public.clientes set nome = trim(p_nome), modulos = p_modulos, grupo_id = p_grupo, tipo = coalesce(p_tipo, tipo)
     where id = p_id returning id into v;
    if v is null then raise exception 'Fazenda não encontrada'; end if;
  end if;
  return v;
end $$;

-- Pessoas de uma fazenda
create or replace function public.ism_pessoas(p_fazenda uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.ism_exige();
  return coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'nome', m.nome, 'login', m.login, 'funcao', m.funcao,
      'perfis', m.perfis, 'ativo', m.ativo, 'dispensa_mfa', m.dispensa_mfa, 'extras', m.extras,
      'provisoria', exists (select 1 from public.senha_provisoria s where s.user_id = m.user_id),
      'outras', (select coalesce(jsonb_agg(c2.nome), '[]') from public.membros m2 join public.clientes c2 on c2.id = m2.cliente_id
                  where m2.user_id = m.user_id and m2.cliente_id <> m.cliente_id and m2.ativo))
      order by m.ativo desc, m.nome)
    from public.membros m where m.cliente_id = p_fazenda), '[]');
end $$;

-- Cria a pessoa (login + senha provisória) e liga à fazenda.
-- Se o login já existe (ex.: o dono com duas fazendas), só liga, sem mudar a senha.
create or replace function public.ism_criar_pessoa(p_fazenda uuid, p_nome text, p_email text, p_senha text, p_funcao text, p_perfis text[])
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare u uuid; novo boolean := false; e text := lower(trim(p_email));
begin
  perform public.ism_exige();
  if coalesce(trim(p_nome), '') = '' then raise exception 'Informe o nome'; end if;
  if e !~ '^[a-z0-9._-]+@[a-z0-9.-]+$' then raise exception 'Login inválido: use letras minúsculas, números, ponto ou traço'; end if;
  if coalesce(array_length(p_perfis, 1), 0) = 0 then raise exception 'Escolha pelo menos um perfil'; end if;
  if 'ISM' = any(p_perfis) then raise exception 'Perfil ISM não é dado por aqui'; end if;
  if not exists (select 1 from public.clientes where id = p_fazenda) then raise exception 'Fazenda não encontrada'; end if;
  if exists (select 1 from public.membros where cliente_id = p_fazenda and nome = trim(p_nome)) then
    raise exception 'Já existe alguém chamado % nesta fazenda', trim(p_nome);
  end if;
  select id into u from auth.users where lower(email) = e;
  if u is null then
    if coalesce(length(p_senha), 0) < 8 then raise exception 'A senha provisória precisa ter pelo menos 8 caracteres'; end if;
    u := gen_random_uuid(); novo := true;
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated', e, crypt(p_senha, gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}', jsonb_build_object('nome', trim(p_nome)), now(), now(), '', '', '', '');
    insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (u::text, u, jsonb_build_object('sub', u::text, 'email', e, 'email_verified', true), 'email', now(), now(), now());
    insert into public.senha_provisoria (user_id) values (u) on conflict do nothing;
  end if;
  if exists (select 1 from public.membros where cliente_id = p_fazenda and user_id = u) then
    raise exception 'Esse login já está nesta fazenda';
  end if;
  insert into public.membros (cliente_id, user_id, nome, login, funcao, perfis)
  values (p_fazenda, u, trim(p_nome), split_part(e, '@', 1), nullif(trim(p_funcao), ''), p_perfis);
  return jsonb_build_object('novo', novo, 'login', split_part(e, '@', 1));
end $$;

-- Altera perfis, função, ações extras, duas etapas e bloqueio de uma pessoa
create or replace function public.ism_editar_pessoa(p_membro uuid, p_funcao text, p_perfis text[], p_extras text[], p_dispensa_mfa boolean, p_ativo boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.ism_exige();
  if coalesce(array_length(p_perfis, 1), 0) = 0 then raise exception 'Escolha pelo menos um perfil'; end if;
  if 'ISM' = any(p_perfis) then raise exception 'Perfil ISM não é dado por aqui'; end if;
  if exists (select 1 from unnest(coalesce(p_extras, '{}')) x where x not in (select acao from public.permissoes)) then
    raise exception 'Ação desconhecida';
  end if;
  update public.membros set funcao = nullif(trim(p_funcao), ''), perfis = p_perfis, extras = coalesce(p_extras, '{}'),
         dispensa_mfa = coalesce(p_dispensa_mfa, false), ativo = coalesce(p_ativo, true)
   where id = p_membro and not ('ISM' = any(perfis));
  if not found then raise exception 'Pessoa não encontrada'; end if;
end $$;

-- Nova senha provisória (a pessoa cria a dela ao entrar)
create or replace function public.ism_redefinir_senha(p_membro uuid, p_senha text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare u uuid;
begin
  perform public.ism_exige();
  if coalesce(length(p_senha), 0) < 8 then raise exception 'A senha provisória precisa ter pelo menos 8 caracteres'; end if;
  select user_id into u from public.membros where id = p_membro and not ('ISM' = any(perfis));
  if u is null then raise exception 'Pessoa não encontrada'; end if;
  update auth.users set encrypted_password = crypt(p_senha, gen_salt('bf')), updated_at = now() where id = u;
  insert into public.senha_provisoria (user_id) values (u) on conflict do nothing;
end $$;

-- Celular perdido: apaga o aplicativo autenticador; no próximo acesso a pessoa cadastra de novo
create or replace function public.ism_zerar_autenticador(p_membro uuid) returns void
language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  perform public.ism_exige();
  select user_id into u from public.membros where id = p_membro and not ('ISM' = any(perfis));
  if u is null then raise exception 'Pessoa não encontrada'; end if;
  if to_regclass('auth.mfa_factors') is not null then execute 'delete from auth.mfa_factors where user_id = $1' using u; end if;
end $$;

revoke execute on function public.ism_exige(), public.ism_fazendas_de(uuid), public.ism_clientes(), public.ism_salvar_cliente(uuid, text),
  public.ism_salvar_fazenda(uuid, uuid, text, text[], text), public.ism_pessoas(uuid),
  public.ism_criar_pessoa(uuid, text, text, text, text, text[]),
  public.ism_editar_pessoa(uuid, text, text[], text[], boolean, boolean),
  public.ism_redefinir_senha(uuid, text), public.ism_zerar_autenticador(uuid) from public, anon;
grant execute on function public.ism_clientes(), public.ism_salvar_cliente(uuid, text),
  public.ism_salvar_fazenda(uuid, uuid, text, text[], text), public.ism_pessoas(uuid),
  public.ism_criar_pessoa(uuid, text, text, text, text, text[]),
  public.ism_editar_pessoa(uuid, text, text[], text[], boolean, boolean),
  public.ism_redefinir_senha(uuid, text), public.ism_zerar_autenticador(uuid) to authenticated;
