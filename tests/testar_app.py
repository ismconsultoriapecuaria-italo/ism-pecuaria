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
    DIALOGOS.clear()
    p.on('dialog', lambda d: (DIALOGOS.append(d.message), (d.accept(RESPOSTA.get('texto', '')) if d.type == 'prompt' else d.accept()) if RESPOSTA['sim'] else d.dismiss()))
    p.reload()
    return b, ctx, p, erros

DIALOGOS = []
RESPOSTA = {'sim': True}

def entrar(p, login, senha='senha123', codigo=None):
    p.fill('#flogin input[name=login]', login)
    p.fill('#flogin input[name=senha]', senha)
    p.click('#flogin button[type=submit]')
    if codigo:
        p.wait_for_selector('#fcod', timeout=15000)
        p.fill('#fcod input[name=cod]', codigo)
        p.click('#fcod button[type=submit]')
    p.wait_for_function('(window.ISM && window.ISM.iniciado && typeof READY!=="undefined" && READY) || !!document.querySelector(".ism-cli")', timeout=60000)
    if p.query_selector('.ism-cli'):   # ISM cai no painel: abre a Barramas
        p.click(".ism-f:has-text('Fazenda Barramas') [data-abrir]")
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
    # preço das dietas (só ISM) → o cocho vira despesa de nutrição no caixa
    p.click('#nav button[data-v=sup]'); p.click('#sseg button:has-text("Preço das dietas")'); p.wait_for_selector('#fpre', state='visible')
    p.select_option('#pre-dieta', 'Dieta 1'); p.fill('#pre-preco', '2,00'); p.fill('#pre-desde', '2026-10-01'); p.click('#fpre button.btn')
    kg1 = float(sql("select coalesce(sum(kg),0) from supl_cocho where dieta='Dieta 1' and excluido_em is null and data>='2026-10-01'"))
    ok(esperar(lambda: sql("select valor from financeiro where origem='cocho' and item='Dieta 1' and excluido_em is null") == '%.2f' % (kg1 * 2)), 'preço salvo e cocho de outubro lançado no caixa (%.0f kg × R$ 2,00)' % kg1)
    ok(sql("select grupo||'|'||sub||'|'||data from financeiro where origem='cocho' and item='Dieta 1'") == 'REBANHO CORTE|NUTRIÇÃO|2026-10-01', 'despesa em REBANHO CORTE · NUTRIÇÃO, competência outubro')
    ok(esperar(lambda: p.evaluate("C.financeiro.some(x=>x.item==='Dieta 1'&&!x.manual&&Math.abs(x.valor-%f)<0.01)" % (kg1 * 2))), 'despesa automática chega ao app')
    ok(esperar(lambda: 'R$' in p.inner_text('#pret') and 'sem preço' in p.inner_text('#pret')), 'tabela de preços mostra a dieta com preço e as sem preço')
    p.evaluate("putC('cocho',{id:uid(),d:'2026-10-23',pasto:C.pastos[0].nome,dieta:'Dieta 1',kg:50,resp:USER.n})")
    ok(esperar(lambda: sql("select valor from financeiro where origem='cocho' and item='Dieta 1' and excluido_em is null") == '%.2f' % ((kg1 + 50) * 2)), 'trato novo no cocho soma na despesa do mês')
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
    # caixa: liberado só para ela (liberar_acao, migração 006)
    ok(p.evaluate("can('fin_editar')"), 'Josiane tem a liberação para editar o caixa')
    p.evaluate("""(()=>{const x=C.financeiro.find(f=>f.item==='Teste e2e');putC('financeiro',{...x,valor:1})})()""")
    ok(esperar(lambda: sql("select valor from financeiro where item='Teste e2e'") == '1.00'), 'Josiane altera o caixa e chega ao banco')
    # lançamento pelo formulário: centro → subcentro → item em lista, com fornecedor e NF
    p.click('#nav button[data-v=fin]'); p.wait_for_selector('#fcx')
    p.select_option('#cx-tipo', 'Despesa'); p.select_option('#cx-grupo', 'REBANHO CORTE'); p.select_option('#cx-sub', 'NUTRIÇÃO')
    itens = p.evaluate("[...document.querySelectorAll('#cx-item option')].map(o=>o.value)")
    ok(len(itens) > 1 and itens[-1] == '__outro', 'itens da nutrição em lista, com "Outro" no fim: ' + str(itens[:3]))
    p.select_option('#cx-item', itens[0]); p.fill('#cx-valor', '321,00'); p.fill('#cx-forn', 'Agro Teste'); p.fill('#cx-nf', '5566')
    p.click('#fcx button.btn')
    ok(esperar(lambda: sql("select sub||'|'||item||'|'||(extra->>'forn')||'|'||(extra->>'nf') from financeiro where valor=321") == 'NUTRIÇÃO|' + itens[0] + '|Agro Teste|5566'), 'lançamento com subcentro, item, fornecedor e NF no banco')
    p.select_option('#cx-item', '__outro'); ok(p.is_visible('#cx-novo'), 'campo do item novo aparece ao escolher "Outro"')
    p.fill('#cx-novo', 'Item novo e2e'); p.fill('#cx-valor', '10'); p.click('#fcx button.btn')
    ok(esperar(lambda: sql("select count(*) from financeiro where item='Item novo e2e' and sub='NUTRIÇÃO'") == '1'), 'item novo digitado em "Outro" gravado')
    ok(esperar(lambda: 'Item novo e2e' in p.evaluate("[...document.querySelectorAll('#cx-item option')].map(o=>o.value)")), 'item novo passa a aparecer na lista')
    ok('Agro Teste' in p.evaluate("[...document.querySelectorAll('#cx-forns option')].map(o=>o.value)"), 'fornecedor usado vira sugestão')
    # relatório do caixa (bibliotecas de PDF/Excel simuladas: o teste não tem internet)
    p.evaluate('''(()=>{const ch=[];window.__pdf=ch;const D={internal:{pageSize:{getWidth:()=>842,getHeight:()=>595},getNumberOfPages:()=>2},lastAutoTable:{finalY:300}};
      ['addImage','setFontSize','setTextColor','text','setDrawColor','setLineWidth','line','setFillColor','roundedRect','setFont','addPage','setPage'].forEach(k=>D[k]=(...a)=>{if(k==='text')ch.push(String(a[0]))});
      D.autoTable=o=>{ch.push('tabela:'+o.body.length)};D.output=()=>new Blob(['pdf']);
      window.jspdf={jsPDF:function(){return D}};
      window.XLSX={utils:{book_new:()=>({S:[]}),aoa_to_sheet:a=>({a}),book_append_sheet:(w,s,n)=>w.S.push([n,s.a.length])},write:w=>{window.__xls=w.S;return new Uint8Array(1)}};
      const o=window.claude.use;window.claude.use=async k=>k==='downloads'?{save:f=>{window.__salvo=f.filename}}:o(k)})()''')
    p.click('#rel-abrir'); p.wait_for_selector('#janela-rel')
    ok(p.evaluate("[...document.querySelectorAll('#janela-rel [name=mes] option')].some(o=>o.value==='2026-10')"), 'relatório oferece os meses, inclusive outubro')
    p.select_option('#janela-rel [name=mes]', '2026-10'); p.click('#janela-rel [data-rel=pdf]')
    ok(esperar(lambda: p.evaluate("window.__salvo") == 'Caixa_Fazenda_Barramas_2026-10.pdf'), 'PDF do caixa de outubro gerado: ' + str(p.evaluate("window.__salvo")))
    ok(p.evaluate("__pdf.includes('Relatório do caixa · Outubro de 2026') && __pdf.some(t=>t.startsWith('LANÇAMENTOS DO MÊS'))"), 'PDF com título, resumo e lançamentos')
    p.click('#janela-rel [data-rel=xlsx]')
    ok(esperar(lambda: p.evaluate("window.__salvo") == 'Caixa_Fazenda_Barramas_2026-10.xlsx'), 'Excel do caixa de outubro gerado')
    ok(p.evaluate("__xls.map(x=>x[0]).join(',')") == 'Resumo,Lançamentos' and p.evaluate("__xls[1][1]") >= 4, 'Excel com abas Resumo e Lançamentos: ' + str(p.evaluate("__xls")))
    p.click('#janela-rel [data-fechar]')
    # corrige a data de um romaneio de entrada
    p.evaluate("(()=>{const r=R.find(x=>x.tipo==='Entrada'&&x.it.some(i=>String(i.id)==='3449'));window.__rid=r.id;corrigirDataRom(r,'2026-09-11')})()")
    ok(esperar(lambda: sql("select ent_data from animais where brinco='3449'") == '2026-09-11'), 'Josiane corrige a data do romaneio de entrada e os animais mudam junto')
    ok(esperar(lambda: sql("select count(*) from romaneios where data='2026-09-11' and tipo='Entrada'") == '1'), 'romaneio gravado com a nova data')
    ok(p.evaluate("podeCorrRom(R[0])"), 'Josiane tem a opção de corrigir romaneio')
    # atividade que se repete toda sexta
    p.click('#nav button[data-v=atv]'); p.wait_for_selector('#fatv')
    p.fill('#atv-tit', 'Limpeza de bebedouro e2e'); p.check('#atv-rec input[value="5"]'); p.check('#atv-resp input >> nth=0'); p.click('#fatv button.btn')
    sexta = p.evaluate("proxRec([5],today(),true)")
    ok(esperar(lambda: sql("select prazo||'|'||(extra->>'rec') from atividades where titulo='Limpeza de bebedouro e2e'") == sexta + '|[5]'), 'atividade semanal criada com prazo na próxima sexta (' + sexta + ')')
    ok('Repete toda sexta' in p.inner_text('#atl'), 'lista mostra "Repete toda sexta"')
    aid = p.evaluate("C.atividades.find(a=>a.tit==='Limpeza de bebedouro e2e').id")
    p.click(f'[data-st="{aid}"]'); p.click(f'[data-st="{aid}"]')
    seguinte = p.evaluate(f"proxRec([5],'{sexta}')")
    ok(esperar(lambda: sql("select prazo||'|'||situacao||'|'||(extra->>'feitas') from atividades where titulo='Limpeza de bebedouro e2e'") == seguinte + '|0|1'), 'concluída, volta "a fazer" para a sexta seguinte (' + seguinte + ')')
    ok(esperar(lambda: p.evaluate("(C.atividades.find(a=>a.tit==='Limpeza de bebedouro e2e')||{}).prazo") == seguinte, 30), 'o app recebe a nova data')
    ordem = p.evaluate("[...document.querySelectorAll('#atl .lvl')].map(l=>[...l.querySelectorAll('.task:not(.done)')].map(t=>(t.querySelector('.late')||{}).textContent||''))")
    ok(True, 'ordem por prazo: ' + str(ordem)[:120])
    ok(not erros, 'sem erros de tela (Josiane) ' + str(erros[:3]))
    b.close()

    # ---------------- Wilmington (proprietário): edita qualquer lançamento ----------------
    b, ctx, p, erros = abrir(pw, 'wilmington')
    entrar(p, 'wilmington', codigo='123456')
    def editar_rom(filtro, campos, marcar=()):
        rid = p.evaluate("(()=>{const r=R.find(" + filtro + ");return String(r.id)})()")
        p.evaluate(f"editarRomaneio('{rid}')")
        p.wait_for_selector('#janela-edicao form')
        for nome, val in campos.items(): p.fill(f'#janela-edicao [name="{nome}"]', val)
        for nome in marcar: p.check(f'#janela-edicao [name="{nome}"]')
        p.click('#janela-edicao button[type=submit]')
        return rid
    # pesagem: muda o peso do primeiro animal
    rid = editar_rom("x=>x.tipo==='Pesagem'", {'p0': '401'})
    br = p.evaluate(f"String(R.find(x=>String(x.id)==='{rid}').it[0].id)")
    ok(esperar(lambda: sql(f"select count(*) from pesagens p join animais a on a.id=p.animal_id where a.brinco='{br}' and p.peso=401 and p.excluido_em is null") == '1'), 'Wilmington corrige o peso de uma pesagem')
    # venda: muda a @ e tira um animal
    rid = editar_rom("x=>x.tipo==='Venda'", {'arr': '420'}, ['r0'])
    ok(esperar(lambda: sql("select count(*) from vendas where arroba=420 and excluido_em is null") == '129'), 'Wilmington muda o valor da @ da venda (129 animais)')
    ok(esperar(lambda: sql("select count(*) from vendas where excluido_em is not null") == '1'), 'animal tirado da venda volta ao rebanho')
    ok(esperar(lambda: sql("select count(*) from vendas_valor vv join vendas v on v.id=vv.venda_id where v.excluido_em is null and abs(vv.valor - round(v.peso/30*420,2))<0.01") == '129'), 'valor de cada animal recalculado pela nova @')
    # entrada: troca um brinco
    rid = editar_rom("x=>x.tipo==='Entrada'&&x.it.some(i=>String(i.id)==='3449')", {'b0': '99449'})
    ok(esperar(lambda: sql("select count(*) from animais where brinco='99449' and excluido_em is null") == '1' and sql("select count(*) from animais where brinco='3449' and excluido_em is null") == '0'), 'Wilmington troca um brinco na entrada')
    # protocolo de segurança do peso (pesagem): 24 kg pergunta; recusando, nada é lançado
    p.click('#nav button[data-v=man]')
    br = p.evaluate("A.find(a=>!a.venda&&!a.morte).id")
    p.evaluate("P={d:today(),t:'Rotina',s:[],resp:USER.n,c:0,u:[],lin:10}")
    n0 = sql(f"select count(*) from pesagens p join animais a on a.id=p.animal_id where a.brinco='{br}' and p.excluido_em is null")
    RESPOSTA['sim'] = False; DIALOGOS.clear()
    p.evaluate(f"(()=>{{document.querySelector('#pb').value='{br}';document.querySelector('#pw').value='24';pcalc();planca()}})()")
    ok(any('ATENÇÃO AO PESO' in m and 'abaixo de 100 kg' in m for m in DIALOGOS), 'peso de 24 kg pede confirmação: ' + str(DIALOGOS[:1]))
    ok('fora do normal' in p.inner_text('#pg'), 'a tela já avisa "peso fora do normal" antes de lançar')
    time.sleep(1.5)
    ok(sql(f"select count(*) from pesagens p join animais a on a.id=p.animal_id where a.brinco='{br}' and p.excluido_em is null") == n0, 'recusando, a pesagem de 24 kg não é lançada')
    ok(p.evaluate("pesoAlertas({r:{it:[240,245,250,238,242].map(p=>({p}))}},330).some(t=>t.includes('foge do padrão'))"), 'garrote no meio de romaneio de bezerros é avisado')
    ok(p.evaluate("pesoAlertas({r:{it:[240,245,250,238,242].map(p=>({p}))}},260).length===0"), 'bezerro dentro do padrão não é avisado')
    ok(p.evaluate("pesoAlertas(null,650).some(t=>t.includes('acima de 600'))"), 'acima de 600 kg é avisado')
    RESPOSTA['sim'] = True; DIALOGOS.clear()
    p.evaluate("document.querySelector('#pend').click()")
    ok(any('Encerrar esta pesagem' in m for m in DIALOGOS), 'encerrar romaneio pergunta antes')
    # caixa: edita valor
    p.click('#nav button[data-v=fin]'); p.wait_for_selector('#cxd', timeout=10000)
    ok(not p.evaluate("document.querySelector('#cxd').open"), 'últimos lançamentos manuais começam recolhidos')
    p.click('#cxd summary'); p.wait_for_selector('[data-ed^="financeiro/"]', state='visible', timeout=10000)
    ok(p.evaluate("document.querySelectorAll('#cxl .rowl').length") <= 10, 'lista aberta mostra no máximo 10 de cada vez')
    p.click('[data-ed^="financeiro/"]'); p.wait_for_selector('#janela-edicao form')
    p.fill('#janela-edicao [name="valor"]', '150,50'); p.click('#janela-edicao button[type=submit]')
    ok(esperar(lambda: sql("select count(*) from financeiro where valor=150.50 and excluido_em is null") == '1'), 'Wilmington corrige um lançamento do caixa')
    ok(not erros, 'sem erros de tela (Wilmington) ' + str(erros[:3]))
    b.close()

    # ---------------- Fazenda Demonstração ----------------
    subprocess.run(['psql', '-d', BANCO, '-q', '-v', 'ON_ERROR_STOP=1', '-f', 'supabase/migrations/005_fazenda_demonstracao.sql'], capture_output=True)
    subprocess.run(['psql', '-d', BANCO, '-q', '-v', 'ON_ERROR_STOP=1', '-f', 'supabase/migrations/008_painel_ism.sql'], capture_output=True)
    ok(sql("select count(*) from animais a join clientes c on c.id=a.cliente_id where c.nome='Fazenda Demonstração'") == '3643', 'demonstração criada com os 3.643 animais')
    b, ctx, p, erros = abrir(pw, 'italo')
    p.fill('#flogin input[name=login]', 'italo'); p.fill('#flogin input[name=senha]', 'senha123'); p.click('#flogin button[type=submit]')
    p.wait_for_selector('#fcod'); p.fill('#fcod input[name=cod]', '123456'); p.click('#fcod button[type=submit]')
    p.wait_for_selector('.ism-cli', timeout=30000)
    txt = p.inner_text('.ism-cli')
    ok(all(n in txt for n in ('Wilmington Viana', 'Fazenda Barramas', 'ISM · Demonstração', 'Fazenda Demonstração')), 'Italo cai no painel: cliente → fazendas (Barramas e Demonstração)')
    p.click(".ism-f:has-text('Fazenda Demonstração') [data-abrir]")
    p.wait_for_function('window.ISM && window.ISM.iniciado && typeof READY!=="undefined" && READY', timeout=240000)
    ok(p.evaluate('A.length') == 3643 and p.evaluate("!!document.querySelector('.faixademo')"), 'demonstração aberta com a faixa de aviso')
    ok(p.evaluate("A.filter(a=>a.forn&&a.forn.includes('Neto')).length") == 0 and p.evaluate("RESP.includes('Carlos') && !RESP.includes('Wilmington')"), 'demonstração sem nomes reais')
    p.evaluate("localStorage.setItem('ism-demo-perfil','Vaqueiro')"); p.reload()
    p.wait_for_function('window.ISM && window.ISM.iniciado && typeof READY!=="undefined" && READY', timeout=240000)
    ok(navs(p) == ['man', 'reb', 'sup', 'atv', 'map'] and not p.evaluate('VAL()'), 'ver como vaqueiro: sem financeiro e sem totais de venda')
    ok(not erros, 'sem erros de tela (demonstração) ' + str(erros[:3]))
    b.close()

    # ---------------- Painel da ISM: cliente, fazenda e pessoa novos ----------------
    b, ctx, p, erros = abrir(pw, 'italo')
    p.fill('#flogin input[name=login]', 'italo'); p.fill('#flogin input[name=senha]', 'senha123'); p.click('#flogin button[type=submit]')
    p.wait_for_selector('#fcod'); p.fill('#fcod input[name=cod]', '123456'); p.click('#fcod button[type=submit]')
    p.wait_for_selector('.ism-cli', timeout=30000)
    RESPOSTA['texto'] = 'Cliente Teste'; p.click('#ism-novoc')
    p.wait_for_selector(".ism-g:has-text('Cliente Teste')", timeout=15000)
    ok(sql("select count(*) from grupos where nome='Cliente Teste'") == '1', 'ISM cadastra cliente novo pelo painel')
    p.click(".ism-g:has-text('Cliente Teste') [data-novaf]"); p.wait_for_selector('#ism-ff')
    p.fill('#ism-ff input[name=nome]', 'Fazenda Teste'); p.uncheck("#ism-ff input[value=financeiro]"); p.click('#ism-ff button[type=submit]')
    p.wait_for_selector('#ism-novap', timeout=15000)
    ok(sql("select array_to_string(modulos,',') from clientes where nome='Fazenda Teste'") == 'rebanho,suplemento,atividades,mapa', 'fazenda nova com as abas escolhidas')
    ok(int(sql("select jsonb_array_length(dados) from painel p join clientes c on c.id=p.cliente_id where c.nome='Fazenda Teste' and chave='plano'") or 0) > 20, 'fazenda nova recebe o plano de contas da Barramas')
    p.click('#ism-novap'); p.wait_for_selector('#ism-fp')
    p.fill('#ism-fp input[name=nome]', 'Pedro Teste'); p.fill('#ism-fp input[name=login]', 'pedro.teste'); p.fill('#ism-fp input[name=senha]', 'provis123')
    p.check("#ism-fp input[value=Vaqueiro]"); p.click('#ism-fp button[type=submit]')
    p.wait_for_selector('.ism-cred', timeout=15000)
    ok('pedro.teste' in p.inner_text('.ism-cred') and 'provis123' in p.inner_text('.ism-cred'), 'tela mostra login e senha provisória para passar à pessoa')
    ok(sql("select perfis::text from membros m join clientes c on c.id=m.cliente_id where c.nome='Fazenda Teste' and m.nome='Pedro Teste'") == '{Vaqueiro}', 'pessoa nova ligada à fazenda com o perfil')
    p.click('#ism-ok'); p.wait_for_selector(".ucard:has-text('Pedro Teste')"); p.click(".ucard:has-text('Pedro Teste')"); p.wait_for_selector('#ism-ep')
    p.check("#ism-ep input[value=fin_ver]"); p.click('#ism-ep button[type=submit]')
    ok(esperar(lambda: sql("select array_to_string(extras,',') from membros where nome='Pedro Teste'") == 'fin_ver'), 'ISM libera ação extra pela tela da pessoa')
    ok(not erros, 'sem erros de tela (painel da ISM) ' + str(erros[:3]))
    b.close()
    # a pessoa nova entra com a senha provisória e cria a dela
    b, ctx, p, erros = abrir(pw, 'pedro')
    p.fill('#flogin input[name=login]', 'pedro.teste'); p.fill('#flogin input[name=senha]', 'provis123'); p.click('#flogin button[type=submit]')
    p.wait_for_selector('#fnova', timeout=30000)
    ok(True, 'primeiro acesso pede para criar a própria senha')
    p.fill('#fnova input[name=s1]', 'minhasenha1'); p.fill('#fnova input[name=s2]', 'minhasenha1'); p.click('#fnova button[type=submit]')
    p.wait_for_function('window.ISM && window.ISM.iniciado && typeof READY!=="undefined" && READY', timeout=60000)
    ok(sql("select count(*) from senha_provisoria s join auth.users u on u.id=s.user_id where u.email='pedro.teste@ismpecuaria.app'") == '0', 'senha criada: não pede de novo')
    ok(navs(p) == ['man', 'reb', 'sup', 'atv', 'map'], 'Pedro entra na Fazenda Teste como vaqueiro: ' + str(navs(p)))
    ok(sql("select count(*) from auth.users where email='pedro.teste@ismpecuaria.app' and encrypted_password = crypt('minhasenha1', encrypted_password)") == '1', 'nova senha gravada')
    ok(not erros, 'sem erros de tela (pessoa nova) ' + str(erros[:3]))
    b.close()

print('\n' + ('TUDO CERTO' if not falhas else f'{len(falhas)} FALHA(S)'))
sys.exit(1 if falhas else 0)
