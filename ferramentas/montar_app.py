#!/usr/bin/env python3
"""Gera app/index.html e app/js/telas.js a partir do protótipo aprovado (tpl.html).
Foi usado uma vez para criar o app; depois disso, edite direto os arquivos em app/.
Uso: python3 ferramentas/montar_app.py <pasta-do-prototipo> <pasta-app>"""
import base64, re, sys, pathlib

P = pathlib.Path(sys.argv[1]); APP = pathlib.Path(sys.argv[2])
tpl = (P / 'tpl.html').read_text(encoding='utf8')
i = tpl.index('<script>\nconst $=s=>')
marcacao, script = tpl[:i], tpl[i + len('<script>\n'):tpl.rindex('</script>')]
estilo = marcacao[marcacao.index('<style>'):marcacao.index('</style>') + len('</style>')]
corpo = marcacao[marcacao.index('</style>') + len('</style>'):]

def troca(txt, a, b, n=1):
    c = txt.count(a)
    assert c == n, f'esperava {n} ocorrência(s) de {a[:70]!r}, achei {c}'
    return txt.replace(a, b)

# ---------- imagens fixas da ISM ----------
(APP / 'img').mkdir(parents=True, exist_ok=True)
for nome, arq in [('ism-branco.png', 'ism_branco.txt'), ('ism.png', 'logo.txt')]:
    d = (P / arq).read_text().strip()
    (APP / 'img' / nome).write_bytes(base64.b64decode(d.split(',', 1)[1]))
(APP / 'modelo-importacao.xlsx').write_bytes(base64.b64decode((P / 'tpl.txt').read_text().strip()))

# ---------- marcação ----------
corpo = troca(corpo, '<h1 class="vh">Fazenda Barramas</h1>%%HORIZ%%', '<h1 class="vh" data-cli-nome></h1><span data-marca-horiz></span>')
corpo = troca(corpo, '<p class="own">Gestão pecuária · Ciclo 2026 · Proprietário: Wilmington Viana</p>', '<p class="own" id="own"></p>')
corpo = corpo.replace('%%ISMBRANCO%%', 'img/ism-branco.png').replace('%%LOGO%%', 'img/ism.png')
corpo = troca(corpo, '%%SEALSVG%%', '<span data-marca-selo></span>')
corpo = troca(corpo, '<p class="eyebrow">Mapa de divisões · outubro/2025</p><h2 class="ct">Fazenda Barramas</h2>',
              '<p class="eyebrow" id="maptit">Mapa de divisões</p><h2 class="ct" data-cli-nome></h2>')
corpo = re.sub(r'<img id="mapimg" alt="[^"]*" src="%%MAP%%">', '<img id="mapimg" alt="Mapa da fazenda" src="">', corpo)
corpo = re.sub(r'<div class="desc">.*?</div>\s*</div>\s*(?=<div class="ismf">)', '<div class="desc" id="mapdesc"></div>\n  ', corpo, flags=re.S)
corpo = troca(corpo, 'Fonte: planilha de caixa 2026 (jan–ago). Desembolso = despesas + investimentos.', 'Desembolso = despesas + investimentos.')
corpo = re.sub(r'<div id="login" class="login" hidden>.*?</div></div>\n', '', corpo, flags=re.S)
assert '%%' not in corpo, re.findall(r'%%[A-Z]+%%', corpo)

entrada = '''<div id="entrada" class="login"><div class="lbox">
 <div class="lhd ehd"><img src="img/ism-branco.png" alt="ISM Consultoria Pecuária"><span>ISM Pecuária</span></div>
 <div id="entrada-corpo"><p class="hint">Carregando…</p></div>
</div></div>
'''
estilo_extra = '''<style>
.ehd{display:flex;align-items:center;gap:14px}.ehd img{height:46px}.ehd span{font-weight:800;font-size:20px;letter-spacing:.02em}
.eform{display:flex;flex-direction:column;gap:12px}.eform label{display:flex;flex-direction:column;gap:4px;font-weight:600;font-size:14px}
.eform input:not([type=checkbox]){min-height:48px;border:1px solid var(--line);border-radius:8px;padding:10px 12px;background:var(--card);font-size:17px}
.ech{flex-direction:row!important;align-items:flex-start;gap:8px!important;font-weight:400!important}.ech input{margin-top:4px}
.eaviso{margin:0;min-height:1.2em;font-size:14px}.eaviso.erro{color:var(--neg);font-weight:600}
.eqr{background:#fff;border-radius:10px;padding:12px;align-self:center;width:220px}.eqr img,.eqr svg{width:100%;height:auto;display:block}
.mono{font-family:var(--f-m);word-break:break-all}
.nomecli{font-size:26px;font-weight:800;letter-spacing:.01em}
.sincst{border-radius:999px;padding:3px 9px;background:rgb(255 255 255 / .1)}.sincst.off{background:#7a4a0c;color:#fff}
.lbox .btn.wide+.btn.wide{margin-top:0}
</style>
'''
html = f'''<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>ISM Pecuária</title>
<meta name="theme-color" content="#1F3D2B">
<meta name="description" content="Gestão de fazendas de recria e engorda · ISM Consultoria Pecuária">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icons/icone-192.png">
<link rel="apple-touch-icon" href="icons/icone-192.png">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..800&family=IBM+Plex+Mono:wght@500;600&display=swap">
<script defer src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
<script defer src="https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js"></script>
{estilo}
{estilo_extra}</head>
<body>
{corpo.strip()}
{entrada}<script src="js/config.js"></script>
<script src="js/versao.js"></script>
<script src="js/cofre.js"></script>
<script src="js/nuvem.js"></script>
<script src="js/sinc.js"></script>
<script src="js/ponte.js"></script>
<script src="js/entrada.js"></script>
</body>
</html>
'''
(APP / 'index.html').write_text(html, encoding='utf8')

# ---------- script das telas ----------
s = script
s = troca(s, 'const D=%%D%%,BM=D.m.slice(),VS=%%V%%,SUP=%%SUP%%;', 'const D=ISM.D,BM=D.m.slice(),VS=ISM.V,SUP=ISM.SUP;')
s = troca(s, "const SEALG='%%SEALG%%';", "const SEALG=ISM.marca.selog||'';")
s = troca(s, "const PDFLOGO='%%PDFLOGO%%',PDFR=%%PDFR%%;", "const PDFLOGO=ISM.marca.pdflogo||'',PDFR=ISM.marca.pdfr||0.26;")
s = troca(s, "const TPL='%%TPL%%';", "const TPL=null;")
s = troca(s, "try{const b=Uint8Array.from(atob(TPL),c=>c.charCodeAt(0));await d.save({filename:'modelo-importacao-barramas.xlsx',data:b});",
          "try{const r=await fetch('modelo-importacao.xlsx');if(!r.ok)throw{code:'fetch'};const b=new Uint8Array(await r.arrayBuffer());await d.save({filename:'modelo-importacao-ism.xlsx',data:b});")
s = re.sub(r"const PREP=\[.*?\];", "const PREP=[];", s, flags=re.S)
s = troca(s, "const RESP=['Italo','Wilmington','Josiane','Alessandro','Genisval','Wemerson','Wemerson (Bebê)','Francisco'];", "const RESP=ISM.nomes.slice();")
# permissões e login reais
a = s.index('const USERS=['); b = s.index('const nivVis=')
s = s[:a] + '''const USERS=[];
const PERM=ISM.perm;
let USER=null;
const can=k=>!!USER&&USER.r.some(r=>(PERM[k]||[]).includes(r));
const VAL=()=>can('rs');
const NAVP={fin:()=>can('fin_ver')&&ISM.mod('financeiro'),man:()=>can('manejo')&&ISM.mod('rebanho'),reb:()=>can('rebanho')&&ISM.mod('rebanho'),sup:()=>(can('cocho')||can('fabrica'))&&ISM.mod('suplemento'),atv:()=>ISM.mod('atividades'),map:()=>ISM.mod('mapa'),imp:()=>can('importar')};
function applyPerms(){
 document.querySelectorAll('#nav button').forEach(b=>b.hidden=!NAVP[b.dataset.v]());
 const n=[...document.querySelectorAll('#nav button')].filter(b=>!b.hidden).length;$('#nav').style.setProperty('--nav-n',n);
 document.querySelectorAll('[data-perm]').forEach(e=>e.hidden=!e.dataset.perm.split('|').some(k=>can(k)));
 ST.splice(0,ST.length,...[['fab','Fábrica de ração'],['coc','Cocho']].filter(([k])=>can(k=='fab'?'fabrica':'cocho')));if(!ST.some(s=>s[0]===SP)&&ST.length)SP=ST[0][0];
 const tat=!can('atv_todas');$('#atv-ne').disabled=tat;$('#atv-ne').closest('.chip').hidden=tat;
 $('#uchip').innerHTML='<span id="sincst" class="sincst">…</span><b>'+esc(USER.n)+'</b><span>'+esc(USER.r.join(' + '))+'</span><button type="button" id="utroca">Conta</button>';
 document.querySelectorAll('[data-resp]').forEach(s=>{if([...s.options].some(o=>o.value===USER.n))s.value=USER.n});
}
function entrar(u){USER=u;applyPerms();const h=(location.hash||'').slice(1),k=Object.keys(VIEWS).find(x=>VIEWS[x]===h);const ini=Object.keys(NAVP).find(x=>NAVP[x]());go(k&&NAVP[k]()?k:ini);window.scrollTo(0,0)}
function loginDraw(){ISM.menu()}
document.addEventListener('click',e=>{if(e.target.id==='utroca')ISM.menu()});
''' + s[b:]
s = troca(s, "let su=null;try{su=localStorage.getItem(LK+'-user')}catch(e){}const U0=USERS.find(u=>u.n===su);if(U0)entrar(U0);else loginDraw();", "entrar(ISM.user);")
s = troca(s, "const LK='barramas-rebanho';", "const LK='ism-'+ISM.cliente.id;")
s = troca(s, "/* ============ BRINCO (arte padrão da Fazenda Barramas) ============ */", "/* ============ BRINCO (arte padrão do cliente) ============ */")
s = troca(s, "Ignorar lançamentos financeiros de jan a ago/2026 (já estão no painel)", "Ignorar lançamentos financeiros dos meses que já estão no painel")
s = s.replace("'Fonte: planilha de caixa 2026 (jan–ago)'+(nimp?' e '+nimp+' lançamentos importados':'')+'. Desembolso",
              "(BM.length?'Fonte: planilha de caixa ('+lab(BM[0])+' a '+lab(BM[BM.length-1])+')':'Fonte: lançamentos do app')+(nimp?' e '+nimp+' lançamentos do app':'')+'. Desembolso")
assert '%%' not in s.replace('100%%', ''), re.findall(r'%%[A-Z]+%%', s)
(APP / 'js' / 'telas.js').write_text('/* Telas do ISM Pecuária (vindas do protótipo aprovado). */\n' + s, encoding='utf8')
print('ok', len(html), len(s))
