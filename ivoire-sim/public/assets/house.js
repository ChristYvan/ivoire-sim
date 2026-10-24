import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mobile = matchMedia('(max-width: 800px)').matches;

const WALL_H = 2.8;       // hauteur des murs (m)
const MODEL_SCALE = 0.5;  // les modèles du pack sont ~2x trop grands : 0,5 donne des tailles réelles
const SNAP = 0.1;         // aimantation des positions (m)
const CATS = {
  salon: '🛋️ Salon', chambre: '🛏️ Chambre', cuisine: '🍳 Cuisine', salle_de_bain: '🛁 Salle de bain',
  decoration: '🪴 Déco', eclairage: '💡 Éclairage', portes_fenetres: '🚪 Portes & fenêtres',
};

/* ---------- API ---------- */
let csrf = '';
async function getJSON(action, qs = '') {
  try {
    const response = await fetch('api.php?action=' + encodeURIComponent(action) + qs);
    const result = await response.json();
    return response.ok ? result : { ok: false, error: result.error || 'La requête a échoué.' };
  } catch (error) {
    console.error(`La requête ${action} a échoué.`, error);
    return { ok: false, error: 'Impossible de contacter le serveur.' };
  }
}
async function postJSON(action, data, retry = true) {
  try {
    if (!csrf) {
      const token = await getJSON('csrf');
      if (!token.ok || !token.csrf) return { ok: false, error: 'Session expirée. Recharge la page et reconnecte-toi.' };
      csrf = token.csrf;
    }
    const res = await fetch('api.php?action=' + action, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify(data),
    });
    if (res.status === 419 && retry) { csrf = ''; return postJSON(action, data, false); }
    const result = await res.json();
    return res.ok ? result : { ok: false, error: result.error || 'La requête a échoué.' };
  } catch (error) {
    console.error(`La requête ${action} a échoué.`, error);
    return { ok: false, error: 'Impossible de contacter le serveur.' };
  }
}
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.id); toast.id = setTimeout(() => t.classList.remove('show'), 2500);
}

/* ---------- Rendu ---------- */
const canvas = $('#c');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile });
} catch (error) {
  console.error('WebGL indisponible dans l’éditeur de maison ; activation de la vue 2D.', error);
  import('./house2d-fallback.js')
    .then(({ startHouseFallback }) => startHouseFallback(canvas))
    .catch(fallbackError => {
      console.error('Impossible de lancer la vue 2D de la maison.', fallbackError);
      $('#msg').textContent = 'La maison ne peut pas être affichée dans ce navigateur.';
      $('#msg').hidden = false;
    });
}
if (renderer) {
renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2));
renderer.shadowMap.enabled = !mobile;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a2438);
scene.add(new THREE.HemisphereLight(0xfff4e0, 0x6b5a48, 1.5));
const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
sun.position.set(5, 9, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0005;
scene.add(sun);

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = 1.5;
controls.minDistance = 3;
controls.maxDistance = 35;

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

/* ---------- Pièce ---------- */
let roomGroup = null;
let room = { w: 10, d: 8 };

function floorTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const tones = ['#b98f5f', '#c19667', '#b08657', '#bd9262'];
  for (let i = 0; i < 8; i++) {
    g.fillStyle = tones[i % 4];
    g.fillRect(0, i * 32, 256, 32);
    g.fillStyle = '#00000022';
    g.fillRect(0, i * 32, 256, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildRoom(r) {
  if (roomGroup) scene.remove(roomGroup);
  room = r;
  roomGroup = new THREE.Group();

  const tex = floorTexture();
  tex.repeat.set(r.w / 2, r.d / 2);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(r.w, r.d), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  roomGroup.add(floor);

  // Murs à une seule face (tournée vers l'intérieur) : ceux entre la caméra et la pièce disparaissent tout seuls.
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xf0e6d2, roughness: 0.95 });
  const wall = (w, x, z, ry) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, WALL_H), wallMat);
    m.position.set(x, WALL_H / 2, z);
    m.rotation.y = ry;
    m.receiveShadow = true;
    roomGroup.add(m);
  };
  wall(r.w, 0, -r.d / 2, 0);
  wall(r.w, 0, r.d / 2, Math.PI);
  wall(r.d, -r.w / 2, 0, Math.PI / 2);
  wall(r.d, r.w / 2, 0, -Math.PI / 2);

  // Plinthe
  const base = new THREE.MeshStandardMaterial({ color: 0xd9ccb2 });
  [[r.w, 0.12, 0.04, 0, -r.d / 2 + 0.02], [r.w, 0.12, 0.04, 0, r.d / 2 - 0.02], [0.04, 0.12, r.d, -r.w / 2 + 0.02, 0], [0.04, 0.12, r.d, r.w / 2 - 0.02, 0]]
    .forEach(([w, h, d, x, z]) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), base); m.position.set(x, h / 2, z); roomGroup.add(m); });

  scene.add(roomGroup);

  const m = Math.max(r.w, r.d);
  Object.assign(sun.shadow.camera, { left: -m, right: m, top: m, bottom: -m, near: 1, far: 40 });
  sun.shadow.camera.updateProjectionMatrix();
  camera.position.set(r.w * 0.75, 6 + m * 0.35, r.d * 1.1);
  controls.target.set(0, 0.6, 0);
  controls.maxDistance = m * 3;
  controls.update();
  $('#room-info').textContent = `Pièce ${r.w} × ${r.d} m`;
}

/* ---------- Meubles ---------- */
const loader = new GLTFLoader();
const modelCache = new Map();
const loadModel = file => {
  if (!modelCache.has(file)) modelCache.set(file, loader.loadAsync('models/furniture/' + file));
  return modelCache.get(file);
};
const items = new Map();   // id → groupe 3D
let selected = null;
let helper = null;

function elevation(slug, minY) {
  if (slug.startsWith('light_') && minY < -0.02) return WALL_H;   // suspendu au plafond
  if (/^bathroom_(mirror|towel)/.test(slug)) return 1.5;           // accroché au mur
  if (/^window_/.test(slug)) return 1.0;
  return -minY;                                                    // posé au sol
}

async function makeItem(d) {
  const gltf = await loadModel(d.model_file);
  const o = gltf.scene.clone(true);
  o.scale.setScalar(MODEL_SCALE);
  o.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(o);
  const c = bb.getCenter(new THREE.Vector3());
  o.position.x -= c.x;
  o.position.z -= c.z;
  o.position.y = elevation(d.slug, bb.min.y);
  const g = new THREE.Group();
  g.add(o);
  g.userData = { id: Number(d.id), name: d.name, slug: d.slug };
  g.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  g.position.set(Number(d.x), 0, Number(d.z));
  g.rotation.y = Number(d.rot);
  scene.add(g);
  items.set(g.userData.id, g);
  return g;
}

function clearItems() {
  select(null);
  items.forEach(g => scene.remove(g));
  items.clear();
}

function select(g) {
  selected = g;
  if (helper) { scene.remove(helper); helper = null; }
  $('#tools').hidden = !g;
  if (g) {
    helper = new THREE.BoxHelper(g, 0xff7a00);
    scene.add(helper);
    $('#sel-name').textContent = g.userData.name;
  }
}

/* ---------- Déplacement à la souris / au doigt ---------- */
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hit = new THREE.Vector3();
let drag = null;

function setRay(e) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
}
function rootOf(obj) { while (obj && !(obj.userData && obj.userData.id)) obj = obj.parent; return obj; }
const snap = v => Math.round(v / SNAP) * SNAP;
function clampPos(g) {
  g.position.x = Math.max(-room.w / 2 + 0.3, Math.min(room.w / 2 - 0.3, snap(g.position.x)));
  g.position.z = Math.max(-room.d / 2 + 0.3, Math.min(room.d / 2 - 0.3, snap(g.position.z)));
}

addEventListener('pointerdown', e => {
  if (e.target !== canvas) return;
  setRay(e);
  const hits = ray.intersectObjects([...items.values()], true);
  const g = hits.length ? rootOf(hits[0].object) : null;
  if (!g) { if (!e.target.closest?.('#tools')) select(null); return; }
  select(g);
  if (ray.ray.intersectPlane(floorPlane, hit)) {
    drag = { g, dx: hit.x - g.position.x, dz: hit.z - g.position.z, moved: false };
    controls.enabled = false;   // le clic est pour le meuble, pas pour la caméra
  }
}, true);

addEventListener('pointermove', e => {
  if (!drag) return;
  setRay(e);
  if (ray.ray.intersectPlane(floorPlane, hit)) {
    drag.g.position.x = hit.x - drag.dx;
    drag.g.position.z = hit.z - drag.dz;
    clampPos(drag.g);
    drag.moved = true;
  }
});

async function endDrag() {
  if (!drag) return;
  const { g, moved } = drag;
  drag = null;
  controls.enabled = true;
  if (moved) await saveItem(g);
}
addEventListener('pointerup', endDrag);
addEventListener('pointercancel', endDrag);

async function saveItem(g) {
  const r = await postJSON('move_furniture', { id: g.userData.id, x: g.position.x, z: g.position.z, rot: g.rotation.y });
  if (!r.ok) toast(r.error || 'Sauvegarde impossible.');
}

/* ---------- Boutons ---------- */
async function rotateSelected() {
  if (!selected) return;
  selected.rotation.y += Math.PI / 2;
  await saveItem(selected);
}
$('#btn-rot').onclick = rotateSelected;
$('#btn-done').onclick = () => select(null);
$('#btn-del').onclick = removeSelected;
async function removeSelected() {
  if (!selected) return;
  const g = selected;
  const r = await postJSON('remove_furniture', { id: g.userData.id });
  if (!r.ok) return toast(r.error);
  select(null);
  scene.remove(g);
  items.delete(g.userData.id);
  toast('Meuble remis dans ton inventaire.');
  loadInventory();
}
addEventListener('keydown', e => {
  if (e.target.tagName === 'SELECT') return;
  if (e.key === 'r' || e.key === 'R') rotateSelected();
  if (e.key === 'Delete' || e.key === 'Backspace') removeSelected();
  if (e.key === 'Escape') select(null);
});
$('#inv-toggle').onclick = () => $('#inv').classList.toggle('open');

/* ---------- Inventaire ---------- */
let propertyId = 0;
function renderInventory(inv) {
  const total = inv.reduce((n, i) => n + Number(i.left_qty), 0);
  $('#inv-count').textContent = `(${total})`;
  if (!inv.length) {
    $('#inv-list').innerHTML = '<p class="cat" style="text-transform:none">Aucun meuble à poser. Achète-en à la boutique de meubles (en ville).</p>';
    return;
  }
  let html = '', last = '';
  for (const i of inv) {
    if (i.category !== last) { html += `<div class="cat">${CATS[i.category] || esc(i.category)}</div>`; last = i.category; }
    html += `<div class="item"><span>${esc(i.name)}<br><small>x${i.left_qty} à poser</small></span><button data-place="${i.id}">Poser</button></div>`;
  }
  $('#inv-list').innerHTML = html;
}
let inventory = [];
async function loadInventory() {
  const r = await getJSON('house', '?property_id=' + propertyId);
  if (r.ok && r.current) { inventory = r.current.inventory; renderInventory(inventory); }
}

$('#inv-list').addEventListener('click', async e => {
  const b = e.target.closest('[data-place]');
  if (!b) return;
  b.disabled = true;
  const fid = Number(b.dataset.place);
  const r = await postJSON('place_furniture', { property_id: propertyId, furniture_id: fid, x: 0, z: 0, rot: 0 });
  if (!r.ok) { toast(r.error); b.disabled = false; return; }
  const def = inventory.find(i => Number(i.id) === fid);
  const g = await makeItem({ id: r.id, x: r.x, z: r.z, rot: r.rot, name: def.name, slug: def.slug, model_file: def.model_file });
  select(g);
  loadInventory();
});

/* ---------- Chargement d'une maison ---------- */
function showMessage(html) { const m = $('#msg'); m.innerHTML = html; m.hidden = false; }

async function loadHouse(id = 0) {
  const r = await getJSON('house', id ? '?property_id=' + id : '');
  if (!r.ok) {
    return showMessage('<h2>Connecte-toi d\'abord</h2><p>Ouvre le jeu et connecte-toi pour aménager ta maison.</p><a class="btn" href="index.html">Ouvrir le jeu</a>');
  }
  if (!r.current) {
    return showMessage('<h2>Tu n\'as pas encore de maison</h2><p>Achète une propriété dans le jeu (onglet Propriétés), puis reviens ici.</p><a class="btn" href="index.html">Acheter une maison</a>');
  }
  $('#msg').hidden = true;
  const cur = r.current;
  propertyId = Number(cur.property.id);
  $('#prop').innerHTML = r.properties.map(p =>
    `<option value="${p.id}"${Number(p.id) === propertyId ? ' selected' : ''}>🏠 ${esc(p.name)} — ${esc(p.city_name)}</option>`).join('');

  clearItems();
  buildRoom({ w: Number(cur.room.w), d: Number(cur.room.d) });
  inventory = cur.inventory;
  renderInventory(inventory);
  await Promise.all(cur.placed.map(p => makeItem(p).catch(() => toast('Modèle introuvable : ' + p.name))));
}
$('#prop').onchange = () => loadHouse(Number($('#prop').value));

/* ---------- Boucle ---------- */
renderer.setAnimationLoop(() => {
  controls.update();
  if (helper && selected) helper.update();
  renderer.render(scene, camera);
});

loadHouse(Number(new URLSearchParams(location.search).get('property_id')) || 0);
}
