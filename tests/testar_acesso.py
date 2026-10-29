#!/usr/bin/env python3
"""Testa as regras de acesso no Postgres local, perfil por perfil.
Uso: python3 tests/testar_acesso.py <pasta-do-socket> <porta>
Cada caso entra como uma pessoa (com ou sem verificação em duas etapas) e
confere se o banco deixa ou bloqueia a ação."""
import json, subprocess, sys

SOCK, PORTA = sys.argv[1], sys.argv[2]
U = {'italo': 1, 'wilmington': 2, 'josiane': 3, 'genisval': 4, 'francisco': 5, 'wemerson': 6, 'estranho': 9}
B = "'10000000-0000-0000-0000-000000000001'"
A1 = "'20000000-0000-0000-0000-000000000001'"

def rodar(sql):
    r = subprocess.run(['psql', '-h', SOCK, '-p', PORTA, '-U', 'postgres', '-d', 'ism', '-tAq', '-v', 'ON_ERROR_STOP=1'],
                       input=sql, capture_output=True, text=True)
    return r.returncode, (r.stdout.strip() if r.returncode == 0 else r.stderr.strip())

def como(quem, sql, aal='aal2'):
    claims = json.dumps({'sub': '00000000-0000-0000-0000-%012d' % U[quem], 'aal': aal, 'role': 'authenticated'})
    return rodar(f"begin; set local role authenticated; do $x$ begin perform set_config('request.jwt.claims', '{claims}', true); end $x$;\n{sql}; rollback;")

falhas = 0
def caso(desc, quem, sql, espera, aal='aal2'):
    global falhas
    cod, out = como(quem, sql, aal)
    if espera == 'erro':
        ok = cod != 0
    elif espera == 'ok':
        ok = cod == 0
    else:
        ok = cod == 0 and (out.splitlines() or [''])[-1] == str(espera)
    if not ok:
        falhas += 1
    print(('OK   ' if ok else 'FALHOU ') + f'[{quem}] {desc}' + ('' if ok else f'  -> esperado {espera}, veio: {out[:300]}'))

conta = lambda t: f"select count(*) from public.{t}"
ins_fin = f"insert into public.financeiro (cliente_id,data,tipo,grupo,item,valor) values ({B},'2026-03-01','Despesa','PESSOAL','Diária',150)"
upd_fin = "update public.financeiro set valor = 1 returning 1"
ins_pes = f"insert into public.pesagens (cliente_id,animal_id,data,peso) values ({B},{A1},'2026-03-01',300)"
ins_venda = f"insert into public.vendas (cliente_id,animal_id,data,peso,arroba,comprador) values ({B},{A1},'2026-04-01',540,300,'Frigorífico X')"
ins_cocho = f"insert into public.supl_cocho (cliente_id,data,pasto,dieta,kg,estado) values ({B},'2026-03-01','Pasto 1','Proteinado',200,'Limpo')"
ins_fab = f"insert into public.supl_fabrica (cliente_id,data,tipo,dieta,kg) values ({B},'2026-03-01','Produção','Proteinado',1000)"
ins_atv = lambda n: f"insert into public.atividades (cliente_id,titulo,nivel) values ({B},'Nova','{n}')"

print('--- Italo (ISM)')
caso('vê todos os clientes (2)', 'italo', conta('clientes'), 2)
caso('vê animais de todos os clientes', 'italo', conta('animais'), 3)
caso('sem verificação em duas etapas não vê nada', 'italo', conta('animais'), 0, aal='aal1')
caso('lança caixa', 'italo', ins_fin, 'ok')
caso('corrige caixa', 'italo', upd_fin, 1)
caso('cria atividade estratégica', 'italo', ins_atv('Estratégico'), 'ok')
caso('vê histórico', 'italo', "select count(*) > 0 from public.auditoria", 't')
caso('não apaga de verdade', 'italo', "delete from public.financeiro", 'erro')

print('--- Wilmington (proprietário)')
caso('vê só a própria fazenda', 'wilmington', conta('animais'), 2)
caso('lança caixa', 'wilmington', ins_fin, 'ok')
caso('corrige caixa', 'wilmington', upd_fin, 1)
caso('vê as 4 atividades', 'wilmington', conta('atividades'), 4)
caso('lança venda e vê o valor total', 'wilmington', ins_venda + "; select valor from public.vendas_valor", '5400.00')
caso('não vê histórico', 'wilmington', conta('auditoria'), 0)
caso('vê o painel do caixa', 'wilmington', conta('painel'), 2)
caso('sem duas etapas fica sem acesso', 'wilmington', conta('financeiro'), 0, aal='aal1')

print('--- Josiane (administrativo)')
caso('lança caixa', 'josiane', ins_fin, 'ok')
caso('não corrige caixa', 'josiane', upd_fin, '')
caso('vê tático e operacional, não estratégico', 'josiane', conta('atividades'), 3)
caso('não cria atividade estratégica', 'josiane', ins_atv('Estratégico'), 'erro')
caso('cria atividade tática', 'josiane', ins_atv('Tático'), 'ok')
caso('não edita pasto', 'josiane', "update public.pastos set nome='X' returning 1", '')

print('--- Genisval (vaqueiro)')
caso('não vê caixa', 'genisval', conta('financeiro'), 0)
caso('não lança caixa', 'genisval', ins_fin, 'erro')
caso('vê rebanho sem precisar de duas etapas', 'genisval', conta('animais'), 2, aal='aal1')
caso('não vê preço por cabeça (saiu do cadastro do animal)', 'genisval', "select coalesce(preco_compra::text,'nada') from public.animais where brinco='1001'", 'nada', aal='aal1')
caso('não vê valor de compra dos animais', 'genisval', conta('animais_valor'), 0, aal='aal1')
caso('não vê valor dos romaneios', 'genisval', conta('romaneio_valores'), 0, aal='aal1')
caso('lança pesagem', 'genisval', ins_pes, 'ok', aal='aal1')
caso('lança venda mas não vê o total', 'genisval', ins_venda + "; select count(*) from public.vendas_valor", 0, aal='aal1')
caso('lança venda sem valor da @', 'genisval', f"insert into public.vendas (cliente_id,animal_id,data,peso,comprador) values ({B},{A1},'2026-04-01',540,'Frigorífico X') returning 1", 1, aal='aal1')
caso('lança cocho', 'genisval', ins_cocho, 'ok', aal='aal1')
caso('lança fábrica', 'genisval', ins_fab, 'ok', aal='aal1')
caso('vê só atividades operacionais', 'genisval', conta('atividades'), 2, aal='aal1')
caso('conclui a própria atividade', 'genisval',
     "update public.atividades set situacao=2 where titulo='Limpar bebedouro' returning 1", 1, aal='aal1')
caso('não muda situação de atividade de outro', 'genisval',
     "update public.atividades set situacao=2 where titulo='Consertar cerca' returning 1", '', aal='aal1')
caso('não muda o título da própria atividade', 'genisval',
     "update public.atividades set titulo='x' where titulo='Limpar bebedouro'", 'erro', aal='aal1')
caso('não cria atividade', 'genisval', ins_atv('Operacional'), 'erro', aal='aal1')
caso('não lança pesagem antes da entrada', 'genisval',
     f"insert into public.pesagens (cliente_id,animal_id,data,peso) values ({B},{A1},'2025-01-01',300)", 'erro', aal='aal1')
caso('não lança em animal de outro cliente', 'genisval',
     f"insert into public.pesagens (cliente_id,animal_id,data,peso) values ({B},'20000000-0000-0000-0000-000000000003','2026-03-01',300)", 'erro', aal='aal1')
caso('corrige a própria pesagem', 'genisval', ins_pes + "; update public.pesagens set peso=301 returning 1", 1, aal='aal1')
caso('não corrige pesagem de romaneio encerrado', 'genisval',
     f"insert into public.romaneios (id,cliente_id,tipo,data) values ('40000000-0000-0000-0000-000000000001',{B},'Pesagem','2026-03-01');"
     f"insert into public.pesagens (cliente_id,animal_id,data,peso,romaneio_id) values ({B},{A1},'2026-03-01',300,'40000000-0000-0000-0000-000000000001');"
     "update public.romaneios set encerrado=true;"
     "update public.pesagens set peso=301 returning 1", '', aal='aal1')

caso('vê a marca da fazenda, mas não os números do caixa', 'genisval', "select string_agg(chave, ',') from public.painel", 'marca', aal='aal1')
print('--- Francisco (serviços gerais)')
caso('não vê rebanho', 'francisco', conta('animais'), 0, aal='aal1')
caso('não lança pesagem', 'francisco', ins_pes, 'erro', aal='aal1')
caso('lança cocho', 'francisco', ins_cocho, 'ok', aal='aal1')
caso('lança fábrica', 'francisco', ins_fab, 'ok', aal='aal1')
caso('vê pastos', 'francisco', conta('pastos'), 1, aal='aal1')
caso('não vê caixa', 'francisco', conta('financeiro'), 0, aal='aal1')
caso('vê só operacionais', 'francisco', conta('atividades'), 2, aal='aal1')

print('--- Wemerson (vaqueiro + serviços gerais)')
caso('vê rebanho', 'wemerson', conta('animais'), 2, aal='aal1')
caso('lança cocho', 'wemerson', ins_cocho, 'ok', aal='aal1')

print('--- Estranho (outra fazenda)')
caso('não vê animais da Barramas', 'estranho', "select count(*) from public.animais where brinco='1001'", 0)
caso('não lança na Barramas', 'estranho', ins_fin, 'erro')
caso('não consegue mudar o cliente de um registro', 'estranho',
     "update public.animais set cliente_id=" + B + " returning cliente_id", '10000000-0000-0000-0000-000000000002')

print('--- Dispensa da verificação em duas etapas')
caso('Josiane sem duas etapas não vê o caixa', 'josiane', conta('financeiro'), 0, aal='aal1')
rodar("select public.dispensar_duas_etapas('Fazenda Barramas', 'Josiane')")
caso('Josiane dispensada vê o caixa sem duas etapas', 'josiane', conta('financeiro'), 1, aal='aal1')
caso('dispensa da Josiane não vale para o Wilmington', 'wilmington', conta('financeiro'), 0, aal='aal1')
rodar("select public.dispensar_duas_etapas('Fazenda Barramas', 'Josiane', false)")
caso('dispensa desligada: volta a exigir', 'josiane', conta('financeiro'), 0, aal='aal1')

print('--- Permissão extra por pessoa (Josiane edita o caixa)')
caso('sem a liberação, Josiane não edita o caixa', 'josiane', upd_fin, '')
rodar("select public.liberar_acao('Fazenda Barramas', 'Josiane', 'fin_editar')")
caso('liberada, Josiane edita o caixa', 'josiane', upd_fin, '1')
caso('a liberação não exige menos que as duas etapas', 'josiane', upd_fin, '', aal='aal1')
caso('liberação da Josiane não vale para o Genisval', 'genisval', upd_fin, '', aal='aal1')
caso('ninguém se libera sozinho', 'josiane', "select public.liberar_acao('Fazenda Barramas', 'Genisval', 'fin_editar')", 'erro')
cod, out = rodar("select public.liberar_acao('Fazenda Barramas', 'Josiane', 'voar')")
ok = cod != 0; falhas += 0 if ok else 1
print(('OK   ' if ok else 'FALHOU ') + '[ism] ação desconhecida é recusada')
rodar("select public.liberar_acao('Fazenda Barramas', 'Josiane', 'fin_editar', false)")
caso('liberação retirada: volta a não editar', 'josiane', upd_fin, '')

print('--- Cocho lança a nutrição no caixa (competência)')
preco = f"select public.definir_preco_dieta({B}, 'Proteinado', 2.5, '2026-03-01')"
auto = f"select coalesce(string_agg(item||'|'||valor||'|'||sub, ';'), 'nada') from public.financeiro where origem='cocho' and excluido_em is null"
caso('sem preço, trato no cocho não gera despesa', 'italo', ins_cocho + ";\n" + auto, 'nada')
caso('com preço, 200 kg × R$ 2,50 = R$ 500 em NUTRIÇÃO', 'italo', preco + ";\n" + ins_cocho + ";\n" + auto, 'Proteinado|500.00|NUTRIÇÃO')
caso('dois tratos no mês viram um lançamento só', 'italo', preco + ";\n" + ins_cocho + ";\n" + ins_cocho + ";\n" + auto, 'Proteinado|1000.00|NUTRIÇÃO')
caso('trato antes do início do preço não conta', 'italo',
     f"select public.definir_preco_dieta({B}, 'Proteinado', 2.5, '2026-03-02');\n" + ins_cocho + ";\n" + auto, 'nada')
caso('corrigir o kg do trato corrige a despesa', 'italo', preco + ";\n" + ins_cocho + ";\nupdate public.supl_cocho set kg=100 where dieta='Proteinado';\n" + auto, 'Proteinado|250.00|NUTRIÇÃO')
caso('excluir o trato tira a despesa', 'italo', preco + ";\n" + ins_cocho + ";\nupdate public.supl_cocho set excluido_em=now() where dieta='Proteinado';\n" + auto, 'nada')
caso('preço novo refaz o mês', 'italo', preco + ";\n" + ins_cocho + f";\nselect public.definir_preco_dieta({B}, 'Proteinado', 3, '2026-03-01');\n" + auto, 'Proteinado|600.00|NUTRIÇÃO')
caso('vaqueiro não vê a despesa automática', 'genisval', ins_cocho + ";\nselect count(*) from public.financeiro where origem='cocho'", 0, aal='aal1')
def claims(q, aal): return json.dumps({'sub': '00000000-0000-0000-0000-%012d' % U[q], 'aal': aal, 'role': 'authenticated'})
cod, out = rodar("begin; set local role authenticated;"
                 f"do $x$ begin perform set_config('request.jwt.claims', '{claims('italo','aal2')}', true); end $x$; {preco};"
                 f"do $x$ begin perform set_config('request.jwt.claims', '{claims('genisval','aal1')}', true); end $x$; {ins_cocho};"
                 "reset role; select valor from public.financeiro where origem='cocho' and excluido_em is null; rollback;")
ok = cod == 0 and out.splitlines()[-1] == '500.00'; falhas += 0 if ok else 1
print(('OK   ' if ok else 'FALHOU ') + '[genisval] trato do vaqueiro lança a despesa mesmo sem ele ver o caixa' + ('' if ok else f'  -> {out[:300]}'))
caso('vaqueiro não muda preço', 'genisval', preco, 'erro', aal='aal1')
caso('administrativo não muda preço', 'josiane', preco, 'erro')
caso('ISM sem duas etapas não muda preço', 'italo', preco, 'erro', aal='aal1')

print('--- Painel da ISM (clientes, fazendas e pessoas)')
novo = ("select public.ism_salvar_cliente(null, 'Cliente Novo');\n"
        "select public.ism_salvar_fazenda(null, (select id from public.grupos where nome='Cliente Novo'), 'Fazenda Nova', '{rebanho,suplemento}');\n"
        "select public.ism_criar_pessoa((select id from public.clientes where nome='Fazenda Nova'), 'Zé Novo', 'ze.novo@ismpecuaria.app', 'provisoria1', 'Vaqueiro', '{Vaqueiro}');\n")
caso('ISM cria cliente, fazenda e pessoa (com senha provisória)', 'italo', novo +
     "select string_agg(p->>'nome'||':'||(p->>'login')||':'||(p->>'provisoria'),';') from jsonb_array_elements(public.ism_pessoas((select id from public.clientes where nome='Fazenda Nova'))) p", 'Zé Novo:ze.novo:true')
cod, out = rodar("begin; set local role authenticated;"
                 f"do $x$ begin perform set_config('request.jwt.claims', '{claims('italo','aal2')}', true); end $x$;\n{novo}"
                 "reset role; select count(*) from auth.users u join auth.identities i on i.user_id=u.id where u.email='ze.novo@ismpecuaria.app' and u.encrypted_password = crypt('provisoria1', u.encrypted_password) and u.aud='authenticated' and u.confirmation_token=''; rollback;")
ok = cod == 0 and out.splitlines()[-1] == '1'; falhas += 0 if ok else 1
print(('OK   ' if ok else 'FALHOU ') + '[ism] login novo entra com a senha provisória (usuário e identidade criados)' + ('' if ok else f'  -> {out[:300]}'))
caso('painel lista o cliente com a fazenda e 1 pessoa', 'italo', novo +
     "select f->>'nome'||':'||(f->>'pessoas') from jsonb_array_elements(public.ism_clientes()) g, jsonb_array_elements(g->'fazendas') f where g->>'nome'='Cliente Novo'", 'Fazenda Nova:1')
caso('mesmo login em outra fazenda só liga, sem nova senha', 'italo', novo +
     f"select public.ism_criar_pessoa({B}, 'Zé Novo', 'ze.novo@ismpecuaria.app', null, 'Vaqueiro', '{{Vaqueiro}}')->>'novo'", 'false')
caso('senha provisória curta é recusada', 'italo',
     f"select public.ism_criar_pessoa({B}, 'Curto', 'curto@ismpecuaria.app', '123', '', '{{Vaqueiro}}')", 'erro')
caso('não dá perfil ISM pelo painel', 'italo',
     f"select public.ism_criar_pessoa({B}, 'Esperto', 'esperto@ismpecuaria.app', 'provisoria1', '', '{{ISM}}')", 'erro')
caso('ISM edita perfil, ação extra, duas etapas e bloqueio', 'italo',
     "select public.ism_editar_pessoa((select id from public.membros where nome='Genisval'), 'Vaqueiro chefe', '{Vaqueiro,Serviços gerais}', '{fin_ver}', true, false);\n"
     "select funcao||'|'||array_to_string(perfis,',')||'|'||array_to_string(extras,',')||'|'||dispensa_mfa||'|'||ativo from public.membros where nome='Genisval'",
     'Vaqueiro chefe|Vaqueiro,Serviços gerais|fin_ver|true|false')
caso('ação extra desconhecida é recusada', 'italo',
     "select public.ism_editar_pessoa((select id from public.membros where nome='Genisval'), '', '{Vaqueiro}', '{voar}', false, true)", 'erro')
caso('ISM redefine senha e ela vira provisória', 'italo',
     "select public.ism_redefinir_senha((select id from public.membros where nome='Genisval'), 'outrasenha9');\n"
     f"select p->>'provisoria' from jsonb_array_elements(public.ism_pessoas({B})) p where p->>'nome'='Genisval'", 'true')
caso('não redefine a senha de quem é ISM', 'italo',
     f"select public.ism_redefinir_senha((select id from public.membros where nome='Italo' and cliente_id={B}), 'outrasenha9')", 'erro')
caso('proprietário não usa o painel da ISM', 'wilmington', "select public.ism_clientes()", 'erro')
caso('proprietário não cria pessoa', 'wilmington',
     f"select public.ism_criar_pessoa({B}, 'Intruso', 'intruso@ismpecuaria.app', 'provisoria1', '', '{{Vaqueiro}}')", 'erro')
caso('ISM sem duas etapas não usa o painel', 'italo', "select public.ism_clientes()", 'erro', aal='aal1')
caso('proprietário não lê a lista de clientes da ISM', 'wilmington', conta('grupos'), 0)
caso('quem não tem senha provisória não precisa trocar', 'genisval', "select public.preciso_trocar_senha()", 'f', aal='aal1')

print('--- Atividades que se repetem toda semana')
rot = "update public.atividades set extra = extra || '{\"rec\":[5]}', prazo = '2026-10-23' where titulo='Limpar bebedouro';\n"
caso('vaqueiro conclui a rotina de sexta e ela volta para a próxima sexta', 'italo',
     rot + "update public.atividades set situacao=2, concluida_em='2026-10-23' where titulo='Limpar bebedouro';\n"
     "select prazo||'|'||situacao||'|'||coalesce(concluida_em::text,'-')||'|'||(extra->>'ult')||'|'||(extra->>'feitas') from public.atividades where titulo='Limpar bebedouro'",
     '2026-10-30|0|-|2026-10-23|1')
caso('feita atrasada (terça) volta para a sexta seguinte', 'italo',
     rot + "update public.atividades set situacao=2, concluida_em='2026-10-27' where titulo='Limpar bebedouro';\n"
     "select prazo from public.atividades where titulo='Limpar bebedouro'", '2026-10-30')
cod, out = rodar("begin; update public.atividades set extra = extra || '{\"rec\":[5]}', prazo = '2026-10-23' where titulo='Limpar bebedouro'; set local role authenticated;"
                 f"do $x$ begin perform set_config('request.jwt.claims', '{claims('genisval','aal1')}', true); end $x$;"
                 "update public.atividades set situacao=2, concluida_em='2026-10-23' where titulo='Limpar bebedouro'; reset role;"
                 "select prazo||'|'||situacao from public.atividades where titulo='Limpar bebedouro'; rollback;")
ok = cod == 0 and out.splitlines()[-1] == '2026-10-30|0'; falhas += 0 if ok else 1
print(('OK   ' if ok else 'FALHOU ') + '[genisval] o próprio vaqueiro conclui e a rotina volta para a próxima sexta' + ('' if ok else f'  -> {out[:300]}'))
caso('atividade sem repetição continua concluída', 'italo',
     "update public.atividades set situacao=2, concluida_em='2026-10-23' where titulo='Consertar cerca';\n"
     "select situacao from public.atividades where titulo='Consertar cerca'", 2)


print('--- Valores lançados no romaneio (migração 011)')
RE = "'40000000-0000-0000-0000-000000000002'"; RV = "'40000000-0000-0000-0000-000000000003'"
ent = (f"insert into public.romaneios (id,cliente_id,tipo,data,info) values ({RE},{B},'Entrada','2026-05-01','{{\"forn\":\"Fazenda X\"}}');"
       f"insert into public.animais (cliente_id,brinco,ent_data,ent_peso,romaneio_id) values ({B},'2001','2026-05-01',300,{RE}),({B},'2002','2026-05-01',330,{RE}),({B},'2003','2026-05-01',270,{RE});")
salva_ent = f"select 1 from public.salvar_valor_romaneio({RE}, 90000, 3000, 2000);"
ven = (f"insert into public.romaneios (id,cliente_id,tipo,data,info) values ({RV},{B},'Venda','2026-06-01','{{\"comp\":\"Frigorífico Y\"}}');"
       f"insert into public.vendas (cliente_id,animal_id,data,peso,comprador,romaneio_id) values ({B},{A1},'2026-06-01',540,'Frigorífico Y',{RV}),({B},'20000000-0000-0000-0000-000000000002','2026-06-01',480,'Frigorífico Y',{RV});")
caso('valores antigos: preço por cabeça foi para a tabela protegida', 'wilmington', "select valor from public.animais_valor where animal_id=" + A1, '2500.00')
caso('valores antigos: R$/@ de cada animal calculado', 'wilmington', "select round(preco_arroba,2) from public.animais_valor where animal_id=" + A1, '300.00')
caso('administrativo lança o valor da compra: R$/@ real do romaneio', 'josiane', ent + salva_ent + f"select round(preco_arroba,2)||'|'||arrobas||'|'||total from public.romaneio_valores where romaneio_id={RE}", '3166.67|30.00|95000.00')
caso('cada animal recebe o valor pelo rateio das @', 'josiane', ent + salva_ent + "select v.valor from public.animais_valor v join public.animais a on a.id=v.animal_id where a.brinco='2001'", '31666.67')
caso('compra entra no caixa: animais, frete e comissão', 'josiane', ent + salva_ent + "select count(*)||'|'||sum(valor)||'|'||min(tipo) from public.financeiro where origem='romaneio' and excluido_em is null", '3|95000.00|Investimento')
caso('animal a mais no romaneio: rateio refeito', 'josiane', ent + salva_ent + f"insert into public.animais (cliente_id,brinco,ent_data,ent_peso,romaneio_id) values ({B},'2004','2026-05-01',300,{RE}); select round(preco_arroba,2) from public.romaneio_valores where romaneio_id={RE}", '2375.00')
caso('corrige o frete: caixa acompanha', 'josiane', ent + salva_ent + f"select 1 from public.salvar_valor_romaneio({RE}, 90000, 5000, 2000); select sum(valor) from public.financeiro where origem='romaneio' and excluido_em is null", '97000.00')
caso('vaqueiro não lança valor no romaneio', 'genisval', ent + salva_ent, 'erro', aal='aal1')
caso('proprietário lança o valor da venda: R$/@ viva e de carcaça', 'wilmington', ven + f"select 1 from public.salvar_valor_romaneio({RV}, p_total => 51000, p_carcaca => 36); select round(preco_arroba,2)||'|'||round(preco_arroba_carcaca,2) from public.romaneio_valores where romaneio_id={RV}", '1500.00|1416.67')
caso('cada venda recebe o valor pelo rateio', 'wilmington', ven + f"select 1 from public.salvar_valor_romaneio({RV}, p_total => 51000); select valor from public.vendas_valor vv join public.vendas v on v.id=vv.venda_id where v.romaneio_id={RV} and v.animal_id={A1}", '27000.00')
caso('venda entra no caixa como receita', 'wilmington', ven + f"select 1 from public.salvar_valor_romaneio({RV}, p_total => 51000); select tipo||'|'||grupo||'|'||valor from public.financeiro where origem='romaneio' and excluido_em is null", 'Receita|RECEITAS PECUÁRIAS|51000.00')
caso('romaneio excluído: sai do caixa', 'wilmington', ven + f"select 1 from public.salvar_valor_romaneio({RV}, p_total => 51000); update public.romaneios set excluido_em=now() where id={RV}; select count(*) from public.financeiro where origem='romaneio' and excluido_em is null", 0)
troca = lambda u, aal='aal2': "do $x$ begin perform set_config('request.jwt.claims', '" + json.dumps({'sub': '00000000-0000-0000-0000-%012d' % U[u], 'aal': aal, 'role': 'authenticated'}) + "', true); end $x$;"
caso('administrativo não corrige valor lançado pelo proprietário', 'wilmington', ent + salva_ent + troca('josiane') + f"select public.salvar_valor_romaneio({RE}, 1000, 0, 0)", 'erro')
caso('valor errado é recusado', 'josiane', ent + f"select public.salvar_valor_romaneio({RE}, 0, 0, 0)", 'erro')
caso('ninguém grava direto na tabela de valores', 'wilmington', f"insert into public.romaneio_valores (romaneio_id,cliente_id,tipo,total) values ('40000000-0000-0000-0000-000000000001',{B},'Entrada',1)", 'erro')

print('--- Funções de administração fechadas (migração 010)')
caso('vaqueiro não consegue se dar o perfil ISM', 'genisval', "select public.vincular_usuario('genisval@barramas.ism','Fazenda Barramas','Genisval','x','{ISM}')", 'erro', aal='aal1')
caso('proprietário não bloqueia ninguém por função de administração', 'wilmington', "select public.bloquear_usuario('Fazenda Barramas','Josiane')", 'erro')
caso('ninguém dispensa duas etapas por conta própria', 'josiane', "select public.dispensar_duas_etapas('Fazenda Barramas','Josiane')", 'erro')
caso('ninguém se libera ação extra', 'josiane', "select public.liberar_acao('Fazenda Barramas','Josiane','importar')", 'erro')
caso('preço das dietas de outra fazenda não vaza', 'estranho', f"select public.preco_dieta({B}, 'Dieta 1', current_date)", 'erro')
caso('ninguém refaz a nutrição na mão', 'italo', f"select public.recalcular_nutricao({B}, current_date)", 'erro')
caso('ninguém recria a demonstração pelo app', 'italo', "select public.recriar_demonstracao()", 'erro')
cod, out = rodar("begin; set local role anon; select public.vincular_usuario('genisval@barramas.ism','Fazenda Barramas','Genisval','x','{ISM}'); rollback;")
ok = cod != 0; falhas += 0 if ok else 1
print(('OK   ' if ok else 'FALHOU ') + '[anon] sem login não chama função de administração')

print('--- Sem login')
cod, out = rodar("begin; set local role anon; select count(*) from public.animais; rollback;")
ok = cod != 0
falhas += 0 if ok else 1
print(('OK   ' if ok else 'FALHOU ') + '[anon] sem login não lê nada')

print(f'\n{"TUDO CERTO" if falhas == 0 else str(falhas) + " FALHA(S)"}')
sys.exit(1 if falhas else 0)
