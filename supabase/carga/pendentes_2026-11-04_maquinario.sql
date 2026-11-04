-- =====================================================================
-- ISM Pecuária · 012 · aba Maquinário (pedido do Italo, 04/11/2026)
-- Horas trabalhadas por máquina: o tratorista lança, a cada uso, o horímetro
-- inicial e o final, cada um com foto do painel. O app lê o número da foto e
-- avisa a ISM e o proprietário quando não bate com o digitado (ou quando o
-- início não continua do fim do uso anterior). Total de horas por mês; mês
-- fechado só a ISM e o proprietário corrigem.
-- Manutenção: data, horímetro, o que foi feito e daqui a quantas horas fazer
-- de novo; alerta para os três quando faltar 50 h ou menos.
-- Acesso: ação 'maquinas' (ISM, Proprietário e, por pessoa, o tratorista) e
-- 'maquinas_gerir' (ISM e Proprietário: corrigem mês fechado, conferem fotos,
-- cadastram máquinas). Módulo da fazenda: 'maquinas'.
-- Rode uma vez no SQL Editor.
-- =====================================================================

insert into public.permissoes (acao, perfil) values
  ('maquinas', 'ISM'), ('maquinas', 'Proprietário'),
  ('maquinas_gerir', 'ISM'), ('maquinas_gerir', 'Proprietário')
on conflict do nothing;

create table if not exists public.maquinas (
  id            uuid primary key default gen_random_uuid(),
  cliente_id    uuid not null references public.clientes(id),
  chave         text,
  nome          text not null,
  modelo        text,
  ativo         boolean not null default true,
  extra         jsonb not null default '{}',
  criado_por    uuid default auth.uid(),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  excluido_em   timestamptz,
  dispositivo   text
);

create table if not exists public.maquinas_horas (
  id            uuid primary key default gen_random_uuid(),
  cliente_id    uuid not null references public.clientes(id),
  chave         text,
  maquina       text not null,
  data          date not null,
  hora_ini      numeric(10,1) not null check (hora_ini >= 0),
  hora_fim      numeric(10,1) check (hora_fim is null or hora_fim >= hora_ini),
  foto_ini      uuid,
  foto_fim      uuid,
  lido_ini      numeric(10,1),
  lido_fim      numeric(10,1),
  responsavel   text,
  obs           text,
  extra         jsonb not null default '{}',
  criado_por    uuid default auth.uid(),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  excluido_em   timestamptz,
  dispositivo   text
);

create table if not exists public.maquinas_manutencao (
  id            uuid primary key default gen_random_uuid(),
  cliente_id    uuid not null references public.clientes(id),
  chave         text,
  maquina       text not null,
  data          date not null,
  horimetro     numeric(10,1) not null check (horimetro >= 0),
  descricao     text not null,
  intervalo     numeric(10,1) check (intervalo is null or intervalo > 0),
  proxima       numeric(10,1),
  responsavel   text,
  extra         jsonb not null default '{}',
  criado_por    uuid default auth.uid(),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  excluido_em   timestamptz,
  dispositivo   text
);

-- fotos do painel (JPEG reduzido, em texto); o app busca só quando alguém abre a foto
create table if not exists public.maquinas_fotos (
  id            uuid primary key,
  cliente_id    uuid not null references public.clientes(id),
  dados         text not null check (length(dados) < 400000),
  criado_por    uuid default auth.uid(),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['maquinas','maquinas_horas','maquinas_manutencao'] loop
    if not exists (select 1 from pg_indexes where indexname = t || '_chave') then
      execute format('create unique index %I on public.%I (cliente_id, chave) where excluido_em is null', t || '_chave', t);
      execute format('create index %I on public.%I (cliente_id, atualizado_em)', t || '_sync', t);
      execute format('create trigger %I before insert or update on public.%I for each row execute function public.tg_carimbo()', t || '_carimbo', t);
      execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.tg_auditoria()', t || '_historico', t);
    end if;
  end loop;
  -- fotos: só o carimbo (o histórico guardaria a foto inteira)
  if not exists (select 1 from pg_trigger where tgname = 'maquinas_fotos_carimbo') then
    create trigger maquinas_fotos_carimbo before insert or update on public.maquinas_fotos for each row execute function public.tg_carimbo();
  end if;
end $$;

-- mês corrente no horário de Brasília (mês fechado = anterior a este)
create or replace function public.mes_aberto(d date) returns boolean
language sql stable as $$
  select date_trunc('month', d) = date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date)
$$;

alter table public.maquinas enable row level security;
alter table public.maquinas_horas enable row level security;
alter table public.maquinas_manutencao enable row level security;
alter table public.maquinas_fotos enable row level security;
do $$ declare t text; begin
  foreach t in array array['maquinas','maquinas_horas','maquinas_manutencao','maquinas_fotos'] loop
    execute format('drop policy if exists ver on public.%I', t);
    execute format('drop policy if exists incluir on public.%I', t);
    execute format('drop policy if exists mudar on public.%I', t);
    execute format('create policy ver on public.%I for select to authenticated using (public.pode(cliente_id, ''maquinas''))', t);
  end loop;
end $$;
create policy incluir on public.maquinas for insert to authenticated with check (public.pode(cliente_id, 'maquinas_gerir'));
create policy mudar on public.maquinas for update to authenticated
  using (public.pode(cliente_id, 'maquinas_gerir')) with check (public.pode(cliente_id, 'maquinas_gerir'));
-- horas: o tratorista lança e corrige só no mês aberto; mês fechado, só ISM e proprietário
create policy incluir on public.maquinas_horas for insert to authenticated
  with check (public.pode(cliente_id, 'maquinas_gerir') or (public.pode(cliente_id, 'maquinas') and public.mes_aberto(data)));
create policy mudar on public.maquinas_horas for update to authenticated
  using (public.pode(cliente_id, 'maquinas_gerir') or (public.pode(cliente_id, 'maquinas') and public.mes_aberto(data)))
  with check (public.pode(cliente_id, 'maquinas_gerir') or (public.pode(cliente_id, 'maquinas') and public.mes_aberto(data)));
create policy incluir on public.maquinas_manutencao for insert to authenticated with check (public.pode(cliente_id, 'maquinas'));
create policy mudar on public.maquinas_manutencao for update to authenticated
  using (public.pode(cliente_id, 'maquinas')) with check (public.pode(cliente_id, 'maquinas'));
create policy incluir on public.maquinas_fotos for insert to authenticated with check (public.pode(cliente_id, 'maquinas'));

revoke all on public.maquinas, public.maquinas_horas, public.maquinas_manutencao, public.maquinas_fotos from public, anon, authenticated;
grant select, insert, update on public.maquinas, public.maquinas_horas, public.maquinas_manutencao to authenticated;
grant select, insert on public.maquinas_fotos to authenticated;
revoke execute on function public.mes_aberto(date) from public, anon;
grant execute on function public.mes_aberto(date) to authenticated;

-- o Painel da ISM passa a aceitar o módulo Maquinário
create or replace function public.ism_salvar_fazenda(p_id uuid, p_grupo uuid, p_nome text, p_modulos text[], p_tipo text default 'fazenda')
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid; plano jsonb;
begin
  perform public.ism_exige();
  if coalesce(trim(p_nome), '') = '' then raise exception 'Informe o nome da fazenda'; end if;
  if exists (select 1 from unnest(p_modulos) x where x not in ('financeiro','rebanho','suplemento','atividades','mapa','maquinas','demonstracao')) then
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

-- Fazenda Barramas: liga a aba, cadastra as 3 máquinas e libera o tratorista Wemerson
update public.clientes set modulos = array(select distinct unnest(modulos || array['maquinas']))
 where nome = 'Fazenda Barramas' and not ('maquinas' = any(modulos));
insert into public.maquinas (cliente_id, chave, nome, modelo)
select c.id, m.chave, m.nome, m.modelo
  from public.clientes c,
       (values ('jd6125', 'Trator JD 6125', 'John Deere 6125'), ('jd5090', 'Trator JD 5090', 'John Deere 5090'),
               ('jd444', 'Pá Carregadeira JD 444', 'John Deere 444')) as m(chave, nome, modelo)
 where c.nome = 'Fazenda Barramas'
   and not exists (select 1 from public.maquinas x where x.cliente_id = c.id and x.chave = m.chave and x.excluido_em is null);
update public.membros m set extras = array(select distinct unnest(m.extras || 'maquinas'::text))
  from public.clientes c
 where c.id = m.cliente_id and c.nome = 'Fazenda Barramas' and m.nome = 'Wemerson';
