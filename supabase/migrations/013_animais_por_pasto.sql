-- =====================================================================
-- ISM Pecuária · 013 · animais por pasto (pedido do Italo, 05/11/2026)
-- Cada registro diz quantos animais há num pasto e o peso médio aproximado
-- por animal (@), a partir de uma data. O número atual do pasto é o último
-- registro. Origem 'cocho': o vaqueiro informa ao lançar o trato (vale na hora;
-- se mudou, a ISM e o proprietário veem um aviso para conferir). Origem
-- 'manual': contagem pasto a pasto, só ação 'lotacao' (ISM e Proprietário).
-- Rode uma vez no SQL Editor.
-- =====================================================================

insert into public.permissoes (acao, perfil) values ('lotacao', 'ISM'), ('lotacao', 'Proprietário')
on conflict do nothing;

create table if not exists public.pastos_lotacao (
  id            uuid primary key default gen_random_uuid(),
  cliente_id    uuid not null references public.clientes(id),
  chave         text,
  data          date not null,
  pasto         text not null,
  cabecas       integer not null check (cabecas >= 0 and cabecas < 100000),
  arroba        numeric(6,2) check (arroba is null or (arroba > 0 and arroba < 100)),
  origem        text not null check (origem in ('cocho','manual')),
  responsavel   text,
  extra         jsonb not null default '{}',
  criado_por    uuid default auth.uid(),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  excluido_em   timestamptz,
  dispositivo   text
);

do $$ begin
  if not exists (select 1 from pg_indexes where indexname = 'pastos_lotacao_chave') then
    create unique index pastos_lotacao_chave on public.pastos_lotacao (cliente_id, chave) where excluido_em is null;
    create index pastos_lotacao_sync on public.pastos_lotacao (cliente_id, atualizado_em);
    create trigger pastos_lotacao_carimbo before insert or update on public.pastos_lotacao for each row execute function public.tg_carimbo();
    create trigger pastos_lotacao_historico after insert or update or delete on public.pastos_lotacao for each row execute function public.tg_auditoria();
  end if;
end $$;

alter table public.pastos_lotacao enable row level security;
drop policy if exists ver on public.pastos_lotacao;
drop policy if exists incluir on public.pastos_lotacao;
drop policy if exists mudar on public.pastos_lotacao;
-- quem trata o cocho vê os pastos e informa o número junto com o trato
create policy ver on public.pastos_lotacao for select to authenticated using (public.pode(cliente_id, 'suplemento'));
create policy incluir on public.pastos_lotacao for insert to authenticated
  with check (public.pode(cliente_id, 'lotacao') or (origem = 'cocho' and public.pode(cliente_id, 'suplemento')));
-- corrigir, excluir ou marcar "ciente": só ISM e proprietário
create policy mudar on public.pastos_lotacao for update to authenticated
  using (public.pode(cliente_id, 'lotacao')) with check (public.pode(cliente_id, 'lotacao'));

revoke all on public.pastos_lotacao from public, anon, authenticated;
grant select, insert, update on public.pastos_lotacao to authenticated;
