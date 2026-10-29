/* Telas do ISM Pecuária (vindas do protótipo aprovado). */
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let TT;const msg=t=>{const e=$('#toast');if(!t){e.hidden=true;return}e.textContent=t;e.hidden=false;clearTimeout(TT);TT=setTimeout(()=>e.hidden=true,4200)};
function seg(sel,items,cur,on){const el=$(sel);el.innerHTML=items.map(([k,t])=>`<button type="button" data-k="${k}" class="${k===cur?'on':''}" aria-pressed="${k===cur}">${t}</button>`).join('');el.onclick=e=>{const b=e.target.closest('button');if(b)on(b.dataset.k)}}

/* ============ FINANCEIRO ============ */
const D=ISM.D,BM=D.m.slice(),VS=ISM.V,SUP=ISM.SUP;let M=D.m.slice(),K=D.k,I=D.i;
const mn=["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
const lab=m=>mn[+m.slice(5)-1]+"/"+m.slice(2,4),fl=m=>mn[+m.slice(5)-1].toUpperCase()+"/"+m.slice(2,4);
const fm=v=>(v<0?"−":"")+"R$ "+Math.abs(Math.round(v)).toLocaleString("pt-BR");
const cp=v=>Math.abs(v)>=1e6?(v<0?"−":"")+"R$ "+(Math.abs(v)/1e6).toLocaleString("pt-BR",{maximumFractionDigits:2})+" mi":fm(v);
const S=(r,a,b)=>r[4].slice(a,b+1).reduce((x,y)=>x+y,0);
const sm=x=>x.reduce((p,q)=>p+q,0),nf=(v,d)=>v.toLocaleString("pt-BR",{minimumFractionDigits:d,maximumFractionDigits:d}),r0=v=>v?nf(Math.round(v),0):"–",R0=v=>"R$ "+r0(v),dm=s=>s.split("-").reverse().join("/"),d2=v=>nf(v,2);
const ti=(s,t)=>`<header class="ph"><p class="eyebrow">${s}</p><h2>${t}</h2></header>`,nt=t=>`<p class="note">${t}</p>`;
const kp=(l,v,u,c)=>`<div class="kpi ${c||''}"><small>${l}</small><b>${v}</b>${u?`<i>${u}</i>`:''}</div>`;
let PA=null,PB=null;
function finBuild(){const ex=(typeof C!=='undefined'&&C.financeiro)||[],ms=new Set(BM);ex.forEach(x=>ms.add(x.d.slice(0,7)));const old=M.slice();M=[...ms].sort();
 const ix=Object.fromEntries(M.map((m,i)=>[m,i])),pad=arr=>M.map(m=>{const j=BM.indexOf(m);return j<0?0:arr[j]}),rows={};K=[];
 D.k.forEach(r=>{const n=[r[0],r[1],r[2],r[3],pad(r[4])];K.push(n);rows[r.slice(0,4).join('|')]=n});
 ex.forEach(x=>{const k=[x.tipo,x.grupo,x.sub||'',x.item].join('|');let r=rows[k];if(!r){r=[x.tipo,x.grupo,x.sub||'',x.item,M.map(()=>0)];rows[k]=r;K.push(r)}r[4][ix[x.d.slice(0,7)]]+=x.valor});
 I={};for(const k in D.i)I[k]=pad(D.i[k]);
 const wasLast=PB===null||PB===old[old.length-1];PA=PA&&M.includes(PA)?PA:M[0];PB=wasLast?M[M.length-1]:(M.includes(PB)?PB:M[M.length-1]);
 ['#per-a','#per-b'].forEach(s=>{$(s).innerHTML=M.map((m,i)=>'<option value="'+i+'">'+lab(m)+'</option>').join('')});$('#per-a').value=M.indexOf(PA);$('#per-b').value=M.indexOf(PB)}
$('#per-a').onchange=$('#per-b').onchange=()=>{PA=M[+$('#per-a').value];PB=M[+$('#per-b').value];finDraw()};
const FT=[['det','Visão geral'],['perf','Perfil de desembolso'],['fat','Faturamento × desembolso'],['vend','Animais vendidos'],['sup','Suplementação']];let FP='det';
const T=t=>K.filter(r=>r[0]===t);
function tree(rows,a,b,color){
 const tot=rows.reduce((s,r)=>s+S(r,a,b),0),G={};
 rows.forEach(r=>{const v=S(r,a,b);if(!v)return;((G[r[1]]=G[r[1]]||{})[r[2]]=G[r[1]][r[2]]||[]).push([r[3],v])});
 const gs=Object.entries(G).map(([g,s])=>[g,s,Object.values(s).flat().reduce((x,y)=>x+y[1],0)]).sort((x,y)=>y[2]-x[2]);
 if(!gs.length)return'<p class="mut">Sem lançamentos no período.</p>';
 return gs.map(([g,s,t])=>`<details class="cc"><summary><div class="ln"><span>${g}</span><span>${fm(t)} <span class="mut">${(t/tot*100).toFixed(1).replace('.',',')}%</span></span></div><div class="meter"><i style="width:${t/gs[0][2]*100}%;background:${color}"></i></div></summary>`+
  Object.entries(s).map(([sb,its])=>{const st=its.reduce((x,y)=>x+y[1],0),ib=its.map(([n,v])=>`<div class="it"><span>${n}</span><span>${fm(v)}</span></div>`).join("");
   return `<div class="grp">${sb&&!(its.length===1&&its[0][0]===sb)?`<div class="ln"><b>${sb}</b><span>${fm(st)}</span></div>`:''}${ib}</div>`}).join("")+`</details>`).join("");
}
const nice=x=>{const p=10**Math.floor(Math.log10(x)),f=x/p;return(f<=1?1:f<=2?2:f<=5?5:10)*p};
const fk=v=>v>=1e6?(v/1e6).toLocaleString('pt-BR',{maximumFractionDigits:1})+' mi':v>=1e3?Math.round(v/1e3)+' mil':String(v);
function chart(a,b){
 const ms=M.slice(a,b+1),n=ms.length,ser=["Receita","Despesa","Investimento"].map(t=>ms.map((_,j)=>T(t).reduce((s,r)=>s+r[4][a+j],0)));
 const W=720,H=280,L=60,R=10,Tp=14,B=30,pw=W-L-R,ph=H-Tp-B,mx=Math.max(...ser.flat())||1,st=nice(mx/4),top=Math.ceil(mx/st)*st,y=v=>Tp+ph-v/top*ph;
 const col=["var(--pos)","var(--neg)","var(--inv)"],gw=pw/n,bw=Math.min(24,gw*.24);let g='';
 for(let v=0;v<=top+1e-6;v+=st)g+=`<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/><text x="${L-8}" y="${y(v)+4}" font-size="11" text-anchor="end" fill="var(--mut)">${fk(v)}</text>`;
 ms.forEach((m,j)=>{const cx=L+j*gw+gw/2;ser.forEach((s,i)=>{const h=y(0)-y(s[j]);g+=`<rect x="${cx-1.5*bw-2+i*(bw+2)}" y="${y(s[j])}" width="${bw}" height="${Math.max(h,0)}" rx="2" fill="${col[i]}"><title>${["Receitas","Despesas","Investimentos"][i]} ${lab(m)}: ${fm(s[j])}</title></rect>`});g+=`<text x="${cx}" y="${H-10}" font-size="12" text-anchor="middle" fill="var(--mut)">${lab(m)}</text>`});
 return `<div class="tw chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Receitas, despesas e investimentos por mês">${g}</svg></div><div class="legend"><span><i style="background:var(--pos)"></i>Receitas</span><span><i style="background:var(--neg)"></i>Despesas</span><span><i style="background:var(--inv)"></i>Investimentos</span></div>`;
}
function finDraw(){
 finBuild();let a=+$('#per-a').value,b=+$('#per-b').value;if(b<a)[a,b]=[b,a];
 const n=b-a+1,ms=M.slice(a,b+1),pr=lab(M[a])+(n>1?" a "+lab(M[b]):"");
 seg('#fseg',FT,FP,k=>{FP=k;finDraw()});const nimp=((typeof C!=='undefined'&&C.financeiro)||[]).length;$('#ffoot').textContent=(BM.length?'Fonte: planilha de caixa ('+lab(BM[0])+' a '+lab(BM[BM.length-1])+')':'Fonte: lançamentos do app')+(nimp?' e '+nimp+' lançamentos do app':'')+'. Desembolso = despesas + investimentos. Indicadores por cabeça existem só para os meses da planilha de caixa.';FT.forEach(([k])=>$('#f-'+k).hidden=k!==FP);
 const sum=t=>T(t).reduce((s,r)=>s+S(r,a,b),0),rec=sum("Receita"),des=sum("Despesa"),inv=sum("Investimento"),res=rec-des-inv;
 const last=k=>{for(let j=b;j>=a;j--)if(I[k][j])return I[k][j];return 0},avg=k=>{const v=I[k].slice(a,b+1).filter(x=>x);return v.length?sm(v)/v.length:0};
 const f1=v=>v?v.toLocaleString("pt-BR",{maximumFractionDigits:1}):"–";
 $('#f-det').innerHTML=`<div class="kpis">${kp("Receitas",`<span class="pos">${cp(rec)}</span>`,pr)+kp("Despesas",`<span class="neg">${cp(des)}</span>`,"operacionais")+kp("Investimentos",`<span class="inv">${cp(inv)}</span>`,"gado e infraestrutura")+kp("Resultado de caixa",cp(res),"receitas − desembolso","hi")}</div>
 <div class="kpis">${kp("Animais",last("animais").toLocaleString("pt-BR"),"último mês")+kp("Custeio por animal",fm(avg("custeio")),"R$/cab/mês, média")+kp("Valor da @",fm(last("arroba")),"último mês")+kp("GMD de equilíbrio",nf(last("gmd"),3)+" kg/dia","último mês")}</div>
 <div class="card"><h3 class="sub">Receitas, despesas e investimentos por mês</h3>${chart(a,b)}</div>
 <div class="card"><h3 class="sub">Despesas por centro de custo</h3>${tree(T("Despesa"),a,b,"var(--neg)")}</div>
 <div class="card"><h3 class="sub">Investimentos</h3>${tree(T("Investimento"),a,b,"var(--inv)")}</div>
 <div class="card"><h3 class="sub">Indicadores por cabeça, mês a mês</h3><div class="tw"><table class="pt"><tr><th>Mês</th><th>Animais</th><th>Custeio</th><th>Nutrição</th><th>Produção</th><th>Sanidade</th><th>M. de obra</th><th>Pastagem</th><th>@</th><th>GMD eq.</th></tr>${ms.map((m,j)=>{const q=a+j;return`<tr><td>${lab(m)}</td><td>${f1(I.animais[q])}</td><td>${f1(I.custeio[q])}</td><td>${f1(I.nutricao[q])}</td><td>${f1(I.producao[q])}</td><td>${f1(I.sanidade[q])}</td><td>${f1(I.mo[q])}</td><td>${f1(I.pasto[q])}</td><td>${f1(I.arroba[q])}</td><td>${f1(I.gmd[q])}</td></tr>`}).join("")}</table></div><p class="mut">Custos em R$ por cabeça por mês. Toque em um centro de custo acima para ver os itens.</p></div>`;
 const th=(l,z)=>`<tr><th>${l}</th>${ms.map(m=>`<th>${fl(m)}</th>`).join("")}<th>${z}</th></tr>`;
 const ln=(l,k,f,c)=>{const x=I[k].slice(a,b+1),nz=x.filter(v=>v);return`<tr class="${c||""}"><td>${l}</td>${x.map(v=>`<td>${f(v)}</td>`).join("")}<td class="av">${f(nz.length?sm(nz)/nz.length:0)}</td></tr>`};
 $('#f-perf').innerHTML=ti("Perfil de","Desembolso")+`<div class="tw"><table class="pt">`+th("Descrição",n>1?"Média "+n+" meses":"Mês")+ln("Nº de animais","animais",r0,"sm")+ln("Nutrição (R$/cab/mês)","nutricao",r0)+ln("Gastos de produção (R$/cab/mês)","producao",r0)+ln("Sanidade (R$/cab/mês)","sanidade",r0)+ln("Mão de obra (R$/cab/mês)","mo",r0)+ln("Pastagem (R$/cab/mês)","pasto",r0)+ln("Custeio/animal (R$/cab/mês)","custeio",r0,"sm")+ln("Valor da @ (R$)","arroba",d2,"sm")+ln("GMD ponto de equilíbrio","gmd",v=>d2(v)+" kg/dia","sm")+`</table></div>`+nt(`<b>${n>1?"Média de "+n+" meses":"Mês"} (${pr}).</b> Os indicadores são a média aritmética dos valores mensais de cada categoria.`);
 const mv=f=>ms.map((_,j)=>K.filter(f).reduce((s,r)=>s+r[4][a+j],0)),fat=mv(r=>r[0]==="Receita"),dp=mv(r=>r[0]==="Despesa"),ig=mv(r=>r[0]==="Investimento"&&/BOVINOS/.test(r[1])),inf=mv(r=>r[0]==="Investimento"&&!/BOVINOS/.test(r[1])),ds=dp.map((v,j)=>v+ig[j]+inf[j]),ac=sm(fat)-sm(ds);
 const sg=v=>(v<0?"−":"")+R0(Math.abs(v)),ro=sm(fat)-sm(dp),rw=(l,x,c)=>`<tr class="${c||""}"><td>${l}</td>${x.map(v=>`<td>${sg(v)}</td>`).join("")}<td class="av">${sg(sm(x))}</td></tr>`;
 $('#f-fat').innerHTML=ti("Caixa","Faturamento × Desembolso")+`<div class="kpis">${kp("Faturamento",`<span class="info">${sg(sm(fat))}</span>`,"venda de garrotes")+kp("Desembolso",`<span class="neg">${sg(sm(ds))}</span>`,"despesas + investimentos")+kp("Resultado operacional",`<span class="${ro<0?'neg':'pos'}">${sg(ro)}</span>`,"faturamento − despesas")+kp("Acumulado (caixa)",sg(ac),"faturamento − desembolso","hi")}</div><div class="tw"><table class="pt">`+th("Período","Total")+rw("Faturamento (venda de garrotes)",fat,"bl")+rw("Despesas",dp)+rw("Resultado operacional",fat.map((v,j)=>v-dp[j]),"sm")+rw("Investimento em gado",ig)+rw("Investimento em infraestrutura",inf)+rw("Desembolso",ds,"rd")+`</table></div>`+nt("<b>Desembolso</b> soma todas as saídas de caixa: despesas operacionais e investimentos em gado e infraestrutura. O resultado operacional desconsidera os investimentos.");
 const vs=VS.filter(x=>x[0].slice(0,7)>=M[a]&&x[0].slice(0,7)<=M[b]),q=sm(vs.map(x=>x[1])),kg=sm(vs.map(x=>x[2]));
 $('#f-vend').innerHTML=ti("Animais","Vendidos")+(vs.length?`<div class="kpis">${kp("Animais",r0(q),"cabeças")+kp("Peso total",r0(kg)+" kg")+kp("Total em @",d2(kg/30)+" @")+kp("Peso médio",r0(kg/q)+" kg","por animal","hi")}</div><div class="tw"><table class="pt"><tr><th>Data</th><th>Animais</th><th>Peso total (kg)</th><th>Total em @</th><th>Peso médio (kg)</th></tr>${vs.map(x=>`<tr><td>${dm(x[0])}</td><td>${x[1]}</td><td>${r0(x[2])}</td><td>${d2(x[2]/30)}</td><td>${nf(x[2]/x[1],1)}</td></tr>`).join("")}<tr class="sm"><td>Total geral</td><td>${q}</td><td>${r0(kg)}</td><td>${d2(kg/30)}</td><td>${r0(kg/q)}</td></tr></table></div>`+nt(`<b>Vendas de ${dm(vs[0][0])} a ${dm(vs[vs.length-1][0])}.</b> @ = peso ÷ 30.`):`<div class="card empty">Sem vendas registradas no período.</div>`);
 const ss=SUP.filter(x=>x[0]>=M[a]&&x[0]<=M[b]),dz=[...new Set(SUP.map(x=>x[1]))].sort(),cl=(d,m)=>ss.find(x=>x[0]===m&&x[1]===d),cc=r=>r[2]*r[3]*30,sb=rs=>sm(rs.map(x=>x[3])),sk=rs=>sm(rs.map(cc)),pm=rs=>sb(rs)?sk(rs)/(sb(rs)*30):0,fp=v=>v?nf(v,3):"–";
 const gr=(h,f,lf,tf,z)=>`<div class="card"><h3 class="sub">${h}</h3><div class="tw"><table class="pt">${th("Dieta",z)}${dz.map(d=>`<tr><td>${d}</td>${ms.map(m=>{const r=cl(d,m);return`<td>${r?f(r):"–"}</td>`}).join("")}<td class="av">${lf(ss.filter(x=>x[1]===d))}</td></tr>`).join("")}<tr class="sm"><td>${z==="Total"?"Total":"Média"}</td>${ms.map(m=>`<td>${tf(ss.filter(x=>x[0]===m))}</td>`).join("")}<td class="av">${tf(ss)}</td></tr></table></div></div>`;
 const tc=sk(ss),tb=sb(ss);
 $('#f-sup').innerHTML=ti("Consumo de","Suplemento")+(ss.length?`<div class="kpis">${kp("Sacos de 30 kg",r0(tb),"consumidos")+kp("Kg consumidos",r0(tb*30)+" kg")+kp("Custo total",R0(tc))+kp("Preço médio",fp(pm(ss)),"R$/kg, ponderado","hi")}</div>`+gr("Consumo em sacos de 30 kg",r=>r0(r[3]),rs=>r0(sb(rs)),rs=>r0(sb(rs)),"Total")+gr("Preço (R$/kg)",r=>fp(r[2]),rs=>fp(pm(rs)),rs=>fp(pm(rs)),"Média")+gr("Custo mês a mês (R$)",r=>R0(cc(r)),rs=>R0(sk(rs)),rs=>R0(sk(rs)),"Total")+nt("Custo = preço (R$/kg) × kg consumidos; fecha com as dietas lançadas no financeiro. Preço médio ponderado pelo consumo."):`<div class="card empty">Sem dados de suplementação no período.</div>`);
}

/* ============ REBANHO: dados ============ */
const LK='ism-'+ISM.cliente.id;let A=[],R=[],DB=null,READY=false,RO=false;
const C={fabrica:[],cocho:[],pastos:[],atividades:[],financeiro:[],importacoes:[]};
const clone=o=>JSON.parse(JSON.stringify(o));
const PEND={},RUN={};
async function flush(k){RUN[k]=1;while(PEND[k]){const p=PEND[k];delete PEND[k];try{const r=DB.doc(k);p.del?await r.delete():await r.set(p.v)}catch(e){dberr(e)}}RUN[k]=0}
function put(k,v){PEND[k]=v===null?{del:1}:{v:clone(v)};if(!RUN[k])flush(k)}
function saveLocal(){try{localStorage.setItem(LK,JSON.stringify(A));localStorage.setItem(LK+'-r',JSON.stringify(R));for(const k in C)localStorage.setItem(LK+'-'+k,JSON.stringify(C[k]))}catch(e){}}
function putC(col,o){if(USER&&!o.por)o={...o,por:USER.n};const L=C[col],i=L.findIndex(x=>x.id===o.id);i<0?L.push(o):L[i]=o;DB?put(col+'/'+o.id,o):saveLocal()}
function delC(col,id){C[col]=C[col].filter(x=>x.id!==id);DB?put(col+'/'+id,null):saveLocal()}
const putA=a=>DB?put('animais/'+a.id,a):saveLocal(),delA=id=>DB?put('animais/'+id,null):saveLocal(),putR=r=>DB?put('romaneios/'+r.id,r):saveLocal(),delR=r=>DB?put('romaneios/'+r.id,null):saveLocal();
function dberr(e){const c=e&&e.code;if(c==='invalid_argument'){RO=true;msg('Este acesso não pode salvar lançamentos. Peça acesso de edição ao proprietário.')}else if(c==='quota_exceeded')msg('Limite de armazenamento atingido. Exporte e remova registros antigos.');else msg('Não foi possível salvar agora. Confira a conexão e tente de novo.')}
const canW=()=>{if(RO){msg('Este acesso é somente leitura.');return false}if(!READY){msg('Aguarde o rebanho carregar.');return false}return true};
(async()=>{
 await new Promise(r=>setTimeout(r,0));let db=null;try{db=window.claude?await claude.use('db'):null}catch(e){}
 if(!db){try{A=JSON.parse(localStorage.getItem(LK)||'[]');R=JSON.parse(localStorage.getItem(LK+'-r')||'[]');for(const k in C)C[k]=JSON.parse(localStorage.getItem(LK+'-'+k)||'[]')}catch(e){}READY=true;redraw();return}
 DB=db;const G={};let RT_=0;const ok=()=>{READY=['animais','romaneios',...Object.keys(C)].every(k=>G[k]);clearTimeout(RT_);RT_=setTimeout(redraw,IMPB?1500:120)};
 db.collection('animais').onSnapshot(s=>{A=s.docs.map(d=>clone(d.data()));G.animais=1;ok()},e=>msg('Conexão perdida. Recarregue a página.'));
 db.collection('romaneios').onSnapshot(s=>{R=s.docs.map(d=>clone(d.data())).sort((x,y)=>x.id-y.id);G.romaneios=1;ok()},e=>{});
 Object.keys(C).forEach(k=>db.collection(k).onSnapshot(s=>{C[k]=s.docs.map(d=>clone(d.data()));G[k]=1;ok()},e=>{}));
 try{const u=await claude.use('user');if(u&&(await u.can('data.write'))===false)RO=true}catch(e){}
})();

/* ============ REBANHO: utilidades ============ */
const num=v=>parseFloat(String(v).replace(/\./g,m=>String(v).includes(',')?'':m).replace(',','.'));
const brl=v=>v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const fd=d=>d?d.split('-').reverse().join('/'):'';
const days=(a,b)=>Math.max(1,Math.round((new Date(b)-new Date(a))/864e5));
const gmd=(a,b)=>((b.p-a.p)/days(a.d,b.d)).toFixed(3).replace('.',',');
const today=()=>{const d=new Date();return new Date(d-d.getTimezoneOffset()*6e4).toISOString().slice(0,10)};
const tag=id=>`<span class="tag">${esc(id)}</span>`;
function pts(a){const p=[a.ent,...(a.pes||[]).slice().sort((x,y)=>x.d<y.d?-1:1)];if(a.venda)p.push({d:a.venda.d,p:a.venda.p,v:1});return p}
const sit=a=>a.venda?'Vendido':a.morte?'Morto':'Ativo';
const CATS=['Bezerro','Garrote','Boi magro','Boi gordo'];
const catPeso=p=>p<300?'Bezerro':p<400?'Garrote':p<480?'Boi magro':'Boi gordo';
const catOf=a=>{const p=pts(a);return catPeso(p[p.length-1].p)};
const evs=(a,t)=>{const r=[];if(!t||t=='Entrada')r.push(a.ent.d);if(!t||t=='Pesagem')(a.pes||[]).forEach(x=>r.push(x.d));if(!t||t=='Venda')a.venda&&r.push(a.venda.d);if(!t||t=='Morte')a.morte&&r.push(a.morte.d);if(!t||t=='Protocolo sanitário')(a.san||[]).forEach(s=>r.push(s.d));return r};
function ficha(a){const p=pts(a);let h='<table class="ft"><tr class="h"><td>Evento</td><td>Data</td><td>Peso</td><td>GMD</td></tr>';
 p.forEach((x,i)=>{h+='<tr><td>'+(i?(x.v?'Venda':'Pesagem '+i+(x.obs?'<span class="sub2" style="display:block;font-size:12px;color:var(--mut)">'+esc(x.obs)+'</span>':'')):'Entrada')+'</td><td>'+fd(x.d)+'</td><td>'+x.p+' kg</td><td>'+(i?gmd(p[i-1],x)+' kg/dia':'–')+'</td></tr>'});h+='</table><div class="facts">';
 if(p.length>1)h+='<span>GMD total <b>'+gmd(p[0],p[p.length-1])+' kg/dia</b></span>';
 h+='<span>'+esc(a.sexo)+' · '+esc(catOf(a))+(a.raca?' · '+esc(a.raca):'')+'</span><span>Fornecedor <b>'+esc(a.forn)+'</b></span>'+(a.preco>0?'<span>Pago <b>'+brl(a.preco)+'</b></span>':'')+(a.lote?'<span>Lote <b>'+esc(a.lote)+'</b></span>':'');
 if(a.venda)h+='<span>Venda '+(VAL()?'<b>'+brl(a.venda.valor)+'</b> · ':'em '+fd(a.venda.d)+' · ')+''+esc(a.venda.comp)+' ('+esc(a.venda.dest)+')</span>';
 (a.san||[]).forEach(s=>{h+='<span>Protocolo '+fd(s.d)+': <b>'+esc(s.i.join(', '))+'</b></span>'});
 if(a.morte)h+='<span class="neg">Morte em <b>'+fd(a.morte.d)+'</b>'+(a.morte.causa?' · '+esc(a.morte.causa):'')+(a.morte.resp?' · '+esc(a.morte.resp):'')+'</span>';
 return h+'</div>'}


/* ============ BRINCO (arte padrão do cliente) ============ */
const SEALG=ISM.marca.selog||'';let TGN=0;
function tagArt(n){const id='tg'+(++TGN),s=String(n??'').trim(),L=s.length||1,fs=L>=4?92:L===3?100:108,tl=Math.min(182,L*46);
 return '<svg class="tagart" viewBox="0 0 200 250" role="img" aria-label="Brinco '+esc(s||'sem número')+'"><defs><linearGradient id="'+id+'g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ecd577"/><stop offset="1" stop-color="#ddc25d"/></linearGradient></defs>'+
 '<path d="M62,48 C62,22 80,4 100,4 C120,4 138,22 138,48 L138,60 C138,71 146,78 158,79 L180,81 C189,82 195,89 195,99 L195,228 C195,240 187,247 175,247 L25,247 C13,247 5,240 5,228 L5,99 C5,89 11,82 20,81 L42,79 C54,78 62,71 62,60 Z" fill="url(#'+id+'g)" stroke="#c4a843" stroke-width="2"/>'+
 '<circle cx="100" cy="36" r="20" fill="#d9bf58" stroke="#bfa23e" stroke-width="2"/><circle cx="100" cy="36" r="13" fill="#e9d371"/><ellipse cx="95" cy="31" rx="5" ry="3.5" fill="#f6e7a6" opacity=".8"/>'+
 '<g transform="translate(57,74) scale(.215)" color="#1d1b13">'+SEALG+'</g>'+
 '<text x="100" y="238" text-anchor="middle" fill="#1d1b13" font-family="Archivo,Arial Narrow,sans-serif" font-weight="800" font-size="'+fs+'" style="font-stretch:72%"'+(s.length>=3?' textLength="'+tl+'" lengthAdjust="spacingAndGlyphs"':'')+'>'+esc(s||'—')+'</text></svg>'}
const tagSet=(sel,n)=>{const e=$(sel);if(e)e.innerHTML=tagArt(n)};

/* ============ NAVEGAÇÃO ============ */
const VIEWS={fin:'financeiro',man:'manejo',reb:'rebanho',sup:'suplementacao',atv:'atividades',map:'mapa',imp:'importar'};let VIEW='fin';
const MT=[['ent','Entrada'],['pes','Pesagem'],['ven','Venda'],['mor','Morte']];let MP='ent';
const RT=[['ani','Animais'],['rom','Romaneios']];let RP='ani';
function go(v){if(USER&&NAVP[v]&&!NAVP[v]())v=Object.keys(NAVP).find(x=>NAVP[x]());VIEW=v;for(const k in VIEWS)$('#v-'+k).hidden=k!==v;document.querySelectorAll('#nav button').forEach(b=>b.toggleAttribute('aria-current',false)||b.dataset.v===v&&b.setAttribute('aria-current','page'));
 if(v==='fin'){finDraw();cxDraw()}if(v==='man')manDraw();if(v==='reb')refresh();if(v==='sup')supDraw();if(v==='atv')atvDraw();if(v==='map')mapDraw();if(v==='imp'){impHist();if(IMP)impShow()}try{history.replaceState(null,'','#'+VIEWS[v])}catch(e){}}
$('#nav').onclick=e=>{const b=e.target.closest('button');if(b){go(b.dataset.v);window.scrollTo(0,0)}};
function manDraw(){seg('#mseg',MT,MP,k=>{MP=k;manDraw()});MT.forEach(([k])=>$('#m-'+k).hidden=k!==MP)}
function redraw(){refresh();if(VIEW==='fin'){finDraw();cxDraw()}if(VIEW==='imp')impHist();if(VIEW==='sup')supDraw();if(VIEW==='atv')atvDraw();if(VIEW==='map')mapDraw()}
function refresh(){
 const at=A.filter(a=>sit(a)=='Ativo'),vd=A.filter(a=>a.venda),mo=A.filter(a=>a.morte&&!a.venda),lw=a=>{const p=pts(a);return p[p.length-1].p};
 const gs=at.map(a=>{const p=pts(a);return p.length>1?(p[p.length-1].p-a.ent.p)/days(a.ent.d,p[p.length-1].d):null}).filter(x=>x!=null);
 const CC=CATS.map(c=>{const L=at.filter(a=>catOf(a)===c);return[c,L.length,L.length?sm(L.map(lw))/L.length:0]});
 $('#rkc').innerHTML=READY?CC.map(([c,n,w])=>kp(c,n.toLocaleString('pt-BR'),n?'média '+nf(w,0)+' kg':'nenhum ativo')).join(''):'';
 $('#rk').innerHTML=!READY?kp('Rebanho','…','carregando'):kp('Ativos',at.length.toLocaleString('pt-BR'),'cabeças','hi')+kp('Peso médio',at.length?nf(sm(at.map(lw))/at.length,1)+' kg':'–','último peso dos ativos')+kp('GMD médio',gs.length?nf(sm(gs)/gs.length,3)+' kg/dia':'–','desde a entrada')+kp('Vendidos',vd.length.toLocaleString('pt-BR'),vd.length?(VAL()?brl(sm(vd.map(a=>a.venda.valor))):'cabeças vendidas'):(mo.length?mo.length+' mortes':'nenhuma venda'));
 if(VIEW!=='reb')return;seg('#rseg',RT,RP,k=>{RP=k;refresh()});RT.forEach(([k])=>$('#r-'+k).hidden=k!==RP);
 if(RP==='ani')render();else rrender()}

/* ============ ANIMAIS ============ */
let LF=[];
function opts(id,vals,t){const s=$(id),c=s.value;s.innerHTML='<option value="">'+t+'</option>'+[...new Set(vals)].filter(Boolean).sort().map(v=>'<option>'+esc(v)+'</option>').join('');s.value=c}
function render(){opts('#ff',A.map(a=>a.forn),'Todos');opts('#fl',A.map(a=>a.lote),'Todos');
 const q=$('#q').value.toLowerCase(),F=$('#ff').value,L=$('#fl').value,d1=$('#fd1').value,d2=$('#fd2').value,S=$('#fs').value,T2=$('#ft').value;
 const FC=$('#fcat').value,r=A.filter(a=>(!FC||catOf(a)==FC)&&(a.id+' '+catOf(a)).toLowerCase().includes(q)&&(!F||a.forn==F)&&(!L||a.lote==L)&&(!(d1||d2||T2)||evs(a,T2).some(d=>(!d1||d>=d1)&&(!d2||d<=d2)))&&(!S||sit(a)==S)).sort((x,y)=>+x.id-+y.id);
 LF=r;const vend=sm(r.map(a=>a.venda?a.venda.valor:0));
 $('#fc').textContent=r.length+' de '+A.length+' animais'+(vend&&VAL()?' · vendido '+brl(vend):'');
 const open=new Set([...document.querySelectorAll('#ls details[open]')].map(d=>d.dataset.id));
 const sh=r.slice(0,LIM);
 $('#ls').innerHTML=!READY?'<div class="empty">Carregando rebanho…</div>':!A.length?'<div class="empty"><b>Nenhum animal lançado ainda</b>Comece pelo romaneio de entrada em Manejo ou importe uma planilha.</div>':r.length?sh.map(a=>{const p=pts(a),s=sit(a),o=open.has(a.id);return '<details class="an" data-id="'+esc(a.id)+'"'+(o?' open':'')+'><summary>'+tag(a.id)+'<span class="who">'+esc(catOf(a))+' · '+esc(a.sexo)+'<span class="pill '+s+'">'+s+'</span></span><span class="kg">'+p[p.length-1].p+' kg</span></summary><div class="body">'+(o?ficha(a):'')+'</div></details>'}).join('')+(r.length>LIM?'<button type="button" class="btn ghost wide" id="lsmore" style="margin-top:10px">Mostrar mais '+Math.min(200,r.length-LIM)+' de '+(r.length-LIM)+' restantes</button>':''):'<div class="empty">Nenhum animal com esses filtros.</div>'}
let LIM=200;
$('#ls').addEventListener('toggle',e=>{const d=e.target;if(d.matches&&d.matches('details.an')&&d.open){const b=d.querySelector('.body');if(!b.innerHTML){const a=findA(d.dataset.id);if(a)b.innerHTML=ficha(a)}}},true);
$('#ls').addEventListener('click',e=>{if(e.target.id==='lsmore'){LIM+=200;render()}});
const FL=['#q','#fcat','#ff','#fl','#fd1','#fd2','#fs','#ft'];FL.forEach(i=>$(i).oninput=()=>{LIM=200;render()});$('#fx').onclick=()=>{FL.forEach(i=>$(i).value='');LIM=200;render()};
const sc=v=>typeof v=='number'?String(v).replace('.',','):String(v??'');
const PDFLOGO=ISM.marca.pdflogo||'',PDFR=ISM.marca.pdfr||0.26;
async function saveRows(d,name,rows,fmt,rom){
 if(fmt!='pdf')return d.save({filename:name+'.csv',data:'﻿'+rows.map(l=>l.map(v=>'"'+sc(v).replace(/"/g,'""')+'"').join(';')).join('\r\n')});
 const J=window.jspdf&&window.jspdf.jsPDF;if(!J)throw{code:'lib'};
 const i=rows.findIndex(r=>!r.length),meta=rows.slice(0,i),head=rows[i+1],body=rows.slice(i+2),w=head.length>8,doc=new J({orientation:w?'l':'p',unit:'pt',format:'a4'});
 const pw_=doc.internal.pageSize.getWidth();try{doc.addImage(PDFLOGO,'PNG',40,22,150,150*PDFR)}catch(e){doc.setFontSize(12);doc.text('FAZENDA BARRAMAS',40,40)}
 doc.setFontSize(8);doc.setTextColor(110);doc.text('ISM Consultoria Pecuária',pw_-40,32,{align:'right'});doc.text('Emitido em '+fd(today()),pw_-40,44,{align:'right'});doc.setDrawColor(31,61,43);doc.setLineWidth(1.2);doc.line(40,68,pw_-40,68);doc.setTextColor(20);
 doc.setFontSize(15);doc.text(meta[0].join(': '),40,90);
 const tk=rom?new Set(fichaTot(rom).map(x=>x[0])):new Set();
 doc.autoTable({startY:98,body:meta.slice(1).filter(r=>!tk.has(r[0])).map(r=>r.map(sc)),theme:'plain',styles:{fontSize:10,cellPadding:2},columnStyles:{0:{fontStyle:'bold',cellWidth:170}}});
 let yN=doc.lastAutoTable.finalY+14;if(rom){yN=fichaPDF(doc,rom,yN)+18;if(yN>doc.internal.pageSize.getHeight()-120){doc.addPage();yN=50}doc.setFontSize(11);doc.setFont('helvetica','bold');doc.setTextColor(31,61,43);doc.text('DETALHAMENTO POR ANIMAL',40,yN);doc.setTextColor(20);doc.setFont('helvetica','normal');yN+=8}
 doc.autoTable({startY:yN,head:[head],body:body.map(r=>r.map(sc)),styles:{fontSize:head.length>16?6:w?7:9,cellPadding:head.length>16?2:3},headStyles:{fillColor:[31,61,43]},alternateRowStyles:{fillColor:[241,244,236]}});
 return d.save({filename:name+'.pdf',data:doc.output('blob')})}
async function dl(){let d=null;try{d=window.claude?await claude.use('downloads'):null}catch(e){}if(!d)msg('Exportação indisponível neste aparelho.');return d}
const xerr=er=>{if(er&&er.code=='declined')return;msg(er&&er.code=='lib'?'Gerador de PDF não carregou. Tente o Excel.':'Não foi possível exportar.')};
$('#fxp').onclick=()=>xp();$('#fxf').onclick=()=>xp('pdf');
async function xp(fmt){if(!LF.length)return msg('Nenhum animal para exportar.');const d=await dl();if(!d)return;
 const n=(v,k)=>v==null||isNaN(v)?'':Math.round(v*10**k)/10**k,b=v=>v==null?'':brl(v),
 X=LF.map(a=>{const p=pts(a),u=p[p.length-1],q=p.length>1?p[p.length-2]:null;return{a,u,q,g:q?(u.p-a.ent.p)/days(a.ent.d,u.d):null,gp:q?(u.p-q.p)/days(q.d,u.d):null}}),
 av=f=>{const v=X.map(f).filter(x=>x!=null);return v.length?v.reduce((s,x)=>s+x,0)/v.length:null},
 sx=f=>X.map(f).filter(x=>x!=null).reduce((s,x)=>s+x,0),
 flt=[['Categoria','#fcat'],['Fornecedor','#ff'],['Lote','#fl'],['Data de','#fd1'],['Data até','#fd2'],['Situação','#fs'],['Evento','#ft'],['Busca','#q']].filter(k=>$(k[1]).value).map(k=>k[0]+': '+$(k[1]).value).join(' | '),
 rows=[['Relatório de animais'],['Filtros',flt||'Todos os animais'],['Animais',LF.length],['Peso de entrada médio (kg)',n(av(o=>o.a.ent.p),1)],['Último peso/peso final médio (kg)',n(av(o=>o.u.p),1)],['GMD médio entre pesagens (kg/dia)',n(av(o=>o.gp),3)],['GPD médio, entrada até último peso/saída (kg/dia)',n(av(o=>o.g),3)],['Valor médio pago na compra',b(av(o=>o.a.preco>0?o.a.preco:null))],['Total pago na compra',b(sx(o=>o.a.preco))],['Valor médio de venda',b(av(o=>o.a.venda?o.a.venda.valor:null))],['Total vendido',b(sx(o=>o.a.venda?o.a.venda.valor:null))],[],
 ['Brinco','Sexo','Categoria','Raça','Fornecedor','Lote','Situação','Data de entrada','Peso de entrada (kg)','Valor pago na compra','Data do peso anterior','Peso anterior (kg)','Data do último peso','Último peso/peso final (kg)','GMD entre pesagens (kg/dia)','GPD entrada até saída (kg/dia)','Valor da venda','Comprador','Destino','Data da morte','Protocolos sanitários'],
 ...X.map(o=>{const a=o.a;return[a.id,a.sexo,catOf(a),a.raca||'',a.forn,a.lote||'',sit(a),fd(a.ent.d),a.ent.p,a.preco>0?n(a.preco,2):'',o.q?fd(o.q.d):'',o.q?o.q.p:'',fd(o.u.d),o.u.p,n(o.gp,3),n(o.g,3),a.venda?n(a.venda.valor,2):'',a.venda?a.venda.comp:'',a.venda?a.venda.dest:'',a.morte?fd(a.morte.d):'',(a.san||[]).map(s=>fd(s.d)+': '+s.i.join(', ')).join(' | ')]})];
 try{await saveRows(d,'animais-'+(flt?'filtrados':'todos'),rows,fmt);msg('Relatório exportado.')}catch(er){xerr(er)}}

/* ============ ROMANEIOS ============ */
function rhead(r){const i=r.info||{},pr=['Protocolo sanitário',i.san&&i.san.length?i.san.join(', '):'Não'],rs=['Responsável',i.resp||'-'];
 if(r.tipo=='Entrada')return[rs,['Fornecedor',i.forn],['Valor por animal',brl(i.preco)],['Lote',i.lote||'-'],['Sexo',i.sexo],...(i.cat?[['Categoria na entrada',i.cat]]:[]),pr];
 if(r.tipo=='Pesagem')return[rs,['Tipo',i.tipo],pr];
 if(r.tipo=='Venda')return[rs,['Comprador',i.comp],['Destino',i.dest],['Valor da @',brl(i.arr)]];return[]}
function gpRom(r,x){const a=findA(String(x.id));if(!a)return null;const pr=pts(a).filter(y=>y.d<r.d).pop();return pr?(num(x.p)-pr.p)/days(pr.d,r.d):null}
const f3=v=>v==null||isNaN(v)?'':v.toFixed(3).replace('.',',');
function ravg(r){const m=k=>{const v=r.it.map(x=>num(x[k])).filter(v=>!isNaN(v));return v.length?v.reduce((a,b)=>a+b,0)/v.length:null},o=[],p=m('p'),g=m('g'),v=m('valor');
 const gpv=(r.tipo=='Pesagem'||r.tipo=='Venda')?r.it.map(x=>gpRom(r,x)).filter(v=>v!=null):[],gp=gpv.length?gpv.reduce((a,b)=>a+b,0)/gpv.length:null;
 if(p!=null)o.push(['Peso médio',p.toFixed(1).replace('.',',')+' kg']);if(gp!=null)o.push(['GMD médio entre pesagens',f3(gp)+' kg/dia']);if(g!=null)o.push(['GPD médio desde a entrada',g.toFixed(3).replace('.',',')+' kg/dia']);if(v!=null&&VAL())o.push(['Valor médio por animal',brl(v)]);return o}
function rcols(r){const b=['Brinco',x=>x.id],p=['Peso (kg)',x=>x.p],gp=['GMD entre pesagens (kg/dia)',x=>f3(gpRom(r,x))],g=['GPD desde a entrada (kg/dia)',x=>x.g];
 const ob=r.it.some(x=>x.obs)?[['Observação',x=>x.obs||'']]:[];
 return r.tipo=='Entrada'?[b,p,['Categoria',x=>catPeso(+x.p)]]:r.tipo=='Pesagem'?[b,p,gp,g,...ob]:r.tipo=='Venda'?(VAL()?[b,p,['Valor',x=>brl(x.valor)],gp,g]:[b,p,gp,g]):[b,['Causa',x=>x.causa||''],['Responsável',x=>x.resp||'']]}
function rrender(){$('#rc').textContent=READY?R.length+' romaneios, pela data, do mais recente para o mais antigo':'';
 const open=new Set([...document.querySelectorAll('#rl details[open]')].map(d=>d.dataset.id));
 $('#rl').innerHTML=!READY?'<div class="empty">Carregando romaneios…</div>':R.slice().sort((x,y)=>y.d.localeCompare(x.d)||y.id-x.id).map(r=>{const c=rcols(r);return '<details class="rm" data-id="'+r.id+'"'+(open.has(String(r.id))?' open':'')+'><summary><span class="rt">'+r.tipo+'<em>'+fd(r.d)+'</em></span><span class="mut">'+r.it.length+' animais'+(r.tipo=='Venda'&&VAL()?' · '+brl(r.it.reduce((s,x)=>s+x.valor,0)):'')+'</span></summary><div class="body"><div class="facts">'+rhead(r).concat(ravg(r)).map(h=>'<span>'+h[0]+' <b>'+esc(h[1])+'</b></span>').join('')+'</div>'+fichaHTML(r)+'<details class="det"><summary class="mut">Detalhes por animal (GMD, GPD, valores)</summary><div class="tw"><table class="ft"><tr class="h">'+c.map(k=>'<td>'+k[0]+'</td>').join('')+'</tr>'+r.it.map(x=>'<tr>'+c.map((k,i)=>'<td>'+(i?esc(k[1](x)):tag(x.id))+'</td>').join('')+'</tr>').join('')+'</table></div></details>'+(can('exportar')?'<div class="act" style="display:flex;gap:8px"><button class="btn sm" type="button" data-r="'+r.id+'">Excel</button><button class="btn sm ghost" type="button" data-r="'+r.id+'" data-f="pdf">PDF</button></div>':'')+(podeCorrRom(r)?'<div class="act" style="margin-top:8px"><button class="btn sm ghost" type="button" data-er="'+r.id+'">Editar romaneio</button></div>':'')+'</div></details>'}).join('')||'<div class="empty"><b>Nenhum romaneio ainda</b>Os romaneios aparecem aqui conforme você lança entradas, pesagens, vendas e mortes.</div>'}
/* correção da data de um romaneio (ISM, proprietário, administrativo; ou quem lançou) */
const podeCorrRom=r=>can('corrigir')||(can('manejo')&&(r.info||{}).por===USER.n);
function corrigirDataRom(r,nd){
 if(!nd)return msg('Escolha a nova data.');if(nd>today())return msg('A data não pode ser no futuro.');if(nd===r.d)return msg('A data já é essa.');
 const od=r.d,mud=[],prob=[];
 for(const x of r.it){const a=findA(String(x.id));if(!a){prob.push(x.id+' (não encontrado)');continue}const n=clone(a);
  if(r.tipo==='Entrada'){const prim=[...(n.pes||[]).map(y=>y.d),n.venda&&n.venda.d,n.morte&&n.morte.d].filter(Boolean).sort()[0];if(prim&&prim<nd){prob.push(x.id+' (tem lançamento em '+fd(prim)+')');continue}
   n.ent.d=nd;(n.san||[]).forEach(y=>{if(y.d===od)y.d=nd})}
  else{if(nd<n.ent.d){prob.push(x.id+' (entrada em '+fd(n.ent.d)+')');continue}
   if(r.tipo==='Pesagem'){const y=(n.pes||[]).find(y=>y.d===od&&Math.abs(num(y.p)-num(x.p))<0.01);if(!y){prob.push(x.id+' (pesagem não encontrada)');continue}y.d=nd;(n.san||[]).forEach(z=>{if(z.d===od)z.d=nd})}
   else if(r.tipo==='Venda'){if(!n.venda||n.venda.d!==od){prob.push(x.id+' (venda não encontrada)');continue}n.venda.d=nd}
   else if(r.tipo==='Morte'){if(!n.morte||n.morte.d!==od){prob.push(x.id+' (morte não encontrada)');continue}n.morte.d=nd}}
  mud.push(n)}
 if(prob.length)return msg('Não dá para mudar para '+fd(nd)+': '+prob.slice(0,4).join(', ')+(prob.length>4?' e mais '+(prob.length-4):'')+'.');
 if(!confirm('Mudar a data deste romaneio de '+r.tipo.toLowerCase()+' de '+fd(od)+' para '+fd(nd)+'? Isso muda a data dos '+mud.length+' animais dele.'))return;
 mud.forEach(n=>{const i=A.findIndex(a=>a.id===n.id);if(i>=0)A[i]=n;putA(n)});
 r.d=nd;putR(r);msg('Data do romaneio corrigida para '+fd(nd)+'.');refresh();rrender()}
$('#rl').addEventListener('click',e=>{const b=e.target.closest('[data-cd]');if(!b)return;e.stopPropagation();if(!canW())return;const r=R.find(x=>String(x.id)===b.dataset.cd);if(!r||!podeCorrRom(r))return;
 const inp=document.querySelector('[data-nd="'+b.dataset.cd+'"]');corrigirDataRom(r,inp&&inp.value)},true);
$('#rl').onclick=async e=>{const t=e.target.closest('[data-r]');if(!t)return;const r=R.find(x=>x.id==t.dataset.r),d=await dl();if(!d||!r)return;
 const c=rcols(r),rows=[['Romaneio',r.tipo],['Data',fd(r.d)],...rhead(r),...ravg(r).filter(x=>x[0]!='Peso médio')];
  fichaTot(r).forEach(t=>rows.push(t));const N=linOf(r);rows.push([],['Coluna da ficha','Linha',...c.map(k=>k[0])],...r.it.map((x,i)=>[Math.floor(i/N)+1,String(i%N+1).padStart(2,'0'),...c.map(k=>k[1](x))]));
 try{await saveRows(d,r.tipo.toLowerCase()+'-'+r.d,rows,t.dataset.f,r);msg('Relatório exportado.')}catch(er){xerr(er)}};
/* Confirmação antes de gravar, excluir ou encerrar qualquer coisa (pedido do Italo, 25/10/2026) */
const certeza=t=>window.confirm(t);
/* Protocolo de segurança do peso: abaixo de 100 kg, acima de 600 kg, ou fugindo do padrão do romaneio */
const PESO_MIN=100,PESO_MAX=600;
function pesoAlertas(S,p){const al=[];if(p<PESO_MIN)al.push('abaixo de '+PESO_MIN+' kg');if(p>PESO_MAX)al.push('acima de '+PESO_MAX+' kg');
 const ps=((S&&S.r&&S.r.it)||[]).map(i=>+i.p).filter(x=>x>0).sort((a,b)=>a-b);
 if(ps.length>=5){const md=ps.length%2?ps[(ps.length-1)/2]:(ps[ps.length/2-1]+ps[ps.length/2])/2;
  if(Math.abs(p-md)>md*0.25)al.push('foge do padrão deste romaneio: até agora a mediana é '+nf(md,0)+' kg ('+catPeso(md).toLowerCase()+') e este peso é de '+catPeso(p).toLowerCase())}
 return al}
function pesoConfere(S,p,brinco){const al=pesoAlertas(S,p);if(!al.length)return true;
 return certeza('ATENÇÃO AO PESO'+(brinco?' do brinco '+brinco:'')+': '+nf(p,0)+' kg\n\n• '+al.join('\n• ')+'\n\nTem certeza que quer lançar este peso?')}
window.pesoAlertas=pesoAlertas;window.certeza=certeza;
function radd(S,tipo,d,info,it){if(!S.r){S.r={id:Date.now(),tipo,d,info:{...info,lin:S.lin||10,por:USER?USER.n:''},it:[]};R.push(S.r)}S.r.it.push(it);putR(S.r)}
function rund(S){if(!S.r)return;S.r.it.pop();if(!S.r.it.length){const id=S.r.id;R=R.filter(x=>x.id!==id);delR(S.r);S.r=null}else putR(S.r)}


/* ============ FICHA DO ROMANEIO (colunas de N linhas com total, como o bloco de papel) ============ */
const LINS=[10,15,20,25,30];
const linOf=r=>{const n=+((r&&r.info&&r.info.lin)||0);return LINS.includes(n)?n:10};
const lastW=id=>{const a=findA(String(id));if(!a)return null;const p=pts(a);return p[p.length-1].p};
const pesoIt=(r,x)=>r.tipo=='Morte'?lastW(x.id):num(x.p);
function fichaTot(r){const W=r.it.map(x=>pesoIt(r,x)).filter(v=>v!=null&&!isNaN(v)),kg=sm(W),n=r.it.length,o=[['Nº de animais',n.toLocaleString('pt-BR')]];
 if(W.length){o.push([r.tipo=='Morte'?'Peso (último registro)':'Peso total',nf(kg,0)+' kg'],['Média',nf(kg/W.length,1)+' kg'],['Total em @',nf(kg/30,2)+' @'],['Média em @',nf(kg/30/W.length,2)+' @'])}
 if(r.tipo=='Venda'&&VAL()){const v=sm(r.it.map(x=>x.valor||0));o.push(['Valor total',brl(v)]);if(kg)o.push(['@ efetiva',brl(v/(kg/30))])}
 return o}
function fichaHTML(r,hl){const N=linOf(r),it=r.it,C=Math.max(1,Math.ceil(it.length/N)),lab=r.tipo=='Morte'?'Últ. peso':'Peso';let h='<div class="ficha">';
 for(let c=0;c<C;c++){const sl=it.slice(c*N,c*N+N),W=sl.map(x=>pesoIt(r,x)).filter(v=>v!=null&&!isNaN(v));
  h+='<table class="fcol"><thead><tr><th>Ord.</th><th>Nº</th><th>'+lab+'</th></tr></thead><tbody>';
  for(let i=0;i<N;i++){const x=sl[i],k=c*N+i,isl=hl&&k===it.length-1;h+='<tr'+(isl?' class="nw"':'')+'><td>'+String(i+1).padStart(2,'0')+'</td><td>'+(x?esc(x.id):'')+'</td><td>'+(x?(pesoIt(r,x)??'–'):'')+'</td></tr>'}
  h+='</tbody><tfoot><tr><td>Total</td><td>'+sl.length+'</td><td>'+nf(sm(W),0)+'</td></tr></tfoot></table>'}
 return h+'</div><div class="ftot">'+fichaTot(r).map(([k,v])=>'<span>'+k+' <b>'+v+'</b></span>').join('')+'</div>'}
function fichaRun(sel,S,tipo){const e=$(sel);if(!e)return;const r=S&&S.r;
 e.innerHTML='<h3 class="sub">Ficha do romaneio · '+(S?S.lin:10)+' linhas por coluna</h3>'+(r&&r.it.length?fichaHTML(r,true):'<p class="mut">Os animais lançados aparecem aqui, em colunas de '+(S?S.lin:10)+' linhas com o total de cada coluna, como no bloco de papel.</p>')}
function fichaMorte(){const d=$('#md').value,r=R.find(x=>x.tipo=='Morte'&&x.d==d),e=$('#mfi');if(!e)return;
 e.innerHTML='<h3 class="sub">Mortes lançadas em '+(d?fd(d):'—')+'</h3>'+(r&&r.it.length?fichaHTML(r,true):'<p class="mut">Nenhuma morte lançada nesta data.</p>')}
/* PDF: 3 colunas por faixa em A4 retrato, cada uma com N linhas e o total */
function fichaPDF(doc,r,y){const N=linOf(r),it=r.it,C=Math.max(1,Math.ceil(it.length/N)),pw=doc.internal.pageSize.getWidth(),ph=doc.internal.pageSize.getHeight(),M=40,G=10,per=3,cw=(pw-2*M-G*(per-1))/per,rh=N>20?12.5:14,hh=16,bh=hh+N*rh+hh;
 const ws=[cw*.2,cw*.4,cw*.4],lab=r.tipo=='Morte'?'ÚLT. PESO':'PESO';
 doc.setFontSize(11);doc.setFont('helvetica','bold');doc.setTextColor(31,61,43);if(y+24+bh>ph-40){doc.addPage();y=50}doc.text('FICHA DO ROMANEIO',M,y+12);y+=22;doc.setTextColor(20);
 for(let b=0;b<Math.ceil(C/per);b++){if(y+bh>ph-40){doc.addPage();y=50}
  for(let k=0;k<per;k++){const c=b*per+k;if(c>=C)break;const x0=M+k*(cw+G),sl=it.slice(c*N,c*N+N),W=sl.map(x=>pesoIt(r,x)).filter(v=>v!=null&&!isNaN(v));
   doc.setFillColor(31,61,43);doc.rect(x0,y,cw,hh,'F');doc.setTextColor(255);doc.setFontSize(8);doc.setFont('helvetica','bold');
   let xx=x0;['ORD.','Nº',lab].forEach((t,i)=>{doc.text(t,xx+ws[i]/2,y+11,{align:'center'});xx+=ws[i]});
   doc.setTextColor(20);doc.setFont('helvetica','normal');doc.setFontSize(N>20?8:9);
   for(let i=0;i<N;i++){const yy=y+hh+i*rh,xr=sl[i];if(i%2){doc.setFillColor(241,244,236);doc.rect(x0,yy,cw,rh,'F')}
    const v=[String(i+1).padStart(2,'0'),xr?String(xr.id):'',xr?String(pesoIt(r,xr)??'–'):''];xx=x0;
    v.forEach((t,j)=>{if(j==0)doc.setTextColor(120);else doc.setTextColor(20);doc.text(t,xx+ws[j]/2,yy+rh*.72,{align:'center'});xx+=ws[j]})}
   const ty=y+hh+N*rh;doc.setFillColor(228,234,220);doc.rect(x0,ty,cw,hh,'F');doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor(20);
   xx=x0;['TOTAL',String(sl.length),nf(sm(W),0)].forEach((t,j)=>{doc.text(t,xx+ws[j]/2,ty+11,{align:'center'});xx+=ws[j]});doc.setFont('helvetica','normal');
   doc.setDrawColor(200,208,192);doc.setLineWidth(.6);doc.rect(x0,y,cw,bh);xx=x0+ws[0];doc.line(xx,y,xx,y+bh);xx+=ws[1];doc.line(xx,y,xx,y+bh)}
  y+=bh+G}
 const T=fichaTot(r);if(y+20+Math.ceil(T.length/3)*16>ph-40){doc.addPage();y=50}
 doc.setDrawColor(31,61,43);doc.setLineWidth(1);doc.rect(M,y,pw-2*M,8+Math.ceil(T.length/3)*16);doc.setFontSize(9);
 T.forEach(([k,v],i)=>{const cx=M+10+(i%3)*((pw-2*M)/3),cy=y+16+Math.floor(i/3)*16;doc.setFont('helvetica','normal');doc.setTextColor(90);doc.text(k+':',cx,cy);doc.setFont('helvetica','bold');doc.setTextColor(20);doc.text(String(v),cx+doc.getTextWidth(k+': ')+2,cy)});
 doc.setFont('helvetica','normal');return y+16+Math.ceil(T.length/3)*16}

/* ============ MANEJO ============ */
const SAN=['Clostridiose','Raiva','Vermífugo','Modificador orgânico'];
const prot=f=>f.get('san')=='sim'?[...f.getAll('it'),...String(f.get('outro')||'').split(',').map(s=>s.trim()).filter(Boolean)]:[];
document.querySelectorAll('.prot').forEach(d=>{const p=d.dataset.p;d.innerHTML='<fieldset><legend>Protocolo sanitário no mesmo manejo</legend><div class="yn"><label class="chip"><input type="radio" id="'+p+'-sn" name="san" value="nao" checked><span>Não</span></label><label class="chip"><input type="radio" id="'+p+'-ss" name="san" value="sim"><span>Sim</span></label></div><div hidden><div class="chips">'+SAN.map((s,i)=>'<label class="chip"><input type="checkbox" id="'+p+'-i'+i+'" name="it" value="'+s+'"><span>'+s+'</span></label>').join('')+'</div><div class="f" style="margin-top:10px"><label for="'+p+'-o">Outros (separe por vírgula)</label><input id="'+p+'-o" name="outro"></div></div></fieldset>';
 d.onchange=()=>{d.querySelector('fieldset>div[hidden],fieldset>div:last-child').hidden=!d.querySelector('[value=sim]').checked}});
['#fe-data','#fp-data','#fv-data','#md'].forEach(s=>$(s).value=today());
const info=(el,parts)=>{$(el).innerHTML=parts.filter(Boolean).map(p=>'<span>'+p+'</span>').join('')};
const findA=b=>A.find(x=>x.id==b);

let E=null;
const nextFree=b=>{while(A.some(a=>+a.id==b))b++;return b};
function eshow(){$('#fb').textContent=E.n;tagSet('#fbt',E.n);info('#fi',[esc(E.f.get('forn')),'Resp.: '+esc(E.f.get('resp')),esc(E.f.get('sexo')),'<b>'+E.c+'</b> lançados','Protocolo: '+(esc(prot(E.f).join(', '))||'não')]);fichaRun('#fe-fi',E);$('#fw').value='';$('#fw').focus()}
$('#fe').onsubmit=e=>{e.preventDefault();if(!canW())return;const f=new FormData(e.target);if(isNaN(num(f.get('preco'))))return msg('Informe o valor por animal.');E={f,n:nextFree(+f.get('brinco')),c:0,u:[],lin:+f.get('lin')||10};e.target.hidden=true;$('#fe2').hidden=false;msg('');eshow()};
function elanca(){const p=num($('#fw').value);if(isNaN(p)||p<=0)return msg('Digite o peso do animal.');if(!canW())return;const f=E.f;
 if(!pesoConfere(E,p,E.n)){$('#fw').select();return}
 if(A.some(a=>+a.id==E.n))E.n=nextFree(E.n);
 const a={id:String(E.n),sexo:f.get('sexo'),cat:catPeso(p),forn:f.get('forn'),preco:num(f.get('preco')),lote:f.get('lote'),ent:{d:f.get('data'),p},pes:[],venda:null,san:prot(f).length?[{d:f.get('data'),i:prot(f)}]:[]};
 A.push(a);putA(a);radd(E,'Entrada',f.get('data'),{forn:f.get('forn'),preco:num(f.get('preco')),lote:f.get('lote'),sexo:f.get('sexo'),san:prot(f),resp:f.get('resp')},{id:E.n,p});
 E.u.push(E.n);E.c++;msg('Brinco '+E.n+' lançado com '+p+' kg ('+catPeso(p).toLowerCase()+').');E.n=nextFree(E.n+1);eshow();refresh()}
$('#fgo').onclick=elanca;$('#fw').onkeydown=e=>{if(e.key=='Enter'){e.preventDefault();elanca()}};
$('#fund').onclick=()=>{if(!E.u.length)return;if(!certeza('Desfazer o último animal lançado (brinco '+E.u[E.u.length-1]+')?'))return;const id=E.u.pop();A=A.filter(a=>a.id!=String(id));delA(id);rund(E);E.c--;E.n=id;msg('Brinco '+id+' desfeito.');eshow();refresh()};
$('#fend').onclick=()=>{if(!certeza('Encerrar este romaneio de entrada com '+E.c+' animal(is)?'))return;msg('Romaneio encerrado: '+E.c+' animais lançados.');E=null;$('#fe2').hidden=true;$('#fe').hidden=false;const kr=$('#fe-resp').value;$('#fe').reset();$('#fe-data').value=today();$('#fe-resp').value=kr;$('#fe').querySelector('.prot fieldset>div:last-child').hidden=true};

function check(S,bSel,wSel,outSel,goSel,label,venda){tagSet(bSel+'t',$(bSel).value.trim());const g=$(outSel),b=$(bSel).value.trim(),p=num($(wSel).value),a=findA(b);g.classList.remove('warn');$(goSel).textContent=label;
 const bad=t=>{g.textContent=t;g.classList.add('warn');return null};
 if(!b){g.textContent='';return null}
 if(!READY){g.textContent='Carregando rebanho…';return null}
 if(!a)return bad('Brinco '+b+' não encontrado.');
 if(a.venda)return bad('Brinco '+b+' já foi vendido.');
 if(a.morte)return bad('Brinco '+b+' morreu em '+fd(a.morte.d)+'.');
 const pt=pts(a),l=pt[pt.length-1];let h=catOf(a)+' · '+a.sexo+'\nÚltimo peso: '+l.p+' kg em '+fd(l.d);
 if(isNaN(p)||p<=0){g.textContent=h;return null}
 const n={d:S.d,p},neg=p<l.p||p<a.ent.p;
 const nc=catPeso(p);if(nc!==catOf(a))h+='\nCategoria passa para '+nc.toLowerCase();
 if(venda&&VAL())h+='\nValor do animal: '+brl(p/30*S.arr);
 h+='\nGMD desde a entrada: '+gmd(a.ent,n)+' kg/dia';
 if(pt.length>1)h+='\nGMD desde a última pesagem: '+gmd(l,n)+' kg/dia';
 if(neg){h+='\nGMD negativo: confira o brinco e o peso.';g.classList.add('warn');$(goSel).textContent='Lançar mesmo assim'}
 const al=pesoAlertas(S,p);if(al.length){h+='\nPeso fora do normal: '+al.join('; ')+'.';g.classList.add('warn');$(goSel).textContent='Lançar mesmo assim'}
 g.textContent=h;return{a,p}}

let P=null;
const pcalc=()=>check(P,'#pb','#pw','#pg','#pgo','Lançar pesagem');
function pnew(){$('#pb').value='';$('#pw').value='';pcalc();info('#pi',['Pesagem de '+esc(P.t.toLowerCase()),fd(P.d),'Resp.: '+esc(P.resp),'<b>'+P.c+'</b> lançadas','Protocolo: '+(esc(P.s.join(', '))||'não')]);fichaRun('#fp-fi',P);$('#pb').focus()}
$('#fp').onsubmit=e=>{e.preventDefault();if(!canW())return;const f=new FormData(e.target);P={d:f.get('data'),t:f.get('tipo'),s:prot(f),resp:f.get('resp'),c:0,u:[],lin:+f.get('lin')||10};e.target.hidden=true;$('#fp2').hidden=false;msg('');pnew()};
$('#pb').oninput=$('#pw').oninput=()=>pcalc();
function planca(){const r=pcalc();if(!r)return msg('Informe um brinco existente e o peso.');if(!canW())return;
 if(!pesoConfere(P,r.p,r.a.id)){$('#pw').select();return}
 r.a.pes=r.a.pes||[];r.a.pes.push({d:P.d,p:r.p,t:P.t});if(P.s.length){r.a.san=r.a.san||[];r.a.san.push({d:P.d,i:P.s})}putA(r.a);
 radd(P,'Pesagem',P.d,{tipo:P.t,san:P.s,resp:P.resp},{id:r.a.id,p:r.p,g:gmd(r.a.ent,{d:P.d,p:r.p})});P.u.push(r.a.id);P.c++;msg('Brinco '+r.a.id+' pesado: '+r.p+' kg.');pnew();refresh()}
$('#pgo').onclick=planca;
$('#pb').onkeydown=e=>{if(e.key=='Enter'){e.preventDefault();$('#pw').focus()}};
$('#pw').onkeydown=e=>{if(e.key=='Enter'){e.preventDefault();planca()}};
$('#pcl').onclick=()=>{$('#pw').value='';pcalc();$('#pw').focus()};
$('#pund').onclick=()=>{if(!P.u.length)return;if(!certeza('Desfazer a última pesagem (brinco '+P.u[P.u.length-1]+')?'))return;const a=findA(P.u.pop());if(a){a.pes.pop();if(P.s.length&&a.san)a.san.pop();putA(a)}rund(P);P.c--;msg('Última pesagem desfeita.');pnew();refresh()};
$('#pend').onclick=()=>{if(!certeza('Encerrar esta pesagem com '+P.c+' animal(is)?'))return;msg('Pesagem encerrada: '+P.c+' animais.');P=null;$('#fp2').hidden=true;$('#fp').hidden=false};

let V=null;
const vcalc=()=>check(V,'#vb','#vw','#vg','#vgo','Lançar venda',1);
function vnew(){$('#vb').value='';$('#vw').value='';vcalc();info('#vi',[esc(V.comp)+' ('+esc(V.dest)+')','Resp.: '+esc(V.resp),'@ '+brl(V.arr),'<b>'+V.c+'</b> vendidos',VAL()?'Total <b>'+brl(V.t)+'</b>':'']);fichaRun('#fv-fi',V);$('#vb').focus()}
$('#fv').onsubmit=e=>{e.preventDefault();if(!canW())return;const f=new FormData(e.target),arr=num(f.get('arr'));if(isNaN(arr)||arr<=0)return msg('Informe o valor da @.');V={d:f.get('data'),comp:f.get('comp'),dest:f.get('dest'),arr,resp:f.get('resp'),c:0,t:0,u:[],lin:+f.get('lin')||10};e.target.hidden=true;$('#fv2').hidden=false;msg('');vnew()};
$('#vb').oninput=$('#vw').oninput=()=>vcalc();
function vlanca(){const r=vcalc();if(!r)return msg('Informe um brinco existente e o peso.');if(!canW())return;
 if(!pesoConfere(V,r.p,r.a.id)){$('#vw').select();return}const val=r.p/30*V.arr;
 r.a.venda={d:V.d,p:r.p,comp:V.comp,dest:V.dest,arr:V.arr,valor:val};putA(r.a);
 radd(V,'Venda',V.d,{comp:V.comp,dest:V.dest,arr:V.arr,resp:V.resp},{id:r.a.id,p:r.p,valor:val,g:gmd(r.a.ent,{d:V.d,p:r.p})});V.u.push(r.a.id);V.c++;V.t+=val;msg('Brinco '+r.a.id+' vendido'+(VAL()?': '+brl(val):'')+'.');vnew();refresh()}
$('#vgo').onclick=vlanca;
$('#vb').onkeydown=e=>{if(e.key=='Enter'){e.preventDefault();$('#vw').focus()}};
$('#vw').onkeydown=e=>{if(e.key=='Enter'){e.preventDefault();vlanca()}};
$('#vcl').onclick=()=>{$('#vw').value='';vcalc();$('#vw').focus()};
$('#vund').onclick=()=>{if(!V.u.length)return;if(!certeza('Desfazer a última venda (brinco '+V.u[V.u.length-1]+')?'))return;const a=findA(V.u.pop());if(a&&a.venda){V.t-=a.venda.valor;a.venda=null;putA(a)}V.c--;rund(V);msg('Última venda desfeita.');vnew();refresh()};
$('#vend').onclick=()=>{if(!certeza('Encerrar esta venda com '+V.c+' animal(is)'+(VAL()?', total '+brl(V.t):'')+'?'))return;msg('Venda encerrada: '+V.c+' animais, total '+brl(V.t)+'.');V=null;$('#fv2').hidden=true;$('#fv').hidden=false};
/* Balança AT55 (js/balanca.js): o peso estável entra sozinho no campo de peso de cada romaneio */
if(window.Balanca)[['#bal-fw','#fw'],['#bal-pw','#pw'],['#bal-vw','#vw']].forEach(([b,w])=>Balanca.painel($(b),$(w)));

function minfo(){tagSet('#mbt',$('#mb').value.trim());const b=$('#mb').value.trim(),a=findA(b),g=$('#mg');g.classList.remove('warn');if(!b){g.textContent='';return null}
 if(!READY){g.textContent='Carregando rebanho…';return null}
 if(!a){g.textContent='Brinco não encontrado.';g.classList.add('warn');return null}
 if(a.venda||a.morte){g.textContent=a.venda?'Animal já vendido.':'Morte já lançada.';g.classList.add('warn');return null}
 const l=pts(a).pop();g.textContent=catOf(a)+' · '+a.sexo+(a.lote?' · lote '+a.lote:'')+'\nÚltimo peso: '+l.p+' kg em '+fd(l.d);return a}
$('#mb').oninput=minfo;
$('#mgo').onclick=()=>{const a=minfo(),d=$('#md').value;if(!a||!d)return msg('Informe a data e um brinco válido.');const mr=$('#m-resp').value;if(!mr)return msg('Escolha o responsável.');if(!canW())return;
 if(!certeza('Lançar a MORTE do brinco '+a.id+' em '+fd(d)+($('#mc').value.trim()?' (causa: '+$('#mc').value.trim()+')':'')+'?'))return;
 a.morte={d,causa:$('#mc').value.trim(),resp:mr};putA(a);let m=R.find(x=>x.tipo=='Morte'&&x.d==d);if(!m){m={id:Date.now(),tipo:'Morte',d,info:{lin:10},it:[]};R.push(m)}m.it.push({id:a.id,causa:a.morte.causa,resp:mr});putR(m);
 msg('Morte do brinco '+a.id+' lançada.');$('#mb').value='';$('#mc').value='';minfo();fichaMorte();$('#mb').focus();refresh()};
$('#md').addEventListener('change',fichaMorte);


/* ============ SUPLEMENTAÇÃO ============ */
const RESP=ISM.nomes.slice();
document.querySelectorAll('[data-lin]').forEach(s=>{try{const v=localStorage.getItem(LK+'-lin');if(v)s.value=v}catch(e){}s.addEventListener('change',()=>{try{localStorage.setItem(LK+'-lin',s.value)}catch(e){}})});
document.querySelectorAll('[data-resp]').forEach(s=>{s.innerHTML='<option value="">Escolha…</option>'+RESP.map(n=>'<option>'+n+'</option>').join('');try{const v=localStorage.getItem(LK+'-'+s.id);if(RESP.includes(v))s.value=v}catch(e){}s.addEventListener('change',()=>{try{localStorage.setItem(LK+'-'+s.id,s.value)}catch(e){}})});
const DIETAS=['Dieta 0,1','Dieta 0,3','Dieta 0,5','Dieta 0,7','Dieta 1'];
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const kgf=v=>nf(v,0)+' kg',sac=v=>nf(v/30,1);
const ymNow=()=>today().slice(0,7);
const mlab=m=>mn[+m.slice(5)-1]+'/'+m.slice(0,4);
const ST=[['fab','Fábrica de ração'],['coc','Cocho']];let SP='coc';
function dietas(){return[...new Set([...DIETAS,...C.fabrica.map(x=>x.dieta),...C.cocho.map(x=>x.dieta)].filter(Boolean))]}
function fillSel(sel,items,keep,extra){const s=$(sel),c=s.value;s.innerHTML=items.map(v=>'<option>'+esc(v)+'</option>').join('')+(extra||'');if(keep!==false&&[...s.options].some(o=>o.value===c))s.value=c}
function arm(btn,fn){if(btn.classList.contains('arm')){fn();return}btn.classList.add('arm');const t=btn.textContent;btn.textContent='Confirmar';setTimeout(()=>{btn.classList.remove('arm');btn.textContent=t},3500)}
function months(){const s=new Set([ymNow(),...C.fabrica.map(x=>x.d.slice(0,7)),...C.cocho.map(x=>x.d.slice(0,7))]);return[...s].sort().reverse()}
function stock(){const S={};C.fabrica.forEach(x=>{const o=S[x.dieta]=S[x.dieta]||{p:0,s:0};x.tipo==='Saída'?o.s+=x.kg:o.p+=x.kg});return S}
function supDraw(){
 seg('#sseg',ST,SP,k=>{SP=k;supDraw()});ST.forEach(([k])=>$('#s-'+k).hidden=k!==SP);
 const ms=months(),cm=$('#smes').value;$('#smes').innerHTML=ms.map(m=>'<option value="'+m+'">'+mlab(m)+'</option>').join('');$('#smes').value=ms.includes(cm)?cm:ms[0];
 const m=$('#smes').value,ds=dietas();
 document.querySelectorAll('[data-dieta]').forEach(s=>fillSel('#'+s.id,ds,true,'<option value="__o">Outro suplemento…</option>'));
 const S=stock(),fm_=C.fabrica.filter(x=>x.d.slice(0,7)===m),cm_=C.cocho.filter(x=>x.d.slice(0,7)===m);
 const prod=sm(fm_.filter(x=>x.tipo!=='Saída').map(x=>x.kg)),sai=sm(fm_.filter(x=>x.tipo==='Saída').map(x=>x.kg)),coc=sm(cm_.map(x=>x.kg)),est=sm(Object.values(S).map(o=>o.p-o.s));
 if(SP==='fab'){
  $('#sk').innerHTML=!READY?kp('Fábrica','…','carregando'):kp('Estoque atual',`<span class="${est<0?'neg':''}">${kgf(est)}</span>`,sac(est)+' sacos de 30 kg','hi')+kp('Produzido',kgf(prod),mlab(m))+kp('Saídas',kgf(sai),mlab(m))+kp('No cocho',kgf(coc),'lançado pelos vaqueiros');
  const ks=Object.keys(S).sort();
  $('#stk').innerHTML=ks.length?'<table class="pt"><tr><th>Suplemento</th><th>Produzido (kg)</th><th>Saídas (kg)</th><th>Estoque (kg)</th><th>Estoque (sacos)</th></tr>'+ks.map(k=>{const e=S[k].p-S[k].s;return'<tr><td>'+esc(k)+'</td><td>'+nf(S[k].p,0)+'</td><td>'+nf(S[k].s,0)+'</td><td class="'+(e<0?'neg':'av')+'">'+nf(e,0)+'</td><td>'+sac(e)+'</td></tr>'}).join('')+'<tr class="sm"><td>Total</td><td>'+nf(sm(ks.map(k=>S[k].p)),0)+'</td><td>'+nf(sm(ks.map(k=>S[k].s)),0)+'</td><td class="av">'+nf(est,0)+'</td><td>'+sac(est)+'</td></tr></table>':'<p class="mut">Nenhum movimento lançado. Comece pela produção da fábrica.</p>';
  $('#fab-lt').textContent='Movimentos de '+mlab(m);
  $('#fabl').innerHTML=fm_.length?fm_.slice().sort((a,b)=>b.d.localeCompare(a.d)||b.id.localeCompare(a.id)).map(x=>'<div class="rowl"><span class="pill '+x.tipo+'">'+(x.tipo==='Saída'?'Saída':'Produção')+'</span><span>'+esc(x.dieta)+'<span class="sub2">'+fd(x.d)+(x.resp?' · '+esc(x.resp):'')+(x.obs?' · '+esc(x.obs):'')+'</span></span><span class="q">'+(x.tipo==='Saída'?'−':'+')+kgf(x.kg)+'</span>'+(can('corrigir')?'<span style="display:flex;gap:6px">'+(window.botaoEditar?botaoEditar:()=>'')('fabrica',x.id)+'<button type="button" class="x" data-del="fabrica/'+x.id+'">Excluir</button></span>':'<span></span>')+'</div>').join(''):'<p class="mut">Nenhum movimento em '+mlab(m)+'.</p>';
  fabHint();
 }else{
  fillSel('#coc-pasto',pastos().map(p=>p.nome),true,'<option value="__n">+ Cadastrar novo pasto</option>');
  if(!pastos().length&&$('#coc-pasto').value!=='__n'){$('#coc-pasto').value='__n';$('#coc-new').hidden=false}
  const by={};cm_.forEach(x=>{const o=by[x.pasto]=by[x.pasto]||{kg:0,n:0,dt:{},u:'',s:0,l:0,ue:''};o.kg+=x.kg;o.n++;if(x.estado==='Sobrou')o.s++;if(x.estado==='Limpo')o.l++;if(x.d>=o.u)o.ue=x.estado||'';o.dt[x.dieta]=(o.dt[x.dieta]||0)+x.kg;if(x.d>o.u)o.u=x.d});
  const np=Object.keys(by).length,dif=sai-coc;
  $('#ck').innerHTML=!READY?kp('Cocho','…','carregando'):kp('No cocho',kgf(coc),mlab(m),'hi')+kp('Tratos',cm_.length.toLocaleString('pt-BR'),cm_.filter(x=>x.estado==='Sobrou').length+' com sobra no cocho')+kp('Pastos tratados',String(np),'no mês')+kp('Saída da fábrica',kgf(sai),sai||coc?(dif===0?'confere com o cocho':(dif>0?'sobra ':'falta ')+kgf(Math.abs(dif))+' no cocho'):'no mês');
  $('#coc-rt').textContent='Resumo por pasto · '+mlab(m);
  const PA=Object.fromEntries(pastos().map(p=>[p.nome,p]));
  $('#cocr').innerHTML=np?'<table class="pt"><tr><th>Pasto</th><th>Total (kg)</th><th>Tratos</th><th>kg/ha</th><th>Último trato</th><th>Limpo / sobrou</th><th>Por suplemento</th></tr>'+Object.entries(by).sort((a,b)=>b[1].kg-a[1].kg).map(([p,o])=>{const ar=PA[p]&&PA[p].area;return'<tr><td>'+esc(p)+'</td><td class="av">'+nf(o.kg,0)+'</td><td>'+o.n+'</td><td>'+(ar?nf(o.kg/ar,1):'–')+'</td><td>'+fd(o.u)+(o.ue?' <span class="pill '+o.ue+'">'+o.ue+'</span>':'')+'</td><td>'+o.l+' / <span class="'+(o.s?'inv':'')+'">'+o.s+'</span></td><td>'+Object.entries(o.dt).map(([d,k])=>esc(d)+': '+nf(k,0)).join(' · ')+'</td></tr>'}).join('')+'<tr class="sm"><td>Total</td><td class="av">'+nf(coc,0)+'</td><td>'+cm_.length+'</td><td></td><td></td><td>'+cm_.filter(x=>x.estado==='Limpo').length+' / '+cm_.filter(x=>x.estado==='Sobrou').length+'</td><td></td></tr></table>':'<p class="mut">Nenhum trato lançado em '+mlab(m)+'.</p>';
  $('#cocl').innerHTML=cm_.length?cm_.slice().sort((a,b)=>b.d.localeCompare(a.d)||b.id.localeCompare(a.id)).map(x=>'<div class="rowl"><span class="d">'+fd(x.d).slice(0,5)+'</span><span><b>'+esc(x.pasto)+'</b>'+(x.estado?' <span class="pill '+x.estado+'">'+x.estado+'</span>':'')+'<span class="sub2">'+esc(x.dieta)+(x.resp?' · '+esc(x.resp):'')+'</span></span><span class="q">'+kgf(x.kg)+'</span>'+(can('corrigir')?'<span style="display:flex;gap:6px">'+(window.botaoEditar?botaoEditar:()=>'')('cocho',x.id)+'<button type="button" class="x" data-del="cocho/'+x.id+'">Excluir</button></span>':'<span></span>')+'</div>').join(''):'<p class="mut">Nenhum lançamento em '+mlab(m)+'.</p>';
  cocHint();
 }
}
$('#smes').onchange=()=>supDraw();
/* Preço das dietas (só ISM): cocho × preço vira despesa de nutrição no caixa (o banco calcula) */
let PRE_LOCAL=null;
const precos=()=>PRE_LOCAL||(ISM.painel&&ISM.painel().precos_supl)||{};
const precoEm=(dt,d)=>((precos().dietas||{})[dt]||[]).filter(e=>e.desde<=d).sort((a,b)=>b.desde.localeCompare(a.desde))[0];
function preDraw(){if(!$('#fpre')||!can('importar'))return;const P=precos().dietas||{},m=$('#smes').value||ymNow(),ds=[...new Set([...dietas(),...Object.keys(P)])];
 fillSel('#pre-dieta',ds,true);if(!$('#pre-desde').value)$('#pre-desde').value=ymNow()+'-01';
 const kgm=dt=>C.cocho.filter(x=>x.dieta===dt&&x.d.slice(0,7)===m),custo=dt=>sm(kgm(dt).map(x=>{const e=precoEm(dt,x.d);return e?x.kg*e.preco:0}));
 $('#pret').innerHTML='<table class="pt"><tr><th>Dieta</th><th>Preço atual</th><th>Desde</th><th>No cocho em '+mlab(m)+'</th><th>Despesa do mês</th></tr>'+ds.map(dt=>{const e=precoEm(dt,today()),h=(P[dt]||[]).slice().sort((a,b)=>b.desde.localeCompare(a.desde));
  return'<tr><td>'+esc(dt)+'</td><td>'+(e?brl(e.preco):'<span class="mut">sem preço</span>')+'</td><td>'+(e?fd(e.desde):'–')+(h.length>1?'<span class="sub2">'+h.length+' preços cadastrados</span>':'')+'</td><td>'+kgf(sm(kgm(dt).map(x=>x.kg)))+'</td><td class="av">'+brl(custo(dt))+'</td></tr>'}).join('')+
  '<tr class="sm"><td>Total</td><td></td><td></td><td>'+kgf(sm(ds.map(dt=>sm(kgm(dt).map(x=>x.kg)))))+'</td><td>'+brl(sm(ds.map(custo)))+'</td></tr></table>'}
window.preDraw=preDraw;{const f0=supDraw;supDraw=function(){f0();preDraw()}}
$('#fpre').onsubmit=async e=>{e.preventDefault();if(!can('importar'))return;const f=new FormData(e.target),v=num(f.get('preco')),dt=f.get('dieta'),de=f.get('desde');
 if(!dt)return msg('Escolha a dieta.');if(!(v>=0)||String(f.get('preco')).trim()==='')return msg('Informe o preço por kg.');if(!de)return msg('Informe a data de início.');
 if(!navigator.onLine)return msg('Para mudar preço é preciso internet.');if(!certeza('Salvar o preço de '+dt+': '+brl(v)+'/kg a partir de '+fd(de)+'?\nO caixa de nutrição será refeito a partir dessa data.'))return;const b=e.target.querySelector('button');b.disabled=true;
 try{PRE_LOCAL=await ISM.rpc('definir_preco_dieta',{c:ISM.cliente.id,p_dieta:dt,p_preco:v,p_desde:de});msg('Preço de '+dt+' salvo: '+brl(v)+'/kg desde '+fd(de)+'. O caixa será refeito.');$('#pre-preco').value='';preDraw();ISM.sincronizar()}
 catch(err){msg(err.message||'Não foi possível salvar o preço.')}finally{b.disabled=false}};
document.querySelectorAll('[data-dieta]').forEach(s=>s.addEventListener('change',()=>{const o=s.closest('form').querySelector('[name=outra]').closest('.f');o.hidden=s.value!=='__o';if(!o.hidden)o.querySelector('input').focus();s.id==='fab-dieta'?fabHint():cocHint()}));
const dietaOf=f=>f.get('dieta')==='__o'?String(f.get('outra')||'').trim():f.get('dieta');
function fabHint(){const d=$('#fab-dieta').value,S=stock()[d];$('#fab-h').textContent=d&&d!=='__o'?'Estoque de '+d+': '+(S?kgf(S.p-S.s)+' ('+sac(S.p-S.s)+' sacos)':'0 kg'):''}
function cocHint(){const p=$('#coc-pasto').value;if(!p||p==='__n'){$('#coc-h').textContent='';return}const l=C.cocho.filter(x=>x.pasto===p).sort((a,b)=>b.d.localeCompare(a.d))[0];$('#coc-h').textContent=l?'Último trato em '+p+': '+fd(l.d)+' · '+kgf(l.kg)+' de '+l.dieta+(l.estado?' · cocho '+l.estado.toLowerCase():''):'Nenhum trato lançado ainda em '+p+'.'}
$('#coc-pasto').onchange=()=>{const n=$('#coc-pasto').value==='__n';$('#coc-new').hidden=!n;if(n)$('#np-nome').focus();cocHint()};
$('#ffab').onsubmit=e=>{e.preventDefault();if(!canW())return;const f=new FormData(e.target),kg=num(f.get('kg')),d=dietaOf(f);
 const resp=f.get('resp');if(!d)return msg('Informe o suplemento.');if(isNaN(kg)||kg<=0)return msg('Informe a quantidade em kg.');if(!resp)return msg('Escolha o responsável.');try{localStorage.setItem(LK+'-fab-resp',resp)}catch(er){}
 const tipo=f.get('tipo'),S0=stock()[d],e2=S0?S0.p-S0.s:0;
 if(!certeza('Lançar '+(tipo==='Saída'?'SAÍDA':'PRODUÇÃO')+' de '+kgf(kg)+' de '+d+' em '+fd(f.get('data'))+'?'))return;
 putC('fabrica',{id:uid(),d:f.get('data'),tipo,dieta:d,kg,resp,obs:String(f.get('obs')||'').trim()});
 msg(tipo==='Saída'&&kg>e2?'Saída lançada, mas é maior que o estoque de '+d+' ('+kgf(e2)+'). Confira a produção.':(tipo==='Saída'?'Saída':'Produção')+' de '+kgf(kg)+' de '+d+' lançada.');
 $('#fab-kg').value='';$('#fab-obs').value='';$('#smes').value=f.get('data').slice(0,7);supDraw();$('#fab-kg').focus()};
$('#fcoc').onsubmit=e=>{e.preventDefault();if(!canW())return;const f=new FormData(e.target),kg=num(f.get('kg')),d=dietaOf(f),p=f.get('pasto');
 const est=f.get('estado');if(!p||p==='__n')return msg('Escolha o pasto ou cadastre um novo.');if(!est)return msg('Marque se o cocho estava limpo ou com sobra.');if(!d)return msg('Informe o suplemento.');if(isNaN(kg)||kg<=0)return msg('Informe os quilos colocados no cocho.');
 const resp=f.get('resp');if(!resp)return msg('Escolha o responsável.');try{localStorage.setItem(LK+'-coc-resp',resp)}catch(er){}
 if(!certeza('Lançar '+kgf(kg)+' de '+d+' no cocho do '+p+' em '+fd(f.get('data'))+'?'))return;
 putC('cocho',{id:uid(),d:f.get('data'),pasto:p,dieta:d,kg,resp,estado:est});msg(kgf(kg)+' de '+d+' no '+p+' (cocho '+est.toLowerCase()+').');
 $('#coc-kg').value='';$('#coc-cl').checked=$('#coc-cs').checked=false;$('#smes').value=f.get('data').slice(0,7);supDraw();$('#coc-pasto').focus()};
$('#np-add').onclick=()=>{if(!canW())return;const n=$('#np-nome').value.trim();if(!n)return msg('Digite o nome do pasto.');if(!certeza('Cadastrar o pasto '+n+'?'))return;const a=num($('#np-area').value);
 savePasto(n,isNaN(a)?null:a,'');$('#np-nome').value='';$('#np-area').value='';$('#coc-new').hidden=true;supDraw();$('#coc-pasto').value=n;cocHint();$('#coc-kg').focus()};
document.addEventListener('click',e=>{const b=e.target.closest('[data-del]');if(!b)return;if(!canW())return;if(!certeza('Excluir este lançamento? Ele sai do app e fica só no histórico.'))return;(fn=>fn())(()=>{const[c,id]=b.dataset.del.split('/');delC(c,id);msg('Lançamento excluído.');redraw()})});

/* ============ PASTOS E MAPA ============ */
const slug=s=>s.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80)||uid();
const pastos=()=>C.pastos.slice().sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR',{numeric:true}));
function savePasto(nome,area,obs){const id=slug(nome),old=C.pastos.find(p=>p.id===id)||{};putC('pastos',{...old,id,nome,area:area??old.area??null,obs:obs||old.obs||''})}
function mapDraw(){
 const P=pastos(),grp=t=>P.filter(p=>(p.tipo||'Pasto')===t),tot=sm(P.map(p=>p.area||0)),m=ymNow(),cm_=C.cocho.filter(x=>x.d.slice(0,7)===m);
 $('#mk').innerHTML=kp('Área total','1.288 ha','do imóvel','hi')+kp('Área útil','1.126 ha','segundo o mapa')+kp('Em pastejo',tot?nf(tot,0)+' ha':'–',grp('Módulo').length+' módulos · '+grp('Pasto').length+' pastos')+kp('Tratados no mês',String(new Set(cm_.map(x=>x.pasto)).size),kgf(sm(cm_.map(x=>x.kg)))+' no cocho em '+mlab(m));
 const last={},mk={};C.cocho.forEach(x=>{if(!last[x.pasto]||x.d>last[x.pasto].d)last[x.pasto]=x;if(x.d.slice(0,7)===m)mk[x.pasto]=(mk[x.pasto]||0)+x.kg});
 const row=p=>'<tr><td>'+(p.cod?'<span class="tag">'+esc(p.cod)+'</span> ':'')+esc(p.nome)+'</td><td>'+(p.area?nf(p.area,0):'–')+'</td><td>'+(mk[p.nome]?nf(mk[p.nome],0):'–')+'</td><td>'+(last[p.nome]?fd(last[p.nome].d)+' · '+kgf(last[p.nome].kg):'–')+'</td><td style="text-align:left;white-space:normal">'+esc(p.obs||'')+'</td><td>'+(can('pastos')?'<button type="button" class="x" data-del="pastos/'+esc(p.id)+'">Excluir</button>':'')+'</td></tr>';
 const sec=(t,L)=>L.length?'<tr class="sm"><td>'+t+'</td><td class="av">'+nf(sm(L.map(p=>p.area||0)),0)+'</td><td>'+nf(sm(L.map(p=>mk[p.nome]||0)),0)+'</td><td></td><td></td><td></td></tr>'+L.map(row).join(''):'';
 const outros=P.filter(p=>!['Módulo','Pasto'].includes(p.tipo||'Pasto'));
 $('#pastl').innerHTML=P.length?'<table class="pt"><tr><th>Identificação</th><th>Área (ha)</th><th>Cocho no mês (kg)</th><th>Último trato</th><th>Observação</th><th></th></tr>'+sec('Módulos',grp('Módulo'))+sec('Pastos',grp('Pasto'))+sec('Outros',outros)+'</table><p class="mut">Soma das áreas: '+nf(tot,0)+' ha. O quadro do mapa informa 1.104 ha; a diferença vem do arredondamento de cada área.</p>':'<div class="empty"><b>Nenhum pasto cadastrado</b>Cadastre abaixo ou pelo lançamento de cocho.</div>';
}
let ZM=1;const zset=z=>{ZM=Math.min(4,Math.max(1,z));$('#mapimg').style.width=(ZM*100)+'%'};
$('#zi').onclick=()=>zset(ZM*1.5);$('#zo').onclick=()=>zset(ZM/1.5);$('#zf').onclick=()=>zset(1);
$('#fpas').onsubmit=e=>{e.preventDefault();if(!canW())return;const n=$('#pa-nome').value.trim();if(!n)return;if(!certeza('Salvar o pasto '+n+'?'))return;const a=num($('#pa-area').value);savePasto(n,isNaN(a)?null:a,$('#pa-obs').value.trim());msg('Pasto '+n+' salvo.');e.target.reset();mapDraw()};

/* ============ ATIVIDADES ============ */
const NIV=[['Estratégico','e','Direção da fazenda: metas, investimentos e decisões do proprietário e da consultoria.'],['Tático','t','Gerência: planejamento e acompanhamento das rotinas do mês.'],['Operacional','o','Equipe de campo e serviços gerais: o trabalho do dia a dia.']];
const EQ={'Estratégico':['Proprietário','Consultoria'],'Tático':['Gerência'],'Operacional':['Equipe de campo','Serviços gerais']};
const STS=['A fazer','Em andamento','Concluída'];
const AT=[['abertas','Abertas'],['concluidas','Concluídas'],['todas','Todas']];let AF='abertas';
function eqFill(){const n=new FormData($('#fatv')).get('nivel');fillSel('#atv-eq',EQ[n],false)}
$('#fatv').querySelector('fieldset').onchange=eqFill;
$('#atv-resp').innerHTML=RESP.map((n,i)=>'<label class="chip"><input type="checkbox" id="atv-r'+i+'" name="resp" value="'+n+'"><span>'+n+'</span></label>').join('');
$('#afr').innerHTML='<option value="">Todos</option>'+RESP.map(n=>'<option>'+n+'</option>').join('');$('#afr').onchange=()=>atvDraw();
const rl=a=>Array.isArray(a.resp)?a.resp:(a.resp?[a.resp]:[]);
/* Atividades que se repetem toda semana (rec = dias da semana, 0 = domingo) */
const DSEM=['dom','seg','ter','qua','qui','sex','sáb'],DSEMX=['domingo','segunda','terça','quarta','quinta','sexta','sábado'];
const pdia=(d,n)=>{const x=new Date(d+'T12:00:00');x.setDate(x.getDate()+n);return x.toISOString().slice(0,10)};
const dow=d=>new Date(d+'T12:00:00').getDay();
function proxRec(rec,de,inclusive){for(let i=inclusive?0:1;i<=7;i++){const d=pdia(de,i);if(rec.includes(dow(d)))return d}return ''}
const recTxt=rec=>rec.length===7?'todo dia':'toda '+rec.slice().sort().map(i=>DSEMX[i]).join(', ').replace(/, ([^,]*)$/,' e $1');
function faltam(p){const n=Math.round((new Date(p+'T12:00:00')-new Date(today()+'T12:00:00'))/864e5);return n<0?'Atrasada '+(-n)+' dia(s)':n===0?'Vence hoje':n===1?'Vence amanhã':'Vence em '+n+' dias'}
document.getElementById('atv-rec').innerHTML=DSEM.map((d,i)=>'<label class="chip"><input type="checkbox" name="rec" value="'+i+'"><span>'+d+'</span></label>').join('');
function atvRepetir(a){if(!podeGerirAtv(a)||!canW())return;const d=document.createElement('div');d.className='login';d.id='janela-rec';const r=a.rec||[];
 d.innerHTML='<div class="lbox"><h2 class="ct">Repetição</h2><p class="hint">'+esc(a.tit)+'</p><form class="eform"><div class="chips">'+DSEM.map((x,i)=>'<label class="chip"><input type="checkbox" name="rec" value="'+i+'"'+(r.includes(i)?' checked':'')+'><span>'+x+'</span></label>').join('')+'</div><p class="hint">Desmarque todos para a atividade deixar de se repetir.</p><button class="btn wide" type="submit">Salvar</button><button class="btn ghost wide" type="button" data-fechar>Cancelar</button></form></div>';
 document.body.appendChild(d);d.querySelector('[data-fechar]').onclick=()=>d.remove();
 d.querySelector('form').onsubmit=e=>{e.preventDefault();const rec=new FormData(e.target).getAll('rec').map(Number);
  if(!certeza(rec.length?'A atividade "'+a.tit+'" vai se repetir '+recTxt(rec)+'. Salvar?':'A atividade "'+a.tit+'" deixa de se repetir. Salvar?'))return;
  const n={...a};if(rec.length){n.rec=rec;if(!n.prazo||!rec.includes(dow(n.prazo)))n.prazo=proxRec(rec,today(),true)}else delete n.rec;
  putC('atividades',n);d.remove();msg(rec.length?'Repete '+recTxt(rec)+'. Próxima: '+fd(n.prazo)+'.':'Repetição retirada.');atvDraw()}}
function atvDraw(){
 const L=C.atividades.filter(podeVerAtv),t=today(),late=a=>a.prazo&&a.prazo<t&&a.st!==2,m=ymNow();
 $('#ak').innerHTML=!READY?kp('Atividades','…','carregando'):kp('A fazer',String(L.filter(a=>!a.st).length),'abertas')+kp('Em andamento',String(L.filter(a=>a.st===1).length))+kp('Atrasadas',`<span class="${L.some(late)?'neg':''}">${L.filter(late).length}</span>`,'prazo vencido')+kp('Concluídas',String(L.filter(a=>a.st===2&&(a.fim||'').slice(0,7)===m).length),mlab(m),'hi');
 seg('#aseg',AT,AF,k=>{AF=k;atvDraw()});
 const fr=$('#afr').value,vis=L.filter(a=>(!fr||rl(a).includes(fr))&&(AF==='todas'||(AF==='abertas'?a.st!==2:a.st===2))).sort((a,b)=>(a.st===2)-(b.st===2)||(a.prazo||'9').localeCompare(b.prazo||'9'));
 $('#atl').innerHTML=NIV.filter(([n])=>nivVis().includes(n)).map(([n,c,desc])=>{const it=vis.filter(a=>a.nivel===n);return'<div class="lvl '+c+'"><header><h3>'+n+'</h3><span class="mut">'+it.length+' '+(it.length===1?'atividade':'atividades')+'</span></header><p class="mut" style="margin:0 0 4px">'+desc+'</p>'+(it.length?it.map(a=>'<div class="task'+(a.st===2?' done':'')+'"><button type="button" class="st s'+(a.st||0)+'" data-st="'+a.id+'" title="Mudar situação">'+STS[a.st||0]+'</button><div><div class="tt">'+esc(a.tit)+'</div><div class="meta"><span>'+esc(a.eq)+'</span>'+(rl(a).length?'<span><b>'+esc(rl(a).join(', '))+'</b></span>':'')+((a.rec||[]).length?'<span class="rec">Repete '+recTxt(a.rec)+'</span>':'')+(a.prazo?'<span class="'+(late(a)?'late':'')+'">'+(a.st===2?'Prazo '+fd(a.prazo):faltam(a.prazo)+' · '+fd(a.prazo))+'</span>':'')+(a.ult?'<span>Última vez: '+fd(a.ult)+'</span>':'')+(a.st===2&&a.fim?'<span>Concluída em '+fd(a.fim)+'</span>':'')+(a.obs?'<span>'+esc(a.obs)+'</span>':'')+'</div></div>'+(podeGerirAtv(a)?'<span style="display:flex;flex-direction:column;gap:6px"><button type="button" class="x" data-rec="'+a.id+'">Repetição</button><button type="button" class="x" data-del="atividades/'+a.id+'">Excluir</button></span>':'<span></span>')+'</div>').join(''):'<p class="mut" style="margin:8px 0 0">Nada '+(AF==='concluidas'?'concluído':'pendente')+' neste nível.</p>')+'</div>'}).join('');
}
$('#atl').addEventListener('click',e=>{const b=e.target.closest('[data-st]');if(!b||!canW())return;const a=C.atividades.find(x=>x.id===b.dataset.st);if(!a)return;if(!podeGerirAtv(a)&&!rl(a).includes(USER.n))return msg('Só os responsáveis mudam a situação desta atividade.');const n={...a,st:((a.st||0)+1)%3},rec=a.rec||[],prox=rec.length&&n.st===2?proxRec(rec,a.prazo&&a.prazo>today()?a.prazo:today()):'';
 if(!certeza(prox?'Concluir "'+a.tit+'"? Como ela se repete '+recTxt(rec)+', volta para '+fd(prox)+'.':'Mudar a atividade "'+a.tit+'" para '+STS[n.st]+'?'))return;n.fim=n.st===2?today():null;putC('atividades',n);if(prox){msg('Concluída. Volta para '+fd(prox)+'.');setTimeout(()=>ISM.sincronizar&&ISM.sincronizar(),1500)}atvDraw()});
$('#atl').addEventListener('click',e=>{const b=e.target.closest('[data-rec]');if(!b)return;const a=C.atividades.find(x=>x.id===b.dataset.rec);if(a)atvRepetir(a)});
$('#fatv').onsubmit=e=>{e.preventDefault();if(!canW())return;const f=new FormData(e.target),tit=String(f.get('tit')).trim();if(!tit)return msg('Descreva a atividade.');
 const resp=f.getAll('resp');if(!resp.length)return msg('Marque pelo menos um responsável.');
 const rec=f.getAll('rec').map(Number),prazo=f.get('prazo')||(rec.length?proxRec(rec,today(),true):'');
 if(!certeza('Criar a atividade "'+tit+'"?'+(rec.length?'\nRepete '+recTxt(rec)+'. Primeira vez: '+fd(prazo)+'.':'')))return;
 const nova={id:uid(),tit,nivel:f.get('nivel'),eq:f.get('eq'),resp,prazo,obs:String(f.get('obs')||'').trim(),st:0,criado:today()};if(rec.length)nova.rec=rec;
 putC('atividades',nova);
 msg('Atividade adicionada.');$('#atv-tit').value='';$('#atv-obs').value='';$('#atv-prazo').value='';document.querySelectorAll('#atv-resp input,#atv-rec input').forEach(c=>c.checked=false);if(AF==='concluidas')AF='abertas';atvDraw();$('#atv-tit').focus()};
eqFill();['#fab-data','#coc-data'].forEach(s=>$(s).value=today());

/* ============ IMPORTAÇÃO: núcleo (sem DOM) ============ */
const nrm=s=>String(s??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/\*/g,'').replace(/\(.*?\)/g,'').replace(/\s+/g,' ').trim();
const IMP_SHEETS={entradas:[['brinco','brinco',1],['data','data de entrada',1],['peso','peso de entrada',1],['sexo','sexo',1],['cat','categoria'],['raca','raca'],['forn','fornecedor',1],['valor','valor pago por animal'],['lote','lote'],['prot','protocolo sanitario'],['resp','responsavel']],
 pesagens:[['brinco','brinco',1],['data','data da pesagem',1],['peso','peso',1],['tipo','tipo'],['prot','protocolo sanitario'],['resp','responsavel'],['obs','observacao']],
 vendas:[['brinco','brinco',1],['data','data da venda',1],['peso','peso final',1],['arr','valor da @',1],['comp','comprador',1],['dest','destino'],['valor','valor do animal'],['resp','responsavel']],
 mortes:[['brinco','brinco',1],['data','data da morte',1],['causa','causa'],['resp','responsavel']],
 financeiro:[['data','data',1],['tipo','tipo',1],['grupo','centro de custo',1],['sub','subcentro'],['item','item',1],['valor','valor',1],['forn','fornecedor'],['nf','nota fiscal'],['nf','nf'],['obs','observacao']]};
const IMP_LAB={entradas:'Entradas',pesagens:'Pesagens',vendas:'Vendas',mortes:'Mortes',financeiro:'Financeiro'};
const sheetKey=n=>{const k=nrm(n);return Object.keys(IMP_SHEETS).find(s=>k===s||k===s.replace(/s$/,'')||k.startsWith(s))||null};
function vdate(y,m,d){if(m<1||m>12||d<1||d>31||y<1990||y>2100)return null;const t=new Date(Date.UTC(y,m-1,d));if(t.getUTCMonth()!==m-1)return null;return y+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0')}
function pdate(v){if(v===''||v==null)return null;
 if(v instanceof Date&&!isNaN(v))return vdate(v.getFullYear(),v.getMonth()+1,v.getDate());
 if(typeof v==='number'){if(v<20000||v>80000)return null;const t=new Date(Math.round((v-25569)*864e5));return vdate(t.getUTCFullYear(),t.getUTCMonth()+1,t.getUTCDate())}
 const s=String(v).trim();let m=s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);if(m){let y=+m[3];if(y<100)y+=2000;return vdate(y,+m[2],+m[1])}
 m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);if(m)return vdate(+m[1],+m[2],+m[3]);return null}
function pnum(v){if(typeof v==='number')return v;let s=String(v??'').replace(/R\$|\s|kg/gi,'');if(!s)return NaN;if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');return parseFloat(s)}
const pbr=v=>typeof v==='number'?String(Math.round(v)):String(v??'').trim().replace(/\.0+$/,'');
const ptxt=v=>String(v??'').trim();
const plist=v=>ptxt(v).split(/[,;]/).map(s=>s.trim()).filter(Boolean);
const pick=(v,list)=>{const k=nrm(v);return list.find(x=>nrm(x)===k)||null};
const psexo=v=>{const k=nrm(v);return k==='macho'||k==='m'?'Macho':k==='femea'||k==='f'?'Fêmea':null};

/* S: {chave: linhas[][]}; ctx: {A,today,BM,skipBase,RESP,grupos} */
function impPlan(S,ctx){
 const ID='imp'+Date.now().toString(36),AM=new Map(ctx.A.map(a=>[a.id,JSON.parse(JSON.stringify(a))])),changed=new Set(),created=new Set(),st={},ROM=new Map(),FIN=[],cnt={animais:0,pesagens:0,vendas:0,mortes:0,financeiro:0};
 let rid=Date.now();const t0=ctx.today;
 const resp=v=>{const s=ptxt(v);return s?(pick(s,ctx.RESP)||s):''};
 const gm=(a,d,p)=>{const dd=Math.max(1,Math.round((new Date(d)-new Date(a.ent.d))/864e5));return((p-a.ent.p)/dd).toFixed(3).replace('.',',')};
 function rom(tipo,d,key,info,it){const k=tipo+'|'+d+'|'+key;let r=ROM.get(k);if(!r){r={id:rid++,tipo,d,info:{...info,imp:ID},it:[],imp:ID};ROM.set(k,r)}r.it.push(it)}
 function sheet(key,fn){const rows=S[key],o={lidas:0,ok:0,ign:0,erros:[]};st[key]=o;if(!rows||rows.length<2)return;
  const hdr=rows[0].map(nrm),ix={};
  for(const[k,lab,req]of IMP_SHEETS[key]){let i=hdr.indexOf(lab);if(i<0)i=hdr.findIndex(h=>h&&h.startsWith(lab));if(i<0&&req){o.erros.push({l:1,m:'coluna "'+lab+'" não encontrada no cabeçalho'});}if(i>=0)ix[k]=i}
  if(o.erros.length)return;
  rows.slice(1).forEach((r,i)=>{if(!r||r.every(c=>String(c??'').trim()===''))return;o.lidas++;const g=k=>ix[k]==null?'':r[ix[k]];let e;try{e=fn(g)}catch(x){e='linha não pôde ser lida'}if(e===true)o.ign++;else if(e)o.erros.push({l:i+2,m:e});else o.ok++})}
 const getA=(id)=>AM.get(id);
 const base=(g,lab)=>{const id=pbr(g('brinco')),d=pdate(g('data'));if(!id)return['brinco vazio'];const a=getA(id);if(!a)return['brinco '+id+' não existe no app nem na aba Entradas'];if(!d)return['data '+lab+' inválida'];if(d>t0)return['data no futuro ('+d.split('-').reverse().join('/')+')'];if(d<a.ent.d)return['data antes da entrada do animal ('+a.ent.d.split('-').reverse().join('/')+')'];return[null,id,a,d]};
 sheet('entradas',g=>{const id=pbr(g('brinco')),d=pdate(g('data')),p=pnum(g('peso'));
  if(!id)return'brinco vazio';if(AM.has(id))return'brinco '+id+(created.has(id)?' repetido na planilha':' já existe no app');
  if(!d)return'data de entrada inválida';if(d>t0)return'data no futuro';if(!(p>0))return'peso de entrada inválido';
  const sexo=psexo(g('sexo'));if(!sexo)return'sexo deve ser Macho ou Fêmea';
  const cat=catPeso(p);
  const forn=ptxt(g('forn'));if(!forn)return'fornecedor vazio';
  const pv=pnum(g('valor')),preco=isNaN(pv)?0:pv,lote=ptxt(g('lote')),prot=plist(g('prot')),rs=resp(g('resp'));
  AM.set(id,{id,sexo,cat,raca:ptxt(g('raca')),forn,preco,lote,ent:{d,p},pes:[],venda:null,san:prot.length?[{d,i:prot,imp:ID}]:[],imp:ID});created.add(id);changed.add(id);cnt.animais++;
  rom('Entrada',d,[forn,lote,preco,sexo,rs].join('|'),{forn,preco,lote,sexo,san:prot,resp:rs},{id,p})});
 sheet('pesagens',g=>{const[e,id,a,d]=base(g,'da pesagem');if(e)return e;const p=pnum(g('peso'));if(!(p>0))return'peso inválido';
  if(a.venda&&a.venda.d<d)return'pesagem depois da venda do animal';if(a.morte&&a.morte.d<d)return'pesagem depois da morte do animal';
  if((a.pes||[]).some(x=>x.d===d&&x.p===p))return'pesagem repetida (mesma data e peso)';
  const tipo=ptxt(g('tipo'))||'Rotina',prot=plist(g('prot')),rs=resp(g('resp')),obs=ptxt(g('obs'));
  a.pes=a.pes||[];a.pes.push({d,p,t:tipo,resp:rs,obs,imp:ID});if(prot.length){a.san=a.san||[];a.san.push({d,i:prot,imp:ID})}changed.add(id);cnt.pesagens++;
  rom('Pesagem',d,[tipo,prot.join(','),rs].join('|'),{tipo,san:prot,resp:rs},{id,p,g:gm(a,d,p),obs})});
 sheet('vendas',g=>{const[e,id,a,d]=base(g,'da venda');if(e)return e;if(a.venda)return'animal já vendido em '+a.venda.d.split('-').reverse().join('/');if(a.morte)return'animal com morte lançada';
  const p=pnum(g('peso')),arr=pnum(g('arr'));if(!(p>0))return'peso final inválido';if(!(arr>0))return'valor da @ inválido';
  const comp=ptxt(g('comp'));if(!comp)return'comprador vazio';const dv=ptxt(g('dest')),dest=dv?(pick(dv,['Frigorífico','Outra fazenda','Atravessador'])||dv):'Frigorífico';
  const vg=pnum(g('valor')),valor=vg>0?vg:p/30*arr,rs=resp(g('resp'));
  a.venda={d,p,comp,dest,arr,valor,resp:rs,imp:ID};changed.add(id);cnt.vendas++;
  rom('Venda',d,[comp,dest,arr,rs].join('|'),{comp,dest,arr,resp:rs},{id,p,valor,g:gm(a,d,p)})});
 sheet('mortes',g=>{const[e,id,a,d]=base(g,'da morte');if(e)return e;if(a.venda)return'animal já vendido';if(a.morte)return'morte já lançada para este animal';
  const causa=ptxt(g('causa')),rs=resp(g('resp'));a.morte={d,causa,resp:rs,imp:ID};changed.add(id);cnt.mortes++;
  rom('Morte',d,'',{},{id,causa,resp:rs})});
 let fn=0;
 sheet('financeiro',g=>{const d=pdate(g('data'));if(!d)return'data inválida';if(d>t0)return'data no futuro';
  const tipo=pick(g('tipo'),['Receita','Despesa','Investimento']);if(!tipo)return'tipo deve ser Receita, Despesa ou Investimento';
  const gr=ptxt(g('grupo'));if(!gr)return'centro de custo vazio';const item=ptxt(g('item'));if(!item)return'item vazio';
  const v=pnum(g('valor'));if(isNaN(v)||v===0)return'valor inválido';
  if(ctx.skipBase&&ctx.BM.includes(d.slice(0,7)))return true;
  const grupo=pick(gr,ctx.grupos)||gr.toUpperCase();
  const fx={id:ID+'-'+(fn++),d,tipo,grupo,sub:ptxt(g('sub')),item,valor:Math.abs(v),obs:ptxt(g('obs')),imp:ID},fo=ptxt(g('forn')),nf=ptxt(g('nf'));if(fo)fx.forn=fo;if(nf)fx.nf=nf;FIN.push(fx);cnt.financeiro++});
 return{ID,st,cnt,animals:[...changed].map(id=>AM.get(id)),roms:[...ROM.values()],fin:FIN,novos:created.size};
}

/* ============ IMPORTAÇÃO: tela ============ */
const TPL=null;let IMP=null,IMPB=false;
function loadXLSX(){return window.XLSX?Promise.resolve():new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';s.onload=res;s.onerror=()=>rej({code:'lib'});document.head.append(s)})}
$('#imp-tpl').onclick=async()=>{const d=await dl();if(!d)return;try{const r=await fetch('modelo-importacao.xlsx');if(!r.ok)throw{code:'fetch'};const b=new Uint8Array(await r.arrayBuffer());await d.save({filename:'modelo-importacao-ism.xlsx',data:b});msg('Modelo baixado.')}catch(e){xerr(e)}};
$('#imp-file').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;impRead(f.name,()=>f.arrayBuffer())};
const PREP=[];
function prepDraw(){const done=new Set((C.importacoes||[]).map(x=>x.arquivo)),L=PREP.filter(p=>!done.has(p.nome));
 $('#imp-ready').innerHTML=L.map((p,i)=>'<div class="card run" style="border-color:var(--tag-edge)"><div><p class="eyebrow">Planilha preparada pela consultoria</p><h2 class="ct">'+esc(p.nome)+'</h2></div><p class="hint" style="margin:0">'+esc(p.desc)+'. Já está no modelo de importação; confira a prévia e grave.</p><button class="btn" type="button" data-prep="'+i+'">Conferir e importar</button></div>').join('')}
document.addEventListener('click',e=>{const b=e.target.closest('[data-prep]');if(!b)return;const p=PREP[+b.dataset.prep];impRead(p.nome,null,async()=>{const r=await fetch(p.path);if(!r.ok)throw{code:'fetch'};return r.json()});window.scrollTo(0,$('#imp-prev').offsetTop-20)});
async function impRead(name,getBuf,getRows){
 $('#imp-prev').innerHTML='<div class="card empty">Lendo '+esc(name)+'…</div>';const f={name};
 try{const S={};if(getRows){const J=await getRows();for(const n in J){const k=sheetKey(n);if(k)S[k]=J[n]}}else{await loadXLSX();const wb=XLSX.read(await getBuf(),{type:'array'});
  wb.SheetNames.forEach(n=>{const k=sheetKey(n);if(k)S[k]=XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,raw:true,defval:''})})}
  if(!Object.keys(S).length){$('#imp-prev').innerHTML='<div class="card empty"><b>Nenhuma aba do modelo encontrada</b>O arquivo precisa ter abas chamadas Entradas, Pesagens, Vendas, Mortes ou Financeiro. Baixe o modelo e copie os dados para ele.</div>';return}
  IMP={name:f.name,S,skip:true};impShow()}
 catch(er){$('#imp-prev').innerHTML='<div class="card empty"><b>Não consegui ler esse arquivo</b>'+(er&&er.code==='lib'?'O leitor de planilhas não carregou. Confira a internet e tente de novo.':er&&er.code==='fetch'?'A planilha preparada não pôde ser baixada. Recarregue o app e tente de novo.':'Salve a planilha como .xlsx no Excel e tente de novo.')+'</div>'}}
function impCtx(){return{A,today:today(),BM,skipBase:IMP.skip,RESP,grupos:[...new Set(D.k.map(r=>r[1]).concat(((ISM.painel&&ISM.painel().plano)||[]).map(r=>r[1]),(C.financeiro||[]).map(x=>x.grupo)))]}}
function impShow(){
 if(!READY){$('#imp-prev').innerHTML='<div class="card empty">Aguarde o app carregar os dados para conferir a planilha.</div>';return}
 const P=IMP.plan=impPlan(IMP.S,impCtx()),keys=Object.keys(P.st).filter(k=>IMP.S[k]&&IMP.S[k].length>1);
 const tot=P.cnt.animais+P.cnt.pesagens+P.cnt.vendas+P.cnt.mortes+P.cnt.financeiro,errs=[];
 keys.forEach(k=>P.st[k].erros.forEach(e=>errs.push(IMP_LAB[k]+' · linha '+e.l+': '+e.m)));
 const hasBase=IMP.S.financeiro&&IMP.S.financeiro.length>1;
 $('#imp-prev').innerHTML='<div class="card run"><div><p class="eyebrow">Prévia · '+esc(IMP.name)+'</p><h2 class="ct">Conferência da planilha</h2></div>'+
 (keys.length?'<div class="tw"><table class="pt"><tr><th>Aba</th><th>Linhas</th><th>Prontas</th><th>Com erro</th><th>Ignoradas</th></tr>'+keys.map(k=>{const o=P.st[k];return'<tr><td>'+IMP_LAB[k]+'</td><td>'+o.lidas+'</td><td class="av pos">'+o.ok+'</td><td class="'+(o.erros.length?'neg':'')+'">'+o.erros.length+'</td><td>'+(o.ign||'–')+'</td></tr>'}).join('')+'</table></div>':'<p class="mut">As abas do modelo estão vazias.</p>')+
 (hasBase?'<label class="chip" style="align-self:flex-start"><input type="checkbox" id="imp-skip"'+(IMP.skip?' checked':'')+'><span>Ignorar lançamentos financeiros dos meses que já estão no painel</span></label>':'')+
 (errs.length?'<div class="note"><b>'+errs.length+(errs.length===1?' linha com erro não será gravada':' linhas com erro não serão gravadas')+'.</b> Corrija na planilha e importe de novo só essas linhas.<br>'+errs.slice(0,40).map(esc).join('<br>')+(errs.length>40?'<br>e mais '+(errs.length-40)+'…':'')+'</div>':'')+
 '<p class="hint">Serão gravados: <b>'+P.cnt.animais+'</b> animais novos, <b>'+P.cnt.pesagens+'</b> pesagens, <b>'+P.cnt.vendas+'</b> vendas, <b>'+P.cnt.mortes+'</b> mortes e <b>'+P.cnt.financeiro+'</b> lançamentos financeiros.</p>'+
 '<div class="row2"><button class="btn" type="button" id="imp-go"'+(tot?'':' disabled')+'>Gravar '+tot+' '+(tot===1?'registro':'registros')+'</button><button class="btn ghost" type="button" id="imp-x">Cancelar</button></div><p class="mut" id="imp-pg" aria-live="polite"></p></div>';
 const sk=$('#imp-skip');if(sk)sk.onchange=()=>{IMP.skip=sk.checked;impShow()};
 $('#imp-x').onclick=()=>{IMP=null;$('#imp-prev').innerHTML=''};$('#imp-go').onclick=impCommit}
async function runOps(ops,prog){let i=0,done=0,fail=0,last=null;
 const w=async()=>{while(i<ops.length){const[k,v]=ops[i++];for(let t=0;t<7;t++){try{v===null?await DB.doc(k).delete():await DB.doc(k).set(clone(v));break}catch(e){if(e&&(e.code==='unavailable'||e.code==='resource_exhausted')&&t<6){await new Promise(r=>setTimeout(r,800*(t+1)+Math.random()*700));continue}fail++;last=e;break}}done++;prog(done,ops.length)}};
 IMPB=true;try{await Promise.all([0,1,2,3].map(w))}finally{IMPB=false;redraw()}return{fail,last}}
async function impCommit(){if(!canW()||!IMP||!IMP.plan)return;if(!certeza('Gravar esta importação no app?'))return;const P=IMP.plan,b=$('#imp-go');b.disabled=true;$('#imp-x').disabled=true;
 const rec={id:P.ID,d:today(),quando:new Date().toISOString(),arquivo:IMP.name,cnt:P.cnt};
 if(!DB){const m=new Map(A.map(a=>[a.id,a]));P.animals.forEach(a=>m.set(a.id,a));A=[...m.values()];R.push(...P.roms);C.financeiro.push(...P.fin);C.importacoes.push(rec);saveLocal();impDone(0);return}
 const ops=[...P.animals.map(a=>['animais/'+a.id,a]),...P.roms.map(r=>['romaneios/'+r.id,r]),...P.fin.map(x=>['financeiro/'+x.id,x])];
 const r=await runOps(ops,(d,n)=>{$('#imp-pg').textContent='Gravando '+d+' de '+n+'…';b.textContent='Gravando '+Math.round(d/n*100)+'%'});
 rec.falhas=r.fail;try{await DB.doc('importacoes/'+P.ID).set(rec)}catch(e){}
 if(r.last&&r.last.code==='invalid_argument')RO=true;impDone(r.fail)}
function impDone(fail){const P=IMP.plan;IMP=null;$('#imp-prev').innerHTML='';
 msg(fail?'Importação gravada com '+fail+' falhas. Desfaça e tente de novo se faltar algo.':'Importação concluída: '+(P.cnt.animais+P.cnt.pesagens+P.cnt.vendas+P.cnt.mortes+P.cnt.financeiro)+' registros.');redraw();impHist()}
async function impUndo(id){if(!canW())return;const ops=[];
 A.forEach(a=>{if(a.imp===id){ops.push(['animais/'+a.id,null]);return}const n=clone(a);let ch=false;const f=(arr)=>{const l=(arr||[]).length,o=(arr||[]).filter(x=>x.imp!==id);if(o.length!==l)ch=true;return o};n.pes=f(n.pes);n.san=f(n.san);if(n.venda&&n.venda.imp===id){n.venda=null;ch=true}if(n.morte&&n.morte.imp===id){n.morte=null;ch=true}if(ch)ops.push(['animais/'+a.id,n])});
 R.filter(r=>r.imp===id).forEach(r=>ops.push(['romaneios/'+r.id,null]));(C.financeiro||[]).filter(x=>x.imp===id).forEach(x=>ops.push(['financeiro/'+x.id,null]));ops.push(['importacoes/'+id,null]);
 if(!DB){ops.forEach(([k,v])=>{const[c,i]=k.split('/');if(c==='animais'){A=v?A.map(a=>a.id===i?v:a):A.filter(a=>a.id!==i)}else if(c==='romaneios')R=R.filter(r=>String(r.id)!==i);else C[c]=C[c].filter(x=>x.id!==i)});saveLocal();msg('Importação desfeita.');redraw();return}
 msg('Desfazendo importação…');const r=await runOps(ops,()=>{});msg(r.fail?'Desfeito com '+r.fail+' falhas. Tente desfazer de novo.':'Importação desfeita.')}
function impHist(){prepDraw();const L=(C.importacoes||[]).slice().sort((a,b)=>(b.quando||'').localeCompare(a.quando||''));
 $('#imp-hist').innerHTML=L.length?L.map(x=>{const c=x.cnt||{},parts=[[c.animais,'animais'],[c.pesagens,'pesagens'],[c.vendas,'vendas'],[c.mortes,'mortes'],[c.financeiro,'lanç. financeiros']].filter(p=>p[0]).map(p=>p[0]+' '+p[1]);return'<div class="rowl"><span class="d">'+fd(x.d).slice(0,5)+'</span><span><b>'+esc(x.arquivo||'Planilha')+'</b><span class="sub2">'+(parts.join(' · ')||'sem registros')+(x.falhas?' · '+x.falhas+' falhas':'')+'</span></span><span></span><button type="button" class="x" data-undo="'+esc(x.id)+'">Desfazer</button></div>'}).join(''):'<p class="mut">Nenhuma importação ainda.</p>'}
document.addEventListener('click',e=>{const b=e.target.closest('[data-undo]');if(b&&certeza('Desfazer esta importação? Tudo o que ela trouxe sai do app.'))impUndo(b.dataset.undo);const g=e.target.closest('[data-go]');if(g){go(g.dataset.go);window.scrollTo(0,0)}});


/* ============ USUÁRIOS E PERFIS (simulação no protótipo) ============ */
const USERS=[];
const PERM=ISM.perm;
let USER=null;
const can=k=>!!USER&&(USER.r.some(r=>(PERM[k]||[]).includes(r))||(USER.x||[]).includes(k));
const VAL=()=>can('rs');
const NAVP={fin:()=>can('fin_ver')&&ISM.mod('financeiro'),man:()=>can('manejo')&&ISM.mod('rebanho'),reb:()=>can('rebanho')&&ISM.mod('rebanho'),sup:()=>(can('cocho')||can('fabrica'))&&ISM.mod('suplemento'),atv:()=>ISM.mod('atividades'),map:()=>ISM.mod('mapa'),imp:()=>can('importar')};
function applyPerms(){
 document.querySelectorAll('#nav button').forEach(b=>b.hidden=!NAVP[b.dataset.v]());
 const n=[...document.querySelectorAll('#nav button')].filter(b=>!b.hidden).length;$('#nav').style.setProperty('--nav-n',n);
 document.querySelectorAll('[data-perm]').forEach(e=>e.hidden=!e.dataset.perm.split('|').some(k=>can(k)));
 ST.splice(0,ST.length,...[['fab','Fábrica de ração'],['coc','Cocho'],['pre','Preço das dietas']].filter(([k])=>can(k=='fab'?'fabrica':k=='pre'?'importar':'cocho')));if(!ST.some(s=>s[0]===SP)&&ST.length)SP=ST[0][0];
 const tat=!can('atv_todas');$('#atv-ne').disabled=tat;$('#atv-ne').closest('.chip').hidden=tat;
 $('#uchip').innerHTML='<b>'+esc(USER.n)+'</b><span>'+esc(USER.r.join(' + '))+'</span><button type="button" id="utroca">Conta</button><span id="sincst" class="sincst">…</span>';
 document.querySelectorAll('[data-resp]').forEach(s=>{if([...s.options].some(o=>o.value===USER.n))s.value=USER.n});
}
function entrar(u){USER=u;applyPerms();const h=(location.hash||'').slice(1),k=Object.keys(VIEWS).find(x=>VIEWS[x]===h);const ini=Object.keys(NAVP).find(x=>NAVP[x]());go(k&&NAVP[k]()?k:ini);window.scrollTo(0,0)}
function loginDraw(){ISM.menu()}
document.addEventListener('click',e=>{if(e.target.id==='utroca')ISM.menu()});
const nivVis=()=>can('atv_todas')?['Estratégico','Tático','Operacional']:can('atv_tatico')?['Tático','Operacional']:['Operacional'];
const podeVerAtv=a=>nivVis().includes(a.nivel);
const podeGerirAtv=a=>can('atv_todas')||(can('atv_tatico')&&a.nivel!=='Estratégico');

/* ============ LANÇAMENTO MANUAL NO CAIXA ============ */
/* Árvore do caixa: tipo → centro → subcentro → itens, da planilha de caixa e dos lançamentos já feitos */
function cxArvore(tp){const T={};const add=(g,sb,it)=>{if(!g)return;((T[g]=T[g]||{})[sb||'']=T[g][sb||'']||new Set());if(it)T[g][sb||''].add(it)};
 D.k.filter(r=>r[0]===tp).forEach(r=>add(r[1],r[2],r[3]));((ISM.painel&&ISM.painel().plano)||[]).filter(r=>r[0]===tp).forEach(r=>add(r[1],r[2],r[3]));(C.financeiro||[]).filter(x=>x.tipo===tp).forEach(x=>add(x.grupo,x.sub,x.item));return T}
function cxFornecedores(){return[...new Set((C.financeiro||[]).map(x=>String(x.forn||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'))}
const OUTRO='__outro';
/* Preenche os selects em cascata. el = {grupo,sub,item,novoF}; val = valores atuais */
function cxCascata(el,tp,val){const T=cxArvore(tp),o=(v,t)=>'<option value="'+esc(v)+'">'+esc(t==null?v:t)+'</option>';
 const gs=Object.keys(T);if(val.grupo&&!gs.includes(val.grupo))gs.push(val.grupo);el.grupo.innerHTML=gs.map(g=>o(g)).join('');if(val.grupo)el.grupo.value=val.grupo;
 const G=T[el.grupo.value]||{},ss=Object.keys(G).sort((a,b)=>a?b?a.localeCompare(b,'pt-BR'):1:-1);if(val.sub!=null&&!ss.includes(val.sub))ss.push(val.sub);
 el.sub.innerHTML=ss.map(x=>o(x,x||'—')).join('');if(val.sub!=null&&ss.includes(val.sub))el.sub.value=val.sub;
 const its=[...(G[el.sub.value]||[])].sort((a,b)=>a.localeCompare(b,'pt-BR'));if(val.item&&val.item!==OUTRO&&!its.includes(val.item))its.push(val.item);
 el.item.innerHTML=its.map(x=>o(x)).join('')+o(OUTRO,'Outro (digitar)');if(val.item)el.item.value=val.item;else if(!its.length)el.item.value=OUTRO;
 el.novoF.hidden=el.item.value!==OUTRO}
window.cxCascata=cxCascata;window.cxFornecedores=cxFornecedores;window.CX_OUTRO=OUTRO;
const cxEl=()=>({grupo:$('#cx-grupo'),sub:$('#cx-sub'),item:$('#cx-item'),novoF:$('#cx-novo-f')});
let CXN=10;
function cxDraw(){if(!$('#fcx'))return;const e=cxEl();cxCascata(e,$('#cx-tipo').value,{grupo:e.grupo.value,sub:e.sub.value,item:e.item.value});
 $('#cx-forns').innerHTML=cxFornecedores().map(x=>'<option value="'+esc(x)+'">').join('');
 const TL=C.financeiro.filter(x=>x.manual).sort((a,b)=>b.d.localeCompare(a.d)||String(b.id).localeCompare(String(a.id))),L=TL.slice(0,CXN);
 $('#cxd-t').textContent='Últimos lançamentos manuais'+(TL.length?' ('+TL.length+')':'');$('#cxd').querySelector('.cxd-a').textContent=$('#cxd').open?'esconder':'ver';$('#cxl-mais').hidden=TL.length<=CXN;
 $('#cxl').innerHTML=L.length?L.map(x=>'<div class="rowl"><span class="d">'+fd(x.d).slice(0,5)+'</span><span><b>'+esc(x.item)+'</b><span class="sub2">'+esc(x.tipo)+' · '+esc(x.grupo)+(x.sub?' · '+esc(x.sub):'')+(x.forn?' · '+esc(x.forn):'')+(x.nf?' · NF '+esc(x.nf):'')+(x.por?' · lançado por '+esc(x.por):'')+'</span></span><span class="q '+(x.tipo==='Receita'?'pos':'neg')+'">'+brl(x.valor)+'</span>'+(can('fin_editar')?'<span style="display:flex;gap:6px">'+(window.botaoEditar?botaoEditar:()=>'')('financeiro',x.id)+'<button type="button" class="x" data-del="financeiro/'+x.id+'">Excluir</button></span>':'<span></span>')+'</div>').join(''):'<p class="mut">Nenhum lançamento manual ainda.</p>'}
['#cx-grupo','#cx-sub'].forEach((q,i)=>$(q).onchange=()=>{const e=cxEl();cxCascata(e,$('#cx-tipo').value,{grupo:e.grupo.value,sub:i?e.sub.value:null,item:''})});
$('#cxd').addEventListener('toggle',()=>{if(!$('#cxd').open)CXN=10;cxDraw()});$('#cxl-mais').onclick=()=>{CXN+=20;cxDraw()};
$('#cx-item').onchange=()=>{$('#cx-novo-f').hidden=$('#cx-item').value!==OUTRO;if(!$('#cx-novo-f').hidden)$('#cx-novo').focus()};
$('#fcx').onsubmit=e=>{e.preventDefault();if(!canW()||!can('fin_lancar'))return;const f=new FormData(e.target),v=num(f.get('valor'));
 const item=(f.get('item')===OUTRO?String(f.get('novo')||''):String(f.get('item')||'')).trim();
 if(!f.get('data'))return msg('Informe a data.');if(!item)return msg(f.get('item')===OUTRO?'Digite o nome do item novo.':'Informe o item.');if(!(v>0))return msg('Informe o valor.');
 const doc={id:uid(),d:f.get('data'),tipo:f.get('tipo'),grupo:f.get('grupo'),sub:String(f.get('sub')||'').trim(),item,valor:v,obs:String(f.get('obs')||'').trim(),manual:true,por:USER.n};
 const forn=String(f.get('forn')||'').trim(),nf=String(f.get('nf')||'').trim();if(forn)doc.forn=forn;if(nf)doc.nf=nf;
 if(!certeza('Lançar '+doc.tipo.toUpperCase()+' de '+brl(v)+' em '+fd(doc.d)+'?\n'+doc.grupo+(doc.sub?' · '+doc.sub:'')+' · '+item+(forn?'\nFornecedor: '+forn:'')+(nf?' · NF '+nf:'')))return;
 putC('financeiro',doc);
 msg(f.get('tipo')+' de '+brl(v)+' lançada no caixa.');['#cx-valor','#cx-novo','#cx-obs','#cx-forn','#cx-nf'].forEach(q=>$(q).value='');$('#cx-item').value='';cxDraw();finDraw()};

/* ============ RELATÓRIO DO CAIXA (PDF e Excel), por mês ============ */
const MEXT=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'],mext=m=>MEXT[+m.slice(5)-1]+' de '+m.slice(0,4);
function relDados(m){const j=M.indexOf(m),ord={Receita:0,Despesa:1,Investimento:2};
 const res=K.filter(r=>j>=0&&r[4][j]).map(r=>({tipo:r[0],grupo:r[1],sub:r[2],item:r[3],valor:r[4][j]})).sort((a,b)=>ord[a.tipo]-ord[b.tipo]||a.grupo.localeCompare(b.grupo,'pt-BR')||a.sub.localeCompare(b.sub,'pt-BR')||a.item.localeCompare(b.item,'pt-BR'));
 const tot=t=>sm(res.filter(r=>r.tipo===t).map(r=>r.valor));
 const det=(C.financeiro||[]).filter(x=>x.d.slice(0,7)===m).sort((a,b)=>a.d.localeCompare(b.d)||ord[a.tipo]-ord[b.tipo]||a.grupo.localeCompare(b.grupo,'pt-BR'));
 const org=x=>x.manual?'Manual':x.auto||x.origem==='cocho'?'Cocho (automático)':'Importado';
 return{res,det,org,rec:tot('Receita'),des:tot('Despesa'),inv:tot('Investimento'),base:BM.includes(m)}}
function relAbrir(){if(!can('fin_ver'))return;const ms=M.slice().reverse();if(!ms.length)return msg('Nenhum mês com lançamentos.');
 const d=document.createElement('div');d.className='login';d.id='janela-rel';
 d.innerHTML='<div class="lbox"><h2 class="ct">Relatório do caixa</h2><p class="hint">Resumo por centro de custo e todos os lançamentos do mês, com fornecedor e nota fiscal.</p><form class="eform"><label>Mês<select name="mes">'+ms.map(m=>'<option value="'+m+'">'+mext(m)+'</option>').join('')+'</select></label>'+
  '<button class="btn wide" type="button" data-rel="pdf">Baixar PDF</button><button class="btn wide" type="button" data-rel="xlsx">Baixar Excel</button><button class="btn ghost wide" type="button" data-fechar>Fechar</button></form></div>';
 document.body.appendChild(d);d.querySelector('[data-fechar]').onclick=()=>d.remove();
 d.querySelectorAll('[data-rel]').forEach(b=>b.onclick=async()=>{const m=d.querySelector('[name=mes]').value;b.disabled=true;try{await relGerar(m,b.dataset.rel)}finally{b.disabled=false}})}
$('#rel-abrir').onclick=relAbrir;
async function relGerar(m,fmt){const R_=relDados(m),dd=await dl();if(!dd)return;const nome='Caixa_'+ISM.cliente.nome.replace(/\s+/g,'_')+'_'+m;
 const cab=['Data','Tipo','Centro de custo','Subcentro','Item','Fornecedor','NF','Valor (R$)','Origem','Lançado por','Observação'];
 const lin=x=>[fd(x.d),x.tipo,x.grupo,x.sub||'',x.item,x.forn||'',x.nf||'',x.valor,R_.org(x),x.por||'',x.obs||''];
 try{
 if(fmt==='xlsx'){await loadXLSX();const wb=XLSX.utils.book_new();
  const r1=[['Relatório do caixa · '+ISM.cliente.nome+' · '+mext(m)],['Emitido em '+fd(today())+' por '+USER.n],[],['Receitas',R_.rec],['Despesas',R_.des],['Investimentos',R_.inv],['Saldo (receitas − despesas − investimentos)',R_.rec-R_.des-R_.inv],[],['Tipo','Centro de custo','Subcentro','Item','Valor (R$)'],...R_.res.map(r=>[r.tipo,r.grupo,r.sub,r.item,Math.round(r.valor*100)/100])];
  const w1=XLSX.utils.aoa_to_sheet(r1);w1['!cols']=[{wch:16},{wch:30},{wch:30},{wch:30},{wch:14}];XLSX.utils.book_append_sheet(wb,w1,'Resumo');
  const w2=XLSX.utils.aoa_to_sheet([cab,...R_.det.map(lin)]);w2['!cols']=[{wch:11},{wch:12},{wch:28},{wch:26},{wch:26},{wch:22},{wch:10},{wch:13},{wch:18},{wch:14},{wch:30}];
  XLSX.utils.book_append_sheet(wb,w2,'Lançamentos');
  const out=XLSX.write(wb,{bookType:'xlsx',type:'array'});await dd.save({filename:nome+'.xlsx',data:new Blob([out],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})});msg('Relatório de '+mext(m)+' baixado em Excel.');return}
 const J=window.jspdf&&window.jspdf.jsPDF;if(!J)throw{code:'lib'};const doc=new J({orientation:'l',unit:'pt',format:'a4'}),pw_=doc.internal.pageSize.getWidth(),ph_=doc.internal.pageSize.getHeight();
 try{doc.addImage(PDFLOGO,'PNG',40,22,150,150*PDFR)}catch(e){doc.setFontSize(12);doc.text(ISM.cliente.nome.toUpperCase(),40,40)}
 doc.setFontSize(8);doc.setTextColor(110);doc.text('ISM Consultoria Pecuária',pw_-40,32,{align:'right'});doc.text('Emitido em '+fd(today())+' por '+USER.n,pw_-40,44,{align:'right'});
 doc.setDrawColor(31,61,43);doc.setLineWidth(1.2);doc.line(40,68,pw_-40,68);doc.setTextColor(20);doc.setFontSize(15);doc.text('Relatório do caixa · '+mext(m),40,90);
 const bx=(x,t,v,c)=>{doc.setFillColor(241,244,236);doc.roundedRect(x,102,(pw_-80-30)/4,44,4,4,'F');doc.setFontSize(8);doc.setTextColor(92,107,95);doc.text(t.toUpperCase(),x+10,117);doc.setFontSize(13);doc.setTextColor(...c);doc.text(brl(v),x+10,136)};
 const bw=(pw_-80-30)/4;bx(40,'Receitas',R_.rec,[31,61,43]);bx(40+(bw+10),'Despesas',R_.des,[181,67,42]);bx(40+2*(bw+10),'Investimentos',R_.inv,[22,35,26]);bx(40+3*(bw+10),'Saldo',R_.rec-R_.des-R_.inv,R_.rec-R_.des-R_.inv<0?[181,67,42]:[31,111,181]);
 doc.setTextColor(20);doc.setFontSize(11);doc.setFont('helvetica','bold');doc.setTextColor(31,61,43);doc.text('RESUMO POR CENTRO DE CUSTO',40,170);doc.setFont('helvetica','normal');doc.setTextColor(20);
 const rb=[];let gA='';R_.res.forEach(r=>{const k=r.tipo+'|'+r.grupo;if(k!==gA){gA=k;rb.push([{content:r.tipo+' · '+r.grupo,colSpan:3,styles:{fontStyle:'bold',fillColor:[225,233,214]}},{content:brl(sm(R_.res.filter(x=>x.tipo===r.tipo&&x.grupo===r.grupo).map(x=>x.valor))),styles:{fontStyle:'bold',halign:'right',fillColor:[225,233,214]}}])}rb.push(['',r.sub||'—',r.item,{content:brl(r.valor),styles:{halign:'right'}}])});
 doc.autoTable({startY:178,head:[['','Subcentro','Item',{content:'Valor',styles:{halign:'right'}}]],body:rb,styles:{fontSize:8,cellPadding:3},headStyles:{fillColor:[31,61,43]},columnStyles:{0:{cellWidth:20}}});
 let y=doc.lastAutoTable.finalY+24;if(y>ph_-100){doc.addPage();y=50}
 doc.setFontSize(11);doc.setFont('helvetica','bold');doc.setTextColor(31,61,43);doc.text('LANÇAMENTOS DO MÊS ('+R_.det.length+')',40,y);doc.setFont('helvetica','normal');doc.setTextColor(20);
 if(R_.det.length)doc.autoTable({startY:y+8,head:[cab.slice(0,10)],body:R_.det.map(x=>{const l=lin(x).slice(0,10);l[7]=brl(x.valor);return l}),styles:{fontSize:7,cellPadding:2.5},headStyles:{fillColor:[31,61,43]},alternateRowStyles:{fillColor:[241,244,236]},columnStyles:{7:{halign:'right'}}});
 else{doc.setFontSize(9);doc.setTextColor(92,107,95);doc.text(R_.base?'Mês fechado pela planilha de caixa: os valores estão no resumo acima.':'Nenhum lançamento neste mês.',40,y+18)}
 const n=doc.internal.getNumberOfPages();for(let i=1;i<=n;i++){doc.setPage(i);doc.setFontSize(7);doc.setTextColor(120);doc.text(ISM.cliente.nome+' · Relatório do caixa · '+mext(m),40,ph_-20);doc.text('Página '+i+' de '+n,pw_-40,ph_-20,{align:'right'})}
 await dd.save({filename:nome+'.pdf',data:doc.output('blob')});msg('Relatório de '+mext(m)+' baixado em PDF.')
 }catch(er){xerr(er)}}
$('#cx-data').value=today();$('#cx-tipo').onchange=()=>{const e=cxEl();cxCascata(e,$('#cx-tipo').value,{grupo:'',sub:null,item:''})};
/* início */
['#pbt','#vbt','#mbt'].forEach(s=>tagSet(s,''));
manDraw();
entrar(ISM.user);
