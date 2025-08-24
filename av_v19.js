/* ArmorVision Nutrition v1.9 — Patch add-on (non intrusif)
   Ajoute sans toucher à v1.5 :
   - Astuce du jour (centrée, thème-aware)
   - Notifications (minutes avant repas / heures fixes)
   - Magasins “sains” OSM + Comparateur panier + prix estimés/réels
*/
function $(s,r=document){return r.querySelector(s)};function $all(s,r=document){return Array.from(r.querySelectorAll(s))};
function todayISO(){return new Date().toISOString().slice(0,10)};
function ensureContainer(p,html,before=false){if(typeof p==='string')p=$(p);if(!p)return null;const f=document.createElement('div');f.innerHTML=html.trim();const el=f.firstElementChild; if(before&&p.firstElementChild)p.insertBefore(el,p.firstElementChild);else p.appendChild(el); return el;}
function haversine(a,b,c,d){const R=6371e3,t=v=>v*Math.PI/180,dl=t(c-a),dn=t(d-b);const A=Math.sin(dl/2)**2+Math.cos(t(a))*Math.cos(t(c))*Math.sin(dn/2)**2;return 2*R*Math.asin(Math.sqrt(A))}
function fmtDist(m){return m<1000?`${Math.round(m)} m`:`${(m/1000).toFixed(1)} km`}
async function geocodeCity(q){const u=`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`;const r=await fetch(u,{headers:{'Accept':'application/json'}});const j=await r.json();if(!j.length)throw new Error('Ville introuvable');return {lat:+j[0].lat,lon:+j[0].lon};}

/* ---- State ---- */
(function ensureState(){try{
  window.state=window.state||{};
  state.user=state.user||{};
  state.plan=state.plan||{meals:[]};
  state.planWeeks=state.planWeeks||[];
  state.shop=state.shop||{scope:'day',checked:{},stores:[],prices:{}};
  state.shop.priceEstimated=state.shop.priceEstimated||{};
  state.notify=state.notify||{enabled:false,mode:'relative',minutesBefore:45,times:['08:00','12:30','19:00'],timers:[]};
}catch(e){console.warn('[v1.9] state patch',e)}})();

/* ---- 1) Astuce du jour ---- */
const TIPS_AV=[
 "Bois 500 ml d’eau 30 minutes avant le repas.",
 "Protéines au petit-déj = appétit mieux contrôlé.",
 "Ajoute une portion de légumes à chaque repas.",
 "Prépare ta collation avant de sortir.",
 "10 minutes de marche post-repas améliorent la glycémie.",
 "Assaisonne avec épices/citron : goût ↑, calories ≈ 0.",
 "Féculents complets à midi, plus léger le soir.",
 "Vise 20–30 g de protéines par repas.",
 "12 h de jeûne nocturne quand possible.",
 "Surgelés nature = gain de temps sans perte de qualité."
];
function tipForToday(){const d=todayISO();let h=0;for(const ch of d)h=(h*31+ch.charCodeAt(0))%TIPS_AV.length;return TIPS_AV[h]}
function injectTip(){
  const dash=document.getElementById('dash')||$('section#dash')||$('main'); if(!dash||$('#tipCard'))return;
  const css=`.tip-wrap{display:flex;align-items:center;justify-content:center;margin:14px 0}
             .tip-card{max-width:720px;width:100%;border-radius:14px;padding:14px;border:1px solid var(--border,#263043);
             box-shadow:var(--shadow,0 4px 24px rgba(0,0,0,.25));text-align:center;background:var(--panel,#111623)}
             body.light .tip-card{color:#10131a} body:not(.light) .tip-card{color:#e9eef4}`;
  const st=document.createElement('style'); st.textContent=css; document.head.appendChild(st);
  ensureContainer(dash, `<div class="tip-wrap"><div class="tip-card" id="tipCard">
    <h3 style="margin:0 0 6px">💡 Astuce du jour</h3>
    <div id="tipText" class="muted">${tipForToday()}</div></div></div>`, true);
}

/* ---- 2) Notifications ---- */
function clearNotifyTimers(){(state.notify.timers||[]).forEach(id=>clearTimeout(id));state.notify.timers=[]}
function renderFixedTimes(){const b=$('#notifTimeList');if(!b)return;const arr=state.notify.times||[];b.innerHTML=arr.length?arr.map(t=>`<span class="chip">${t}<span class="x" style="margin-left:6px;opacity:.7;cursor:pointer" onclick="removeFixedTime('${t}')">✖</span></span>`).join(' '):'<span class="muted">Aucune heure définie.</span>'}
function initNotifUI(){
  const seg=$('#notifModeSeg'); if(seg){
    $all('.chip',seg).forEach(ch=>{
      ch.classList.toggle('active', ch.dataset.nmode===state.notify.mode);
      ch.onclick=()=>{ state.notify.mode=ch.dataset.nmode; window.save?.(); initNotifUI(); };
    });
  }
  const en=$('#notifEnable'); if(en){ en.checked=!!state.notify.enabled; en.onchange=()=>{ state.notify.enabled=en.checked; window.save?.(); scheduleAllNotifications(); }; }
  const min=$('#notifMinutes'); if(min){ min.value=state.notify.minutesBefore||45; min.oninput=()=>{ state.notify.minutesBefore=+min.value||45; window.save?.(); scheduleAllNotifications(); }; }
  const rel=$('#notifRelative'), fix=$('#notifFixed');
  if(rel&&fix){ if(state.notify.mode==='relative'){ rel.classList.remove('hidden'); fix.classList.add('hidden'); } else { rel.classList.add('hidden'); fix.classList.remove('hidden'); } }
  const addBtn=$('#notifAddBtn'); if(addBtn){ addBtn.onclick=addFixedTime; }
  renderFixedTimes();
}
function addFixedTime(){ const t=$('#notifTimeInput').value; if(!t) return; state.notify.times=Array.from(new Set([...(state.notify.times||[]),t])).sort(); window.save?.(); renderFixedTimes(); scheduleAllNotifications(); }
function removeFixedTime(t){ state.notify.times=(state.notify.times||[]).filter(x=>x!==t); window.save?.(); renderFixedTimes(); scheduleAllNotifications(); }
function scheduleAllNotifications(){
  clearNotifyTimers(); if(!state.notify.enabled || !('Notification' in window)) return;
  if(state.notify.mode==='fixed'){
    (state.notify.times||[]).forEach(t=>{
      const [hh,mm]=t.split(':').map(Number); const when=new Date(); when.setHours(hh,mm,0,0);
      let d=when-new Date(); if(d<0) d+=86400000;
      const id=setTimeout(()=>{ try{ new Notification('Rappel',{body:`Notification programmée (${t})`}); }catch(_){}
        scheduleAllNotifications(); }, d);
      state.notify.timers.push(id);
    });
    return;
  }
  const meals=(state.plan?.meals||[]); const now=new Date();
  meals.forEach(m=>{
    if(!m.time) return;
    const [hh,mm]=m.time.split(':').map(Number);
    const when=new Date(); when.setHours(hh,mm,0,0); when.setMinutes(when.getMinutes()-(state.notify.minutesBefore||45));
    const d=when-now; if(d>0){
      const id=setTimeout(()=>{ try{ new Notification('Prochain repas',{body:`${m.time} — ${m.name||'Repas'}`}); }catch(_){}
        scheduleAllNotifications(); }, d);
      state.notify.timers.push(id);
    }
  });
}
function injectNotifCard(){
  const settings=document.getElementById('settings')||$('section#settings'); if(!settings||$('#notifModeSeg')) return;
  ensureContainer(settings, `<div class="card" style="margin-top:12px">
    <h3>Notifications</h3>
    <div class="row" style="gap:10px;align-items:center;flex-wrap:wrap">
      <label class="row" style="gap:6px"><input id="notifEnable" type="checkbox"> Activer</label>
      <div class="seg" id="notifModeSeg">
        <span class="chip" data-nmode="relative">Avant repas</span>
        <span class="chip" data-nmode="fixed">Heures fixes</span>
      </div>
    </div>
    <div id="notifRelative" class="row" style="gap:8px;margin-top:8px">
      <label>Minutes avant</label>
      <input id="notifMinutes" type="number" min="0" max="180" value="45" style="max-width:120px">
      <span class="muted">Appliqué à chaque repas planifié.</span>
    </div>
    <div id="notifFixed" class="hidden" style="margin-top:8px">
      <div class="row" style="gap:8px">
        <input id="notifTimeInput" type="time" style="max-width:140px">
        <button class="btn small" type="button" id="notifAddBtn">Ajouter</button>
        <span class="muted">Ex : 08:00, 12:30, 19:00</span>
      </div>
      <div id="notifTimeList" class="chips" style="margin-top:8px"></div>
    </div>
    <p class="muted" style="margin-top:8px">Les prix “<b>estimé</b>” peuvent ne pas être à jour selon les magasins.</p>
  </div>`);
  initNotifUI(); scheduleAllNotifications();
}

/* ---- 3) Magasins sains + Comparateur + Prix ---- */
const BRAND_SOURCES={
  "carrefour":  {search:q=>`https://r.jina.ai/http://www.carrefour.fr/s?q=${encodeURIComponent(q)}`},
  "intermarché":{search:q=>`https://r.jina.ai/https://www.intermarche.com/recherche?q=${encodeURIComponent(q)}`},
  "leclerc":    {search:q=>`https://r.jina.ai/https://www.e.leclerc/recherche?q=${encodeURIComponent(q)}`},
  "auchan":     {search:q=>`https://r.jina.ai/https://www.auchan.fr/recherche?q=${encodeURIComponent(q)}`},
  "monoprix":   {search:q=>`https://r.jina.ai/https://www.monoprix.fr/courses/recherche?text=${encodeURIComponent(q)}`},
  "casino":     {search:q=>`https://r.jina.ai/https://www.casino.fr/recherche?q=${encodeURIComponent(q)}`},
  "lidl":       {search:q=>`https://r.jina.ai/https://www.lidl.fr/q/${encodeURIComponent(q)}`},
  "aldi":       {search:q=>`https://r.jina.ai/https://www.aldi.fr/recherche?q=${encodeURIComponent(q)}`}
};
function brandFromName(n){const low=(n||'').toLowerCase();return Object.keys(BRAND_SOURCES).find(b=>low.includes(b))||null}
function normalizeQuery(f){return (f||'').replace(/\(.*?\)/g,'').replace(/cuit|cru|naturel|boîte|égoutté|mélange/gi,'').trim()}

async function fetchPriceForFoodAtStore(food,storeName){
  const brand=brandFromName(storeName); if(!brand) return null;
  try{
    const url=BRAND_SOURCES[brand].search(normalizeQuery(food));
    const r=await fetch(url,{headers:{'Accept':'text/html'}}); const ht=await r.text();
    let m=ht.match(/(\d+[.,]\d{2})\s*€\s*\/\s*(?:kg|KG)/); if(m) return parseFloat(m[1].replace(',','.'))/1000;
    m=ht.match(/(\d+[.,]\d{2})\s*€(?!\s*\/)/);
    if(m){
      const perPack=parseFloat(m[1].replace(',','.'));
      const heur=/yaourt|skyr|fromage|cottage/i.test(food)?500:
                 /riz|pâte|semoule|quinoa|flocon/i.test(food)?1000:
                 /poulet|dinde|boeuf|steak|saumon|cabillaud|thon|tofu|tempeh|seitan|jambon|oeuf/i.test(food)?400:
                 /banane|pomme|poire|kiwi|fruits rouges/i.test(food)?500:
                 /brocoli|haricot|courgette|épinard|salade|chou|tomate|carotte|poivron/i.test(food)?500:1000;
      return perPack/heur; // €/g approx
    }
  }catch(e){}
  return null;
}

async function loadStores(lat,lon){
  state.user=state.user||{}; state.user.gps={lat,lon}; window.save?.();
  const radius=8000;
  // Inclus : grands et moyens circuits + convenience & magasins frais/bio
  const shopFilter = "^(supermarket|hypermarket|superstore|discount|convenience|greengrocer|butcher|seafood|health_food|organic|farm|dairy)$";
  const query=`[out:json][timeout:25];
  (
    node(around:${radius},${lat},${lon})[shop~"${shopFilter}"];
    way(around:${radius},${lat},${lon})[shop~"${shopFilter}"];
  );
  out center tags;`;
  const url="https://overpass-api.de/api/interpreter?data="+encodeURIComponent(query);

  let data; 
  try{ const r=await fetch(url); data=await r.json(); }
  catch(e){ const sb=$('#storeBox'); if(sb) sb.innerHTML='<span class="muted">Overpass API indisponible. Réessaie plus tard.</span>'; return; }

  const items=(data.elements||[]).map(el=>{
    const c= el.type==='node' ? {lat:el.lat,lon:el.lon} : (el.center||{});
    const name=(el.tags&&(el.tags.name||el.tags.brand||el.tags['addr:street']))||'Magasin';
    const brand=el.tags&&(el.tags.brand||el.tags.operator)||'';
    const dist=(c.lat&&c.lon)?haversine(lat,lon,c.lat,c.lon):Number.POSITIVE_INFINITY;
    const link=(c.lat&&c.lon)?`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}&query=${c.lat},${c.lon}`:null;
    return {name:(brand?brand+' ':'')+name, dist, link};
  }).filter(x=>x.dist<radius).sort((a,b)=>a.dist-b.dist).slice(0,40);

  state.shop=state.shop||{}; 
  state.shop.stores=items.map(it=>({name:it.name,dist:fmtDist(it.dist),link:it.link}));
  window.save?.();

  const sb=$('#storeBox');
  if(sb) sb.innerHTML = items.map(s=>`<div class="row" style="justify-content:space-between;gap:8px">
    <label class="row" style="gap:8px"><input type="checkbox" onchange="toggleStore('${s.name.replace(/'/g,"\\'")}',this.checked)"> ${s.name}</label>
    <span class="muted">${fmtDist(s.dist)} ${s.link? '• <a class="link" href="'+s.link+'" target="_blank">📍 Itinéraire</a>':''}</span>
  </div>`).join('');

  renderCompare();
}

function toggleStore(name,checked){ state.shop.prices=state.shop.prices||{}; state.shop.prices[name]=state.shop.prices[name]||{}; window.save?.(); renderCompare(); }
function setShopScope(sc){ state.shop.scope=sc; window.save?.(); renderCompare(); }

function getMealsForShopScope(){
  const s=state.shop?.scope||'day';
  if(s==='day') return state.plan?.meals||[];
  if(s==='week') return (state.planWeeks||[]).slice(0,7).flatMap(d=>d.meals||[]);
  if(s==='4w') return (state.planWeeks||[]).slice(0,28).flatMap(d=>d.meals||[]);
  return state.plan?.meals||[];
}

async function autoFillPrices(stores,foods){
  state.shop.prices=state.shop.prices||{};
  for(const sname of stores){
    state.shop.prices[sname]=state.shop.prices[sname]||{};
    for(const fd of foods){
      if(!state.shop.prices[sname][fd]){
        const p = await fetchPriceForFoodAtStore(fd,sname);
        if(p){ state.shop.prices[sname][fd]=p;
          state.shop.priceEstimated=state.shop.priceEstimated||{};
          state.shop.priceEstimated[sname]=state.shop.priceEstimated[sname]||{};
          state.shop.priceEstimated[sname][fd]=true;
        }
      }
    }
  }
  window.save?.();
}

function renderCompare(){
  const box=$('#compareBox'); if(!box) return;
  const stores=(state.shop.stores||[]).map(s=>s.name||s);
  if(!stores.length){ box.textContent='Active ou configure au moins un magasin (case + 💶).'; return; }
  const meals=getMealsForShopScope(); const list={}; meals.forEach(m=>m.items?.forEach(i=> list[i.food]=(list[i.food]||0)+i.grams ));
  const foods=Object.keys(list);
  autoFillPrices(stores,foods).then(()=>setTimeout(renderCompare,400));
  const rows = stores.map(s=>{
    const pm=state.shop.prices[s]||{}; let total=0,missing=false,est=false;
    foods.forEach(f=>{ const p=pm[f]; if(p){ total+=p*list[f]; if(state.shop.priceEstimated?.[s]?.[f]) est=true; } else missing=true; });
    return {store:s,total:Math.round(total*100)/100,missing,estimated:est};
  }).sort((a,b)=>a.total-b.total).slice(0,5);
  box.innerHTML = `<table class="table-compact"><tr><th>Magasin</th><th>Total €</th><th>Statut</th></tr>${
    rows.map(r=>`<tr><td>${r.store}</td><td style="text-align:right">${r.total.toFixed(2)}</td><td style="text-align:right" class="muted">${r.missing?'incomplet':(r.estimated?'estimé':'réel')}</td></tr>`).join('')
  }</table><p class="muted">“Estimé” = extraction publique, peut ne pas être à jour selon les magasins.</p>`;
}

/* ---- 4) UI injection page Courses ---- */
function ensurePriceModal(){
  if ($('#priceModal')) return;
  const shop=document.getElementById('shop')||$('section#shop')||$('main');
  ensureContainer(shop, `<div class="modal" id="priceModal" style="display:none">
    <div class="backdrop" onclick="closeModal && closeModal('priceModal')"></div>
    <div class="sheet">
      <div class="close-x" onclick="closeModal && closeModal('priceModal')">✖</div>
      <h3>💶 Configurer les prix par magasin</h3>
      <p class="muted" style="margin:6px 0">Saisis les prix <b>€/kg</b> (ou €/L). Les totaux utiliseront ces valeurs en priorité.</p>
      <div id="priceEditorBox" style="max-height:60vh;overflow:auto"></div>
      <div class="row" style="gap:8px;margin-top:10px">
        <button class="btn small primary" id="priceSaveBtn">Enregistrer</button>
        <button class="btn small" onclick="closeModal && closeModal('priceModal')">Fermer</button>
      </div>
    </div>
  </div>`);
  $('#priceSaveBtn')?.addEventListener('click', savePriceEditor);
}
function openPriceEditor(){
  ensurePriceModal();
  const stores=(state.shop.stores||[]).map(s=>s.name||s);
  if(!stores.length){ alert('Active d’abord des magasins à proximité.'); return; }
  const meals=getMealsForShopScope(); const need={}; meals.forEach(m=>m.items?.forEach(i=>need[i.food]=true));
  const foods=Object.keys(need);
  const box=$('#priceEditorBox');
  let html='<table class="table-compact"><tr><th>Aliment</th>'+stores.map(s=>`<th style="text-align:right">${s}</th>`).join('')+'</tr>';
  foods.forEach(fd=>{
    html+='<tr><td>'+fd+'</td>';
    stores.forEach(s=>{
      const v=((state.shop.prices?.[s]||{})[fd]||null);
      html+=`<td style="text-align:right"><input type="number" step="0.01" placeholder="€/kg" data-store="${s}" data-food="${fd}" value="${v? (v*1000).toFixed(2):''}" style="max-width:110px"></td>`;
    });
    html+='</tr>';
  });
  html+='</table>';
  if(box) box.innerHTML=html;
  if (window.openModal) openModal('priceModal'); else $('#priceModal').style.display='none';
}
function savePriceEditor(){
  $all('#priceEditorBox input[type=number]').forEach(inp=>{
    const s=inp.dataset.store,f=inp.dataset.food,v=parseFloat(inp.value);
    state.shop.prices[s]=state.shop.prices[s]||{};
    if(!isNaN(v) && v>0){ state.shop.prices[s][f]=v/1000; if(state.shop.priceEstimated?.[s]) delete state.shop.priceEstimated[s][f]; }
    else { delete state.shop.prices[s][f]; }
  });
  window.save?.();
  if (window.closeModal) closeModal('priceModal'); else $('#priceModal').style.display='none';
  renderCompare();
}

/* ---- 5) Boutons & boot ---- */
function injectShopUI(){
  const shop=document.getElementById('shop')||$('section#shop')||$('main'); if(!shop) return;

  if (!$('#cityInput')) {
    ensureContainer(shop, `<div class="card">
      <div class="row" style="flex-wrap:wrap;gap:8px">
        <input id="cityInput" class="input" placeholder="Ville / Code postal" style="max-width:200px">
        <button class="btn small" id="btnRefresh">↻</button>
        <button class="btn small" id="btnGPS">📍</button>
        <div class="seg">
          <span class="chip" onclick="setShopScope('day')">Jour</span>
          <span class="chip" onclick="setShopScope('week')">Semaine</span>
          <span class="chip" onclick="setShopScope('4w')">4 semaines</span>
        </div>
      </div>
    </div>`, true);
  }
  if (!$('#storeBox')) ensureContainer(shop, `<div class="card"><h3>Magasins à proximité</h3><div class="row" style="gap:8px;margin:6px 0"><button class="btn small" type="button" onclick="openPriceEditor()">💶 Configurer prix</button></div><div id="storeBox" class="muted">Clique “📍” ou saisis ta ville puis ↻.</div></div>`);
  if (!$('#compareBox')) ensureContainer(shop, `<div class="card"><h3>Comparateur</h3><div id="compareBox" class="muted">—</div></div>`);

  $('#btnGPS')?.addEventListener('click', ()=>{
    if(!navigator.geolocation){ alert('Géolocalisation non supportée.'); return; }
    navigator.geolocation.getCurrentPosition(pos=> loadStores(pos.coords.latitude, pos.coords.longitude), _=>alert('Impossible d’obtenir la position.'));
  });
  $('#btnRefresh')?.addEventListener('click', refreshStores);

  // Expose global (pour onclick inline existants)
  window.setShopScope = setShopScope;
  window.openPriceEditor = openPriceEditor;
  window.savePriceEditor = savePriceEditor;
  window.refreshStores = refreshStores;

  if(state.user?.city){ setTimeout(()=>refreshStores(),200); }
}
async function refreshStores(){
  const city=($('#cityInput')?.value)||state.user?.city;
  if(city){
    state.user.city=city; window.save?.();
    try{ const p=await geocodeCity(city); await loadStores(p.lat,p.lon); }
    catch(e){ alert('Ville introuvable.'); }
  } else if(state.user?.gps){
    await loadStores(state.user.gps.lat,state.user.gps.lon);
  } else {
    const sb=$('#storeBox'); if(sb) sb.innerHTML='<span class="muted">Indique une ville/CP ou utilise 📍.</span>';
  }
   }
