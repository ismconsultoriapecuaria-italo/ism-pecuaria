-- =====================================================================
-- ISM Pecuária · 005 · Fazenda Demonstração
-- Cria (ou recria) um cliente de teste com os dados da operação da Barramas
-- tornados fictícios: nomes de pessoas, fornecedores, compradores e lotes
-- trocados e valores em dinheiro 10% diferentes. Serve para apresentar o app.
-- Rode uma vez no SQL Editor. Para atualizar com os dados mais recentes da
-- Barramas, rode de novo:  select public.recriar_demonstracao();
-- =====================================================================
-- Correção: excluir um lançamento (pesagem, venda, morte, protocolo) nunca é barrado pelas conferências de data
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

create or replace function public.recriar_demonstracao(p_origem text default 'Fazenda Barramas')
returns text language plpgsql security definer set search_path = public as $f$
declare
  orig uuid; demo uuid := 'd0000000-0000-4000-8000-00000000de30'; f numeric := 0.9;
  t text; n int;
begin
  select id into orig from clientes where nome = p_origem;
  if orig is null then raise exception 'Cliente % não encontrado', p_origem; end if;

  -- a cópia não passa pelas conferências de data (os dados de origem já foram conferidos)
  alter table pesagens disable trigger pesagens_valida;  alter table vendas disable trigger vendas_valida;
  alter table mortes disable trigger mortes_valida;      alter table sanitario disable trigger sanitario_valida;

  -- apaga a demonstração anterior (só ela)
  foreach t in array array['vendas_valor','pesagens','sanitario','vendas','mortes','animais','romaneios','pastos',
                           'supl_fabrica','supl_cocho','atividades','financeiro','importacoes','painel','membros'] loop
    execute format('delete from public.%I where cliente_id = $1', t) using demo;
  end loop;
  insert into clientes (id, nome, tipo, modulos)
  values (demo, 'Fazenda Demonstração', 'fazenda', '{financeiro,rebanho,suplemento,atividades,mapa,demonstracao}')
  on conflict (id) do update set modulos = excluded.modulos;

  -- trocas de nomes (pessoas, fornecedores, compradores, lotes)
  create temp table _troca (de text primary key, para text) on commit drop;
  insert into _troca values ('Wemerson (Bebê)','Zé'),('Wilmington','Carlos'),('Josiane','Ana'),('Genisval','João'),
    ('Alessandro','Pedro'),('Wemerson','Luiz'),('Francisco','Antônio'),('Barramas','Demonstração');
  insert into _troca select fornecedor, 'Fornecedor ' || chr(64 + row_number() over (order by fornecedor)::int)
    from (select distinct fornecedor from animais where cliente_id = orig and fornecedor is not null and fornecedor <> 'Não informado') x
    on conflict do nothing;
  insert into _troca select comprador, 'Comprador ' || chr(64 + row_number() over (order by comprador)::int)
    from (select distinct comprador from vendas where cliente_id = orig) x on conflict do nothing;
  insert into _troca select lote, 'Lote ' || row_number() over (order by lote)
    from (select distinct lote from animais where cliente_id = orig and coalesce(lote, '') <> '') x on conflict do nothing;

  -- pessoas fictícias da fazenda (sem login; servem para os campos de responsável)
  insert into membros (cliente_id, nome, funcao, perfis) values
    (demo,'Carlos','Proprietário','{Proprietário}'), (demo,'Ana','Administrativo','{Administrativo}'),
    (demo,'João','Vaqueiro','{Vaqueiro}'), (demo,'Pedro','Vaqueiro','{Vaqueiro}'),
    (demo,'Luiz','Tratorista','{Vaqueiro,Serviços gerais}'), (demo,'Zé','Serviços gerais','{Serviços gerais}'),
    (demo,'Antônio','Serviços gerais','{Serviços gerais}');

  -- novos ids
  create temp table _id (velho uuid primary key, novo uuid not null default gen_random_uuid()) on commit drop;
  insert into _id (velho) select id from romaneios where cliente_id = orig and excluido_em is null;
  insert into _id (velho) select id from animais   where cliente_id = orig and excluido_em is null;
  insert into _id (velho) select id from pesagens  where cliente_id = orig and excluido_em is null;
  insert into _id (velho) select id from sanitario where cliente_id = orig and excluido_em is null;
  insert into _id (velho) select id from vendas    where cliente_id = orig and excluido_em is null;
  insert into _id (velho) select id from mortes    where cliente_id = orig and excluido_em is null;

  insert into romaneios (id, cliente_id, tipo, data, info, linhas, responsavel, encerrado, chave, extra)
  select i.novo, demo, r.tipo, r.data,
         public._demo_json(r.info, f), r.linhas, public._demo_txt(r.responsavel), r.encerrado, r.chave, r.extra
  from romaneios r join _id i on i.velho = r.id where r.cliente_id = orig and r.excluido_em is null;

  insert into animais (id, cliente_id, brinco, sexo, raca, fornecedor, lote, preco_compra, ent_data, ent_peso, romaneio_id, responsavel, extra)
  select i.novo, demo, a.brinco, a.sexo, a.raca, public._demo_txt(a.fornecedor), public._demo_txt(a.lote),
         round(a.preco_compra * f, 2), a.ent_data, a.ent_peso, ir.novo, public._demo_txt(a.responsavel), a.extra
  from animais a join _id i on i.velho = a.id left join _id ir on ir.velho = a.romaneio_id
  where a.cliente_id = orig and a.excluido_em is null;

  insert into pesagens (id, cliente_id, animal_id, data, peso, tipo, obs, responsavel, romaneio_id, extra)
  select i.novo, demo, ia.novo, p.data, p.peso, p.tipo, public._demo_txt(p.obs), public._demo_txt(p.responsavel), ir.novo, p.extra
  from pesagens p join _id i on i.velho = p.id join _id ia on ia.velho = p.animal_id left join _id ir on ir.velho = p.romaneio_id
  where p.cliente_id = orig and p.excluido_em is null;

  insert into sanitario (id, cliente_id, animal_id, data, itens, romaneio_id, extra)
  select i.novo, demo, ia.novo, s.data, s.itens, ir.novo, s.extra
  from sanitario s join _id i on i.velho = s.id join _id ia on ia.velho = s.animal_id left join _id ir on ir.velho = s.romaneio_id
  where s.cliente_id = orig and s.excluido_em is null;

  insert into mortes (id, cliente_id, animal_id, data, causa, responsavel, romaneio_id, extra)
  select i.novo, demo, ia.novo, m.data, m.causa, public._demo_txt(m.responsavel), ir.novo, m.extra
  from mortes m join _id i on i.velho = m.id join _id ia on ia.velho = m.animal_id left join _id ir on ir.velho = m.romaneio_id
  where m.cliente_id = orig and m.excluido_em is null;

  insert into vendas (id, cliente_id, animal_id, data, peso, arroba, comprador, destino, responsavel, romaneio_id, extra)
  select i.novo, demo, ia.novo, v.data, v.peso, round(v.arroba * f, 2), public._demo_txt(v.comprador), v.destino,
         public._demo_txt(v.responsavel), ir.novo, v.extra
  from vendas v join _id i on i.velho = v.id join _id ia on ia.velho = v.animal_id left join _id ir on ir.velho = v.romaneio_id
  where v.cliente_id = orig and v.excluido_em is null;
  update vendas_valor d set valor = round(o.valor * f, 2)
  from vendas_valor o join _id i on i.velho = o.venda_id where d.venda_id = i.novo;

  insert into pastos (cliente_id, cod, nome, tipo, area_ha, obs, chave, extra)
  select demo, cod, nome, tipo, area_ha, obs, chave, extra from pastos where cliente_id = orig and excluido_em is null;
  insert into supl_fabrica (cliente_id, data, tipo, dieta, kg, obs, responsavel, chave, extra)
  select demo, data, tipo, dieta, kg, obs, public._demo_txt(responsavel), chave, extra from supl_fabrica where cliente_id = orig and excluido_em is null;
  insert into supl_cocho (cliente_id, data, pasto, dieta, kg, estado, responsavel, chave, extra)
  select demo, data, pasto, dieta, kg, estado, public._demo_txt(responsavel), chave, extra from supl_cocho where cliente_id = orig and excluido_em is null;
  insert into atividades (cliente_id, titulo, nivel, equipe, responsaveis, prazo, obs, situacao, concluida_em, chave, extra)
  select demo, titulo, nivel, equipe, array(select public._demo_txt(x) from unnest(responsaveis) x), prazo, obs, situacao, concluida_em, chave,
         public._demo_json(extra, 1) from atividades where cliente_id = orig and excluido_em is null;
  insert into financeiro (cliente_id, data, tipo, grupo, sub, item, valor, obs, origem, chave, extra)
  select demo, data, tipo, grupo, sub, item, round(valor * f, 2), public._demo_txt(obs), origem, chave, public._demo_json(extra, 1)
  from financeiro where cliente_id = orig and excluido_em is null;

  -- painel do caixa, valores 10% diferentes dos reais
  insert into public.painel (cliente_id, chave, dados) values (demo, 'D', '{"m": ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"], "k": [["Receita", "RECEITAS PECUÁRIAS", "", "Garrotes", [139636, 133615, 217526, 1394495, 300446, 941015, 777173, 642492]], ["Despesa", "ADMINISTRAÇÃO", "COMUNICAÇÃO E ENERGIA", "CONTA DE ENERGIA ELÉTRICA", [1890, 1890, 2070, 2592, 2592, 2592, 2592, 2592]], ["Despesa", "ADMINISTRAÇÃO", "COMUNICAÇÃO E ENERGIA", "INTERNET", [446, 446, 446, 446, 446, 446, 446, 446]], ["Despesa", "ADMINISTRAÇÃO", "CONTABILIDADE, JURÍDICO E CONSULTORIA", "ESCRITÓRIO CONTABIL", [990, 990, 990, 990, 990, 990, 990, 990]], ["Despesa", "ADMINISTRAÇÃO", "CONTABILIDADE, JURÍDICO E CONSULTORIA", "CONSULTORIA ITALO", [3600, 3600, 2700, 2700, 2700, 2700, 3600, 3600]], ["Despesa", "ADMINISTRAÇÃO", "DESPESAS FINANCEIRAS", "JUROS FINANCEIROS", [2322, 0, 0, 0, 0, 0, 0, 0]], ["Despesa", "ADMINISTRAÇÃO", "DESPESAS FINANCEIRAS", "TARIFAS DE CONTA CORRENTE", [90, 90, 90, 90, 90, 90, 90, 90]], ["Despesa", "ADMINISTRAÇÃO", "OUTRAS DESPESAS ADMINISTRATIVAS", "SUPERMERCADO", [1512, 1359, 1170, 1170, 1170, 1170, 1170, 1170]], ["Despesa", "ADMINISTRAÇÃO", "OUTRAS DESPESAS ADMINISTRATIVAS", "DOAÇÕES", [0, 0, 0, 0, 0, 4536, 0, 0]], ["Despesa", "ADMINISTRAÇÃO", "OUTRAS DESPESAS ADMINISTRATIVAS", "MATERIAL DE ESCRITÓRIO", [216, 247, 1375, 0, 0, 134, 475, 2228]], ["Investimento", "INVESTIMENTOS EM INFRA ESTRUTURA", "CONSTRUÇÃO DE CERCAS", "OUTROS ITENS", [3931, 0, 0, 0, 0, 0, 0, 0]], ["Investimento", "INVESTIMENTOS EM INFRA ESTRUTURA", "FORMAÇÃO DE PASTO", "SEMENTE DE PASTAGEM", [783, 0, 0, 0, 0, 0, 0, 0]], ["Investimento", "INVESTIMENTOS EM INFRA ESTRUTURA", "FORMAÇÃO DE PASTO", "CORREÇÃO DE SOLO", [0, 0, 0, 0, 0, 0, 0, 54000]], ["Investimento", "INVESTIMENTOS EM INFRA ESTRUTURA", "INSTALAÇÕES PECUÁRIAS", "COCHOS/CERCAS/BEBEDOUROS", [0, 46960, 23270, 1080, 0, 0, 0, 35525]], ["Investimento", "INVESTIMENTOS EM INFRA ESTRUTURA", "INSTALAÇÕES PECUÁRIAS", "FERRAMENTAS E EQUIPAMENTOS", [0, 0, 0, 0, 0, 0, 89100, 451]], ["Investimento", "INVESTIMENTOS EM INFRA ESTRUTURA", "INSTALAÇÕES PECUÁRIAS", "FÁBRICA DE RAÇÃO/BARRACÃO", [0, 0, 0, 0, 0, 0, 33164, 14787]], ["Investimento", "INVESTIMENTOS EM INFRA ESTRUTURA", "INSTALAÇÕES PECUÁRIAS", "OUTROS ITENS", [996, 0, 0, 646, 0, 0, 0, 0]], ["Investimento", "INVESTIMENTOS EM INFRA ESTRUTURA", "REDE HIDRÁULICA", "ENCANAMENTOS", [0, 0, 0, 0, 0, 0, 1067, 0]], ["Investimento", "INVESTIMENTOS EM INFRA ESTRUTURA", "REDE HIDRÁULICA", "OUTROS ITENS", [0, 0, 0, 9000, 0, 0, 0, 0]], ["Investimento", "INVESTIMENTOS EM BOVINOS", "", "BEZERROS", [0, 207094, 113162, 791558, 136760, 462853, 739169, 965824]], ["Despesa", "MANUTENÇÃO DA FAZENDA", "PREDIAL", "MANUTENÇÃO SEDE", [0, 0, 7524, 0, 0, 0, 0, 0]], ["Despesa", "MANUTENÇÃO DA FAZENDA", "PREDIAL", "OUTROS ITENS", [0, 3161, 1318, 0, 0, 0, 0, 0]], ["Despesa", "MANUTENÇÃO DA FAZENDA", "CERCAS", "MANUTENÇÃO DE CERCAS", [0, 0, 54, 2610, 0, 0, 0, 0]], ["Despesa", "MANUTENÇÃO DA FAZENDA", "FERRAMENTAS E EQUIPAMENTOS", "MANUTENÇÃO GERAL", [1059, 541, 470, 675, 855, 2192, 477, 0]], ["Despesa", "MANUTENÇÃO DA FAZENDA", "REDE HIDRÁULICA", "OUTROS ITENS", [0, 189, 248, 0, 0, 0, 0, 594]], ["Despesa", "MÃO DE OBRA PERMANENTE", "SALÁRIOS E ENCARGOS", "SALÁRIOS", [16020, 10639, 10639, 9450, 9450, 9450, 11610, 11610]], ["Despesa", "MÃO DE OBRA PERMANENTE", "SALÁRIOS E ENCARGOS", "PROLABORE", [9000, 9000, 9000, 9000, 9000, 9000, 9000, 9000]], ["Despesa", "MÃO DE OBRA PERMANENTE", "SALÁRIOS E ENCARGOS", "FGTS", [612, 612, 612, 612, 612, 612, 612, 612]], ["Despesa", "MÃO DE OBRA PERMANENTE", "SALÁRIOS E ENCARGOS", "PAGAMENTO HORAS DE TRATOR", [0, 5850, 0, 3600, 3600, 3600, 3600, 2520]], ["Despesa", "MÃO DE OBRA PERMANENTE", "SALÁRIOS E ENCARGOS", "ACERTOS TRABALHISTAS", [0, 0, 0, 0, 0, 13635, 0, 0]], ["Despesa", "MÃO DE OBRA PERMANENTE", "SALÁRIOS E ENCARGOS", "DIARISTAS", [0, 0, 0, 0, 0, 810, 900, 0]], ["Despesa", "PARQUE DE MÁQUINAS", "COMBUSTÍVEIS", "ÓLEO DIESEL", [4322, 6062, 1685, 6296, 850, 0, 670, 0]], ["Despesa", "PARQUE DE MÁQUINAS", "COMBUSTÍVEIS", "GASOLINA", [0, 302, 540, 688, 564, 3361, 1717, 1996]], ["Despesa", "PARQUE DE MÁQUINAS", "MANUTENÇÃO E CONSERTO", "MANUTENÇÃO DE VEÍCULOS", [0, 790, 0, 8067, 0, 0, 0, 0]], ["Despesa", "PARQUE DE MÁQUINAS", "MANUTENÇÃO E CONSERTO", "MANUTENÇÃO DE MÁQUINAS E IMPLEMENTOS", [0, 3010, 2787, 0, 1876, 4831, 5755, 0]], ["Despesa", "PARQUE DE MÁQUINAS", "MANUTENÇÃO E CONSERTO", "OUTROS ITENS", [0, 0, 0, 54, 0, 0, 0, 0]], ["Despesa", "PARQUE DE MÁQUINAS", "SEGUROS, IMPOSTOS MULTAS E OUTROS", "IPVA", [0, 8073, 0, 0, 0, 0, 0, 0]], ["Despesa", "PASTAGENS", "MANUTENÇÃO DE PASTAGEM", "ADUBAÇÃO", [11525, 11525, 11525, 11525, 0, 0, 0, 0]], ["Despesa", "PASTAGENS", "MANUTENÇÃO DE PASTAGEM", "HERBICIDAS", [36382, 7588, 2925, 6030, 3333, 36292, 2542, 4556]], ["Despesa", "PASTAGENS", "MANUTENÇÃO DE PASTAGEM", "INSETICIDAS", [0, 0, 3600, 4385, 0, 0, 0, 0]], ["Despesa", "PASTAGENS", "MANUTENÇÃO DE PASTAGEM", "TERCEIRIZADOS (APLICAÇÃO TOCO)", [0, 20250, 4500, 2700, 0, 8370, 4500, 4500]], ["Despesa", "PASTAGENS", "MANUTENÇÃO DE PASTAGEM", "OUTROS ITENS", [0, 1147, 523, 0, 0, 0, 0, 0]], ["Despesa", "REBANHO CORTE", "NUTRIÇÃO", "Dieta 0,1", [9860, 9356, 5658, 8740, 7675, 11429, 18230, 29445]], ["Despesa", "REBANHO CORTE", "NUTRIÇÃO", "Dieta 0,3", [25520, 24898, 21553, 22126, 19355, 16344, 5237, 3521]], ["Despesa", "REBANHO CORTE", "NUTRIÇÃO", "Dieta 0,5", [0, 0, 0, 0, 0, 0, 14191, 14270]], ["Despesa", "REBANHO CORTE", "NUTRIÇÃO", "Dieta 0,7", [0, 0, 1069, 3528, 5934, 6308, 12490, 12580]], ["Despesa", "REBANHO CORTE", "NUTRIÇÃO", "Dieta 1", [0, 0, 0, 0, 0, 0, 0, 1072]], ["Despesa", "REBANHO CORTE", "SANIDADE", "VACINAS", [994, 1066, 5582, 2552, 0, 0, 8557, 0]], ["Despesa", "REBANHO CORTE", "SANIDADE", "OUTROS ITENS", [0, 0, 0, 0, 0, 0, 806, 0]], ["Despesa", "REBANHO CORTE", "SANIDADE", "PROTOCOLO GERAL", [0, 0, 0, 5396, 9374, 9490, 3177, 2020]], ["Despesa", "TAXA E IMPOSTOS", "TAXAS E IMPOSTOS", "IR", [0, 0, 0, 0, 0, 6967, 6967, 6967]], ["Despesa", "TAXA E IMPOSTOS", "TAXAS E IMPOSTOS", "RECEITA FEDERAL", [1710, 1710, 1710, 1710, 1710, 1710, 1710, 1710]], ["Despesa", "TAXA E IMPOSTOS", "TAXAS E IMPOSTOS", "OUTROS ITENS", [0, 0, 0, 936, 0, 0, 0, 0]], ["Despesa", "TROPA", "TROPA DE SERVIÇO", "MINERAIS TROPA", [0, 212, 0, 0, 0, 0, 0, 0]], ["Despesa", "TROPA", "TROPA DE SERVIÇO", "OUTROS ITENS", [0, 112, 0, 0, 0, 189, 499, 0]]], "i": {"animais": [1847.0, 1708.0, 1804.0, 1849.0, 1849.0, 1796.0, 2270.0, 2270.0], "arroba": [315.0, 315.0, 324.0, 333.0, 333.0, 324.0, 324.0, 333.0], "gmd": [0.2399, 0.2718, 0.1948, 0.2114, 0.1335, 0.2702, 0.1667, 0.1562], "custeio": [75.58, 85.62, 63.13, 70.41, 44.44, 87.56, 54.01, 52.02], "nutricao": [19.16, 20.06, 15.68, 18.6, 17.83, 18.98, 22.09, 26.82], "producao": [35.77, 42.91, 26.74, 29.02, 9.29, 42.63, 15.07, 13.85], "sanidade": [0.54, 0.62, 3.09, 4.3, 5.07, 5.28, 5.52, 0.89], "arrend": [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], "mo": [13.88, 15.28, 11.23, 12.26, 12.26, 20.66, 11.33, 10.46], "pasto": [6.24, 6.75, 6.39, 6.23, 0.0, 0.0, 0.0, 0.0]}}'::jsonb);
  insert into public.painel (cliente_id, chave, dados) values (demo, 'V', '[["2026-01-09", 36, 13415], ["2026-01-20", 20, 7827], ["2026-02-11", 75, 30572], ["2026-02-28", 24, 8816], ["2026-02-28", 10, 3730], ["2026-03-17", 22, 9172], ["2026-03-28", 26, 11253], ["2026-04-15", 121, 51334], ["2026-04-16", 177, 74435], ["2026-05-15", 69, 27819], ["2026-06-03", 193, 82697], ["2026-06-04", 10, 4434]]'::jsonb);
  insert into public.painel (cliente_id, chave, dados) values (demo, 'SUP', '[["2026-01", "Dieta 0,1", 1.868, 176], ["2026-01", "Dieta 0,3", 1.593, 534], ["2026-02", "Dieta 0,1", 1.868, 167], ["2026-02", "Dieta 0,3", 1.593, 521], ["2026-03", "Dieta 0,1", 1.868, 101], ["2026-03", "Dieta 0,3", 1.593, 451], ["2026-03", "Dieta 0,7", 1.782, 20], ["2026-04", "Dieta 0,1", 1.868, 156], ["2026-04", "Dieta 0,3", 1.593, 463], ["2026-04", "Dieta 0,7", 1.782, 66], ["2026-05", "Dieta 0,1", 1.868, 137], ["2026-05", "Dieta 0,3", 1.593, 405], ["2026-05", "Dieta 0,7", 1.782, 111], ["2026-06", "Dieta 0,1", 1.868, 204], ["2026-06", "Dieta 0,3", 1.593, 342], ["2026-06", "Dieta 0,7", 1.782, 118], ["2026-07", "Dieta 0,1", 1.917, 317], ["2026-07", "Dieta 0,3", 1.467, 119], ["2026-07", "Dieta 0,5", 1.314, 360], ["2026-07", "Dieta 0,7", 1.503, 277], ["2026-08", "Dieta 0,1", 1.917, 512], ["2026-08", "Dieta 0,3", 1.467, 80], ["2026-08", "Dieta 0,5", 1.314, 362], ["2026-08", "Dieta 0,7", 1.503, 279], ["2026-08", "Dieta 1", 1.323, 27]]'::jsonb);
  insert into public.painel (cliente_id, chave, dados) values (demo, 'marca', '{"subtitulo": "Demonstração do ISM Pecuária · dados fictícios"}'::jsonb);

  alter table pesagens enable trigger pesagens_valida;  alter table vendas enable trigger vendas_valida;
  alter table mortes enable trigger mortes_valida;      alter table sanitario enable trigger sanitario_valida;

  select count(*) into n from animais where cliente_id = demo;
  return 'Fazenda Demonstração pronta: ' || n || ' animais';
end $f$;

-- troca nomes num texto (usa a tabela temporária _troca)
create or replace function public._demo_txt(v text) returns text language plpgsql as $f$
declare r record;
begin
  if v is null then return null; end if;
  for r in select de, para from _troca order by length(de) desc loop v := replace(v, r.de, r.para); end loop;
  return v;
end $f$;

-- troca nomes e ajusta valores em dinheiro (preco, arr, valor) dentro de um jsonb de romaneio
create or replace function public._demo_json(j jsonb, f numeric) returns jsonb language plpgsql as $f$
declare inf jsonb; its jsonb;
begin
  if j is null then return null; end if;
  j := public._demo_txt(j::text)::jsonb;
  if f <> 1 then
    inf := j -> 'info';
    if inf ? 'preco' and jsonb_typeof(inf -> 'preco') = 'number' then inf := jsonb_set(inf, '{preco}', to_jsonb(round((inf ->> 'preco')::numeric * f, 2))); end if;
    if inf ? 'arr' and jsonb_typeof(inf -> 'arr') = 'number' then inf := jsonb_set(inf, '{arr}', to_jsonb(round((inf ->> 'arr')::numeric * f, 2))); end if;
    if inf is not null then j := jsonb_set(j, '{info}', inf); end if;
    if jsonb_typeof(j -> 'it') = 'array' then
      select coalesce(jsonb_agg(case when x ? 'valor' and jsonb_typeof(x -> 'valor') = 'number'
                                     then jsonb_set(x, '{valor}', to_jsonb(round((x ->> 'valor')::numeric * f, 2))) else x end), '[]')
        into its from jsonb_array_elements(j -> 'it') x;
      j := jsonb_set(j, '{it}', its);
    end if;
  end if;
  return j;
end $f$;

revoke execute on function public.recriar_demonstracao(text), public._demo_txt(text), public._demo_json(jsonb, numeric) from public, anon, authenticated;

select public.recriar_demonstracao();
