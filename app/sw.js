// Guarda o app no aparelho para abrir sem internet.
// Os dados NÃO passam por aqui: ficam cifrados no banco local do app.
importScripts('js/versao.js');
const CACHE = 'ism-pecuaria-' + self.ISM_VERSAO;
const ARQUIVOS = ['./', 'index.html', 'manifest.webmanifest', 'modelo-importacao.xlsx',
  'js/config.js', 'js/versao.js', 'js/cofre.js', 'js/nuvem.js', 'js/sinc.js', 'js/ponte.js', 'js/ism.js', 'js/entrada.js', 'js/telas.js', 'js/edicao.js',
  'img/ism-branco.png', 'img/ism.png', 'icons/icone-192.png', 'icons/icone-512.png'];
const EXTERNOS = ['https://cdnjs.cloudflare.com/', 'https://fonts.googleapis.com/', 'https://fonts.gstatic.com/'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('ism-pecuaria-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (u.origin === location.origin) {
    // arquivos do app: rede primeiro (pega versão nova), cópia guardada quando sem internet
    e.respondWith(fetch(e.request).then(r => {
      if (r.ok) { const c = r.clone(); caches.open(CACHE).then(k => k.put(e.request, c)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
    return;
  }
  if (EXTERNOS.some(p => e.request.url.startsWith(p))) {
    // bibliotecas e fontes: cópia guardada primeiro
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => {
      const c = res.clone(); caches.open(CACHE).then(k => k.put(e.request, c)); return res;
    })));
  }
  // chamadas ao Supabase passam direto (nunca ficam no cache)
});
