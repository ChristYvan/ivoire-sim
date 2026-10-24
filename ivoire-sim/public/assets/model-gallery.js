import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const assets = [
  { file: '1960s-convertible.glb', label: 'Cabriolet des années 1960', category: 'vehicles', icon: '🚘' },
  { file: '1990s-car-interior.glb', label: 'Intérieur automobile des années 1990', category: 'interiors', icon: '🚗' },
  { file: 'car-dashboard.glb', label: 'Tableau de bord automobile', category: 'interiors', icon: '🛞' },
  { file: 'city-bus.glb', label: 'Bus de ville', category: 'vehicles', icon: '🚌' },
  { file: 'bus-interior.glb', label: 'Intérieur de bus', category: 'interiors', icon: '💺' },
  { file: 'adobe-house.glb', label: 'Maison en adobe', category: 'houses', icon: '🏠' },
  { file: 'alpine-chalet.glb', label: 'Chalet alpin', category: 'houses', icon: '🏡' },
  { file: 'bungalow.glb', label: 'Bungalow', category: 'houses', icon: '🏡' },
  { file: 'colonial-house.glb', label: 'Maison coloniale', category: 'houses', icon: '🏛️' },
  { file: 'dome-house.glb', label: 'Maison dôme', category: 'houses', icon: '🏠' },
  { file: 'duplex-house.glb', label: 'Maison duplex', category: 'houses', icon: '🏘️' },
  { file: 'dutch-canal-house.glb', label: 'Maison du canal', category: 'houses', icon: '🏠' },
  { file: 'mediterranean-villa.glb', label: 'Villa méditerranéenne', category: 'houses', icon: '🏡' },
  { file: 'modern-house.glb', label: 'Maison moderne', category: 'houses', icon: '🏠' },
  { file: 'row-houses.glb', label: 'Maisons en rangée', category: 'houses', icon: '🏘️' },
  { file: 'bookstore-interior.glb', label: 'Intérieur de librairie', category: 'interiors', icon: '📚' },
  { file: 'cafe-interior.glb', label: 'Intérieur de café', category: 'interiors', icon: '☕' },
  { file: 'cozy-character.glb', label: 'Personnage animé Cozy', category: 'characters', icon: '🏃🏾', path: 'characters/cozy-character.glb' },
  { file: 'cozy-chef.glb', label: 'Personnage animé cuisinier', category: 'characters', icon: '👨🏾‍🍳', path: 'characters/cozy-chef.glb' },
  { file: 'cozy-space.glb', label: 'Personnage animé astronaute', category: 'characters', icon: '👨🏾‍🚀', path: 'characters/cozy-space.glb' },
];

const categories = [
  { id: 'all', label: 'Tout' },
  { id: 'houses', label: 'Maisons' },
  { id: 'vehicles', label: 'Véhicules' },
  { id: 'interiors', label: 'Intérieurs' },
  { id: 'characters', label: 'Personnages' },
];
const filters = document.querySelector('#filters');
const list = document.querySelector('#assets');
const status = document.querySelector('#status');
const rendererCanvas = document.querySelector('#preview');
const query = new URLSearchParams(location.search);
let category = categories.some(item => item.id === query.get('category')) ? query.get('category') : 'all';
let selectedFile = '';
let currentModel = null;
let requestId = 0;
let renderer;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x17263b);
scene.add(new THREE.HemisphereLight(0xe6f3ff, 0x596143, 2));
const sun = new THREE.DirectionalLight(0xfff0d6, 2.5);
sun.position.set(5, 9, 6);
scene.add(sun);
const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 200);
const controls = new OrbitControls(camera, rendererCanvas);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.92;
const loader = new GLTFLoader();
const clock = new THREE.Clock();

try {
  renderer = new THREE.WebGLRenderer({ canvas: rendererCanvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
} catch (error) {
  console.error('Impossible de créer le rendu 3D de la galerie.', error);
  status.textContent = 'Aperçu indisponible : ce navigateur doit autoriser WebGL.';
}

function resize() {
  if (!renderer) return;
  const width = rendererCanvas.clientWidth;
  const height = rendererCanvas.clientHeight;
  if (!width || !height) return;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

function renderFilters() {
  filters.replaceChildren();
  categories.forEach(item => {
    const button = document.createElement('button');
    button.className = `filter${item.id === category ? ' active' : ''}`;
    button.textContent = item.label;
    button.type = 'button';
    button.onclick = () => {
      category = item.id;
      renderFilters();
      renderList();
    };
    filters.append(button);
  });
}

function renderList() {
  list.replaceChildren();
  assets.filter(item => category === 'all' || item.category === category).forEach(item => {
    const button = document.createElement('button');
    button.className = `asset${item.file === selectedFile ? ' active' : ''}`;
    button.type = 'button';
    button.append(`${item.icon} ${item.label}`);
    const filename = document.createElement('small');
    filename.textContent = item.file;
    button.append(filename);
    button.onclick = () => selectAsset(item);
    list.append(button);
  });
}

function disposeModel(model) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  model.traverse(object => {
    if (!object.isMesh) return;
    geometries.add(object.geometry);
    const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
    meshMaterials.forEach(material => {
      if (!material) return;
      materials.add(material);
      Object.values(material).forEach(value => {
        if (value?.isTexture) textures.add(value);
      });
    });
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
  textures.forEach(texture => texture.dispose());
}

async function selectAsset(asset) {
  selectedFile = asset.file;
  renderList();
  const currentRequest = ++requestId;
  status.textContent = `Chargement de ${asset.label}…`;
  try {
    const path = asset.path || `amelioration/${asset.file}`;
    const gltf = await loader.loadAsync(`models/${path}`);
    if (currentRequest !== requestId) return;
    if (currentModel) {
      scene.remove(currentModel);
      disposeModel(currentModel);
    }
    currentModel = gltf.scene;
    currentModel.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(currentModel);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const span = Math.max(size.x, size.y, size.z);
    if (!Number.isFinite(span) || span <= 0) throw new Error('Le modèle ne possède pas de dimensions exploitables.');
    currentModel.position.sub(center);
    scene.add(currentModel);
    camera.position.set(span * 1.35, span * 0.95, span * 1.65);
    controls.target.set(0, 0, 0);
    controls.minDistance = span * 0.35;
    controls.maxDistance = span * 5;
    controls.update();
    status.textContent = renderer
      ? `${asset.label} · ${size.x.toFixed(1)} × ${size.y.toFixed(1)} × ${size.z.toFixed(1)} m`
      : `${asset.label} chargé ; aperçu WebGL indisponible.`;
  } catch (error) {
    if (currentRequest !== requestId) return;
    console.error(`Impossible de charger le modèle ${asset.file}.`, error);
    status.textContent = `Échec du chargement de ${asset.label}.`;
  }
}

renderFilters();
renderList();
const initial = assets.find(item => item.file === query.get('model'))
  || assets.find(item => category === 'all' || item.category === category)
  || assets[0];
selectAsset(initial);
if (renderer) {
  function animate() {
    const dt = Math.min(clock.getDelta(), 0.05);
    if (currentModel) currentModel.rotation.y += dt * 0.18;
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  resize();
  animate();
}
