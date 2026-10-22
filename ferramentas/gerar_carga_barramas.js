// Gera supabase/carga/barramas.sql com os dados que já estavam no protótipo,
// usando a MESMA tradução do app (app/js/sinc.js). Uso:
//   node ferramentas/gerar_carga_barramas.js <pasta-dump-do-prototipo> <pasta-ativos> <saida.sql>
const fs = require('fs'), path = require('path');
const [DUMP, ATIVOS, SAIDA] = process.argv.slice(2);
const CLIENTE = 'b0000000-0000-4000-8000-000000000001';

// ambiente mínimo para rodar o sinc.js fora do navegador
const mem = {};
global.window = global;
global.navigator = { onLine: false };
global.document = { addEventListener() {}, hidden: false };
global.addEventListener = () => {};
global.setInterval = () => 0;
window.ISM_CONFIG = { SEGUNDOS_SINCRONIA: 60 };
window.Cofre = { ler: async k => mem[k] || null, gravar: async (k, v) => { mem[k] = v; }, chaves: async () => [], apagar: async () => {} };
window.Nuvem = {};
require(path.resolve(__dirname, '../app/js/sinc.js'));
const S = window.Sinc;

const lerCol = c => {
  const d = path.join(DUMP, c);
  return fs.existsSync(d) ? fs.readdirSync(d).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(path.join(d, f), 'utf8'))) : [];
};
const lit = s => "'" + String(s).replace(/'/g, "''") + "'";

(async () => {
  await S.iniciar({ cliente: CLIENTE, usuario: null, podeTotais: true, obterToken: async () => null });
  const extras = JSON.parse(fs.readFileSync(path.join(DUMP, 'extras.json'), 'utf8')); // atividades, cocho, fabrica, financeiro
  const cols = { romaneios: lerCol('romaneios'), pastos: lerCol('pastos'), importacoes: lerCol('importacoes'), animais: lerCol('animais'), ...extras };
  let n = 0;
  for (const [c, docs] of Object.entries(cols)) for (const d of docs) { S.db.doc(c + '/' + d.id).set(d); n++; }
  S._processar();
  const fila = S._fila();
  const porTab = {}, valores = [];
  for (const o of fila) {
    if (o.op === 'ins') { const l = Object.assign({}, o.linha); delete l.criado_por; (porTab[o.tab] = porTab[o.tab] || []).push(l); }
    else if (o.tab === 'vendas_valor') valores.push(o);
    else throw new Error('operação inesperada ' + JSON.stringify(o).slice(0, 200));
  }
  const A = f => fs.readFileSync(path.join(ATIVOS, f), 'utf8').trim();
  const marca = { horiz: A('horiz_svg.txt'), selo: A('seal_svg.txt'), selog: A('seal_g.txt'), pdflogo: A('pdflogo.txt'), pdfr: +A('pdflogo_ratio.txt'),
    subtitulo: 'Gestão pecuária · Ciclo 2026 · Proprietário: Wilmington Viana' };
  const mapa = { img: A('map.txt'), titulo: 'Mapa de divisões · outubro/2025',
    alt: 'Mapa de divisões da Fazenda Barramas com módulos M1 a M8, pastos P1 a P31, rio, corredores e áreas de preservação',
    info: [['Município', 'Senador La Rocque – MA'], ['Proprietário', 'Wilmington Viana'], ['Coordenadas', '5°18′37,45″ S · 47°04′25,62″ O'], ['Elipsoide', 'GRS 80']] };
  const painel = { marca, mapa, D: JSON.parse(A('D.txt')), V: JSON.parse(A('V.txt')), SUP: JSON.parse(A('SUP.txt')) };

  const out = [];
  out.push('-- =====================================================================');
  out.push('-- ISM Pecuária — carga inicial da Fazenda Barramas');
  out.push('-- Dados que estavam no protótipo em ' + new Date().toISOString().slice(0, 10) + '. Rode UMA vez, depois do 001 e do 002.');
  out.push('-- =====================================================================');
  out.push('begin;');
  out.push(`insert into public.clientes (id, nome, tipo, modulos) values ('${CLIENTE}', 'Fazenda Barramas', 'fazenda', '{financeiro,rebanho,suplemento,atividades,mapa}');`);
  for (const [k, v] of Object.entries(painel)) out.push(`insert into public.painel (cliente_id, chave, dados) values ('${CLIENTE}', ${lit(k)}, ${lit(JSON.stringify(v))}::jsonb);`);
  const ordem = ['romaneios', 'pastos', 'importacoes', 'animais', 'pesagens', 'sanitario', 'vendas', 'mortes', 'supl_fabrica', 'supl_cocho', 'atividades', 'financeiro'];
  const contagem = {};
  for (const t of ordem) {
    const ls = porTab[t] || []; contagem[t] = ls.length;
    for (let i = 0; i < ls.length; i += 400) {
      const lote = ls.slice(i, i + 400), cs = [...new Set(lote.flatMap(Object.keys))];
      out.push(`insert into public.${t} (${cs.join(', ')})\n  select ${cs.join(', ')} from json_populate_recordset(null::public.${t}, ${lit(JSON.stringify(lote))}::json);`);
    }
  }
  for (const o of valores) out.push(`update public.vendas_valor set valor = ${+o.campos.valor} where venda_id = '${o.id}';`);
  out.push('commit;');
  out.push('-- conferência: ' + JSON.stringify(contagem));
  fs.mkdirSync(path.dirname(SAIDA), { recursive: true });
  fs.writeFileSync(SAIDA, out.join('\n') + '\n');
  console.log('documentos', n, 'linhas', contagem, 'valores de venda', valores.length);
})();
