-- =====================================================================
-- ISM Pecuária — estrutura do banco (Supabase / Postgres)
-- Rode este arquivo inteiro no SQL Editor do Supabase, uma única vez,
-- antes do 002_regras_de_acesso.sql.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Configuração geral
-- ---------------------------------------------------------------------
create table if not exists public.config (
  chave text primary key,
  valor text not null
);
insert into public.config (chave, valor) values
  ('exigir_mfa', 'sim')          -- 'sim' = ISM, proprietário e administrativo precisam da verificação em duas etapas
on conflict (chave) do nothing;

-- ---------------------------------------------------------------------
-- Clientes (fazendas, corretores...) e pessoas
-- ---------------------------------------------------------------------
create table public.clientes (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null unique,
  tipo       text not null default 'fazenda' check (tipo in ('fazenda','corretor')),
  modulos    text[] not null default '{}',
  criado_em  timestamptz not null default now()
);

-- Equipe da ISM: enxerga e administra todos os clientes
create table public.ism_equipe (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nome    text not null
);

-- Pessoas de cada cliente, com um ou mais perfis
create table public.membros (
  id         uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id),
  user_id    uuid references auth.users(id),
  nome       text not null,
  login      text,
  funcao     text,
  perfis     text[] not null check (perfis <@ array['ISM','Proprietário','Administrativo','Gerente','Vaqueiro','Fábrica de ração','Serviços gerais']),
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now(),
  unique (cliente_id, nome),
  unique (cliente_id, user_id)
);

-- Matriz de permissões: qual perfil pode cada ação
create table public.permissoes (
  acao   text not null,
  perfil text not null,
  primary key (acao, perfil)
);

insert into public.permissoes (acao, perfil)
select a, p from (values
  ('app',            '{ISM,Proprietário,Administrativo,Gerente,Vaqueiro,Fábrica de ração,Serviços gerais}'),
  ('fin_ver',        '{ISM,Proprietário,Administrativo}'),
  ('fin_lancar',     '{ISM,Proprietário,Administrativo}'),
  ('fin_editar',     '{ISM}'),
  ('ver_totais',     '{ISM,Proprietário,Administrativo,Gerente}'),
  ('rebanho_ver',    '{ISM,Proprietário,Administrativo,Gerente,Vaqueiro}'),
  ('manejo_lancar',  '{ISM,Proprietário,Administrativo,Gerente,Vaqueiro}'),
  ('corrigir',       '{ISM,Proprietário,Administrativo}'),
  ('suplemento',     '{ISM,Proprietário,Administrativo,Gerente,Vaqueiro,Fábrica de ração,Serviços gerais}'),
  ('pastos_ver',     '{ISM,Proprietário,Administrativo,Gerente,Vaqueiro,Fábrica de ração,Serviços gerais}'),
  ('pastos_editar',  '{ISM}'),
  ('atv_estrategico','{ISM,Proprietário}'),
  ('atv_tatico',     '{ISM,Proprietário,Administrativo,Gerente}'),
  ('atv_operacional','{ISM,Proprietário,Administrativo,Gerente,Vaqueiro,Fábrica de ração,Serviços gerais}'),
  ('atv_criar',      '{ISM,Proprietário,Administrativo,Gerente}'),
  ('importar',       '{ISM}'),
  ('exportar',       '{ISM,Proprietário,Administrativo,Gerente}'),
  ('usuarios',       '{ISM}'),
  ('auditoria',      '{ISM}')
) as t(a, ps), unnest(ps::text[]) as p
on conflict do nothing;

-- ---------------------------------------------------------------------
-- Colunas comuns: quem criou, quando, exclusão lógica (nada é apagado)
-- ---------------------------------------------------------------------
-- id, cliente_id, criado_por, criado_em, atualizado_em, excluido_em, dispositivo

create table public.romaneios (
  id            uuid primary key default gen_random_uuid(),
  cliente_id    uuid not null references public.clientes(id),
  tipo          text not null check (tipo in ('Entrada','Pesagem','Venda','Morte')),
  data          date not null,
  info          jsonb not null default '{}',
  linhas        int  not null default 10 check (linhas in (10,15,20,25,30)),
  responsavel   text,
  encerrado     boolean not null default false,
  criado_por    uuid default auth.uid(),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  excluido_em   timestamptz,
  dispositivo   text
);

create table public.animais (
  id            uuid primary key default gen_random_uuid(),
  cliente_id    uuid not null references public.clientes(id),
  brinco        text not null,
  sexo          text not null default 'Macho' check (sexo in ('Macho','Fêmea')),
  raca          text,
  fornecedor    text,
  lote          text,
  preco_compra  numeric(12,2),           -- preço por cabeça (o vaqueiro pode ver)
  ent_data      date not null,
  ent_peso      numeric(7,1) not null check (ent_peso > 0),
  romaneio_id   uuid references public.romaneios(id),
  responsavel   text,
  criado_por    uuid default auth.uid(),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  excluido_em   timestamptz,
  dispositivo   text
);
create unique index animais_brinco_unico on public.animais (cliente_id, brinco) where excluido_em is null;

create table public.pesagens (
  id            uuid primary key default gen_random_uuid(),
  cliente_id    uuid not null references public.clientes(id),
  animal_id     uuid not null references public.animais(id),
  data          date not null,
  peso          numeric(7,1) not null check (peso > 0),
  tipo          text not null default 'Rotina',
  obs           text,
  responsavel   text,
  romaneio_id   uuid references public.romaneios(id),
  criado_por    uuid default auth.uid(),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  excluido_em   timestamptz,
  dispositivo   text
);
create index on public.pesagens (animal_id);

create table public.vendas (
  id            uuid primary key default gen_random_uuid(),
  cliente_id    uuid not null references public.clientes(id),
  animal_id     uuid not null references public.animais(id),
  data          date not null,
  peso          numeric(7,1) not null check (peso > 0),
  arroba        numeric(10,2) not null check (arroba > 0),  -- valor da @ (o vaqueiro lança e vê)
  comprador     text not null,
  destino       text,
  responsavel   text,
  romaneio_id   uuid references public.romaneios(id),
  criado_por    uuid default auth.uid(),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  excluido_em   timestamptz,
  dispositivo   text
);
create unique index vendas_uma_por_animal on public.vendas (animal_id) where excluido_em is null;

-- Valor de cada animal vendido fica em tabela separada: só quem pode ver totais lê
create table public.vendas_valor (
  venda_id      uuid primary key references public.vendas(id),
  cliente_id    uuid not null references public.clientes(id),
  valor         numeric(12,2) not null,
  atualizado_em timestamptz not null default now()
);

create table public.mortes (
  id            uuid primary key default gen_random_uuid(),
  cliente_id    uuid not null references public.clientes(id),
  animal_id     uuid not null references public.animais(id),
  data          date not null,
  causa         text,
  responsavel   text,
  romaneio_id   uuid references public.romaneios(id),
  criado_por    uuid default auth.uid(),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  excluido_em   timestamptz,
  dispositivo   text
);
create unique index mortes_uma_por_animal on public.mortes (animal_id) where excluido_em is null;

create table public.sanitario (
  id            uuid primary key default gen_random_uuid(),
  cliente_id    uuid not null references public.clientes(id),
  animal_id     uuid not null references public.animais(id),
  data          date not null,
  itens         text[] not null,
  romaneio_id   uuid references public.romaneios(id),
  criado_por    uuid default auth.uid(),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  excluido_em   timestamptz,
  dispositivo   text
);

create table public.pastos (
  id            uuid primary key default gen_random_uuid(),
  cliente_id    uuid not null references public.clientes(id),
  cod           text,
  nome          text not null,
  tipo          text,
  area_ha       numeric(8,2),
  obs           text,
  criado_por    uuid default auth.uid(),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  excluido_em   timestamptz,
  dispositivo   text
);
create unique index pastos_nome_unico on public.pastos (cliente_id, nome) where excluido_em is null;

create table public.supl_fabrica (
  id            uuid primary key default gen_random_uuid(),
  cliente_id    uuid not null references public.clientes(id),
  data          date not null,
  tipo          text not null check (tipo in ('Produção','Saída')),
  dieta         text not null,
  kg            numeric(10,1) not null check (kg > 0),
  obs           text,
  responsavel   text,
  criado_por    uuid default auth.uid(),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  excluido_em   timestamptz,
  dispositivo   text
);

create table public.supl_cocho (
  id            uuid primary key default gen_random_uuid(),
  cliente_id    uuid not null references public.clientes(id),
  data          date not null,
  pasto         text not null,
  dieta         text not null,
  kg            numeric(10,1) not null check (kg > 0),
  estado        text check (estado in ('Limpo','Sobrou')),
  responsavel   text,
  criado_por    uuid default auth.uid(),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  excluido_em   timestamptz,
  dispositivo   text
);

create table public.atividades (
  id            uuid primary key default gen_random_uuid(),
  cliente_id    uuid not null references public.clientes(id),
  titulo        text not null,
  nivel         text not null check (nivel in ('Estratégico','Tático','Operacional')),
  equipe        text,
  responsaveis  text[] not null default '{}',   -- nomes dos membros
  prazo         date,
  obs           text,
  situacao      int not null default 0 check (situacao between 0 and 2),  -- 0 a fazer, 1 em andamento, 2 concluída
  concluida_em  date,
  criado_por    uuid default auth.uid(),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  excluido_em   timestamptz,
  dispositivo   text
);

create table public.financeiro (
  id            uuid primary key default gen_random_uuid(),
  cliente_id    uuid not null references public.clientes(id),
  data          date not null,
  tipo          text not null check (tipo in ('Receita','Despesa','Investimento')),
  grupo         text not null,
  sub           text,
  item          text not null,
  valor         numeric(14,2) not null check (valor > 0),
  obs           text,
  origem        text not null default 'manual',   -- manual | importacao | planilha-caixa
  criado_por    uuid default auth.uid(),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  excluido_em   timestamptz,
  dispositivo   text
);
create index on public.financeiro (cliente_id, data);

-- Séries do painel (indicadores por cabeça, vendas e suplementação da planilha de caixa)
create table public.painel (
  cliente_id    uuid not null references public.clientes(id),
  chave         text not null,
  dados         jsonb not null,
  atualizado_em timestamptz not null default now(),
  primary key (cliente_id, chave)
);

create table public.importacoes (
  id            uuid primary key default gen_random_uuid(),
  cliente_id    uuid not null references public.clientes(id),
  arquivo       text not null,
  contagens     jsonb not null default '{}',
  criado_por    uuid default auth.uid(),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  excluido_em   timestamptz,
  dispositivo   text
);

-- Histórico de tudo que muda (ninguém escreve aqui direto)
create table public.auditoria (
  id          bigserial primary key,
  cliente_id  uuid,
  tabela      text not null,
  registro_id text,
  acao        text not null,
  usuario     uuid,
  quando      timestamptz not null default now(),
  antes       jsonb,
  depois      jsonb
);
create index on public.auditoria (cliente_id, quando desc);

-- ---------------------------------------------------------------------
-- Campos usados pelo app para sincronizar com o aparelho:
--   chave = identificador que o app usa na tela (nº do romaneio, código do pasto...)
--   extra = detalhes adicionais do lançamento, guardados como vieram do app
-- ---------------------------------------------------------------------
do $$ declare t text; begin
  foreach t in array array['romaneios','pastos','supl_fabrica','supl_cocho','atividades','financeiro','importacoes'] loop
    execute format('alter table public.%I add column chave text', t);
    execute format('create unique index %I on public.%I (cliente_id, chave) where excluido_em is null', t || '_chave', t);
  end loop;
  foreach t in array array['romaneios','animais','pesagens','vendas','mortes','sanitario','pastos','supl_fabrica','supl_cocho','atividades','financeiro','importacoes'] loop
    execute format('alter table public.%I add column extra jsonb not null default ''{}''', t);
  end loop;
end $$;
create index if not exists vendas_valor_sync on public.vendas_valor (cliente_id, atualizado_em);
create index if not exists painel_sync on public.painel (cliente_id, atualizado_em);

-- índices para sincronização incremental
do $$ declare t text; begin
  foreach t in array array['romaneios','animais','pesagens','vendas','mortes','sanitario','pastos','supl_fabrica','supl_cocho','atividades','financeiro','importacoes'] loop
    execute format('create index if not exists %I on public.%I (cliente_id, atualizado_em)', t || '_sync', t);
  end loop;
end $$;
