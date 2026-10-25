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
caso('vê preço por cabeça', 'genisval', "select preco_compra from public.animais where brinco='1001'", '2500.00', aal='aal1')
caso('lança pesagem', 'genisval', ins_pes, 'ok', aal='aal1')
caso('lança venda mas não vê o total', 'genisval', ins_venda + "; select count(*) from public.vendas_valor", 0, aal='aal1')
caso('vê o valor da @ da venda', 'genisval', ins_venda + "; select arroba from public.vendas", '300.00', aal='aal1')
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

print('--- Sem login')
cod, out = rodar("begin; set local role anon; select count(*) from public.animais; rollback;")
ok = cod != 0
falhas += 0 if ok else 1
print(('OK   ' if ok else 'FALHOU ') + '[anon] sem login não lê nada')

print(f'\n{"TUDO CERTO" if falhas == 0 else str(falhas) + " FALHA(S)"}')
sys.exit(1 if falhas else 0)
