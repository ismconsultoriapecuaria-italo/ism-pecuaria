-- =====================================================================
-- ISM Pecuária · 010 · fecha as funções do banco (correção de segurança)
-- O Postgres libera para TODOS (PUBLIC) toda função nova. Algumas funções de
-- administração (vincular_usuario, bloquear_usuario) tinham sido fechadas só
-- para "authenticated", e continuavam abertas pelo PUBLIC: qualquer pessoa
-- logada poderia se dar o perfil ISM. Aqui tudo é fechado e só o necessário
-- é liberado para quem está logado. Rode uma vez no SQL Editor.
-- =====================================================================

-- 1) Fecha todas as funções do esquema public (menos as de extensões)
do $$ declare f record; begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

-- 2) Libera só o que o app usa (regras de acesso e chamadas das telas)
grant execute on function
  public.mfa_ok(), public.sou_ism(), public.meus_perfis(uuid), public.perfis_efetivos(uuid),
  public.pode(uuid, text), public.meu_nome(uuid), public.romaneio_aberto(uuid),
  public.pode_atividade(uuid, text), public.gere_atividade(uuid, text),
  public.definir_preco_dieta(uuid, text, numeric, date),
  public.preciso_trocar_senha(), public.senha_trocada(),
  public.ism_clientes(), public.ism_salvar_cliente(uuid, text),
  public.ism_salvar_fazenda(uuid, uuid, text, text[], text), public.ism_pessoas(uuid),
  public.ism_criar_pessoa(uuid, text, text, text, text, text[]),
  public.ism_editar_pessoa(uuid, text, text[], text[], boolean, boolean),
  public.ism_redefinir_senha(uuid, text), public.ism_zerar_autenticador(uuid)
to authenticated;

-- 3) Funções criadas daqui para frente nascem fechadas
alter default privileges in schema public revoke execute on functions from public;
do $$ begin
  execute 'alter default privileges in schema public revoke execute on functions from anon, authenticated';
exception when others then null; end $$;

-- 4) Conferência: lista o que ficou liberado para quem está logado ou para o público
select p.proname as funcao_liberada
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prokind = 'f'
   and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))
   and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
 order by 1;
