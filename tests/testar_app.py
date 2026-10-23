#!/usr/bin/env python3
"""Teste de ponta a ponta: abre o app de verdade num navegador (Chromium), entra com
pessoas diferentes, lança dados com e sem internet e confere no banco local.
Precisa do servidor simulado rodando: python3 tests/servidor_simulado.py 8790 e2e"""
import json, subprocess, sys, time
from playwright.sync_api import sync_playwright

URL = 'http://127.0.0.1:8790/'
BANCO = sys.argv[1] if len(sys.argv) > 1 else 'e2e'
falhas = []
def sql(q): return subprocess.run(['psql', '-d', BANCO, '-tAqc', q], capture_output=True, text=True).stdout.strip()
def ok(cond, desc):
    print(('OK     ' if cond else 'FALHOU ') + desc)
    if not cond: falhas.append(desc)
def esperar(fn, seg=20):
    t = time.time()
    while time.time() - t < seg:
        try:
            if fn(): return True
        except Exception: pass
        time.sleep(0.3)
    return False

CONFIG = """window.ISM_CONFIG={SUPABASE_URL:'http://127.0.0.1:8790',SUPABASE_ANON_KEY:'anon-teste',DOMINIO_LOGIN:'ismpecuaria.app',MINUTOS_INATIVO_COMPARTILHADO:15,SEGUNDOS_SINCRONIA:5};"""

def abrir(pw, nome):
    b = pw.chromium.launch()
    ctx = b.new_context(viewport={'width': 412, 'height': 900}, locale='pt-BR')
    ctx.route('https://**/*', lambda r: r.fulfill(status=200, content_type='text/css' if 'fonts' in r.request.url else 'application/javascript', body=''))
    p = ctx.new_page()
    erros = []
    p.goto(URL); p.wait_for_function('navigator.serviceWorker && navigator.serviceWorker.controller || new Promise(r=>setTimeout(r,1500))')
    p.on('pageerror', lambda e: erros.append(str(e)))
    p.reload()
    return b, ctx, p, erros

def entrar(p, login, senha='senha123', codigo=None):
    p.fill('#flogin input[name=login]', login)
    p.fill('#flogin input[name=senha]', senha)
    p.click('#flogin button[type=submit]')
    if codigo:
        p.wait_for_selector('#fcod', timeout=15000)
        p.fill('#fcod input[name=cod]', codigo)
        p.click('#fcod button[type=submit]')
    p.wait_for_function('window.ISM && window.ISM.iniciado && typeof READY!=="undefined" && READY', timeout=60000)

def navs(p): return p.evaluate("[...document.querySelectorAll('#nav button')].filter(b=>!b.hidden).map(b=>b.dataset.v)")

subprocess.run(['curl', '-s', URL + '__teste/offline?on=0'], capture_output=True)
with sync_playwright() as pw:
    # ---------------- Italo (ISM, com duas etapas) ----------------
    b, ctx, p, erros = abrir(pw, 'italo')
    p.fill('#flogin input[name=login]', 'italo'); p.fill('#flogin input[name=senha]', 'errada'); p.click('#flogin button[type=submit]')
    ok(esperar(lambda: 'incorretos' in p.inner_text('#entrada-aviso')), 'senha errada mostra "Login ou senha incorretos"')
    entrar(p, 'italo', codigo='123456')
    ok(p.evaluate('A.length') == 3643, 'Italo vê os 3.643 animais')
    ok(navs(p) == ['fin', 'man', 'reb', 'sup', 'atv', 'map'] and p.evaluate("can('importar')"), 'Italo vê todas as abas e pode importar: ' + str(navs(p)))
    ok(p.evaluate("A.filter(a=>a.venda&&a.venda.valor>0).length") == 130, 'Italo vê o valor das 130 vendas')
    ok(p.evaluate("C.pastos.length") == 40 and p.evaluate("C.cocho.length") == 4, 'pastos e cocho carregados')
    ok(p.evaluate("R.length") == 64, 'romaneios carregados')
    ok('Barramas' in p.evaluate("document.querySelector('.brand').innerHTML"), 'logo da Barramas no topo')
    ok(p.evaluate("!!document.querySelector('#mapimg').src.startsWith('data:image')"), 'mapa da fazenda carregado')
    ok(p.evaluate("document.querySelector('#f-det').innerText.includes('Receitas')"), 'painel financeiro desenhado')
    # lança no caixa
    p.evaluate("""putC('financeiro',{id:uid(),d:'2026-10-20',tipo:'Despesa',grupo:'ADMINISTRAÇÃO',sub:'',item:'Teste e2e',valor:123.45,obs:'',manual:true,por:USER.n})""")
    ok(esperar(lambda: sql("select count(*) from financeiro where item='Teste e2e'") == '1'), 'lançamento de caixa do Italo chegou ao banco')
    ok(sql("select origem from financeiro where item='Teste e2e'") == 'manual', 'caixa gravado como manual')
    ok(not erros, 'sem erros de tela (Italo) ' + str(erros[:3]))
    b.close()

    # ---------------- Genisval (vaqueiro) ----------------
    b, ctx, p, erros = abrir(pw, 'genisval')
    entrar(p, 'genisval')
    ok(navs(p) == ['man', 'reb', 'sup', 'atv', 'map'], 'Genisval vê manejo, rebanho, suplemento, atividades e mapa: ' + str(navs(p)))
    ok(p.evaluate('A.length') == 3643, 'Genisval vê o rebanho')
    ok(p.evaluate("A.filter(a=>a.venda&&a.venda.valor!==undefined).length") == 0, 'Genisval NÃO recebe o valor das vendas')
    ok(p.evaluate("A.find(a=>a.venda).venda.arr") > 0, 'Genisval vê o valor da @')
    ok(p.evaluate("R.filter(r=>r.tipo==='Venda').every(r=>r.it.every(i=>i.valor===undefined))"), 'romaneio de venda sem valores para o vaqueiro')
    ok(p.evaluate("C.financeiro.length") == 0, 'Genisval não recebe o caixa')
    # pesagem com internet
    p.evaluate("""(()=>{const a=A.find(x=>x.id==='1001');a.pes=a.pes||[];a.pes.push({d:'2026-10-21',p:333,t:'Rotina'});putA(a)})()""")
    ok(esperar(lambda: sql("select count(*) from pesagens p join animais a on a.id=p.animal_id where a.brinco='1001' and p.peso=333") == '1'), 'pesagem do Genisval chegou ao banco')
    # sem internet
    sql_antes = sql("select count(*) from supl_cocho")
    subprocess.run(['curl', '-s', URL + '__teste/offline?on=1'], capture_output=True)
    ctx.set_offline(True)
    p.evaluate("window.dispatchEvent(new Event('offline'))")
    p.evaluate("""putC('cocho',{id:uid(),d:'2026-10-22',pasto:'Pasto 3',dieta:'Dieta 1',kg:75,resp:'Genisval',estado:'Sobrou'})""")
    ok(esperar(lambda: 'aguardando' in p.inner_text('#sincst').lower() or 'a enviar' in p.inner_text('#sincst').lower(), 8), 'sem internet: aparece lançamento aguardando (' + p.inner_text('#sincst') + ')')
    ok(sql("select count(*) from supl_cocho") == sql_antes, 'sem internet: nada chegou ao banco ainda')
    p.evaluate("Sinc._fila().forEach(o=>o.n=Date.now()-13*3600e3); ISM.estado(Sinc.estado())")
    ok(p.evaluate("!!document.getElementById('faixapend')"), 'aviso forte de lançamento parado há mais de 12 horas')
    # recarrega o app sem internet: continua aberto com os dados
    p.reload()
    p.wait_for_function('window.ISM && window.ISM.iniciado && typeof READY!=="undefined" && READY', timeout=30000)
    ok(p.evaluate("C.cocho.some(c=>c.kg===75)"), 'sem internet: app reabre com o lançamento guardado no aparelho')
    subprocess.run(['curl', '-s', URL + '__teste/offline?on=0'], capture_output=True)
    ctx.set_offline(False)
    p.evaluate("window.dispatchEvent(new Event('online'))")
    ok(esperar(lambda: sql("select count(*) from supl_cocho where kg=75 and estado='Sobrou'") == '1', 30), 'internet voltou: cocho enviado ao banco')
    # banco recusa: pesagem antes da entrada
    p.evaluate("""(()=>{const a=A.find(x=>x.id==='1002');a.pes=a.pes||[];a.pes.push({d:'2020-01-01',p:200,t:'Rotina'});putA(a)})()""")
    ok(esperar(lambda: 'anterior à entrada' in (p.inner_text('#toast') or '')), 'banco recusa pesagem antes da entrada e o app avisa')
    ok(esperar(lambda: p.evaluate("!A.find(x=>x.id==='1002').pes.some(x=>x.d==='2020-01-01')")), 'pesagem recusada é desfeita no aparelho')
    # atividade: vaqueiro só vê operacional
    ok(p.evaluate("C.atividades.every(a=>a.nivel==='Operacional')"), 'Genisval só recebe atividades operacionais')
    ok(not p.evaluate("podeCorrRom(R.find(x=>x.tipo==='Entrada'&&(x.info||{}).por!=='Genisval'))"), 'Genisval não pode corrigir romaneio lançado por outra pessoa')
    ok(not erros, 'sem erros de tela (Genisval) ' + str(erros[:3]))
    b.close()

    # ---------------- Francisco (serviços gerais) ----------------
    b, ctx, p, erros = abrir(pw, 'francisco')
    entrar(p, 'francisco')
    ok(navs(p) == ['sup', 'atv', 'map'], 'Francisco vê suplemento, atividades e mapa: ' + str(navs(p)))
    ok(p.evaluate('A.length') == 0, 'Francisco não recebe o rebanho')
    a = p.evaluate("C.atividades.find(a=>a.tit==='Limpeza de bebedouros').id")
    p.evaluate(f"""(()=>{{const a=C.atividades.find(x=>x.id==='{a}');putC('atividades',{{...a,st:1,fim:null}})}})()""")
    ok(esperar(lambda: sql("select situacao from atividades where titulo='Limpeza de bebedouros'") == '1'), 'Francisco muda a situação da atividade dele')
    ok(not erros, 'sem erros de tela (Francisco) ' + str(erros[:3]))
    b.close()

    # ---------------- Josiane (administrativo): duas etapas já cadastradas? ----------------
    b, ctx, p, erros = abrir(pw, 'josiane')
    entrar(p, 'josiane', codigo='123456')
    ok(navs(p) == ['fin', 'man', 'reb', 'sup', 'atv', 'map'], 'Josiane vê tudo menos importar: ' + str(navs(p)))
    ok(p.evaluate("C.atividades.every(a=>a.nivel!=='Estratégico')"), 'Josiane não recebe atividades estratégicas')
    # tenta corrigir caixa (só ISM pode)
    p.evaluate("""(()=>{const x=C.financeiro.find(f=>f.item==='Teste e2e');putC('financeiro',{...x,valor:1})})()""")
    ok(esperar(lambda: 'não permite' in (p.inner_text('#toast') or '')), 'Josiane não consegue alterar o caixa e o app avisa')
    ok(sql("select valor from financeiro where item='Teste e2e'") == '123.45', 'valor do caixa continua o original no banco')
    # corrige a data de um romaneio de entrada
    p.on('dialog', lambda d: d.accept())
    p.evaluate("(()=>{const r=R.find(x=>x.tipo==='Entrada'&&x.it.some(i=>String(i.id)==='3449'));window.__rid=r.id;corrigirDataRom(r,'2026-09-11')})()")
    ok(esperar(lambda: sql("select ent_data from animais where brinco='3449'") == '2026-09-11'), 'Josiane corrige a data do romaneio de entrada e os animais mudam junto')
    ok(esperar(lambda: sql("select count(*) from romaneios where data='2026-09-11' and tipo='Entrada'") == '1'), 'romaneio gravado com a nova data')
    ok(p.evaluate("podeCorrRom(R[0])"), 'Josiane tem a opção de corrigir romaneio')
    ok(not erros, 'sem erros de tela (Josiane) ' + str(erros[:3]))
    b.close()

print('\n' + ('TUDO CERTO' if not falhas else f'{len(falhas)} FALHA(S)'))
sys.exit(1 if falhas else 0)
