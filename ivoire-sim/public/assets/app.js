'use strict';

let csrf = '';
let me = null;
let currentTab = 'jobs';
const $ = (s, r = document) => r.querySelector(s);
const fcfa = n => Number(n).toLocaleString('fr-FR') + ' FCFA';
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function api(action, data = null) {
  const opts = { headers: { 'X-CSRF-Token': csrf } };
  if (data !== null) {
    opts.method = 'POST';
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(data);
  }
  const res = await fetch('api.php?action=' + action, opts);
  const json = await res.json().catch(() => ({ ok: false, error: 'Réponse invalide du serveur.' }));
  if (json.csrf) csrf = json.csrf;
  return json;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2600);
}

function show(screen) {
  ['auth', 'city', 'game'].forEach(s => $('#screen-' + s).hidden = s !== screen);
}

/* ---------- Authentification ---------- */
let registerMode = false;
$('#auth-toggle').onclick = () => {
  registerMode = !registerMode;
  $('#auth-title').textContent = registerMode ? 'Créer un compte' : 'Connexion';
  $('#auth-submit').textContent = registerMode ? "S'inscrire" : 'Se connecter';
  $('#auth-toggle').textContent = registerMode ? 'J\'ai déjà un compte' : 'Créer un compte';
  $('[name=username]').hidden = $('[name=email]').hidden = !registerMode;
  $('[name=login]').hidden = registerMode;
  $('[name=login]').required = !registerMode;
  $('[name=username]').required = $('[name=email]').required = registerMode;
};

$('#auth-form').onsubmit = async e => {
  e.preventDefault();
  const f = new FormData(e.target);
  const body = registerMode
    ? { username: f.get('username'), email: f.get('email'), password: f.get('password') }
    : { login: f.get('login'), password: f.get('password') };
  const r = await api(registerMode ? 'register' : 'login', body);
  if (!r.ok) { $('#auth-error').textContent = r.error; return; }
  $('#auth-error').textContent = '';
  e.target.reset();
  await enterGame();
};

document.querySelectorAll('[data-logout]').forEach(b => b.onclick = async () => {
  await api('logout', {});
  csrf = (await api('csrf')).csrf;
  show('auth');
});

/* ---------- Choix de la ville ---------- */
let cities = [];
let selectedCityId = null;
let cityScene = null;

function createCityScene() {
  const canvas = $('#city-canvas');
  if (!window.THREE) {
    $('#city-scene-error').hidden = false;
    $('#city-scene-error').textContent = 'La bibliothèque 3D ne s’est pas chargée. Tu peux toujours choisir une ville ci-dessous.';
    return;
  }

  const THREE = window.THREE;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (error) {
    console.error('Impossible de créer la scène Three.js.', error);
    $('#city-scene-error').hidden = false;
    $('#city-scene-error').textContent = 'La 3D n’est pas disponible sur cet appareil. Tu peux toujours choisir une ville ci-dessous.';
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x172c4e, 0);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x536d86, 18, 42);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(12, 11, 16);
  camera.lookAt(0, 1, 0);

  scene.add(new THREE.HemisphereLight(0xc8e4ff, 0x253448, 2));
  const sunlight = new THREE.DirectionalLight(0xffe0ad, 2.2);
  sunlight.position.set(-8, 14, 8);
  scene.add(sunlight);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(42, 42),
    new THREE.MeshStandardMaterial({ color: 0x3c594e, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.08;
  scene.add(ground);

  const roadMaterial = new THREE.MeshStandardMaterial({ color: 0x25313c, roughness: 1 });
  const road = new THREE.Mesh(new THREE.PlaneGeometry(42, 2.8), roadMaterial);
  road.rotation.x = -Math.PI / 2;
  road.position.y = -0.03;
  scene.add(road);
  const crossRoad = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 42), roadMaterial);
  crossRoad.rotation.x = -Math.PI / 2;
  crossRoad.position.y = -0.025;
  scene.add(crossRoad);

  const blocks = new THREE.Group();
  scene.add(blocks);
  let animationFrame = 0;

  function setCity(city) {
    if (!city) return;
    $('#city-scene-name').textContent = city.name;
    $('#city-scene-tagline').textContent = city.tagline;
    document.querySelectorAll('.city-card').forEach(card => {
      card.setAttribute('aria-pressed', String(Number(card.dataset.id) === Number(city.id)));
    });
    blocks.children.forEach(object => {
      object.geometry.dispose();
      if (Array.isArray(object.material)) object.material.forEach(material => material.dispose());
      else object.material.dispose();
    });
    blocks.clear();

    const profiles = {
      Plateau: { color: 0x91b9d8, min: 5, max: 12, count: 18 },
      Cocody: { color: 0xc5b596, min: 1.5, max: 4.5, count: 12 },
      Yopougon: { color: 0xe58b55, min: 1.5, max: 4, count: 20 },
      Marcory: { color: 0xd9a96e, min: 2, max: 6, count: 16 },
      Adjamé: { color: 0xd47b46, min: 1.5, max: 4, count: 22 },
      Abidjan: { color: 0x92afbd, min: 3, max: 9, count: 18 }
    };
    const profile = profiles[city.name] || profiles.Abidjan;
    let seed = Number(city.id) * 7919;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    const columns = [-7, -4.5, 4.5, 7];
    const rows = [-7, -4, 4, 7];
    for (let i = 0; i < profile.count; i += 1) {
      const x = columns[i % columns.length] + (random() - 0.5) * 0.65;
      const z = rows[Math.floor(i / columns.length) % rows.length] + (random() - 0.5) * 0.65;
      const height = profile.min + random() * (profile.max - profile.min);
      const width = 1.35 + random() * 0.8;
      const depth = 1.35 + random() * 0.8;
      const building = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        new THREE.MeshStandardMaterial({
          color: profile.color,
          roughness: 0.8,
          emissive: 0x09101a,
          emissiveIntensity: 0.12
        })
      );
      building.position.set(x, height / 2, z);
      blocks.add(building);

      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(width + 0.08, 0.16, depth + 0.08),
        new THREE.MeshStandardMaterial({ color: 0xe2b77b, roughness: 0.9 })
      );
      roof.position.set(x, height + 0.08, z);
      blocks.add(roof);
    }
  }

  const resize = () => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  const animate = () => {
    if ($('#screen-city').hidden) {
      animationFrame = 0;
      return;
    }
    animationFrame = requestAnimationFrame(animate);
    blocks.rotation.y = Math.sin(Date.now() * 0.00012) * 0.035;
    renderer.render(scene, camera);
  };
  cityScene = { setCity, resize };
  cityScene.start = () => {
    if (!animationFrame) animationFrame = requestAnimationFrame(animate);
  };
  window.addEventListener('resize', resize);
}

function selectCity(cityId) {
  selectedCityId = Number(cityId);
  const city = cities.find(item => Number(item.id) === selectedCityId);
  if (!city) return;
  cityScene?.setCity(city);
  $('#city-enter').disabled = false;
  $('#city-enter').textContent = `Entrer à ${city.name}`;
}

async function showCities() {
  const r = await api('cities');
  if (!r.ok) return toast(r.error || 'Impossible de charger les villes.');
  cities = r.cities;
  $('#city-grid').innerHTML = cities.map(c => `
    <button class="tile city city-card" type="button" data-id="${c.id}" aria-pressed="false">
      <h4>${esc(c.name)}</h4><small class="muted">${esc(c.tagline)}</small>
      <p>${esc(c.description)}</p>
      <span class="muted">Afficher dans l’aperçu 3D</span>
    </button>`).join('');
  document.querySelectorAll('.city-card').forEach(card => {
    card.onclick = () => selectCity(card.dataset.id);
  });
  if (!cityScene) createCityScene();
  selectCity(cities[0]?.id);
  $('#city-enter').onclick = async () => {
    if (selectedCityId === null) return;
    $('#city-enter').disabled = true;
    const x = await api('choose_city', { city_id: selectedCityId });
    if (!x.ok) {
      $('#city-enter').disabled = false;
      return toast(x.error);
    }
    await enterGame();
  };
  show('city');
  cityScene?.resize();
  cityScene?.start();
}

/* ---------- Jeu ---------- */
async function refreshMe() {
  const r = await api('me');
  if (!r.ok) return false;
  me = r;
  const p = r.player;
  $('#hud-name').textContent = p.username;
  $('#hud-level').textContent = p.level;
  $('#hud-city').textContent = r.city ? r.city.name : '—';
  $('#hud-cash').textContent = fcfa(p.cash);
  $('#hud-bank').textContent = fcfa(p.bank);
  ['health', 'hunger', 'thirst', 'energy'].forEach(k => $('#b-' + k).textContent = p[k] + '%');
  return true;
}

async function enterGame() {
  if (!(await refreshMe())) return show('auth');
  if (!me.city) return showCities();
  show('game');
  renderTab(currentTab);
}

document.querySelectorAll('[data-act]').forEach(b => b.onclick = async () => {
  const r = await api(b.dataset.act, {});
  toast(r.ok ? 'OK !' : r.error);
  refreshMe();
});

document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => {
  document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('active', x === b));
  currentTab = b.dataset.tab;
  renderTab(currentTab);
});

async function act(action, data, okMsg) {
  const r = await api(action, data);
  toast(r.ok ? okMsg : r.error);
  await refreshMe();
  renderTab(currentTab);
}
window.act = act;

async function renderTab(tab) {
  const box = $('#tab-content');
  box.innerHTML = '…';

  if (tab === 'jobs') {
    const r = await api('jobs');
    box.innerHTML = `
      <p>${me.job ? `Emploi actuel : <strong>${esc(me.job.title)}</strong> (${fcfa(me.job.daily_pay)} / service)
        <button class="btn primary small" onclick="act('work',{},'Service terminé, salaire reçu !')">Travailler</button>`
        : 'Tu n\'as pas encore d\'emploi.'}</p>` +
      r.jobs.map(j => `<div class="row">
        <div><strong>${esc(j.title)}</strong><br><small class="muted">${fcfa(j.daily_pay)} · niveau ${j.min_level}${j.needs_vehicle !== 'aucun' ? ' · véhicule : ' + esc(j.needs_vehicle) : ''}</small></div>
        <button class="btn small" onclick="act('apply_job',{job_id:${j.id}},'Embauché !')">Postuler</button></div>`).join('');
  }

  if (tab === 'properties') {
    const [all, mine] = await Promise.all([api('properties'), api('my_properties')]);
    box.innerHTML = `<h3>Mes propriétés (${mine.properties.length})</h3>` +
      (mine.properties.map(p => `<div class="row"><span>🏠 ${esc(p.name)}<br><small class="muted">${esc(p.city_name)}</small></span>
        <a class="btn small" href="house.html?property_id=${Number(p.id)}">🛋️ Aménager</a></div>`).join('') || '<p class="muted">Aucune.</p>') +
      `<h3>À vendre</h3><div class="grid">` +
      all.properties.filter(p => !Number(p.sold)).map(p => `<div class="tile">
        <h4>${esc(p.name)}</h4><small class="muted">${esc(p.type)} · ${p.rooms} pièces</small>
        <span class="price">${fcfa(p.price)}</span>
        <button class="btn small" onclick="act('buy_property',{property_id:${p.id}},'Propriété achetée !')">Acheter</button></div>`).join('') + '</div>';
  }

  if (tab === 'furniture') {
    const r = await api('furniture');
    if (!r.ok) {
      box.innerHTML = `<p class="error">${esc(r.error || 'Impossible de charger les meubles.')}</p>`;
      return;
    }
    const categories = {
      salon: '🛋️ Salon', chambre: '🛏️ Chambre', cuisine: '🍳 Cuisine',
      salle_de_bain: '🛁 Salle de bain', decoration: '🪴 Décoration',
      eclairage: '💡 Éclairage', portes_fenetres: '🚪 Portes et fenêtres',
    };
    const grouped = r.furniture.reduce((groups, item) => {
      if (!groups[item.category]) groups[item.category] = [];
      groups[item.category].push(item);
      return groups;
    }, {});
    box.innerHTML = `<h3>Mes meubles</h3><p>Achète des meubles ici, puis ouvre une propriété pour les placer et les déplacer.</p>
      <a class="btn small" href="house.html">🛋️ Aménager une maison</a>
      <h3>Boutique de meubles</h3>` + Object.entries(grouped).map(([category, items]) =>
        `<h4>${esc(categories[category] || category)}</h4><div class="grid">${items.map(item => `<div class="tile">
          <h4>${esc(item.name)}</h4><small class="muted">${Number(item.owned)} en inventaire</small>
          <span class="price">${fcfa(item.price)}</span>
          <button class="btn small" onclick="act('buy_furniture',{furniture_id:${Number(item.id)},quantity:1},'Meuble acheté !')">Acheter</button>
        </div>`).join('')}</div>`).join('');
  }

  if (tab === 'vehicles') {
    const [all, garage] = await Promise.all([api('vehicles'), api('garage')]);
    box.innerHTML = `<h3>Mon garage (${garage.vehicles.length})</h3>` +
      (garage.vehicles.map(v => `<div class="row"><span>🚗 ${esc(v.name)} — ${esc(v.plate)}</span><small class="muted">⛽ ${v.fuel}%</small></div>`).join('') || '<p class="muted">Vide.</p>') +
      `<h3>Concessionnaire</h3><div class="grid">` +
      all.vehicles.map(v => `<div class="tile">
        <h4>${esc(v.name)}</h4><small class="muted">${esc(v.type)} · ${v.max_speed} km/h</small>
        <span class="price">${fcfa(v.price)}</span>
        <button class="btn small" onclick="act('buy_vehicle',{vehicle_id:${v.id}},'Véhicule acheté !')">Acheter</button></div>`).join('') + '</div>';
  }

  if (tab === 'bank') {
    const r = await api('transactions');
    box.innerHTML = `
      <div class="form-inline"><input id="amt" type="number" min="1" placeholder="Montant en FCFA">
        <button class="btn" onclick="act('deposit',{amount:+$('#amt').value},'Dépôt effectué')">Déposer</button>
        <button class="btn" onclick="act('withdraw',{amount:+$('#amt').value},'Retrait effectué')">Retirer</button></div>
      <div class="form-inline"><input id="dest" placeholder="Pseudo du destinataire">
        <button class="btn primary" onclick="act('transfer',{to:$('#dest').value,amount:+$('#amt').value},'Virement envoyé')">Virer</button></div>
      <h3>Dernières opérations</h3>` +
      r.transactions.map(t => `<div class="row"><span>${esc(t.label)}<br><small class="muted">${esc(t.created_at)}</small></span>
        <strong class="${t.amount >= 0 ? 'pos' : 'neg'}">${t.amount >= 0 ? '+' : ''}${fcfa(t.amount)}</strong></div>`).join('');
  }

  if (tab === 'players') {
    const r = await api('online');
    box.innerHTML = `<h3>Joueurs connectés à ${esc(me.city.name)}</h3>` +
      (r.players.map(p => `<div class="row"><span>👤 ${esc(p.username)}</span><small class="muted">Niv. ${p.level}</small></div>`).join('') || '<p class="muted">Personne d\'autre pour le moment.</p>');
  }

  if (tab === 'city') { showCities(); }
}

/* ---------- Démarrage ---------- */
(async () => {
  const r = await api('csrf');
  if (r.logged) enterGame(); else show('auth');
})();
