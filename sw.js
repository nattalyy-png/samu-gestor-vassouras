// Service worker simples: permite instalar o app e abrir a tela mesmo sem internet.
// Os dados ficam no cache do Firebase (registros feitos sem sinal são enviados quando a internet volta).
const CACHE = 'samu-gestor-v6';
const ARQUIVOS = ['./', 'index.html', 'style.css', 'app.js', 'escala-parser.js', 'firebase-config.js', 'logo-completa.png', 'logo-simbolo.png', 'icone-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Rede primeiro (para receber atualizações), cache se estiver sem internet.
  e.respondWith(fetch(e.request.url, { cache: 'no-cache' }).then(r => { const c = r.clone(); caches.open(CACHE).then(k => k.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
});
