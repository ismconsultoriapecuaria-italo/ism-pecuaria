-- =====================================================================
-- ISM Pecuária · 006 · permissões extras por pessoa
-- A ISM pode liberar uma ação a mais para uma pessoa específica, sem mudar
-- o perfil inteiro. Ex.: a Josiane (Administrativo) passa a editar o caixa.
-- A ação extra só vale quando os perfis da pessoa estão liberados (duas
-- etapas feitas ou dispensadas). Rode uma vez no SQL Editor.
-- =====================================================================
alter table public.membros add column if not exists extras text[] not null default '{}';

create or replace function public.pode(c uuid, a text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.permissoes
                 where acao = a and perfil = any(public.perfis_efetivos(c)))
      or exists (select 1 from public.membros m
                 where m.cliente_id = c and m.user_id = auth.uid() and m.ativo
                   and a = any(m.extras)
                   and m.perfis <@ public.perfis_efetivos(c))
$$;

-- Libera ou tira uma ação de uma pessoa:
--   select liberar_acao('Fazenda Barramas', 'Josiane', 'fin_editar');
--   select liberar_acao('Fazenda Barramas', 'Josiane', 'fin_editar', false);
create or replace function public.liberar_acao(p_cliente text, p_nome text, p_acao text, p_liberar boolean default true)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.permissoes where acao = p_acao) then
    raise exception 'Ação desconhecida: %', p_acao;
  end if;
  update public.membros m
     set extras = case when p_liberar then array(select distinct unnest(m.extras || p_acao))
                       else array_remove(m.extras, p_acao) end
    from public.clientes c
   where c.id = m.cliente_id and c.nome = p_cliente and m.nome = p_nome;
  if not found then raise exception 'Pessoa % não encontrada em %', p_nome, p_cliente; end if;
  return case when p_liberar then 'liberado: ' else 'retirado: ' end || p_acao || ' para ' || p_nome;
end $$;
revoke execute on function public.liberar_acao(text, text, text, boolean) from public, anon, authenticated;

-- Josiane (Fazenda Barramas) edita o caixa também (pedido do Italo, 24/10/2026)
update public.membros set extras = array(select distinct unnest(extras || 'fin_editar'::text))
 where nome = 'Josiane' and cliente_id = (select id from public.clientes where nome = 'Fazenda Barramas');
