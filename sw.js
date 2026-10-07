// Service worker do SITE (PWA). Não roda dentro do app nativo: o index.html
// só registra quando o hostname não é localhost, e o Capacitor sempre serve
// de localhost. Um service worker dentro do app nativo só serviria para
// entregar assets velhos por cima dos que já vêm empacotados.
//
// ESTRATÉGIA: REDE PRIMEIRO, cache como reserva.
// É deliberado. "Cache primeiro" seria mais rápido, mas deixaria aluno preso
// numa versão antiga do JS - inclusive depois de uma correção de segurança.
// Aqui, com internet, todo mundo recebe sempre o código mais novo; o cache
// só entra em ação quando a rede falha.

const CACHE = 'nuts-v1';

// Mínimo para a tela abrir offline.
const ESSENCIAIS = ['./', './index.html', './style.css', './app.js'];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE)
            // Um arquivo que falhe não pode abortar a instalação inteira.
            .then((cache) => Promise.allSettled(ESSENCIAIS.map((u) => cache.add(u))))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((nomes) => Promise.all(
                nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;

    if (req.method !== 'GET') return;

    // Deixa passar sem tocar tudo que não é do próprio site: Firebase,
    // Google Fonts, Font Awesome e o proxy de imagens da Cloudflare.
    // Interceptar terceiros aqui só traria problema.
    let origem;
    try {
        origem = new URL(req.url).origin;
    } catch (e) {
        return;
    }
    if (origem !== self.location.origin) return;

    event.respondWith(
        fetch(req)
            .then((res) => {
                if (res && res.ok && res.type === 'basic') {
                    const copia = res.clone();
                    caches.open(CACHE).then((cache) => cache.put(req, copia));
                }
                return res;
            })
            .catch(() => caches.match(req).then((cacheado) => {
                if (cacheado) return cacheado;
                // Navegação sem rede e sem cache da rota: cai na tela inicial.
                if (req.mode === 'navigate') return caches.match('./index.html');
                return Response.error();
            }))
    );
});
