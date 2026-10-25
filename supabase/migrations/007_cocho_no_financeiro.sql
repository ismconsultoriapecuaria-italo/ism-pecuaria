-- =====================================================================
-- ISM Pecuária · 007 · o cocho lança a despesa de nutrição no caixa
-- Regime de competência: entra como despesa o que os animais comeram no mês.
-- Para cada fazenda, mês e dieta: soma dos kg tratados no cocho × preço por kg
-- da dieta vigente na data do trato. Fica um lançamento por mês e por dieta
-- (Despesa · REBANHO CORTE · NUTRIÇÃO · <dieta>), refeito sozinho a cada trato
-- lançado, corrigido ou excluído, e a cada preço novo.
-- Os preços ficam no painel (chave 'precos_supl') e só a ISM muda:
--   {"grupo":"REBANHO CORTE","sub":"NUTRIÇÃO",
--    "dietas":{"Dieta 0,3":[{"desde":"2026-09-01","preco":1.42}]}}
-- Tratos antes do primeiro preço da dieta não geram despesa.
-- Rode uma vez no SQL Editor.
-- =====================================================================

-- Preço por kg da dieta numa data (o último "desde" que já começou)
create or replace function public.preco_dieta(c uuid, p_dieta text, p_data date) returns numeric
language sql stable security definer set search_path = public as $$
  select (e ->> 'preco')::numeric
    from public.painel p, jsonb_array_elements(coalesce(p.dados -> 'dietas' -> p_dieta, '[]')) e
   where p.cliente_id = c and p.chave = 'precos_supl' and (e ->> 'desde')::date <= p_data
   order by (e ->> 'desde')::date desc limit 1
$$;

-- Refaz os lançamentos de nutrição de um mês
create or replace function public.recalcular_nutricao(c uuid, p_mes date) returns void
language plpgsql security definer set search_path = public as $$
declare
  ini date := date_trunc('month', p_mes)::date;
  fim date := (date_trunc('month', p_mes) + interval '1 month')::date;
  cfg jsonb := coalesce((select dados from public.painel where cliente_id = c and chave = 'precos_supl'), '{}');
  g text := coalesce(nullif(cfg ->> 'grupo', ''), 'REBANHO CORTE');
  s text := coalesce(nullif(cfg ->> 'sub', ''), 'NUTRIÇÃO');
  r record; k text;
begin
  for r in
    with t as (
      select dieta, sum(kg) as kg, sum(kg * public.preco_dieta(c, dieta, data)) as valor
        from public.supl_cocho
       where cliente_id = c and excluido_em is null and data >= ini and data < fim
         and public.preco_dieta(c, dieta, data) is not null
       group by dieta)
    select d.dieta, t.kg, round(coalesce(t.valor, 0), 2) as valor
      from (select dieta from t
            union
            select item from public.financeiro
             where cliente_id = c and origem = 'cocho' and excluido_em is null and data = ini) d
      left join t on t.dieta = d.dieta
  loop
    k := 'cocho-' || to_char(ini, 'YYYY-MM') || '-' || r.dieta;
    if coalesce(r.valor, 0) <= 0 then
      update public.financeiro set excluido_em = now()
       where cliente_id = c and chave = k and excluido_em is null;
    else
      update public.financeiro
         set valor = r.valor, grupo = g, sub = s, data = ini,
             obs = 'Automático: ' || replace(round(r.kg, 1)::text, '.', ',') || ' kg no cocho',
             extra = jsonb_build_object('auto', true, 'kg', r.kg)
       where cliente_id = c and chave = k and excluido_em is null
         and (valor is distinct from r.valor or grupo is distinct from g or sub is distinct from s
              or (extra ->> 'kg')::numeric is distinct from r.kg);
      if not found and not exists (select 1 from public.financeiro where cliente_id = c and chave = k and excluido_em is null) then
        insert into public.financeiro (cliente_id, chave, data, tipo, grupo, sub, item, valor, obs, origem, extra)
        values (c, k, ini, 'Despesa', g, s, r.dieta, r.valor,
                'Automático: ' || replace(round(r.kg, 1)::text, '.', ',') || ' kg no cocho', 'cocho',
                jsonb_build_object('auto', true, 'kg', r.kg));
      end if;
    end if;
  end loop;
end $$;
revoke execute on function public.recalcular_nutricao(uuid, date) from public, anon, authenticated;

-- A cada trato lançado, corrigido ou excluído
create or replace function public.tg_cocho_financeiro() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then perform public.recalcular_nutricao(old.cliente_id, old.data); end if;
  if tg_op in ('INSERT', 'UPDATE') and (tg_op = 'INSERT' or date_trunc('month', new.data) <> date_trunc('month', old.data)) then
    perform public.recalcular_nutricao(new.cliente_id, new.data);
  end if;
  return null;
end $$;
drop trigger if exists cocho_financeiro on public.supl_cocho;
create trigger cocho_financeiro after insert or update or delete on public.supl_cocho
  for each row execute function public.tg_cocho_financeiro();

-- A cada mudança de preço: refaz todos os meses com trato desde o preço mais antigo
create or replace function public.tg_precos_financeiro() returns trigger
language plpgsql security definer set search_path = public as $$
declare m date;
begin
  if new.chave <> 'precos_supl' then return null; end if;
  for m in select distinct date_trunc('month', data)::date from public.supl_cocho where cliente_id = new.cliente_id
           union select data from public.financeiro where cliente_id = new.cliente_id and origem = 'cocho' and excluido_em is null loop
    perform public.recalcular_nutricao(new.cliente_id, m);
  end loop;
  return null;
end $$;
drop trigger if exists precos_financeiro on public.painel;
create trigger precos_financeiro after insert or update on public.painel
  for each row execute function public.tg_precos_financeiro();

-- Tela da ISM no app: grava o preço de uma dieta a partir de uma data (só ISM)
create or replace function public.definir_preco_dieta(c uuid, p_dieta text, p_preco numeric, p_desde date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d jsonb; lista jsonb;
begin
  if not public.sou_ism() or not public.mfa_ok() then raise exception 'Só a ISM muda o preço das dietas'; end if;
  if coalesce(trim(p_dieta), '') = '' then raise exception 'Informe a dieta'; end if;
  if p_preco is null or p_preco < 0 then raise exception 'Preço inválido'; end if;
  if p_desde is null then raise exception 'Informe a data de início'; end if;
  d := coalesce((select dados from public.painel where cliente_id = c and chave = 'precos_supl'), '{}');
  lista := coalesce((select jsonb_agg(e) from jsonb_array_elements(coalesce(d -> 'dietas' -> p_dieta, '[]')) e
                      where (e ->> 'desde')::date <> p_desde), '[]')
           || jsonb_build_array(jsonb_build_object('desde', p_desde, 'preco', p_preco));
  d := jsonb_set(case when d ? 'dietas' then d else d || '{"dietas":{}}' end, array['dietas', p_dieta], lista);
  insert into public.painel (cliente_id, chave, dados) values (c, 'precos_supl', d)
  on conflict (cliente_id, chave) do update set dados = excluded.dados;
  return d;
end $$;
revoke execute on function public.definir_preco_dieta(uuid, text, numeric, date) from public, anon;
grant execute on function public.definir_preco_dieta(uuid, text, numeric, date) to authenticated;
