import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { buildCity } from './city-builder.js';

const $ = s => document.querySelector(s);
const fcfa = n => Number(n).toLocaleString('fr-FR') + ' FCFA';
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mobile = matchMedia('(max-width: 800px)').matches;

function launchCityFallback(targetCanvas) {
  $('#loading').textContent = 'WebGL indisponible ; lancement de la carte de secours…';
  import('./city2d-fallback.js')
    .then(({ startCityFallback }) => startCityFallback(targetCanvas))
    .catch(fallbackError => {
      console.error('Impossible de lancer la carte de secours.', fallbackError);
      $('#loading').textContent = 'La carte ne peut pas être affichée dans ce navigateur.';
    });
}

/* ---------- Rendu ---------- */
const canvas = $('#c');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: 'low-power',
  });
} catch (error) {
  console.error('Impossible de créer le contexte graphique WebGL.', error);
  launchCityFallback(canvas);
}
if (renderer) {
renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1 : 1.25));
renderer.shadowMap.enabled = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const city = buildCity();
const { scene, playerCar: starterCar, groundY, solids, bounds, downtownPlaceholder, vehicles, improvementHomes, improvementInteriors, shop } = city;
let car = starterCar;
const vehicleTemplates = new Map();
const characterTemplates = new Map();
let playerVehicleModel = 'SUV';
let selectedCharacter = 'Cozy_Chef';
let playerModelGroup = null;
const customVehicleModels = {
  ClassicConvertible: { file: '1960s-convertible.glb' },
  CityBus: { file: 'city-bus.glb' },
};
const animatedCharacters = new Map();
let animatedCharacterLoading = Promise.resolve();
let playerAnimation = { mixer: null, actions: {}, current: null };
let characterLoading = Promise.resolve();
const playerCharacter = new THREE.Group();
playerCharacter.name = 'player-character';
playerCharacter.position.set(-28, groundY(-28, 70), 70);
scene.add(playerCharacter);

function fitModelToHeight(model, targetHeight) {
  model.updateMatrixWorld(true);
  const originalBounds = new THREE.Box3().setFromObject(model);
  const originalHeight = originalBounds.getSize(new THREE.Vector3()).y;
  if (!Number.isFinite(originalHeight) || originalHeight <= 0) {
    throw new Error('Un modèle 3D ne possède pas de hauteur exploitable.');
  }
  model.scale.setScalar(targetHeight / originalHeight);
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const center = bounds.getCenter(new THREE.Vector3());
  model.position.set(-center.x, -bounds.min.y, -center.z);
}

function applyVehicleModel(vehicle, modelName) {
  const template = vehicleTemplates.get(modelName);
  if (!template) return;
  const model = template.clone(true);
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const scale = customVehicleModels[modelName] ? 1 : 4.2 / size.z;
  model.scale.setScalar(scale);
  model.updateMatrixWorld(true);
  const scaledBounds = new THREE.Box3().setFromObject(model);
  const center = scaledBounds.getCenter(new THREE.Vector3());
  model.position.set(-center.x, -scaledBounds.min.y + 0.04, -center.z);
  model.traverse(object => {
    if (object.isMesh) {
      object.castShadow = !mobile;
      object.receiveShadow = true;
    }
  });
  for (const child of vehicle.root.children) {
    if (child !== vehicle.modelSlot) child.visible = false;
  }
  vehicle.modelSlot.clear();
  vehicle.modelSlot.add(model);
  vehicle.modelName = modelName;
}

async function loadQuaterniusVehicles() {
  const names = [...new Set(vehicles.map(vehicle => vehicle.modelName))];
  const path = 'assets/quaternius/vehicles/';
  const objNames = names.filter(name => !customVehicleModels[name]);
  const templates = await Promise.all(objNames.map(async name => {
    const materials = await new MTLLoader().loadAsync(`${path}${name}.mtl`);
    materials.preload();
    const model = await new OBJLoader().setMaterials(materials).loadAsync(`${path}${name}.obj`);
    return [name, model];
  }));
  templates.forEach(([name, model]) => vehicleTemplates.set(name, model));
  const loader = new GLTFLoader();
  const gltfTemplates = await Promise.all(Object.entries(customVehicleModels)
    .filter(([name]) => names.includes(name))
    .map(async ([name, asset]) => [name, (await loader.loadAsync(`models/amelioration/${asset.file}`)).scene]));
  gltfTemplates.forEach(([name, model]) => vehicleTemplates.set(name, model));
  vehicles.forEach(vehicle => applyVehicleModel(
    vehicle,
    vehicle.root === car ? playerVehicleModel : vehicle.modelName,
  ));
}

function fitModelToWidth(model, targetWidth) {
  model.updateMatrixWorld(true);
  const initialBounds = new THREE.Box3().setFromObject(model);
  const width = initialBounds.getSize(new THREE.Vector3()).x;
  if (!Number.isFinite(width) || width <= 0) {
    throw new Error('Un bâtiment du pack ne possède pas de largeur exploitable.');
  }
  model.scale.setScalar(targetWidth / width);
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const center = bounds.getCenter(new THREE.Vector3());
  model.position.set(-center.x, -bounds.min.y, -center.z);
}

async function loadImprovementModels() {
  const loader = new GLTFLoader();
  const houseModels = ['adobe-house.glb', 'bungalow.glb', 'modern-house.glb', 'colonial-house.glb'];
  const [houses, interiors] = await Promise.all([
    Promise.all(houseModels.map(async file => [file, (await loader.loadAsync(`models/amelioration/${file}`)).scene])),
    Promise.all(improvementInteriors.map(async place => [place, (await loader.loadAsync(`models/amelioration/${place.model}`)).scene])),
  ]);
  const houseTemplates = new Map(houses);
  improvementHomes.forEach(home => {
    const source = houseTemplates.get(home.model);
    if (!source) return;
    const model = source.clone(true);
    fitModelToWidth(model, 10);
    model.traverse(object => {
      if (object.isMesh) {
        object.castShadow = !mobile;
        object.receiveShadow = true;
      }
    });
    const placement = new THREE.Group();
    placement.position.set(home.x, home.y, home.z);
    placement.add(model);
    scene.add(placement);
  });
  interiors.forEach(([place, source]) => {
    const model = source.clone(true);
    model.traverse(object => {
      if (object.isMesh) {
        object.castShadow = !mobile;
        object.receiveShadow = true;
      }
    });
    const placement = new THREE.Group();
    placement.position.set(place.x, groundY(place.x, place.z), place.z);
    placement.add(model);
    scene.add(placement);
  });
}

async function loadQuaterniusPeople() {
  const names = ['Female_Casual', 'Female_Dress', 'Male_Casual', 'Male_Suit'];
  const path = 'assets/quaternius/people/';
  const templates = await Promise.all(names.map(async name => {
    const materials = await new MTLLoader().loadAsync(`${path}${name}.mtl`);
    materials.preload();
    return new OBJLoader().setMaterials(materials).loadAsync(`${path}${name}.obj`);
  }));
  templates.forEach((model, index) => characterTemplates.set(names[index], model));
  updatePlayerCharacter();
  const positions = [
    [44, -14], [80, -12], [108, -14], [24, 7],
    [53, 20], [119, 43], [46, 57], [116, 58],
  ];
  positions.forEach(([x, z], index) => {
    const model = templates[index % templates.length].clone(true);
    fitModelToHeight(model, 1.72);
    const person = new THREE.Group();
    person.position.set(x, groundY(x, z) + 0.04, z);
    person.rotation.y = (index % 4) * Math.PI / 2;
    person.add(model);
    model.traverse(object => {
      if (object.isMesh) object.castShadow = !mobile;
    });
    scene.add(person);
  });
}

async function loadAnimatedCharacter() {
  const variants = [
    ['Cozy_Animated', 'cozy-character.glb'],
    ['Cozy_Chef', 'cozy-chef.glb'],
    ['Cozy_Space', 'cozy-space.glb'],
  ];
  const loaded = await Promise.all(variants.map(async ([name, file]) => [
    name,
    await new GLTFLoader().loadAsync(`models/characters/${file}`),
  ]));
  loaded.forEach(([name, gltf]) => animatedCharacters.set(name, gltf));
  updatePlayerCharacter();
}

function updatePlayerCharacter() {
  const animated = animatedCharacters.get(selectedCharacter);
  const template = animated ? animated.scene : characterTemplates.get(selectedCharacter);
  if (!template) return;
  if (playerAnimation.mixer) {
    playerAnimation.mixer.stopAllAction();
    playerAnimation.mixer.uncacheRoot(playerAnimation.root);
    playerAnimation = { mixer: null, actions: {}, current: null };
  }
  const model = animated ? template : template.clone(true);
  fitModelToHeight(model, 1.72);
  model.traverse(object => {
    if (object.isMesh) {
      object.castShadow = !mobile;
      object.frustumCulled = false;
    }
  });
  playerModelGroup = new THREE.Group();
  playerModelGroup.add(model);
  playerCharacter.clear();
  playerCharacter.add(playerModelGroup);
  playerCharacter.visible = !state.driving;
  $('#character-open').textContent = characterIcon(selectedCharacter);
  if (animated) {
    playerAnimation.mixer = new THREE.AnimationMixer(model);
    playerAnimation.root = model;
    animated.animations.forEach(clip => {
      playerAnimation.actions[clip.name.toLowerCase()] = playerAnimation.mixer.clipAction(clip);
    });
    playPlayerAnimation('idle');
  }
}

function characterIcon(model) {
  if (model.startsWith('Cozy_')) return '🏃🏾';
  return model.startsWith('Female') ? '👩🏾' : '👨🏾';
}

function playPlayerAnimation(name, fade = 0.18) {
  const next = playerAnimation.actions[name];
  if (!next || playerAnimation.current === next) return;
  next.reset().fadeIn(fade).play();
  if (playerAnimation.current) playerAnimation.current.fadeOut(fade);
  playerAnimation.current = next;
}

function openCharacterCreator() {
  const options = [
    ['Female_Casual', '👩🏾', 'Femme · Décontracté'],
    ['Female_Dress', '👩🏿', 'Femme · Robe'],
    ['Male_Casual', '👨🏾', 'Homme · Décontracté'],
    ['Male_Suit', '👨🏿', 'Homme · Costume'],
    ['Cozy_Animated', '🏃🏾', 'Personnage animé · marche et course'],
    ['Cozy_Chef', '👨🏾‍🍳', 'Personnage animé · Cuisinier'],
    ['Cozy_Space', '👨🏾‍🚀', 'Personnage animé · Astronaute'],
  ];
  openPanel('🧍 Créer mon personnage', `<p>Choisis l’apparence de ton personnage. Elle est enregistrée sur ton compte.</p><div class="character-options">${options.map(([model, icon, label]) => `<button type="button" class="character-option" data-character="${model}" aria-pressed="${selectedCharacter === model}"><span class="character-preview">${icon}</span><b>${label}</b><small>${selectedCharacter === model ? 'Sélectionné' : 'Choisir'}</small></button>`).join('')}</div>`);
  document.querySelectorAll('[data-character]').forEach(button => {
    button.onclick = async () => {
      button.disabled = true;
      const model = button.dataset.character;
      try {
        await characterLoading;
        if (model.startsWith('Cozy_')) await animatedCharacterLoading;
      } catch (error) {
        console.error('Les modèles de personnages ne sont pas disponibles.', error);
        toast('Les personnages ne peuvent pas être chargés. Réessaie plus tard.');
        button.disabled = false;
        return;
      }
      if (model.startsWith('Cozy_') ? !animatedCharacters.has(model) : !characterTemplates.has(model)) {
        toast('Les modèles de personnages ne sont pas encore chargés.');
        button.disabled = false;
        return;
      }
      const response = await postJSON('set_character', { model });
      if (!response.ok) {
        toast(response.error || 'La sauvegarde du personnage a échoué.');
        button.disabled = false;
        return;
      }
      selectedCharacter = model;
      updatePlayerCharacter();
      openCharacterCreator();
      toast('Personnage enregistré.');
    };
  });
}

async function loadQuaterniusAnimals() {
  const loader = new GLTFLoader();
  const path = 'assets/quaternius/animals/';
  const animals = [
    { name: 'ShibaInu', x: 174, z: 72, height: 0.85, rotation: 0.4 },
    { name: 'Cow', x: 188, z: 88, height: 1.5, rotation: -0.5 },
    { name: 'Horse', x: 200, z: 73, height: 1.65, rotation: Math.PI / 2 },
  ];
  const templates = await Promise.all(animals.map(animal => loader.loadAsync(`${path}${animal.name}.gltf`)));
  animals.forEach((animal, index) => {
    const model = templates[index].scene.clone(true);
    fitModelToHeight(model, animal.height);
    model.traverse(object => {
      if (object.isMesh) {
        object.castShadow = !mobile;
        object.receiveShadow = true;
      }
    });
    const group = new THREE.Group();
    group.position.set(animal.x, groundY(animal.x, animal.z), animal.z);
    group.rotation.y = animal.rotation;
    group.add(model);
    scene.add(group);
  });
}

async function loadQuaterniusAssets() {
  characterLoading = loadQuaterniusPeople();
  animatedCharacterLoading = loadAnimatedCharacter();
  const results = await Promise.allSettled([
    loadQuaterniusVehicles(),
    characterLoading,
    animatedCharacterLoading,
    loadQuaterniusAnimals(),
    loadImprovementModels(),
  ]);
  const failed = results.filter(result => result.status === 'rejected');
  if (failed.length) {
    failed.forEach(result => console.error('Impossible de charger un pack de modèles du jeu.', result.reason));
    toast('Certains modèles de la ville n’ont pas pu être chargés.');
  }
}

async function loadDowntownKit() {
  const loader = new GLTFLoader();
  const assetPath = 'assets/downtown-city/';
  const names = ['Building_Large_2', 'Building_Medium_2_001', 'Building_Small_1'];
  try {
    const gltfs = await Promise.all(names.map(name => loader.loadAsync(`${assetPath}${name}.gltf`)));
    const placements = [];
    for (let ix = 0; ix < 4; ix += 1) {
      for (let iz = 0; iz < 4; iz += 1) {
        const central = (ix === 1 || ix === 2) && (iz === 1 || iz === 2);
        const modelIndex = central ? 0 : (ix + iz) % 3;
        placements.push({
          source: gltfs[modelIndex].scene,
          x: 4 + ix * 10.5,
          z: -54 + iz * 11,
          width: modelIndex === 0 ? 11 : modelIndex === 1 ? 8.5 : 7.2
        });
      }
    }

    const buildings = new THREE.Group();
    for (const placement of placements) {
      const model = placement.source.clone(true);
      model.updateMatrixWorld(true);
      const originalBounds = new THREE.Box3().setFromObject(model);
      const originalWidth = originalBounds.getSize(new THREE.Vector3()).x;
      if (!Number.isFinite(originalWidth) || originalWidth <= 0) {
        throw new Error('Un modèle du kit ne possède pas de largeur exploitable.');
      }

      model.scale.setScalar(placement.width / originalWidth);
      model.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(model);
      const center = bounds.getCenter(new THREE.Vector3());
      model.position.x += placement.x - center.x;
      model.position.y -= bounds.min.y;
      model.position.z += placement.z - center.z;
      model.traverse(object => {
        if (object.isMesh) {
          object.castShadow = !mobile;
          object.receiveShadow = true;
          object.frustumCulled = false;
        }
      });
      buildings.add(model);
    }

    function disposePlaceholder(object) {
      object.traverse(child => {
        if (!child.isMesh) return;
        child.geometry.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach(material => {
          if (material.map) material.map.dispose();
          material.dispose();
        });
      });
    }

    scene.remove(downtownPlaceholder);
    disposePlaceholder(downtownPlaceholder);
    scene.add(buildings);
  } catch (error) {
    console.error('Impossible de charger les bâtiments Downtown City.', error);
    toast('Les bâtiments Downtown City n’ont pas pu être chargés ; la ville reste disponible.');
  }
}

const camera = new THREE.PerspectiveCamera(50, 1, 1, 2500);
camera.position.set(
  playerCharacter.position.x + 95,
  playerCharacter.position.y + 85,
  playerCharacter.position.z + 95,
);
const controls = new OrbitControls(camera, canvas);
controls.target.copy(playerCharacter.position);
controls.enableDamping = true;
controls.maxPolarAngle = 1.45;
controls.minDistance = 25;
controls.maxDistance = 330;
controls.update();

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
canvas.addEventListener('webglcontextlost', event => {
  event.preventDefault();
  const fallbackCanvas = document.createElement('canvas');
  fallbackCanvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block';
  canvas.after(fallbackCanvas);
  canvas.style.display = 'none';
  $('#labels').hidden = true;
  launchCityFallback(fallbackCanvas);
});

/* ---------- Étiquettes des lieux ---------- */
const labelsBox = $('#labels');
const labelEls = city.pois.map(p => {
  const el = document.createElement('div');
  el.className = 'poi';
  el.textContent = `${p.icon} ${p.name}`;
  el.onclick = () => {
    if (p.id === 'boutique') return openShop();
    const model = p.id === 'cafe' ? 'cafe-interior.glb'
      : p.id === 'librairie' ? 'bookstore-interior.glb'
        : null;
    const preview = model
      ? `<p>Le nouvel intérieur 3D est installé dans la ville.</p><a class="btn" href="model-gallery.html?model=${encodeURIComponent(model)}">Voir le modèle 3D</a>`
      : p.id === 'nouveau-quartier'
        ? '<p>Quatre nouvelles maisons ont été ajoutées à l’est de la ville.</p><a class="btn" href="model-gallery.html?category=houses">Voir les maisons</a>'
        : `<p>Tu peux t'y rendre à pied avec ZQSD ou en voiture avec E/C.</p><p class="sub">Les activités de ce lieu arriveront dans une prochaine version.</p>`;
    openPanel(`${p.icon} ${p.name}`, preview);
  };
  labelsBox.appendChild(el);
  return { el, pos: new THREE.Vector3(...p.pos) };
});
const tmp = new THREE.Vector3();
function updateLabels() {
  labelsBox.style.display = state.driving ? 'none' : 'block';
  if (state.driving) return;
  for (const l of labelEls) {
    tmp.copy(l.pos).project(camera);
    if (tmp.z > 1 || Math.abs(tmp.x) > 1.1 || Math.abs(tmp.y) > 1.1) { l.el.style.display = 'none'; continue; }
    l.el.style.display = 'block';
    l.el.style.transform = `translate(${((tmp.x * 0.5 + 0.5) * innerWidth).toFixed(1)}px, ${((-tmp.y * 0.5 + 0.5) * innerHeight).toFixed(1)}px) translate(-50%,-100%)`;
  }
}

/* ---------- Conduite ---------- */
const state = { driving: false, speed: 0, keys: {}, walking: false };
$('#dpad').hidden = !matchMedia('(pointer: coarse)').matches;
const KEYMAP = {
  ArrowUp: 'up', w: 'up', z: 'up', ArrowDown: 'down', s: 'down',
  ArrowLeft: 'left', a: 'left', q: 'left', ArrowRight: 'right', d: 'right',
};
addEventListener('keydown', e => {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (k === 'Escape') return closePanel();
  if (!$('#panel').hidden || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  if (k === 'c' || k === 'e') { e.preventDefault(); return enterExitVehicle(); }
  if (k === 'Shift') state.keys.run = true;
  if (KEYMAP[k]) { state.keys[KEYMAP[k]] = true; e.preventDefault(); }
});
addEventListener('keyup', e => {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (k === 'Shift') state.keys.run = false;
  if (KEYMAP[k]) state.keys[KEYMAP[k]] = false;
});
document.querySelectorAll('#dpad [data-key]').forEach(b => {
  const set = v => () => { state.keys[b.dataset.key] = v; };
  b.addEventListener('pointerdown', set(true));
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, set(false)));
});
$('#vehicle-interact').onclick = enterExitVehicle;
$('#character-open').onclick = openCharacterCreator;
document.querySelector('[data-app="Personnage"]').onclick = openCharacterCreator;

function toggleDrive() {
  if (state.driving) {
    const side = new THREE.Vector3(Math.cos(car.rotation.y), 0, -Math.sin(car.rotation.y));
    const candidates = [1, -1, 2].map(direction => car.position.clone()
      .addScaledVector(side, direction === 2 ? 0 : direction * 3)
      .add(new THREE.Vector3(0, 0, direction === 2 ? -4 : 0)));
    const exitPosition = candidates.find(position => canMove(position.x, position.z));
    if (!exitPosition) {
      toast('Aucune place libre pour sortir du véhicule.');
      return;
    }
    playerCharacter.position.set(exitPosition.x, groundY(exitPosition.x, exitPosition.z), exitPosition.z);
    playerCharacter.rotation.y = car.rotation.y;
    playerCharacter.visible = true;
    car.userData.playerControlled = false;
    state.driving = false;
    state.speed = 0;
    state.walking = false;
    controls.enabled = true;
    controls.target.copy(playerCharacter.position);
    const forward = new THREE.Vector3(Math.sin(car.rotation.y), 0, Math.cos(car.rotation.y));
    camera.position.copy(playerCharacter.position)
      .addScaledVector(forward, -24)
      .add(new THREE.Vector3(0, 9, 0));
    controls.update();
    toast('Tu es sorti du véhicule. Déplace-toi avec ZQSD ; Maj pour courir.');
  } else {
      const nearby = vehicles
        .filter(vehicle => !vehicle.root.userData.playerControlled)
      .map(vehicle => ({ vehicle, distance: vehicle.root.position.distanceTo(playerCharacter.position) }))
      .filter(item => item.distance <= 8)
      .sort((a, b) => a.distance - b.distance)[0];
    if (!nearby) {
      toast('Approche-toi d’une voiture (8 m maximum) pour y entrer.');
      return;
    }
    car.visible = true;
    car = nearby.vehicle.root;
    car.userData.playerControlled = true;
    playerCharacter.visible = false;
    state.driving = true;
    state.speed = 0;
    state.walking = false;
    controls.enabled = false;
    toast('Au volant ! Flèches ou ZQSD pour conduire ; E ou C pour sortir.');
  }
  state.keys = {};
  $('#speedo').hidden = !state.driving;
  $('#dpad').hidden = !matchMedia('(pointer: coarse)').matches;
  $('#vehicle-interact').textContent = state.driving ? '🚶 Sortir (E)' : '🚘 Entrer (E)';
  document.querySelectorAll('.bottom button').forEach(b => b.classList.toggle('active', b.dataset.nav === (state.driving ? 'vehicles' : 'map')));
}

function enterExitVehicle() {
  if (!state.driving && Math.hypot(playerCharacter.position.x - shop.x, playerCharacter.position.z - shop.z) <= 8) {
    openShop();
    return;
  }
  toggleDrive();
}

function moveCharacter(dt) {
  const { up, down, left, right } = state.keys;
  const forward = Number(up) - Number(down);
  const sideways = Number(right) - Number(left);
  if (!forward && !sideways) {
    state.walking = false;
    controls.target.lerp(playerCharacter.position, 1 - Math.exp(-3 * dt));
    return;
  }
  const view = controls.target.clone().sub(camera.position);
  view.y = 0;
  if (view.lengthSq() < 0.001) view.set(0, 0, -1);
  view.normalize();
  const rightVector = new THREE.Vector3(-view.z, 0, view.x);
  const movement = view.multiplyScalar(forward).addScaledVector(rightVector, sideways);
  if (movement.lengthSq() === 0) return;
  movement.normalize();
  const distance = (state.keys.run ? 9 : 4.5) * dt;
  state.walking = false;
  const nextX = THREE.MathUtils.clamp(playerCharacter.position.x + movement.x * distance, bounds.minX, bounds.maxX);
  const nextZ = THREE.MathUtils.clamp(playerCharacter.position.z + movement.z * distance, bounds.minZ, bounds.maxZ);
  if (canMove(nextX, nextZ)) {
    playerCharacter.position.set(nextX, groundY(nextX, nextZ), nextZ);
    playerCharacter.rotation.y = Math.atan2(movement.x, movement.z);
    state.walking = true;
  } else {
    const tryX = canMove(nextX, playerCharacter.position.z);
    const tryZ = canMove(playerCharacter.position.x, nextZ);
    if (tryX || tryZ) {
      const x = tryX ? nextX : playerCharacter.position.x;
      const z = tryZ ? nextZ : playerCharacter.position.z;
      playerCharacter.position.set(x, groundY(x, z), z);
      playerCharacter.rotation.y = Math.atan2(movement.x, movement.z);
      state.walking = true;
    }
  }
  controls.target.lerp(playerCharacter.position, 1 - Math.exp(-6 * dt));
}

function canMove(x, z) {
  if (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ) return false;
  return !solids.some(r => x > r[0] - 1.8 && x < r[2] + 1.8 && z > r[1] - 1.8 && z < r[3] + 1.8);
}

function drive(dt) {
  const k = state.keys;
  const acc = (k.up ? 1 : 0) - (k.down ? 1 : 0);
  if (acc > 0) state.speed += 22 * dt;
  else if (acc < 0) state.speed -= (state.speed > 0 ? 40 : 14) * dt;
  else state.speed -= Math.sign(state.speed) * Math.min(Math.abs(state.speed), 10 * dt);
  state.speed = THREE.MathUtils.clamp(state.speed, -10, 38);

  const steer = (k.left ? 1 : 0) - (k.right ? 1 : 0);
  const h = car.rotation.y + steer * 1.8 * dt * THREE.MathUtils.clamp(state.speed / 8, -1, 1);
  car.rotation.y = h;
  const nx = car.position.x + Math.sin(h) * state.speed * dt;
  const nz = car.position.z + Math.cos(h) * state.speed * dt;
  if (canMove(nx, nz)) { car.position.x = nx; car.position.z = nz; } else { state.speed *= -0.3; }
  car.position.y = groundY(car.position.x, car.position.z) + 0.2;

  const fwd = new THREE.Vector3(Math.sin(h), 0, Math.cos(h));
  const want = car.position.clone().addScaledVector(fwd, -14).add(new THREE.Vector3(0, 7, 0));
  camera.position.lerp(want, 1 - Math.exp(-6 * dt));
  camera.lookAt(car.position.clone().addScaledVector(fwd, 6).add(new THREE.Vector3(0, 2, 0)));
  $('#kmh').textContent = Math.round(Math.abs(state.speed) * 3.6);
}

/* ---------- Mini-carte ---------- */
const mini = $('#mini');
const mctx = mini.getContext('2d');
function drawMini() {
  const W = mini.width, s = 0.6;
  mctx.clearRect(0, 0, W, W);
  mctx.save();
  mctx.beginPath(); mctx.arc(W / 2, W / 2, W / 2 - 3, 0, Math.PI * 2); mctx.clip();

  let fx, fz, cx, cz;
  if (state.driving) { fx = Math.sin(car.rotation.y); fz = Math.cos(car.rotation.y); cx = car.position.x; cz = car.position.z; }
  else { cx = controls.target.x; cz = controls.target.z; fx = cx - camera.position.x; fz = cz - camera.position.z; }
  const phi = -Math.PI / 2 - Math.atan2(fz, fx);

  mctx.translate(W / 2, W / 2);
  mctx.rotate(phi);
  mctx.translate(-cx * s, -cz * s);
  mctx.fillStyle = '#1f8fb8'; mctx.fillRect(-2000, -2000, 4000, 4000);
  mctx.fillStyle = '#5f9e4b'; mctx.fillRect(-40 * s, -160 * s, 260 * s, 300 * s);
  mctx.fillStyle = '#e8d2a0'; mctx.fillRect(-40 * s, 22 * s, 14 * s, 108 * s);
  mctx.fillStyle = '#3f6e36'; mctx.beginPath(); mctx.arc(30 * s, -140 * s, 62 * s, 0, Math.PI * 2); mctx.fill();
  mctx.fillStyle = '#444a55';
  mctx.fillRect(-24 * s, -75 * s, 12 * s, 210 * s);
  [-65, -3, 50].forEach(z => mctx.fillRect(-12 * s, (z - 4) * s, 227 * s, 8 * s));
  mctx.fillStyle = '#fff';
  city.pois.forEach(p => { mctx.beginPath(); mctx.arc(p.pos[0] * s, p.pos[2] * s, 3, 0, Math.PI * 2); mctx.fill(); });
  mctx.restore();

  mctx.fillStyle = '#4da3ff';
  mctx.beginPath(); mctx.moveTo(W / 2, W / 2 - 12); mctx.lineTo(W / 2 + 8, W / 2 + 9); mctx.lineTo(W / 2, W / 2 + 4); mctx.lineTo(W / 2 - 8, W / 2 + 9); mctx.closePath(); mctx.fill();
}

/* ---------- Joueur (API PHP) ---------- */
async function getJSON(action) {
  try { return await (await fetch('api.php?action=' + action)).json(); } catch { return { ok: false }; }
}
async function postJSON(action, data) {
  try {
    const csrf = await getJSON('csrf');
    if (!csrf.ok || !csrf.csrf) {
      return { ok: false, error: 'Session expirée. Recharge la page et reconnecte-toi.' };
    }
    const response = await fetch(`api.php?action=${encodeURIComponent(action)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf.csrf },
      body: JSON.stringify(data),
    });
    const result = await response.json();
    return response.ok ? result : { ok: false, error: result.error || 'La requête a échoué.' };
  } catch (error) {
    console.error(`La requête ${action} a échoué.`, error);
    return { ok: false, error: 'Impossible de contacter le serveur.' };
  }
}
let me = null;
async function loadPlayer() {
  const r = await getJSON('me');
  if (!r.ok) { $('#p-name').textContent = 'Invité'; return; }
  me = r;
  const p = r.player;
  const savedCharacters = ['Female_Casual', 'Female_Dress', 'Male_Casual', 'Male_Suit', 'Cozy_Animated', 'Cozy_Chef', 'Cozy_Space'];
  if (savedCharacters.includes(p.character_model)) {
    selectedCharacter = p.character_model;
    updatePlayerCharacter();
  }
  $('#p-name').textContent = p.username;
  $('#p-level').textContent = p.level;
  $('#p-city').textContent = r.city ? r.city.name : 'Abidjan (aperçu)';
  $('#p-xp').style.width = (Number(p.xp) % 100) + '%';
  $('#p-cash').textContent = fcfa(p.cash);
  $('#p-bank').textContent = fcfa(p.bank);
  const garage = await getJSON('garage');
  const owned = garage.ok && garage.vehicles.find(vehicle => vehicle.type !== 'moto');
  if (owned) {
    const label = `${owned.name} ${owned.type}`.toLowerCase();
    playerVehicleModel = owned.type === 'taxi' || label.includes('taxi')
      ? 'Taxi'
      : owned.type === 'minibus' || label.includes('suv')
        ? 'SUV'
        : label.includes('mercedes') || label.includes('sport')
          ? 'SportsCar'
          : label.includes('corolla')
            ? 'NormalCar1'
            : 'NormalCar2';
    const playerVehicle = vehicles.find(vehicle => vehicle.root === car);
    if (playerVehicle) {
      playerVehicle.modelName = playerVehicleModel;
      applyVehicleModel(playerVehicle, playerVehicleModel);
    }
  }
}

/* ---------- Horloge ---------- */
function tick() {
  const d = new Date();
  $('#clock').textContent = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  $('#date').textContent = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}
tick(); setInterval(tick, 10000);

/* ---------- Panneaux et barre du bas ---------- */
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.id); toast.id = setTimeout(() => t.classList.remove('show'), 3000);
}
function openPanel(title, html) { $('#panel-title').innerHTML = title; $('#panel-body').innerHTML = html; $('#panel').hidden = false; }
function closePanel() { $('#panel').hidden = true; }
$('#panel-close').onclick = closePanel;
$('#panel').onclick = e => { if (e.target.id === 'panel') closePanel(); };

const needLogin = '<p>Connecte-toi d\'abord dans le jeu.</p><a class="btn" href="index.html">Ouvrir le jeu</a>';
const furnitureCategories = {
  salon: '🛋️ Salon',
  chambre: '🛏️ Chambre',
  cuisine: '🍳 Cuisine',
  salle_de_bain: '🛁 Salle de bain',
  decoration: '🪴 Décoration',
  eclairage: '💡 Éclairage',
  portes_fenetres: '🚪 Portes et fenêtres',
};
let shopFurniture = [];
let shopCategory = 'salon';
function renderFurnitureShop() {
  const categories = $('#shop-categories');
  const items = $('#shop-items');
  if (!categories || !items) return;
  categories.innerHTML = Object.entries(furnitureCategories)
    .map(([id, name]) => `<button type="button" class="shop-category${id === shopCategory ? ' active' : ''}" data-shop-category="${id}">${name}</button>`)
    .join('');
  items.innerHTML = shopFurniture.filter(item => item.category === shopCategory).map(item => `
    <div class="row shop-item">
      <span>${esc(item.name)}<br><small>${Number(item.owned) ? `En inventaire : ${Number(item.owned)}` : 'Modèle 3D disponible pour la maison'}</small></span>
      <span><b>${fcfa(item.price)}</b><br><button type="button" class="btn small" data-buy-furniture="${Number(item.id)}">Acheter</button></span>
    </div>`).join('');
}
async function openShop() {
  const result = await getJSON('furniture');
  if (!result.ok) return openPanel('🛋️ Boutique de meubles', needLogin);
  shopFurniture = result.furniture;
  shopCategory = 'salon';
  await loadPlayer();
  openPanel('🛋️ Boutique de meubles',
    `<p>Choisis des meubles pour ton logement. Ils seront disponibles dans ton inventaire.</p>
    <div class="shop-categories" id="shop-categories"></div>
    <div id="shop-items"></div>
    <a class="btn small" href="house.html">Aménager ma maison</a>`);
  renderFurnitureShop();
}
$('#panel-body').addEventListener('click', async event => {
  const category = event.target.closest('[data-shop-category]');
  if (category) {
    shopCategory = category.dataset.shopCategory;
    renderFurnitureShop();
    return;
  }
  const buy = event.target.closest('[data-buy-furniture]');
  if (!buy) return;
  buy.disabled = true;
  const result = await postJSON('buy_furniture', { furniture_id: Number(buy.dataset.buyFurniture), quantity: 1 });
  if (!result.ok) {
    toast(result.error || 'Achat impossible.');
    buy.disabled = false;
    return;
  }
  toast('Meuble acheté !');
  const catalog = await getJSON('furniture');
  if (catalog.ok) shopFurniture = catalog.furniture;
  await loadPlayer();
  renderFurnitureShop();
});
const NAV = {
  map: () => { if (state.driving) toggleDrive(); },
  vehicles: enterExitVehicle,
  inventory: async () => {
    const r = await getJSON('garage');
    if (!r.ok) return openPanel('🎒 Inventaire', needLogin);
    openPanel('🎒 Inventaire — Garage', (r.vehicles.map(v => `<div class="row"><span>🚗 ${esc(v.name)}<br><small>${esc(v.plate)}</small></span><small>⛽ ${v.fuel}%</small></div>`).join('') || '<p>Aucun véhicule. Achètes-en un dans le jeu.</p>') + '<a class="btn" href="index.html">Concessionnaire</a>');
  },
  missions: async () => {
    const r = await getJSON('jobs');
    if (!r.ok) return openPanel('📋 Missions', needLogin);
    openPanel('📋 Missions & emplois', r.jobs.map(j => `<div class="row"><span>${esc(j.title)}<br><small>Niveau ${j.min_level}</small></span><b>${fcfa(j.daily_pay)}</b></div>`).join('') + '<a class="btn" href="index.html">Postuler / travailler</a>');
  },
  home: async () => {
    const r = await getJSON('my_properties');
    if (!r.ok) return openPanel('🏠 Maison', needLogin);
    openPanel('🏠 Mes propriétés', (r.properties.map(p => `<div class="row"><span>${esc(p.name)}<br><small>${esc(p.city_name)}</small></span><a class="btn small" href="house.html?property_id=${Number(p.id)}">🛋️ Aménager</a></div>`).join('') || '<p>Aucune propriété.</p>') + '<a class="btn" href="index.html">Acheter une maison</a>');
  },
  money: async () => {
    await loadPlayer();
    if (!me) return openPanel('🪙 Argent', needLogin);
    openPanel('🪙 Argent', `<div class="row"><span>Liquide</span><b>${fcfa(me.player.cash)}</b></div><div class="row"><span>Banque</span><b>${fcfa(me.player.bank)}</b></div><a class="btn" href="index.html">Aller à la banque</a>`);
  },
};
document.querySelectorAll('[data-nav]').forEach(b => b.onclick = () => {
  if (b.dataset.nav !== 'vehicles' && b.dataset.nav !== 'map') {
    document.querySelectorAll('.bottom button').forEach(x => x.classList.toggle('active', x === b));
  }
  NAV[b.dataset.nav]();
});
document.querySelectorAll('[data-app]').forEach(b => b.onclick = () => {
  if (b.dataset.app === 'Modèles 3D') location.href = 'model-gallery.html';
  else toast(`${b.dataset.app} : bientôt disponible`);
});

/* ---------- Boucle ---------- */
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  city.update(dt, clock.elapsedTime);
  if (state.driving) drive(dt);
  else {
    moveCharacter(dt);
    if (playerAnimation.mixer) {
      playPlayerAnimation(state.walking ? (state.keys.run ? 'run' : 'walk') : 'idle');
      playerAnimation.mixer.update(dt);
    } else if (playerModelGroup) {
      playerModelGroup.position.y = state.walking ? Math.abs(Math.sin(clock.elapsedTime * (state.keys.run ? 17 : 12))) * 0.08 : 0;
    }
    controls.update();
  }
  renderer.render(scene, camera);
  updateLabels();
  drawMini();
});

loadPlayer();
loadDowntownKit();
loadQuaterniusAssets();
$('#loading').hidden = true;
}
