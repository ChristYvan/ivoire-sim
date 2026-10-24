// Ivoire Sim — construction de la ville 3D (formes simples, inspirées de la photo de référence)
// Repère : x = est (la mer est à l'ouest, x < -40), z = sud, y = hauteur. 1 unité ≈ 1 mètre.
import * as THREE from 'three';

export const HILL = { x: 30, z: -140, r: 62, h: 26 };
export const BOUNDS = { minX: -38, maxX: 215, minZ: -160, maxZ: 135 };

export function groundY(x, z) {
  const d = Math.hypot(x - HILL.x, z - HILL.z);
  if (d >= HILL.r) return 0;
  const t = 1 - d / HILL.r;
  return HILL.h * t * t * (3 - 2 * t);
}

// Lieux affichés sur la carte (pos = [x, hauteur de l'étiquette, z])
export const POIS = [
  { id: 'residentiel', name: 'Quartier résidentiel', icon: '🏠', pos: [0, 20, -100] },
  { id: 'monument',    name: 'Monument',             icon: '📍', pos: [30, 42, -140] },
  { id: 'centreville', name: 'Centre-ville',         icon: '🏙️', pos: [20, 62, -35] },
  { id: 'hotel',       name: 'Hôtel',                icon: '🛏️', pos: [2, 17, 13] },
  { id: 'commercial',  name: 'Centre commercial',    icon: '🛒', pos: [62, 13, -30] },
  { id: 'hopital',     name: 'Hôpital',              icon: '➕', pos: [110, 19, -25] },
  { id: 'universite',  name: 'Université',           icon: '🎓', pos: [38, 14, 14] },
  { id: 'commissariat',name: 'Commissariat',         icon: '🛡️', pos: [100, 15, 18] },
  { id: 'boutique',    name: 'Boutique de meubles',  icon: '🛋️', pos: [70, 11, 8] },
  { id: 'aeroport',    name: 'Aéroport',             icon: '✈️', pos: [150, 18, -100] },
  { id: 'port',        name: 'Port',                 icon: '⚓', pos: [-50, 20, -20] },
  { id: 'plage',       name: 'Plage',                icon: '🏖️', pos: [-33, 9, 60] },
  { id: 'populaire',   name: 'Quartier populaire',   icon: '🏠', pos: [82, 12, 86] },
  { id: 'cafe',        name: 'Café',                  icon: '☕', pos: [120, 7, 65] },
  { id: 'librairie',   name: 'Librairie',             icon: '📚', pos: [135, 7, 65] },
  { id: 'nouveau-quartier', name: 'Nouveau quartier', icon: '🏡', pos: [155, 15, 120] },
];

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

export function buildCity() {
  const rand = rng(2026);
  const pick = arr => arr[Math.floor(rand() * arr.length)];
  const scene = new THREE.Scene();
  const skyColor = new THREE.Color(0xa9d4f5);
  scene.background = skyColor;
  scene.fog = new THREE.Fog(skyColor, 320, 1200);

  // ---------- Lumières ----------
  scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x55703f, 1.0));
  const sun = new THREE.DirectionalLight(0xfff0d2, 2.4);
  sun.target.position.set(80, 0, -10);
  sun.position.set(200, 190, 80);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -190, right: 190, top: 190, bottom: -190, near: 10, far: 600 });
  sun.shadow.bias = -0.0004;
  scene.add(sun, sun.target);

  // ---------- Outils ----------
  const matCache = new Map();
  const M = (color, extra) => {
    if (extra) return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05, ...extra });
    if (!matCache.has(color)) matCache.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05 }));
    return matCache.get(color);
  };
  const add = (obj, cast = true, receive = true) => {
    obj.traverse?.(o => { if (o.isMesh) { o.castShadow = cast; o.receiveShadow = receive; } });
    scene.add(obj);
    return obj;
  };
  const box = (w, h, d, color, x, y, z, extra) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M(color, extra));
    m.position.set(x, y + h / 2, z);
    return add(m);
  };
  const flat = (w, d, color, x, y, z, extra) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), M(color, extra));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    m.receiveShadow = true;
    scene.add(m);
    return m;
  };
  const solids = [];   // zones où la voiture ne peut pas passer : [x1, z1, x2, z2]
  const reserved = []; // zones où on ne plante pas d'arbres
  const solid = (x, z, w, d) => solids.push([x - w / 2, z - d / 2, x + w / 2, z + d / 2]);
  const reserve = (x, z, w, d) => reserved.push([x - w / 2, z - d / 2, x + w / 2, z + d / 2]);
  const inRects = (rects, x, z, m = 0) => rects.some(r => x > r[0] - m && x < r[2] + m && z > r[1] - m && z < r[3] + m);
  const blocked = (x, z, m = 2) => inRects(solids, x, z, m) || inRects(reserved, x, z, m);

  function labelPlane(text, w, h, bg, fg) {
    if (typeof document === 'undefined') return new THREE.Mesh(new THREE.PlaneGeometry(w, h), M(bg));
    const c = document.createElement('canvas');
    c.width = 256; c.height = Math.round(256 * h / w);
    const g = c.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = fg; g.font = `bold ${Math.round(c.height * 0.6)}px sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, c.width / 2, c.height / 2 + 2);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t }));
  }

  function windowTexture(base, lit) {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = 64; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, 64, 128);
    g.fillStyle = lit;
    for (let y = 6; y < 128; y += 12) for (let x = 6; x < 64; x += 12) g.fillRect(x, y, 6, 7);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  // ---------- Terrain, mer, plage ----------
  flat(3200, 3200, 0x4f8a42, 800, -0.4, 0);               // sol lointain
  flat(260, 300, 0x5f9e4b, 90, 0, -10);                    // terre
  flat(1500, 2400, 0x1f8fb8, -790, 0.1, 0, { roughness: 0.25, metalness: 0.1 }); // mer
  flat(26, 300, 0x3fd0c9, -53, 0.15, -10, { roughness: 0.3 });                   // eau peu profonde
  flat(14, 108, 0xe8d2a0, -33, 0.12, 76);                  // plage
  flat(14, 72, 0x9b9b95, -33, 0.12, -14);                  // quai / zone portuaire

  // Colline avec relief
  {
    const g = new THREE.PlaneGeometry(HILL.r * 2, HILL.r * 2, 64, 64);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const px = p.getX(i) + HILL.x, pz = p.getZ(i) + HILL.z;
      p.setXYZ(i, px, groundY(px, pz) + 0.05, pz);
    }
    g.computeVertexNormals();
    const hill = new THREE.Mesh(g, M(0x47873c, { flatShading: true }));
    hill.receiveShadow = true;
    scene.add(hill);
  }

  // ---------- Routes ----------
  const ROAD = 0x2f333a;
  const road = (x, z, w, d) => { flat(w, d, ROAD, x, 0.2, z); reserve(x, z, w, d); };
  road(-18, 30, 12, 210);                       // grande avenue le long de la plage
  const STREETS = [-65, -3, 50];
  STREETS.forEach(z => road(101.5, z, 227, 8)); // rues est-ouest
  for (let z = -70; z < 130; z += 8) flat(0.5, 3.5, 0xf2c200, -18, 0.3, z);
  STREETS.forEach(zs => { for (let x = -8; x < 214; x += 8) flat(3.5, 0.4, 0xffffff, x, 0.3, zs); });

  // ---------- Centre-ville : tours ----------
  const glassPalette = [
    ['#2d6a8f', '#bfe3f5'], ['#3b82a8', '#d8f0ff'], ['#8fa6b8', '#eef6fb'], ['#b9b4a6', '#f6f0dc'], ['#2b3a4a', '#9fc4e0'],
  ];
  const glassTex = glassPalette.map(([b, l]) => windowTexture(b, l));
  const downtownPlaceholder = new THREE.Group();
  scene.add(downtownPlaceholder);
  function tower(x, z, w, d, h, idx) {
    const [baseCss] = glassPalette[idx];
    const base = new THREE.Color(baseCss);
    const tex = glassTex[idx];
    let side;
    if (tex) {
      const t = tex.clone(); t.needsUpdate = true; t.repeat.set(Math.max(w, d) / 7, h / 14);
      side = new THREE.MeshStandardMaterial({ map: t, roughness: 0.35, metalness: 0.35 });
    } else {
      side = new THREE.MeshStandardMaterial({ color: base, roughness: 0.35, metalness: 0.35 });
    }
    const top = M(0x6d7278);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, top, top, side, side]);
    m.position.set(x, h / 2, z);
    downtownPlaceholder.add(m);
    solid(x, z, w, d);
  }
  for (let ix = 0; ix < 4; ix++) {
    for (let iz = 0; iz < 4; iz++) {
      const x = 4 + ix * 10.5, z = -54 + iz * 11;
      const central = (ix === 1 || ix === 2) && (iz === 1 || iz === 2);
      const h = central ? 34 + rand() * 20 : 12 + rand() * 20;
      tower(x, z, 7, 7, h, Math.floor(rand() * glassPalette.length));
    }
  }

  // ---------- Hôtel + piscine ----------
  box(22, 10, 14, 0xe6dcc4, 2, 0, 13); box(16, 5, 10, 0xd9cfb6, 2, 10, 13);
  solid(2, 13, 22, 14);
  flat(8, 5, 0x38c8e0, 18, 0.3, 13, { roughness: 0.2 }); reserve(18, 13, 8, 5);

  // ---------- Centre commercial + parking ----------
  box(40, 7, 22, 0xd8ccb2, 62, 0, -30); box(40.4, 2.6, 22.4, 0x3a5a70, 62, 2.2, -30);
  solid(62, -30, 40, 22);
  flat(40, 8, 0x44484f, 62, 0.2, -15); reserve(62, -15, 40, 8);
  const carColors = [0xf28c28, 0xffffff, 0x1c1c1c, 0x8a8f96, 0xc0392b, 0x2c5aa0, 0xf5f0e6];
  const vehicles = [];
  const vehicleModels = ['NormalCar1', 'NormalCar2', 'SUV', 'SportsCar', 'Taxi', 'ClassicConvertible'];
  function makeCar(color, modelName = vehicleModels[Math.floor(rand() * vehicleModels.length)]) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.8, 4.2), M(color));
    body.position.y = 0.85;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.7, 2.2), M(0x22303c));
    cab.position.set(0, 1.55, -0.2);
    const modelSlot = new THREE.Group();
    modelSlot.name = 'modelSlot';
    g.add(body, cab, modelSlot);
    const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.4, 10);
    wheelGeo.rotateZ(Math.PI / 2);
    [[-1, 1.3], [1, 1.3], [-1, -1.3], [1, -1.3]].forEach(([wx, wz]) => {
      const w = new THREE.Mesh(wheelGeo, M(0x111111));
      w.position.set(wx, 0.45, wz);
      g.add(w);
    });
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    vehicles.push({ root: g, modelSlot, modelName });
    return g;
  }
  for (let i = 0; i < 12; i++) {
    const c = makeCar(pick(carColors), vehicleModels[i % vehicleModels.length]);
    c.position.set(45 + i * 3, 0.2, -15 + (i % 2 ? 1.5 : -1.5));
    scene.add(c);
  }
  for (const [x, z] of [[168, 62], [210, 62], [168, 105], [210, 105]]) {
    box(0.8, 1.4, 0.8, 0x80552c, x, 0, z);
  }
  for (const z of [62, 105]) box(42, 0.45, 0.35, 0x9c7043, 189, 0.55, z);
  for (const x of [168, 210]) box(0.35, 0.45, 43, 0x9c7043, x, 0.55, 83.5);
  box(13, 6, 10, 0xb85f3c, 198, 0, 115);

  // ---------- Hôpital ----------
  box(26, 12, 16, 0xf1f1ee, 110, 0, -25);
  box(1.4, 6, 0.4, 0xd62828, 110, 3, -16.8); box(6, 1.4, 0.4, 0xd62828, 110, 5.3, -16.8);
  solid(110, -25, 26, 16);

  // ---------- Commissariat ----------
  box(24, 8, 12, 0xe8edf2, 100, 0, 18); box(24.2, 2.2, 12.2, 0x2f5fa8, 100, 5, 18);
  solid(100, 18, 24, 12);
  const sign = labelPlane('POLICE', 10, 2, '#2f5fa8', '#ffffff');
  sign.position.set(100, 6.1, 24.2); scene.add(sign);
  flat(24, 10, 0x44484f, 100, 0.2, 31); reserve(100, 31, 24, 10);
  for (let i = 0; i < 8; i++) { const c = makeCar(i % 3 ? 0xffffff : 0x2f5fa8, i % 2 ? 'NormalCar1' : 'Cop'); c.position.set(91 + i * 3, 0.2, 31); scene.add(c); }

  // ---------- Boutique de meubles ----------
  box(12, 5, 9, 0xd66b35, 70, 0, 14);
  box(12.2, 0.5, 9.2, 0x292e38, 70, 5, 14);
  const furnitureSign = labelPlane('MEUBLES', 8, 1.5, '#e87532', '#ffffff');
  furnitureSign.position.set(70, 3.6, 9.4); scene.add(furnitureSign);
  solid(70, 14, 12, 9);

  // ---------- Université + terrain de foot ----------
  box(30, 8, 4, 0xa8553b, 38, 0, 19); box(4, 8, 10, 0xa8553b, 25, 0, 12); box(4, 8, 10, 0xa8553b, 51, 0, 12);
  flat(22, 8, 0x6ab04c, 38, 0.2, 12);
  solid(38, 14, 30, 14);
  flat(26, 14, 0x3f9a3f, 38, 0.2, 34); reserve(38, 34, 26, 14);
  flat(26.4, 0.3, 0xffffff, 38, 0.3, 27); flat(26.4, 0.3, 0xffffff, 38, 0.3, 41);
  flat(0.3, 14.4, 0xffffff, 25, 0.3, 34); flat(0.3, 14.4, 0xffffff, 51, 0.3, 34); flat(0.3, 14, 0xffffff, 38, 0.3, 34);

  // ---------- Aéroport ----------
  flat(100, 12, 0x3a3d42, 150, 0.2, -108); reserve(150, -108, 100, 12);
  for (let x = 104; x < 198; x += 8) flat(4, 0.5, 0xffffff, x, 0.3, -108);
  flat(60, 14, 0x6a6e73, 130, 0.25, -95); reserve(130, -95, 60, 14);
  box(50, 6, 12, 0xcfd3d6, 130, 0, -80); box(50.4, 2.4, 12.4, 0x4f86b8, 130, 2.2, -80);
  solid(130, -80, 50, 12);
  {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2, 22, 12), M(0xdedede));
    stem.position.set(175, 11, -80);
    add(stem);
    box(5, 3, 5, 0x7fb2d6, 175, 22, -80);
    solid(175, -80, 5, 5);
  }
  function makePlane() {
    const g = new THREE.Group();
    const fus = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 16, 12), M(0xffffff));
    fus.rotation.z = Math.PI / 2;
    const nose = new THREE.Mesh(new THREE.SphereGeometry(1.4, 12, 8), M(0xffffff));
    nose.position.x = 8;
    const wings = new THREE.Mesh(new THREE.BoxGeometry(3, 0.3, 20), M(0xe9eef2));
    const fin = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 0.3), M(0xff7a00));
    fin.position.set(-7, 2.2, 0);
    const tailWing = new THREE.Mesh(new THREE.BoxGeometry(2, 0.3, 6), M(0xe9eef2));
    tailWing.position.set(-7, 0.4, 0);
    g.add(fus, nose, wings, fin, tailWing);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return g;
  }
  const parked = makePlane(); parked.position.set(125, 2.2, -95); add(parked);
  const flyer = makePlane(); flyer.position.set(-100, 55, -120); add(flyer, false, false);

  // ---------- Port : quai, conteneurs, grues, navire ----------
  box(24, 0.6, 44, 0x8c8f93, -50, 0, -20);
  const contColors = [0xc0392b, 0x2e86c1, 0xe67e22, 0x27ae60, 0xf1c40f, 0x7f8c8d];
  for (let ix = 0; ix < 3; ix++) {
    for (let iz = 0; iz < 6; iz++) {
      const stack = 1 + Math.floor(rand() * 3);
      for (let s = 0; s < stack; s++) box(2.4, 2.4, 5, pick(contColors), -58 + ix * 3.2, 0.6 + s * 2.4, -38 + iz * 6.2);
    }
  }
  [-12, -30].forEach(z => {
    box(1.2, 16, 1.2, 0xe67e22, -62, 0.6, z); box(1.2, 16, 1.2, 0xe67e22, -42, 0.6, z);
    box(36, 1.4, 1.6, 0xe67e22, -52, 16.6, z);
  });
  const ship = new THREE.Group();
  {
    const part = (w, h, d, c, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M(c)); m.position.set(x, y + h / 2, z); ship.add(m); };
    part(12, 5, 46, 0x2d3e5e, 0, 0, 0); part(12.2, 1.5, 46.2, 0xa83232, 0, 0, 0);
    part(9, 9, 8, 0xf4f4f4, 0, 5, 17);
    for (let ix = 0; ix < 3; ix++) for (let iz = 0; iz < 4; iz++) part(2.8, 2.4, 5, pick(contColors), -3.4 + ix * 3.4, 5, -17 + iz * 6);
  }
  ship.position.set(-80, 0.1, 25);
  add(ship);
  const boats = [[-60, 50], [-76, 82], [-56, 104]].map(([x, z]) => {
    const b = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1, 6), M(0xffffff)); hull.position.y = 0.5;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1, 2.5), M(0xdfe9f0)); cab.position.set(0, 1.5, -0.5);
    b.add(hull, cab);
    b.position.set(x, 0.1, z); b.rotation.y = rand() * 3;
    return add(b);
  });
  box(22, 0.6, 2, 0x8a6a45, -50, 0, 70); box(22, 0.6, 2, 0x8a6a45, -48, 0, 95);

  // ---------- Maisons ----------
  const improvementHomes = [];
  const wallColors = [0xe9dcc3, 0xd8c7a3, 0xcfd8dc, 0xf2e6d0];
  const roofColors = [0xb5532f, 0xc8703a, 0x7a4a3a, 0x8a8f94];
  function house(x, y, z, rot, s) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 6), M(pick(wallColors)));
    body.position.y = 2;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(5, 2.5, 4), M(pick(roofColors)));
    roof.rotation.y = Math.PI / 4; roof.position.y = 5.25;
    g.add(body, roof);
    g.position.set(x, y, z); g.rotation.y = rot; g.scale.setScalar(s);
    add(g);
    solid(x, z, 7 * s, 7 * s);
  }
  // Quartier populaire (grille)
  for (let k = 0; k < 4; k++) flat(4, 66, ROAD, 64 + k * 12, 0.2, 86);
  for (let k = 0; k < 4; k++) flat(60, 4, ROAD, 82, 0.2, 68 + k * 12);
  reserve(82, 86, 60, 66);
  for (let ix = 0; ix < 5; ix++) {
    for (let iz = 0; iz < 5; iz++) house(58 + ix * 12, 0, 62 + iz * 12, Math.floor(rand() * 4) * Math.PI / 2, 0.9 + rand() * 0.25);
  }
  // Quartier résidentiel sur la colline
  for (let n = 0, tries = 0; n < 40 && tries < 400; tries++) {
    const a = rand() * Math.PI * 2, r = 12 + rand() * (HILL.r - 22);
    const x = HILL.x + Math.cos(a) * r, z = HILL.z + Math.sin(a) * r;
    if (x < -28 || z > -80 || blocked(x, z, 5)) continue;
    house(x, groundY(x, z), z, rand() * Math.PI * 2, 1);
    n++;
  }
  [
    { model: 'adobe-house.glb', x: 120, z: 120 },
    { model: 'bungalow.glb', x: 143, z: 120 },
    { model: 'modern-house.glb', x: 166, z: 120 },
    { model: 'colonial-house.glb', x: 189, z: 120 },
  ].forEach(home => {
    improvementHomes.push({ ...home, y: groundY(home.x, home.z) });
    solid(home.x, home.z, 12, 10);
  });
  const improvementInteriors = [
    { model: 'cafe-interior.glb', x: 120, z: 65 },
    { model: 'bookstore-interior.glb', x: 135, z: 65 },
  ];
  improvementInteriors.forEach(place => solid(place.x, place.z, 7, 7));

  // ---------- Monument sur la colline ----------
  {
    const y = groundY(HILL.x, HILL.z);
    box(8, 6, 8, 0xc9c5bb, HILL.x, y, HILL.z);
    box(2, 10, 2, 0xe8e4da, HILL.x, y + 6, HILL.z);
    box(13, 1.5, 1.5, 0xe8e4da, HILL.x, y + 13, HILL.z);
    const head = new THREE.Mesh(new THREE.SphereGeometry(1.2, 10, 8), M(0xe8e4da));
    head.position.set(HILL.x, y + 17.2, HILL.z); add(head);
  }

  // ---------- Végétation ----------
  function palm(x, z) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, 7, 6), M(0x8a6a45));
    trunk.position.y = 3.5; trunk.rotation.z = (rand() - 0.5) * 0.15;
    g.add(trunk);
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 4.2), M(0x2f8f3a));
      leaf.position.set(0, 7.1, 0);
      leaf.rotation.set(0.5, (i / 6) * Math.PI * 2, 0, 'YXZ');
      leaf.translateZ(1.9);
      g.add(leaf);
    }
    g.position.set(x, groundY(x, z), z);
    add(g, true, false);
  }
  function tree(x, z) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 2.4, 6), M(0x6b4a2b)); trunk.position.y = 1.2;
    const crown = new THREE.Mesh(new THREE.SphereGeometry(2.2 + rand(), 8, 6), M(pick([0x2f7d32, 0x3b8f3a, 0x4a9d44])));
    crown.position.y = 4;
    g.add(trunk, crown);
    g.position.set(x, groundY(x, z), z);
    add(g, true, false);
  }
  for (let z = -70; z < 135; z += 14) { if (!blocked(-27, z, 1)) palm(-27, z); if (!blocked(-8, z, 1)) palm(-8, z); }
  for (let z = 26; z < 130; z += 12) palm(-30, z + rand() * 4);
  for (let n = 0, t = 0; n < 130 && t < 800; t++) {
    const x = -8 + rand() * 215, z = -62 + rand() * 190;
    if (blocked(x, z, 3)) continue;
    tree(x, z); n++;
  }
  for (let n = 0, t = 0; n < 80 && t < 600; t++) {
    const a = rand() * Math.PI * 2, r = rand() * HILL.r;
    const x = HILL.x + Math.cos(a) * r, z = HILL.z + Math.sin(a) * r;
    if (x < -28 || z > -75 || blocked(x, z, 4)) continue;
    tree(x, z); n++;
  }
  // Parasols sur la plage
  for (let i = 0; i < 9; i++) {
    const x = -36 + rand() * 6, z = 30 + rand() * 90;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.2, 5), M(0xeeeeee)); pole.position.set(x, 1.1, z);
    const top = new THREE.Mesh(new THREE.ConeGeometry(1.6, 0.7, 8), M(pick([0xff5a5f, 0xffc300, 0x1e90ff, 0xffffff]))); top.position.set(x, 2.4, z);
    add(pole, true, false); add(top, true, false);
  }

  // ---------- Nuages ----------
  const clouds = [];
  for (let i = 0; i < 9; i++) {
    const c = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(10 + rand() * 8, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }));
      s.position.set(k * 12 - 18, rand() * 4, rand() * 8); s.scale.y = 0.45;
      c.add(s);
    }
    c.position.set(-300 + rand() * 700, 110 + rand() * 40, -250 + rand() * 450);
    scene.add(c); clouds.push(c);
  }

  // ---------- Trafic ----------
  const traffic = [];
  const addTraffic = (axis, fixed, dir, s0, min, max, speed, modelName) => {
    const car = makeCar(pick(carColors), modelName);
    scene.add(car);
    const v = { car, axis, dir, s: s0, min, max, speed };
    if (axis === 'z') { car.position.x = fixed; car.rotation.y = dir > 0 ? 0 : Math.PI; }
    else { car.position.z = fixed; car.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
    traffic.push(v);
  };
  for (let i = 0; i < 7; i++) {
    addTraffic('z', -21, 1, -70 + i * 29, -75, 135, 8 + rand() * 6);
    addTraffic('z', -15, -1, -60 + i * 29, -75, 135, 8 + rand() * 6);
  }
  STREETS.forEach(zs => {
    for (let i = 0; i < 3; i++) {
      addTraffic('x', zs + 2, 1, -5 + i * 70, -12, 215, 8 + rand() * 5);
      addTraffic('x', zs - 2, -1, 20 + i * 70, -12, 215, 8 + rand() * 5);
    }
  });
  addTraffic('x', -65, 1, -12, -12, 215, 8, 'CityBus');

  // ---------- Voiture du joueur ----------
  const playerCar = makeCar(0xe63946, 'SUV');
  playerCar.position.set(-21, 0.2, 70);
  scene.add(playerCar);

  // ---------- Animation ----------
  function update(dt, t) {
    for (const v of traffic) {
      if (v.car.userData.playerControlled) {
        v.s = v.axis === 'z' ? v.car.position.z : v.car.position.x;
        continue;
      }
      v.s += v.dir * v.speed * dt;
      if (v.dir > 0 && v.s > v.max) v.s = v.min;
      if (v.dir < 0 && v.s < v.min) v.s = v.max;
      if (v.axis === 'z') v.car.position.z = v.s; else v.car.position.x = v.s;
    }
    ship.position.y = 0.1 + Math.sin(t * 0.8) * 0.15;
    ship.rotation.z = Math.sin(t * 0.6) * 0.012;
    boats.forEach((b, i) => { b.position.y = 0.1 + Math.sin(t * 1.2 + i) * 0.12; b.rotation.z = Math.sin(t + i) * 0.03; });
    flyer.position.x += 14 * dt;
    if (flyer.position.x > 260) flyer.position.x = -120;
    clouds.forEach(c => { c.position.x += 2 * dt; if (c.position.x > 450) c.position.x = -350; });
  }

  return { scene, update, pois: POIS, playerCar, groundY, solids, bounds: BOUNDS, sun, downtownPlaceholder, vehicles, improvementHomes, improvementInteriors, shop: { x: 70, z: 8 } };
}
