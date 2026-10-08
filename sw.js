/* Spiegamelo – service worker
   Strategia: l'app (shell) viene servita subito dalla cache, così funziona anche offline.
   In parallelo controlla in rete se c'è una versione nuova: se sì aggiorna la cache e
   avvisa la pagina, che mostra "È disponibile una nuova versione · Aggiorna".
   Ad ogni rilascio che cambia l'elenco dei file, aumentare VERSION. */
const VERSION = 'spiegamelo-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './privacy.html', './esempio-guida-videochiamata.html',
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-192.png', './icons/maskable-512.png', './icons/apple-touch-icon.png', './icons/favicon-32.png'];
const scope = new URL(self.registration.scope);
const keyOf = url => { const u = new URL(url); u.search = ''; u.hash = ''; if (u.pathname.endsWith('/')) u.pathname += 'index.html'; return u.href; };

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(SHELL.map(p => fetch(new Request(new URL(p, scope), { cache: 'reload' })).then(r => { if (r.ok) return c.put(keyOf(r.url || new URL(p, scope).href), r); })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('spiegamelo-') && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Avvisa la pagina appena aperta (resultingClientId) e le altre finestre già aperte.
async function notify(id) {
  const msg = { type: 'spiegamelo-updated' };
  (await self.clients.matchAll({ type: 'window' })).forEach(c => c.postMessage(msg));
  for (let i = 0; id && i < 20; i++) { const c = await self.clients.get(id); if (c) { c.postMessage(msg); return; } await new Promise(r => setTimeout(r, 250)); }
}
self.addEventListener('fetch', e => {
  const req = e.request; const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  const key = keyOf(req.url);
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const cached = await cache.match(key);
    const old = cached && /\.html$/.test(key) ? cached.clone() : null; // copia per il confronto (il corpo di "cached" va alla pagina)
    // Nota: una richiesta di navigazione non può essere riusata con opzioni, quindi si usa l'URL.
    const refresh = fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then(async res => {
      if (res && res.ok && res.type === 'basic') {
        if (old) {
          const [a, b] = await Promise.all([old.text(), res.clone().text()]);
          await cache.put(key, res.clone());
          if (a !== b && key.endsWith('/index.html')) await notify(e.resultingClientId || e.clientId);
        } else await cache.put(key, res.clone());
      }
      return res;
    }).catch(() => null);
    if (cached) { e.waitUntil(refresh); return cached; }
    const res = await refresh;
    if (res) return res;
    if (req.mode === 'navigate') { const shell = await cache.match(keyOf(scope.href)); if (shell) return shell; }
    return Response.error();
  })());
});
