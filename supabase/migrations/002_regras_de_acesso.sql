-- =====================================================================
-- ISM Pecuária — regras de acesso, histórico e validações
-- Rode depois do 001_estrutura.sql.
-- As permissões ficam no banco: mesmo com o app aberto, quem não tem
-- acesso não lê nem grava o dado.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Funções de permissão
-- ---------------------------------------------------------------------

-- Verificação em duas etapas concluída nesta sessão?
create or replace function public.mfa_ok() returns boolean
language sql stable as $$
  select coalesce((select valor from public.config where chave = 'exigir_mfa'), 'sim') <> 'sim'
      or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
$$;

create or replace function public.sou_ism() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.ism_equipe where user_id = auth.uid())
$$;

-- Perfis da pessoa logada neste cliente (sem filtrar MFA)
create or replace function public.meus_perfis(c uuid) returns text[]
language sql stable security definer set search_path = public as $$
  select case
    when public.sou_ism() then array['ISM']
    else coalesce((select perfis from public.membros
                   where cliente_id = c and user_id = auth.uid() and ativo), '{}')
  end
$$;

-- Perfis valendo agora: perfis fortes só contam com a verificação em duas etapas
create or replace function public.perfis_efetivos(c uuid) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(p), '{}')
  from unnest(public.meus_perfis(c)) as p
  where public.mfa_ok() or p not in ('ISM','Proprietário','Administrativo')
$$;

create or replace function public.pode(c uuid, a text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.permissoes
                 where acao = a and perfil = any(public.perfis_efetivos(c)))
$$;

-- Nome da pessoa logada neste cliente (para "minhas atividades")
create or replace function public.meu_nome(c uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select nome from public.membros where cliente_id = c and user_id = auth.uid() and ativo),
    (select nome from public.ism_equipe where user_id = auth.uid()))
$$;

create or replace function public.romaneio_aberto(r uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select r is null or exists (select 1 from public.romaneios where id = r and not encerrado and excluido_em is null)
$$;

create or replace function public.pode_atividade(c uuid, nivel text) returns boolean
language sql stable as $$
  select case nivel
    when 'Estratégico' then public.pode(c, 'atv_estrategico')
    when 'Tático'      then public.pode(c, 'atv_tatico')
    else                    public.pode(c, 'atv_operacional') end
$$;

create or replace function public.gere_atividade(c uuid, nivel text) returns boolean
language sql stable as $$
  select public.pode(c, 'atv_criar') and public.pode_atividade(c, nivel)
$$;

-- ---------------------------------------------------------------------
-- Gatilhos: carimbo de atualização, campos protegidos, histórico
-- ---------------------------------------------------------------------
create or replace function public.tg_carimbo() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    new.cliente_id := old.cliente_id;
    if to_jsonb(new) ? 'criado_por' then
      new.criado_por := old.criado_por;
      new.criado_em  := old.criado_em;
    end if;
  else
    if to_jsonb(new) ? 'criado_por' then
      new.criado_por := coalesce(auth.uid(), new.criado_por);
    end if;
  end if;
  new.atualizado_em := clock_timestamp();
  return new;
end $$;

create or replace function public.tg_auditoria() returns trigger
language plpgsql security definer set search_path = public as $$
declare novo jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
        velho jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
        reg jsonb := coalesce(novo, velho);
begin
  insert into public.auditoria (cliente_id, tabela, registro_id, acao, usuario, antes, depois)
  values ((reg ->> 'cliente_id')::uuid, tg_table_name,
          coalesce(reg ->> 'id', reg ->> 'venda_id', reg ->> 'chave'),
          case when tg_op = 'UPDATE' and velho ->> 'excluido_em' is null and novo ->> 'excluido_em' is not null
               then 'EXCLUSAO' else tg_op end,
          auth.uid(), velho, novo);
  return coalesce(new, old);
end $$;

do $$ declare t text; begin
  foreach t in array array['romaneios','animais','pesagens','vendas','vendas_valor','mortes','sanitario','pastos',
                           'supl_fabrica','supl_cocho','atividades','financeiro','importacoes','painel','membros'] loop
    if t not in ('membros') then
      execute format('create trigger %I before insert or update on public.%I for each row execute function public.tg_carimbo()', t || '_carimbo', t);
    end if;
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.tg_auditoria()', t || '_historico', t);
  end loop;
end $$;

-- Eventos de animal: o animal precisa ser do mesmo cliente, existir e a data não pode ser antes da entrada
create or replace function public.tg_valida_evento() returns trigger
language plpgsql security definer set search_path = public as $$
declare a public.animais;
begin
  select * into a from public.animais where id = new.animal_id;
  if a.id is null or a.cliente_id <> new.cliente_id then
    raise exception 'Animal não encontrado neste cliente';
  end if;
  -- exclusão de um lançamento nunca é barrada pelas conferências de data
  if new.excluido_em is not null then return new; end if;
  if new.excluido_em is null and a.excluido_em is not null then
    raise exception 'Animal excluído';
  end if;
  if new.data < a.ent_data then
    raise exception 'Data anterior à entrada do animal (%)', a.ent_data;
  end if;
  if tg_table_name = 'vendas' and new.excluido_em is null
     and exists (select 1 from public.mortes m where m.animal_id = new.animal_id and m.excluido_em is null) then
    raise exception 'Animal com morte lançada';
  end if;
  if tg_table_name = 'mortes' and new.excluido_em is null
     and exists (select 1 from public.vendas v where v.animal_id = new.animal_id and v.excluido_em is null) then
    raise exception 'Animal já vendido';
  end if;
  return new;
end $$;

create trigger pesagens_valida  before insert or update on public.pesagens  for each row execute function public.tg_valida_evento();
create trigger vendas_valida    before insert or update on public.vendas    for each row execute function public.tg_valida_evento();
create trigger mortes_valida    before insert or update on public.mortes    for each row execute function public.tg_valida_evento();
create trigger sanitario_valida before insert or update on public.sanitario for each row execute function public.tg_valida_evento();

-- Valor da venda: calculado no banco (peso ÷ 30 × @), guardado à parte
create or replace function public.tg_venda_valor() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.vendas_valor (venda_id, cliente_id, valor)
    values (new.id, new.cliente_id, round(new.peso / 30 * new.arroba, 2))
    on conflict (venda_id) do nothing;
  elsif new.peso <> old.peso or new.arroba <> old.arroba then
    update public.vendas_valor set valor = round(new.peso / 30 * new.arroba, 2) where venda_id = new.id;
  end if;
  return new;
end $$;
create trigger vendas_valor_auto after insert or update on public.vendas for each row execute function public.tg_venda_valor();

-- Atividades: quem não gerencia o nível só muda a situação das que são suas
create or replace function public.tg_atividade_responsavel() returns trigger
language plpgsql as $$
begin
  if auth.uid() is null or public.gere_atividade(old.cliente_id, old.nivel) then
    return new;
  end if;
  if (to_jsonb(new) - array['situacao','concluida_em','atualizado_em','dispositivo'])
     is distinct from (to_jsonb(old) - array['situacao','concluida_em','atualizado_em','dispositivo']) then
    raise exception 'Você só pode mudar a situação desta atividade';
  end if;
  return new;
end $$;
create trigger atividades_responsavel before update on public.atividades for each row execute function public.tg_atividade_responsavel();

-- ---------------------------------------------------------------------
-- Regras por tabela (Row Level Security)
-- ---------------------------------------------------------------------
alter table public.config       enable row level security;
alter table public.clientes     enable row level security;
alter table public.ism_equipe   enable row level security;
alter table public.membros      enable row level security;
alter table public.permissoes   enable row level security;
alter table public.romaneios    enable row level security;
alter table public.animais      enable row level security;
alter table public.pesagens     enable row level security;
alter table public.vendas       enable row level security;
alter table public.vendas_valor enable row level security;
alter table public.mortes       enable row level security;
alter table public.sanitario    enable row level security;
alter table public.pastos       enable row level security;
alter table public.supl_fabrica enable row level security;
alter table public.supl_cocho   enable row level security;
alter table public.atividades   enable row level security;
alter table public.financeiro   enable row level security;
alter table public.painel       enable row level security;
alter table public.importacoes  enable row level security;
alter table public.auditoria    enable row level security;

create policy ver on public.config     for select to authenticated using (true);
create policy ver on public.permissoes for select to authenticated using (true);
create policy ver on public.ism_equipe for select to authenticated using (user_id = auth.uid());

create policy ver on public.clientes for select to authenticated using (public.pode(id, 'app'));

create policy ver     on public.membros for select to authenticated using (user_id = auth.uid() or public.pode(cliente_id, 'app'));
create policy incluir on public.membros for insert to authenticated with check (public.pode(cliente_id, 'usuarios'));
create policy mudar   on public.membros for update to authenticated using (public.pode(cliente_id, 'usuarios')) with check (public.pode(cliente_id, 'usuarios'));

-- Romaneios e eventos do rebanho
create policy ver     on public.romaneios for select to authenticated using (public.pode(cliente_id, 'rebanho_ver'));
create policy incluir on public.romaneios for insert to authenticated with check (public.pode(cliente_id, 'manejo_lancar'));
create policy mudar   on public.romaneios for update to authenticated
  using (public.pode(cliente_id, 'corrigir') or (public.pode(cliente_id, 'manejo_lancar') and criado_por = auth.uid() and not encerrado))
  with check (public.pode(cliente_id, 'corrigir') or criado_por = auth.uid());

do $$ declare t text; begin
  foreach t in array array['animais','pesagens','vendas','mortes','sanitario'] loop
    execute format($f$create policy ver on public.%I for select to authenticated using (public.pode(cliente_id, 'rebanho_ver'))$f$, t);
    execute format($f$create policy incluir on public.%I for insert to authenticated
                      with check (public.pode(cliente_id, 'manejo_lancar') or public.pode(cliente_id, 'importar'))$f$, t);
    execute format($f$create policy mudar on public.%I for update to authenticated
                      using (public.pode(cliente_id, 'corrigir')
                             or (public.pode(cliente_id, 'manejo_lancar') and criado_por = auth.uid() and public.romaneio_aberto(romaneio_id)))
                      with check (public.pode(cliente_id, 'corrigir') or criado_por = auth.uid())$f$, t);
  end loop;
end $$;

create policy ver   on public.vendas_valor for select to authenticated using (public.pode(cliente_id, 'ver_totais'));
create policy mudar on public.vendas_valor for update to authenticated
  using (public.pode(cliente_id, 'corrigir') or public.pode(cliente_id, 'importar'))
  with check (public.pode(cliente_id, 'corrigir') or public.pode(cliente_id, 'importar'));

-- Pastos
create policy ver     on public.pastos for select to authenticated using (public.pode(cliente_id, 'pastos_ver'));
create policy incluir on public.pastos for insert to authenticated with check (public.pode(cliente_id, 'pastos_editar'));
create policy mudar   on public.pastos for update to authenticated using (public.pode(cliente_id, 'pastos_editar')) with check (public.pode(cliente_id, 'pastos_editar'));

-- Suplementação (cocho e fábrica)
do $$ declare t text; begin
  foreach t in array array['supl_fabrica','supl_cocho'] loop
    execute format($f$create policy ver on public.%I for select to authenticated using (public.pode(cliente_id, 'suplemento'))$f$, t);
    execute format($f$create policy incluir on public.%I for insert to authenticated with check (public.pode(cliente_id, 'suplemento'))$f$, t);
    execute format($f$create policy mudar on public.%I for update to authenticated
                      using (public.pode(cliente_id, 'corrigir')) with check (public.pode(cliente_id, 'corrigir'))$f$, t);
  end loop;
end $$;

-- Atividades por nível
create policy ver on public.atividades for select to authenticated
  using (public.pode_atividade(cliente_id, nivel));
create policy incluir on public.atividades for insert to authenticated
  with check (public.gere_atividade(cliente_id, nivel));
create policy mudar on public.atividades for update to authenticated
  using (public.gere_atividade(cliente_id, nivel)
         or (public.pode_atividade(cliente_id, nivel) and public.meu_nome(cliente_id) = any(responsaveis)))
  with check (public.pode_atividade(cliente_id, nivel));

-- Financeiro: lança quem pode; corrigir só a ISM
create policy ver     on public.financeiro for select to authenticated using (public.pode(cliente_id, 'fin_ver'));
create policy incluir on public.financeiro for insert to authenticated with check (public.pode(cliente_id, 'fin_lancar'));
create policy mudar   on public.financeiro for update to authenticated using (public.pode(cliente_id, 'fin_editar')) with check (public.pode(cliente_id, 'fin_editar'));

-- Painel: números do caixa só para quem vê o financeiro; marca e mapa para todos do cliente
create policy ver     on public.painel for select to authenticated
  using (public.pode(cliente_id, case when chave in ('marca','mapa') then 'app' else 'fin_ver' end));
create policy incluir on public.painel for insert to authenticated with check (public.pode(cliente_id, 'importar'));
create policy mudar   on public.painel for update to authenticated using (public.pode(cliente_id, 'importar')) with check (public.pode(cliente_id, 'importar'));

create policy ver     on public.importacoes for select to authenticated using (public.pode(cliente_id, 'importar'));
create policy incluir on public.importacoes for insert to authenticated with check (public.pode(cliente_id, 'importar'));
create policy mudar   on public.importacoes for update to authenticated using (public.pode(cliente_id, 'importar')) with check (public.pode(cliente_id, 'importar'));

create policy ver on public.auditoria for select to authenticated using (public.pode(cliente_id, 'auditoria'));

-- ---------------------------------------------------------------------
-- Privilégios: ninguém apaga linhas; exclusão é sempre lógica (excluido_em)
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
grant usage on schema public to authenticated;
grant select on public.config, public.permissoes, public.clientes, public.ism_equipe, public.auditoria to authenticated;
grant select, insert, update on public.membros, public.romaneios, public.animais, public.pesagens, public.vendas,
  public.mortes, public.sanitario, public.pastos, public.supl_fabrica, public.supl_cocho, public.atividades,
  public.financeiro, public.painel, public.importacoes to authenticated;
grant select, update on public.vendas_valor to authenticated;
grant usage on all sequences in schema public to authenticated;

-- Funções de uso interno não ficam expostas a quem não está logado
revoke execute on all functions in schema public from anon, public;
grant execute on function public.mfa_ok(), public.sou_ism(), public.meus_perfis(uuid), public.perfis_efetivos(uuid),
  public.pode(uuid, text), public.meu_nome(uuid), public.romaneio_aberto(uuid), public.pode_atividade(uuid, text),
  public.gere_atividade(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- Administração (rodar no SQL Editor, como dono do banco)
-- ---------------------------------------------------------------------

-- Liga um usuário criado em Authentication > Users a um cliente, com nome e perfis
create or replace function public.vincular_usuario(p_email text, p_cliente text, p_nome text, p_funcao text, p_perfis text[])
returns text language plpgsql security definer set search_path = public as $$
declare u uuid; c uuid;
begin
  select id into u from auth.users where lower(email) = lower(p_email);
  if u is null then raise exception 'Usuário % não existe em Authentication > Users', p_email; end if;
  select id into c from public.clientes where nome = p_cliente;
  if c is null then raise exception 'Cliente % não existe', p_cliente; end if;
  if 'ISM' = any(p_perfis) then
    insert into public.ism_equipe (user_id, nome) values (u, p_nome) on conflict (user_id) do update set nome = excluded.nome;
  end if;
  insert into public.membros (cliente_id, user_id, nome, login, funcao, perfis)
  values (c, u, p_nome, split_part(p_email, '@', 1), p_funcao, p_perfis)
  on conflict (cliente_id, nome) do update set user_id = excluded.user_id, login = excluded.login,
       funcao = excluded.funcao, perfis = excluded.perfis, ativo = true;
  return 'ok: ' || p_nome || ' em ' || p_cliente;
end $$;
revoke execute on function public.vincular_usuario(text, text, text, text, text[]) from authenticated;

-- Bloqueia (ou desbloqueia) uma pessoa num cliente
create or replace function public.bloquear_usuario(p_cliente text, p_nome text, p_bloquear boolean default true)
returns text language plpgsql security definer set search_path = public as $$
begin
  update public.membros m set ativo = not p_bloquear
  from public.clientes c where c.id = m.cliente_id and c.nome = p_cliente and m.nome = p_nome;
  if not found then raise exception 'Pessoa % não encontrada em %', p_nome, p_cliente; end if;
  return case when p_bloquear then 'bloqueado: ' else 'liberado: ' end || p_nome;
end $$;
revoke execute on function public.bloquear_usuario(text, text, boolean) from authenticated;
