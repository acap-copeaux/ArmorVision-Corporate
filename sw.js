// Armor Vision Nutrition — Service Worker (compatible v1.9)
const CACHE = 'av-nutri-v1.9';
self.addEventListener('install', (e)=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['./','./index.html','./av_v19.js','./manifest.json']).catch(()=>{})));
  self.skipWaiting();
});
self.addEventListener('activate', (e)=>{ e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', (e)=>{
  e.respondWith(
    caches.match(e.request).then(r=> r || fetch(e.request).then(res=>{
      const copy = res.clone();
      caches.open(CACHE).then(c=>{ c.put(e.request, copy).catch(()=>{}); });
      return res;
    }).catch(()=>r))
  );
});
