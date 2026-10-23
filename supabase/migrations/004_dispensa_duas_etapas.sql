-- =====================================================================
-- ISM Pecuária · 004 · dispensa da verificação em duas etapas por pessoa
-- A ISM pode liberar uma pessoa específica de usar o aplicativo autenticador.
-- Rode uma vez no SQL Editor.
-- =====================================================================
alter table public.membros add column if not exists dispensa_mfa boolean not null default false;

create or replace function public.perfis_efetivos(c uuid) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(p), '{}')
  from unnest(public.meus_perfis(c)) as p
  where public.mfa_ok()
     or p not in ('ISM','Proprietário','Administrativo')
     or exists (select 1 from public.membros m
                where m.cliente_id = c and m.user_id = auth.uid() and m.ativo and m.dispensa_mfa
                  and not exists (select 1 from public.ism_equipe e where e.user_id = auth.uid()))
$$;

-- Liga/desliga a dispensa: select dispensar_duas_etapas('Fazenda Barramas', 'Josiane');
create or replace function public.dispensar_duas_etapas(p_cliente text, p_nome text, p_dispensar boolean default true)
returns text language plpgsql security definer set search_path = public as $$
begin
  update public.membros m set dispensa_mfa = p_dispensar
  from public.clientes c where c.id = m.cliente_id and c.nome = p_cliente and m.nome = p_nome;
  if not found then raise exception 'Pessoa % não encontrada em %', p_nome, p_cliente; end if;
  return case when p_dispensar then 'sem duas etapas: ' else 'com duas etapas: ' end || p_nome;
end $$;
revoke execute on function public.dispensar_duas_etapas(text, text, boolean) from public, anon, authenticated;

-- Josiane (Fazenda Barramas) fica sem a verificação em duas etapas (pedido do Italo, 23/10/2026)
update public.membros set dispensa_mfa = true
 where nome = 'Josiane' and cliente_id = (select id from public.clientes where nome = 'Fazenda Barramas');
