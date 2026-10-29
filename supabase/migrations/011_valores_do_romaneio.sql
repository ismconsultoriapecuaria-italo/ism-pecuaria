-- =====================================================================
-- ISM Pecuária · 011 · valores de compra e venda lançados no romaneio
-- A partir de agora o vaqueiro lança entrada e venda SEM valor. Depois, na aba
-- Romaneios, quem lança no caixa informa:
--   Entrada: valor pago nos animais + frete + comissão (= total da compra)
--   Venda:   valor total da venda (e, se tiver, o total de @ de carcaça do frigorífico)
-- O banco soma as @ do romaneio (peso ÷ 30), acha o valor real pago/recebido por @
-- e rateia por animal: valor do animal = peso ÷ 30 × R$/@ do romaneio.
-- Cada animal passa a carregar o R$/@ da compra (animais_valor) e da venda (vendas_valor).
-- O total entra sozinho no caixa:
--   compra → Investimento · INVESTIMENTOS EM BOVINOS · COMPRA DE ANIMAIS · ANIMAIS / FRETE / COMISSÃO
--   venda  → Receita · RECEITAS PECUÁRIAS · VENDA DE ANIMAIS · ANIMAIS
-- Mudou o romaneio (animal a mais, peso corrigido)? O rateio e o caixa se refazem sozinhos.
-- Os valores antigos (preço por cabeça e @ da venda) passam para as tabelas protegidas:
-- o vaqueiro deixa de ver qualquer valor. Esses romaneios antigos não geram caixa.
-- Rode uma vez no SQL Editor.
-- =====================================================================

create table if not exists public.romaneio_valores (
  romaneio_id          uuid primary key references public.romaneios(id),
  cliente_id           uuid not null references public.clientes(id),
  tipo                 text not null check (tipo in ('Entrada','Venda')),
  valor_animais        numeric(14,2),
  frete                numeric(14,2) not null default 0,
  comissao             numeric(14,2) not null default 0,
  total                numeric(14,2) not null check (total > 0),
  arrobas              numeric(12,2),
  preco_arroba         numeric,
  arrobas_carcaca      numeric(12,2),
  preco_arroba_carcaca numeric,
  animais              int,
  rateio               boolean not null default true,   -- false = valores antigos, cada animal com o seu
  no_caixa             boolean not null default true,   -- false = romaneio antigo, não gera caixa
  lancado_por          uuid default auth.uid(),
  lancado_nome         text,
  atualizado_em        timestamptz not null default now(),
  excluido_em          timestamptz
);
create index if not exists romaneio_valores_sync on public.romaneio_valores (cliente_id, atualizado_em);

create table if not exists public.animais_valor (
  animal_id     uuid primary key references public.animais(id),
  cliente_id    uuid not null references public.clientes(id),
  preco_arroba  numeric,
  valor         numeric(12,2),
  atualizado_em timestamptz not null default now()
);
create index if not exists animais_valor_sync on public.animais_valor (cliente_id, atualizado_em);

alter table public.vendas alter column arroba drop not null;
alter table public.vendas_valor alter column valor drop not null;
alter table public.vendas_valor add column if not exists preco_arroba numeric;

-- carimbo de data (sincronia) e histórico
do $$ declare t text; begin
  foreach t in array array['romaneio_valores','animais_valor'] loop
    if not exists (select 1 from pg_trigger where tgname = t || '_carimbo') then
      execute format('create trigger %I before insert or update on public.%I for each row execute function public.tg_carimbo()', t || '_carimbo', t);
      execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.tg_auditoria()', t || '_historico', t);
    end if;
  end loop;
end $$;

-- só quem vê os totais lê; ninguém grava direto (só pela função salvar_valor_romaneio)
alter table public.romaneio_valores enable row level security;
alter table public.animais_valor enable row level security;
drop policy if exists ver on public.romaneio_valores;
drop policy if exists ver on public.animais_valor;
create policy ver on public.romaneio_valores for select to authenticated using (public.pode(cliente_id, 'ver_totais'));
create policy ver on public.animais_valor for select to authenticated using (public.pode(cliente_id, 'ver_totais'));
revoke all on public.romaneio_valores, public.animais_valor from public, anon, authenticated;
grant select on public.romaneio_valores, public.animais_valor to authenticated;

-- ---------------------------------------------------------------------
-- Caixa automático de um romaneio
-- ---------------------------------------------------------------------
create or replace function public.caixa_linha(c uuid, k text, p_data date, p_tipo text, g text, s text, it text, v numeric, p_obs text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(v, 0) <= 0 then
    update public.financeiro set excluido_em = now() where cliente_id = c and chave = k and excluido_em is null;
    return;
  end if;
  update public.financeiro set data = p_data, tipo = p_tipo, grupo = g, sub = s, item = it, valor = round(v, 2), obs = p_obs
   where cliente_id = c and chave = k and excluido_em is null
     and (data, tipo, grupo, sub, item, valor, obs) is distinct from (p_data, p_tipo, g, s, it, round(v, 2), p_obs);
  if not exists (select 1 from public.financeiro where cliente_id = c and chave = k and excluido_em is null) then
    insert into public.financeiro (cliente_id, chave, data, tipo, grupo, sub, item, valor, obs, origem, extra)
    values (c, k, p_data, p_tipo, g, s, it, round(v, 2), p_obs, 'romaneio', jsonb_build_object('auto', true));
  end if;
end $$;

create or replace function public.caixa_romaneio(p_rom uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v public.romaneio_valores; r public.romaneios; base text; quem text; o text;
begin
  select * into r from public.romaneios where id = p_rom;
  select * into v from public.romaneio_valores where romaneio_id = p_rom;
  base := 'rom-' || p_rom::text || '-';
  if r.id is null or r.excluido_em is not null or v.romaneio_id is null or v.excluido_em is not null or not v.no_caixa then
    update public.financeiro set excluido_em = now() where cliente_id = coalesce(r.cliente_id, v.cliente_id) and chave like base || '%' and excluido_em is null;
    return;
  end if;
  o := 'Automático: romaneio de ' || lower(v.tipo) || ' de ' || to_char(r.data, 'DD/MM/YYYY') || ' · ' || coalesce(v.animais, 0) || ' animais';
  if v.tipo = 'Entrada' then
    quem := nullif(coalesce(r.info -> 'info' ->> 'forn', r.info ->> 'forn'), '');
    if quem is not null then o := o || ' · ' || quem; end if;
    perform public.caixa_linha(r.cliente_id, base || 'animais', r.data, 'Investimento', 'INVESTIMENTOS EM BOVINOS', 'COMPRA DE ANIMAIS', 'ANIMAIS', v.valor_animais, o);
    perform public.caixa_linha(r.cliente_id, base || 'frete', r.data, 'Investimento', 'INVESTIMENTOS EM BOVINOS', 'COMPRA DE ANIMAIS', 'FRETE', v.frete, o);
    perform public.caixa_linha(r.cliente_id, base || 'comissao', r.data, 'Investimento', 'INVESTIMENTOS EM BOVINOS', 'COMPRA DE ANIMAIS', 'COMISSÃO', v.comissao, o);
  else
    quem := nullif(coalesce(r.info -> 'info' ->> 'comp', r.info ->> 'comp'), '');
    if quem is not null then o := o || ' · ' || quem; end if;
    perform public.caixa_linha(r.cliente_id, base || 'venda', r.data, 'Receita', 'RECEITAS PECUÁRIAS', 'VENDA DE ANIMAIS', 'ANIMAIS', v.total, o);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Rateio: @ do romaneio, R$/@ e valor de cada animal
-- ---------------------------------------------------------------------
create or replace function public.recalcular_romaneio(p_rom uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v public.romaneio_valores; arr numeric; n int; pa numeric; pc numeric;
begin
  if p_rom is null then return; end if;
  select * into v from public.romaneio_valores where romaneio_id = p_rom;
  if v.romaneio_id is null then return; end if;
  if v.excluido_em is null then
    if v.tipo = 'Entrada' then
      select coalesce(sum(ent_peso), 0) / 30, count(*) into arr, n from public.animais where romaneio_id = p_rom and excluido_em is null;
    else
      select coalesce(sum(peso), 0) / 30, count(*) into arr, n from public.vendas where romaneio_id = p_rom and excluido_em is null;
    end if;
    pa := case when arr > 0 then v.total / arr end;
    pc := case when v.arrobas_carcaca > 0 then v.total / v.arrobas_carcaca end;
    update public.romaneio_valores set arrobas = round(arr, 2), preco_arroba = pa, preco_arroba_carcaca = pc, animais = n
     where romaneio_id = p_rom
       and (arrobas, preco_arroba, preco_arroba_carcaca, animais) is distinct from (round(arr, 2), pa, pc, n);
    if v.rateio and pa is not null then
      if v.tipo = 'Entrada' then
        insert into public.animais_valor (animal_id, cliente_id, preco_arroba, valor)
        select a.id, a.cliente_id, pa, round(a.ent_peso / 30 * pa, 2) from public.animais a where a.romaneio_id = p_rom and a.excluido_em is null
        on conflict (animal_id) do update set preco_arroba = excluded.preco_arroba, valor = excluded.valor
         where (animais_valor.preco_arroba, animais_valor.valor) is distinct from (excluded.preco_arroba, excluded.valor);
      else
        insert into public.vendas_valor (venda_id, cliente_id, preco_arroba, valor)
        select x.id, x.cliente_id, pa, round(x.peso / 30 * pa, 2) from public.vendas x where x.romaneio_id = p_rom and x.excluido_em is null
        on conflict (venda_id) do update set preco_arroba = excluded.preco_arroba, valor = excluded.valor
         where (vendas_valor.preco_arroba, vendas_valor.valor) is distinct from (excluded.preco_arroba, excluded.valor);
      end if;
    end if;
  end if;
  perform public.caixa_romaneio(p_rom);
end $$;

-- Valor de cada venda: R$/@ do romaneio (quando lançado), senão a @ antiga
create or replace function public.tg_venda_valor() returns trigger
language plpgsql security definer set search_path = public as $$
declare pa numeric;
begin
  select case when rateio then preco_arroba end into pa from public.romaneio_valores
   where romaneio_id = new.romaneio_id and excluido_em is null;
  pa := coalesce(pa, new.arroba, (select preco_arroba from public.vendas_valor where venda_id = new.id));
  if tg_op = 'INSERT' then
    insert into public.vendas_valor (venda_id, cliente_id, valor, preco_arroba)
    values (new.id, new.cliente_id, case when pa > 0 then round(new.peso / 30 * pa, 2) end, pa)
    on conflict (venda_id) do nothing;
  elsif new.peso is distinct from old.peso or new.romaneio_id is distinct from old.romaneio_id
        or (new.arroba is not null and new.arroba is distinct from old.arroba) then
    update public.vendas_valor set valor = case when pa > 0 then round(new.peso / 30 * pa, 2) end, preco_arroba = pa
     where venda_id = new.id;
  end if;
  return new;
end $$;

-- refaz o rateio quando o romaneio muda (os nomes "zz" fazem rodar depois dos outros gatilhos)
create or replace function public.tg_rateio_romaneio() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then perform public.recalcular_romaneio(old.romaneio_id); end if;
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.romaneio_id is distinct from old.romaneio_id) then
    perform public.recalcular_romaneio(new.romaneio_id);
  end if;
  return null;
end $$;
drop trigger if exists animais_zz_rateio on public.animais;
create trigger animais_zz_rateio after insert or update of ent_peso, excluido_em, romaneio_id or delete on public.animais
  for each row execute function public.tg_rateio_romaneio();
drop trigger if exists vendas_zz_rateio on public.vendas;
create trigger vendas_zz_rateio after insert or update of peso, excluido_em, romaneio_id or delete on public.vendas
  for each row execute function public.tg_rateio_romaneio();

-- romaneio excluído ou com a data mudada: refaz o caixa
create or replace function public.tg_romaneio_caixa() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.romaneio_valores where romaneio_id = new.id) then
    if new.excluido_em is not null and old.excluido_em is null then
      update public.romaneio_valores set excluido_em = now() where romaneio_id = new.id and excluido_em is null;
    end if;
    perform public.caixa_romaneio(new.id);
  end if;
  return null;
end $$;
drop trigger if exists romaneios_zz_caixa on public.romaneios;
create trigger romaneios_zz_caixa after update of data, excluido_em, info on public.romaneios
  for each row execute function public.tg_romaneio_caixa();

-- ---------------------------------------------------------------------
-- Tela Romaneios: lançar ou corrigir o valor da compra / da venda
-- ---------------------------------------------------------------------
create or replace function public.salvar_valor_romaneio(p_romaneio uuid, p_animais numeric default null, p_frete numeric default 0,
  p_comissao numeric default 0, p_total numeric default null, p_carcaca numeric default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.romaneios; v public.romaneio_valores; tot numeric;
begin
  select * into r from public.romaneios where id = p_romaneio and excluido_em is null;
  if r.id is null then raise exception 'Romaneio não encontrado'; end if;
  if r.tipo not in ('Entrada', 'Venda') then raise exception 'Só romaneios de entrada e de venda têm valor'; end if;
  if not public.pode(r.cliente_id, 'fin_lancar') then raise exception 'Você não tem permissão para lançar valores'; end if;
  select * into v from public.romaneio_valores where romaneio_id = r.id and excluido_em is null;
  if v.romaneio_id is not null and not public.pode(r.cliente_id, 'fin_editar') and v.lancado_por is distinct from auth.uid() then
    raise exception 'Só quem lançou, o proprietário ou a ISM corrigem este valor';
  end if;
  if r.tipo = 'Entrada' then
    if coalesce(p_animais, 0) <= 0 then raise exception 'Informe o valor pago nos animais'; end if;
    if coalesce(p_frete, 0) < 0 or coalesce(p_comissao, 0) < 0 then raise exception 'Frete e comissão não podem ser negativos'; end if;
    tot := p_animais + coalesce(p_frete, 0) + coalesce(p_comissao, 0);
  else
    if coalesce(p_total, 0) <= 0 then raise exception 'Informe o valor total da venda'; end if;
    if p_carcaca is not null and p_carcaca <= 0 then raise exception 'As @ de carcaça devem ser maiores que zero'; end if;
    tot := p_total;
  end if;
  insert into public.romaneio_valores (romaneio_id, cliente_id, tipo, valor_animais, frete, comissao, total, arrobas_carcaca, rateio, no_caixa, lancado_por, lancado_nome, excluido_em)
  values (r.id, r.cliente_id, r.tipo, case when r.tipo = 'Entrada' then p_animais end,
          case when r.tipo = 'Entrada' then coalesce(p_frete, 0) else 0 end, case when r.tipo = 'Entrada' then coalesce(p_comissao, 0) else 0 end,
          tot, case when r.tipo = 'Venda' then p_carcaca end, true, true, auth.uid(), public.meu_nome(r.cliente_id), null)
  on conflict (romaneio_id) do update set valor_animais = excluded.valor_animais, frete = excluded.frete, comissao = excluded.comissao,
    total = excluded.total, arrobas_carcaca = excluded.arrobas_carcaca, rateio = true, no_caixa = true,
    lancado_por = coalesce(romaneio_valores.lancado_por, excluded.lancado_por), lancado_nome = coalesce(romaneio_valores.lancado_nome, excluded.lancado_nome), excluido_em = null;
  perform public.recalcular_romaneio(r.id);
  select * into v from public.romaneio_valores where romaneio_id = r.id;
  return to_jsonb(v);
end $$;
revoke execute on function public.caixa_linha(uuid, text, date, text, text, text, text, numeric, text) from public, anon, authenticated;
revoke execute on function public.caixa_romaneio(uuid) from public, anon, authenticated;
revoke execute on function public.recalcular_romaneio(uuid) from public, anon, authenticated;
revoke execute on function public.tg_rateio_romaneio() from public, anon, authenticated;
revoke execute on function public.tg_romaneio_caixa() from public, anon, authenticated;
revoke execute on function public.salvar_valor_romaneio(uuid, numeric, numeric, numeric, numeric, numeric) from public, anon;
grant execute on function public.salvar_valor_romaneio(uuid, numeric, numeric, numeric, numeric, numeric) to authenticated;

-- ---------------------------------------------------------------------
-- Valores antigos: saem do alcance do vaqueiro (uma vez; repetir não estraga)
-- ---------------------------------------------------------------------
-- compra: preço por cabeça → animais_valor (com o R$/@ de cada animal)
insert into public.animais_valor (animal_id, cliente_id, preco_arroba, valor)
select id, cliente_id, preco_compra / (ent_peso / 30), preco_compra from public.animais
 where preco_compra > 0 and ent_peso > 0
on conflict (animal_id) do nothing;
insert into public.romaneio_valores (romaneio_id, cliente_id, tipo, valor_animais, total, arrobas, preco_arroba, animais, rateio, no_caixa, lancado_por, lancado_nome)
select r.id, r.cliente_id, 'Entrada', sum(a.preco_compra), sum(a.preco_compra), round(sum(a.ent_peso) / 30, 2), sum(a.preco_compra) / (sum(a.ent_peso) / 30),
       count(*), false, false, null, 'Valores anteriores (preço por animal)'
  from public.romaneios r join public.animais a on a.romaneio_id = r.id and a.excluido_em is null and a.preco_compra > 0
 where r.tipo = 'Entrada'
 group by r.id, r.cliente_id
on conflict (romaneio_id) do nothing;
update public.animais set preco_compra = null where preco_compra is not null;
-- (o cabeçalho do romaneio fica em info -> 'info')
update public.romaneios set info = (info - 'preco') #- '{info,preco}' where tipo = 'Entrada' and (info ? 'preco' or info -> 'info' ? 'preco');

-- venda: @ de cada venda → vendas_valor.preco_arroba
update public.vendas_valor vv set preco_arroba = v.arroba from public.vendas v
 where v.id = vv.venda_id and v.arroba is not null and vv.preco_arroba is null;
insert into public.romaneio_valores (romaneio_id, cliente_id, tipo, total, arrobas, preco_arroba, animais, rateio, no_caixa, lancado_por, lancado_nome)
select r.id, r.cliente_id, 'Venda', sum(vv.valor), round(sum(v.peso) / 30, 2), sum(vv.valor) / (sum(v.peso) / 30), count(*), false, false, null,
       'Valores anteriores (@ por venda)'
  from public.romaneios r join public.vendas v on v.romaneio_id = r.id and v.excluido_em is null
  join public.vendas_valor vv on vv.venda_id = v.id and vv.valor > 0
 where r.tipo = 'Venda'
 group by r.id, r.cliente_id
having sum(vv.valor) > 0
on conflict (romaneio_id) do nothing;
update public.vendas set arroba = null where arroba is not null;
update public.romaneios set info = (info - 'arr') #- '{info,arr}' where tipo = 'Venda' and (info ? 'arr' or info -> 'info' ? 'arr');
