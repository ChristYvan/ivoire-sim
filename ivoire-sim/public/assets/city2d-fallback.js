import { POIS } from './city-builder.js';

export function startCityFallback(canvas) {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Le navigateur ne fournit pas de contexte Canvas 2D.');

  const loading = document.querySelector('#loading');
  const help = document.querySelector('#help');
  const panel = document.querySelector('#panel');
  const panelTitle = document.querySelector('#panel-title');
  const panelBody = document.querySelector('#panel-body');
  const closePanel = document.querySelector('#panel-close');
  const esc = value => String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
  const center = { x: 90, z: -10 };
  const pointer = { x: 0, y: 0, down: false, moved: false, lastX: 0, lastY: 0 };
  const character = { x: -28, z: 70, model: 'Cozy_Chef' };
  const keys = {};
  const cars = [
    { x: -21, z: 70, icon: '🚙' }, { x: 45, z: -65, icon: '🚕' },
    { x: 92, z: -3, icon: '🚙' }, { x: 132, z: 50, icon: '🚗' },
    { x: -18, z: 30, icon: '🚕' }, { x: 176, z: 62, icon: '🚐' },
    { x: 100, z: -65, icon: '🚌' }, { x: 57, z: -15, icon: '🚘' },
  ];
  cars.forEach(vehicle => { vehicle.heading = 0; vehicle.speed = 0; });
  let activeCar = null;
  let lastFrame = 0;
  let zoom = 1;
  let width = 0;
  let height = 0;
  let scale = 1;
  let originX = 0;
  let originY = 0;
  let poiHits = [];

  function project(x, z, y = 0) {
    return {
      x: originX + ((x - center.x) - (z - center.z)) * scale * 0.7,
      y: originY + ((x - center.x) + (z - center.z)) * scale * 0.35 - y * scale * 0.7,
    };
  }

  function polygon(points, fill, stroke) {
    context.beginPath();
    points.forEach((point, index) => {
      const p = project(point[0], point[1], point[2] || 0);
      if (index === 0) context.moveTo(p.x, p.y);
      else context.lineTo(p.x, p.y);
    });
    context.closePath();
    context.fillStyle = fill;
    context.fill();
    if (stroke) {
      context.strokeStyle = stroke;
      context.lineWidth = 1;
      context.stroke();
    }
  }

  function box(x, z, w, d, h, color) {
    const corners = [
      [x - w / 2, z - d / 2], [x + w / 2, z - d / 2],
      [x + w / 2, z + d / 2], [x - w / 2, z + d / 2],
    ];
    polygon(corners.map(([px, pz]) => [px, pz, h]), color, '#243746');
    polygon([[...corners[0], h], [...corners[1], h], corners[1], corners[0]], shade(color, -24));
    polygon([[...corners[1], h], [...corners[2], h], corners[2], corners[1]], shade(color, -42));
    polygon([[...corners[0], h], [...corners[1], h], [...corners[2], h], [...corners[3], h]], shade(color, 12));
  }

  function shade(hex, amount) {
    const value = Number.parseInt(hex.slice(1), 16);
    const channels = [value >> 16, (value >> 8) & 255, value & 255]
      .map(channel => Math.max(0, Math.min(255, channel + amount)));
    return `rgb(${channels.join(',')})`;
  }

  function road(x1, z1, x2, z2, thickness) {
    const a = project(x1, z1, 0.2);
    const b = project(x2, z2, 0.2);
    context.beginPath();
    context.moveTo(a.x, a.y);
    context.lineTo(b.x, b.y);
    context.strokeStyle = '#343a42';
    context.lineWidth = thickness * scale * 0.7;
    context.lineCap = 'butt';
    context.stroke();
    context.beginPath();
    context.moveTo(a.x, a.y);
    context.lineTo(b.x, b.y);
    context.strokeStyle = '#e1c849';
    context.lineWidth = Math.max(1, scale * 0.18);
    context.setLineDash([scale * 1.3, scale * 1.2]);
    context.stroke();
    context.setLineDash([]);
  }

  const labelOffsets = {
    residentiel: [-72, -28],
    monument: [72, -10],
    centreville: [-76, 22],
    hotel: [-55, -26],
    commercial: [96, -4],
    hopital: [92, -28],
    universite: [-85, 28],
    commissariat: [88, 24],
    aeroport: [0, -25],
    port: [0, -24],
    plage: [-18, -24],
    populaire: [0, -24],
  };

  function drawPoi(poi) {
    const p = project(poi.pos[0], poi.pos[2], 2);
    const [offsetX, offsetY] = labelOffsets[poi.id] || [0, -24];
    p.x += offsetX;
    p.y += offsetY;
    const label = `${poi.icon} ${poi.name}`;
    context.font = '600 12px system-ui, sans-serif';
    const boxWidth = context.measureText(label).width + 18;
    const boxHeight = 23;
    context.fillStyle = '#0b1626e8';
    context.beginPath();
    context.roundRect(p.x - boxWidth / 2, p.y - boxHeight - 5, boxWidth, boxHeight, 7);
    context.fill();
    context.fillStyle = '#ffffff';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(label, p.x, p.y - boxHeight / 2 - 5);
    poiHits.push({ poi, x: p.x, y: p.y - boxHeight - 5, width: boxWidth, height: boxHeight + 8 });
  }

  function draw() {
    poiHits = [];
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const nextWidth = canvas.clientWidth || window.innerWidth;
    const nextHeight = canvas.clientHeight || window.innerHeight;
    if (width !== nextWidth || height !== nextHeight || canvas.width !== Math.round(nextWidth * dpr)) {
      width = nextWidth;
      height = nextHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    context.clearRect(0, 0, width, height);
    context.fillStyle = '#70b9d0';
    context.fillRect(0, 0, width, height);
    const fit = Math.min(width / 406, height / 215) * 0.86;
    scale = fit * zoom;
    originX = width / 2 + pointer.x;
    originY = height / 2 - 7 * scale + pointer.y;
    center.x = character.x + (activeCar ? activeCar.x - character.x : 0);
    center.z = character.z + (activeCar ? activeCar.z - character.z : 0);

    polygon([[-45, -165], [222, -165], [222, 140], [-45, 140]], '#73a85c');
    polygon([[-54, -165], [-43, -165], [-43, 140], [-54, 140]], '#ead39b');
    polygon([[30, -140], [30, -78], [92, -78]], '#548848');
    for (const z of [-65, -3, 50]) road(-22, z, 215, z, 8);
    road(-18, -78, -18, 135, 12);
    road(-8, -21, 214, -21, 5);

    const buildings = [];
    for (let ix = 0; ix < 4; ix += 1) {
      for (let iz = 0; iz < 4; iz += 1) {
        const central = (ix === 1 || ix === 2) && (iz === 1 || iz === 2);
        buildings.push({
          x: 4 + ix * 10.5, z: -54 + iz * 11,
          w: central ? 8.5 : 7, d: central ? 8.5 : 7,
          h: central ? 42 + ((ix + iz) % 2) * 8 : 16 + ((ix * 3 + iz) % 4) * 5,
          color: ['#5290ad', '#98aaba', '#6f8da2', '#bfaa87'][(ix + iz) % 4],
        });
      }
    }
    for (let ix = 0; ix < 5; ix += 1) {
      for (let iz = 0; iz < 5; iz += 1) {
        buildings.push({
          x: 58 + ix * 12, z: 66 + iz * 12, w: 6, d: 6,
          h: 4 + ((ix + iz) % 3), color: ['#e8dcc2', '#d9c8a6', '#d5dee0'][(ix + 2 * iz) % 3],
        });
      }
    }
    buildings.sort((a, b) => (a.x + a.z) - (b.x + b.z)).forEach(item => box(item.x, item.z, item.w, item.d, item.h, item.color));

    box(62, -30, 40, 22, 8, '#c8bda6');
    box(110, -25, 26, 16, 12, '#e5e8e7');
    box(130, -80, 50, 12, 7, '#bccbd0');
    box(38, 19, 30, 12, 8, '#a8553b');
    box(198, 115, 13, 10, 6, '#b85f3c');
    context.strokeStyle = '#91683d';
    context.lineWidth = Math.max(2, scale * 0.35);
    context.beginPath();
    [[168, 62], [210, 62], [210, 105], [168, 105], [168, 62]].forEach(([x, z], index) => {
      const p = project(x, z, 0.5);
      if (index === 0) context.moveTo(p.x, p.y);
      else context.lineTo(p.x, p.y);
    });
    context.stroke();
    const citizens = [[44, -14], [80, -12], [108, -14], [24, 7], [53, 20], [119, 43], [46, 57], [116, 58]];
    context.font = '16px system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    citizens.forEach(([x, z], index) => {
      const p = project(x, z, 0);
      context.fillText(index % 2 ? '🚶🏾' : '🚶🏿', p.x, p.y);
    });
    [['🐕', 174, 72], ['🐄', 188, 88], ['🐎', 200, 73]].forEach(([icon, x, z]) => {
      const p = project(x, z, 0);
      context.fillText(icon, p.x, p.y);
    });
    cars.forEach(vehicle => {
      const { x, z, icon } = vehicle;
      const p = project(x, z, 0);
      context.fillText(icon, p.x, p.y);
    });
    const playerPosition = activeCar || character;
    const marker = project(playerPosition.x, playerPosition.z, 0);
    context.beginPath();
    context.arc(marker.x, marker.y - 5, Math.max(8, 9 * zoom), 0, Math.PI * 2);
    context.fillStyle = '#ff7a00';
    context.fill();
    context.strokeStyle = '#ffffff';
    context.lineWidth = 2;
    context.stroke();
    context.font = '16px system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const characterIcon = character.model.startsWith('Cozy_')
      ? (keys.up || keys.down || keys.left || keys.right) && !activeCar ? '🚶🏾' : '🏃🏾'
      : character.model.startsWith('Female') ? '👩🏾' : '👨🏾';
    context.fillText(activeCar ? activeCar.icon : characterIcon, marker.x, marker.y - 6);
    for (const poi of POIS) drawPoi(poi);

    context.fillStyle = '#152337dd';
    context.beginPath();
    context.roundRect(12, height - 174, 265, 32, 10);
    context.fill();
    context.fillStyle = '#ffffff';
    context.font = '600 13px system-ui, sans-serif';
    context.textAlign = 'left';
    context.textBaseline = 'middle';
    context.fillText('Carte 2D de secours · WebGL indisponible', 24, height - 158);
    context.fillStyle = '#152337dd';
    context.beginPath();
    context.roundRect(12, 190, 245, 30, 9);
    context.fill();
    context.fillStyle = '#ffffff';
    context.font = '600 12px system-ui, sans-serif';
    context.textAlign = 'left';
    context.fillText(activeCar ? 'Au volant · Maj pour accélérer' : 'À pied · ZQSD · Maj pour courir', 22, 205);
  }

  function openPoi(poi) {
    panelTitle.textContent = `${poi.icon} ${poi.name}`;
    if (poi.id === 'boutique') {
      panelBody.innerHTML = '<p>Achète des meubles dans l’onglet 🛋️ Meubles, puis aménage tes propriétés.</p><a class="btn" href="index.html">Ouvrir le jeu</a>';
      panel.hidden = false;
      return;
    }
    const model = poi.id === 'cafe' ? 'cafe-interior.glb'
      : poi.id === 'librairie' ? 'bookstore-interior.glb' : '';
    if (model) {
      panelBody.innerHTML = `<p>Le nouvel intérieur 3D est installé dans la ville.</p><a class="btn" href="model-gallery.html?model=${encodeURIComponent(model)}">Voir le modèle 3D</a>`;
      panel.hidden = false;
      return;
    }
    if (poi.id === 'nouveau-quartier') {
      panelBody.innerHTML = '<p>Quatre nouvelles maisons ont été ajoutées à l’est de la ville.</p><a class="btn" href="model-gallery.html?category=houses">Voir les maisons</a>';
      panel.hidden = false;
      return;
    }
    panelBody.textContent = 'Point d’intérêt de la ville d’Abidjan.';
    panel.hidden = false;
  }

  function toast(message) {
    const node = document.querySelector('#toast');
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => node.classList.remove('show'), 3000);
  }

  async function saveCharacter(model) {
    try {
      const token = await fetch('api.php?action=csrf').then(response => response.json());
      if (!token.ok || !token.csrf) {
        toast('Connecte-toi pour enregistrer ton personnage.');
        return false;
      }
      const response = await fetch('api.php?action=set_character', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token.csrf },
        body: JSON.stringify({ model }),
      }).then(result => result.json());
      if (!response.ok) {
        toast(response.error || 'La sauvegarde du personnage a échoué.');
        return false;
      }
      return true;
    } catch (error) {
      console.error('Impossible de sauvegarder le personnage.', error);
      toast('Le serveur ne répond pas ; le personnage n’a pas été enregistré.');
      return false;
    }
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
    panelTitle.textContent = '🧍 Créer mon personnage';
    panelBody.innerHTML = `<p>Choisis l’apparence de ton personnage.</p><div class="character-options">${options.map(([model, icon, label]) => `<button type="button" class="character-option" data-character="${model}" aria-pressed="${character.model === model}"><span class="character-preview">${icon}</span><b>${label}</b><small>${character.model === model ? 'Sélectionné' : 'Choisir'}</small></button>`).join('')}</div>`;
    panel.hidden = false;
    panelBody.querySelectorAll('[data-character]').forEach(button => {
      button.onclick = async () => {
        button.disabled = true;
        if (!await saveCharacter(button.dataset.character)) {
          button.disabled = false;
          return;
        }
        character.model = button.dataset.character;
        document.querySelector('#character-open').textContent = character.model.startsWith('Cozy_')
          ? '🏃🏾' : character.model.startsWith('Female') ? '👩🏾' : '👨🏾';
        openCharacterCreator();
        draw();
        toast('Personnage enregistré.');
      };
    });
  }

  function enterExitVehicle() {
    if (!activeCar && Math.hypot(character.x - 70, character.z - 8) <= 8) {
      openPoi(POIS.find(poi => poi.id === 'boutique'));
      return;
    }
    if (activeCar) {
      const exit = [
        [activeCar.x + 3, activeCar.z],
        [activeCar.x - 3, activeCar.z],
        [activeCar.x, activeCar.z + 4],
      ].find(([x, z]) => !cars.some(vehicle => vehicle !== activeCar && Math.hypot(vehicle.x - x, vehicle.z - z) < 2.5));
      if (!exit) {
        toast('Aucune place libre pour sortir du véhicule.');
        return;
      }
      character.x = exit[0];
      character.z = exit[1];
      activeCar.speed = 0;
      activeCar = null;
      document.querySelector('#speedo').hidden = true;
      document.querySelector('#vehicle-interact').textContent = '🚘 Entrer (E)';
      toast('Tu es sorti. ZQSD pour marcher, Maj pour courir.');
    } else {
      const nearest = cars
        .map(vehicle => ({ vehicle, distance: Math.hypot(vehicle.x - character.x, vehicle.z - character.z) }))
        .filter(item => item.distance <= 8)
        .sort((a, b) => a.distance - b.distance)[0];
      if (!nearest) {
        toast('Approche-toi d’une voiture (8 m maximum) pour y entrer.');
        return;
      }
      activeCar = nearest.vehicle;
      document.querySelector('#speedo').hidden = false;
      document.querySelector('#vehicle-interact').textContent = '🚶 Sortir (E)';
      toast('Au volant ! ZQSD pour conduire, Maj pour courir plus vite.');
    }
    draw();
  }

  function updateMovement(timestamp) {
    const dt = Math.min((timestamp - lastFrame) / 1000 || 0, 0.05);
    lastFrame = timestamp;
    const forward = Number(keys.up) - Number(keys.down);
    const sideways = Number(keys.right) - Number(keys.left);
    if (forward || sideways) {
      const length = Math.hypot(forward, sideways);
      if (activeCar) {
        activeCar.speed += forward * 22 * dt;
        activeCar.speed = Math.max(-10, Math.min(keys.run ? 55 : 38, activeCar.speed));
        if (!forward) activeCar.speed -= Math.sign(activeCar.speed) * Math.min(Math.abs(activeCar.speed), 10 * dt);
        activeCar.heading += sideways * 1.8 * dt * Math.max(-1, Math.min(1, activeCar.speed / 8));
        activeCar.x = Math.max(-38, Math.min(215, activeCar.x + Math.sin(activeCar.heading) * activeCar.speed * dt));
        activeCar.z = Math.max(-160, Math.min(135, activeCar.z + Math.cos(activeCar.heading) * activeCar.speed * dt));
        document.querySelector('#kmh').textContent = String(Math.round(Math.abs(activeCar.speed) * 3.6));
      } else {
        const length = Math.hypot(forward, sideways);
        const speed = keys.run ? 9 : 4.5;
        const dx = (sideways / length) * speed * dt;
        const dz = (forward / length) * speed * dt;
        character.x = Math.max(-38, Math.min(215, character.x + dx));
        character.z = Math.max(-160, Math.min(135, character.z + dz));
      }
    }
    if (forward || sideways) draw();
    requestAnimationFrame(updateMovement);
  }

  canvas.addEventListener('pointerdown', event => {
    pointer.down = true;
    pointer.moved = false;
    pointer.lastX = event.clientX;
    pointer.lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', event => {
    if (!pointer.down) return;
    const dx = event.clientX - pointer.lastX;
    const dy = event.clientY - pointer.lastY;
    pointer.moved ||= Math.abs(dx) + Math.abs(dy) > 2;
    pointer.x += dx;
    pointer.y += dy;
    pointer.lastX = event.clientX;
    pointer.lastY = event.clientY;
    draw();
  });
  canvas.addEventListener('pointerup', event => {
    pointer.down = false;
    if (pointer.moved) return;
    const hit = poiHits.find(item => event.offsetX >= item.x - item.width / 2
      && event.offsetX <= item.x + item.width / 2
      && event.offsetY >= item.y && event.offsetY <= item.y + item.height);
    if (hit) openPoi(hit.poi);
  });
  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    zoom = Math.max(0.7, Math.min(2.5, zoom * (event.deltaY < 0 ? 1.1 : 0.9)));
    draw();
  }, { passive: false });
  const keyMap = {
    ArrowUp: 'up', w: 'up', z: 'up', ArrowDown: 'down', s: 'down',
    ArrowLeft: 'left', a: 'left', q: 'left', ArrowRight: 'right', d: 'right',
  };
  window.addEventListener('keydown', event => {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (key === 'Escape') {
      panel.hidden = true;
      return;
    }
    if (!panel.hidden || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    if (key === 'Shift') keys.run = true;
    if (keyMap[key]) {
      keys[keyMap[key]] = true;
      event.preventDefault();
    }
    if (key === 'e' || key === 'c') enterExitVehicle();
  });
  window.addEventListener('keyup', event => {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (key === 'Shift') keys.run = false;
    if (keyMap[key]) keys[keyMap[key]] = false;
  });
  document.querySelectorAll('#dpad [data-key]').forEach(button => {
    const setKey = value => () => { keys[button.dataset.key] = value; };
    button.addEventListener('pointerdown', setKey(true));
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(name => button.addEventListener(name, setKey(false)));
  });
  document.querySelector('#vehicle-interact').onclick = enterExitVehicle;
  document.querySelector('#character-open').onclick = openCharacterCreator;
  document.querySelector('[data-app="Personnage"]').onclick = openCharacterCreator;
  document.querySelector('[data-app="Modèles 3D"]').onclick = () => { location.href = 'model-gallery.html'; };
  document.querySelector('[data-nav="home"]').onclick = async () => {
    try {
      const result = await fetch('api.php?action=my_properties').then(response => response.json());
      if (!result.ok) {
        panelTitle.textContent = '🏠 Maison';
        panelBody.innerHTML = '<p>Connecte-toi d’abord pour voir tes propriétés.</p><a class="btn" href="index.html">Ouvrir le jeu</a>';
      } else {
        panelTitle.textContent = '🏠 Mes propriétés';
        const properties = result.properties.map(property => `<div class="row"><span>${esc(property.name)}<br><small>${esc(property.city_name)}</small></span><a class="btn small" href="house.html?property_id=${Number(property.id)}">🛋️ Aménager</a></div>`).join('');
        panelBody.innerHTML = (properties || '<p>Aucune propriété.</p>') + '<a class="btn" href="index.html">Acheter une maison</a>';
      }
      panel.hidden = false;
    } catch (error) {
      console.error('Impossible de charger les propriétés du joueur.', error);
      toast('Les propriétés ne sont pas disponibles.');
    }
  };
  document.querySelector('[data-nav="inventory"]').onclick = () => {
    panelTitle.textContent = '🎒 Inventaire';
    panelBody.innerHTML = '<p>La boutique de meubles est disponible dans l’onglet 🛋️ Meubles.</p><a class="btn" href="index.html">Ouvrir le jeu</a>';
    panel.hidden = false;
  };
  document.querySelector('[data-nav="map"]').onclick = () => { panel.hidden = true; };
  document.querySelector('[data-nav="vehicles"]').onclick = enterExitVehicle;
  document.querySelector('[data-nav="missions"]').onclick = () => toast('Missions : bientôt disponibles sur la carte 2D.');
  document.querySelector('[data-nav="money"]').onclick = () => toast('Argent : ouvre le jeu pour consulter ton compte.');
  closePanel.onclick = () => { panel.hidden = true; };
  window.addEventListener('resize', draw);
  document.querySelector('#mini').hidden = true;
  document.querySelector('#speedo').hidden = true;
  document.querySelector('#dpad').hidden = !matchMedia('(pointer: coarse)').matches;
  document.querySelector('#character-open').textContent = '👨🏾‍🍳';
  fetch('api.php?action=me').then(response => response.json()).then(result => {
    if (!result.ok) return;
    const player = result.player;
    character.model = ['Female_Casual', 'Female_Dress', 'Male_Casual', 'Male_Suit', 'Cozy_Animated', 'Cozy_Chef', 'Cozy_Space'].includes(player.character_model)
      ? player.character_model : 'Cozy_Chef';
    document.querySelector('#p-name').textContent = player.username;
    document.querySelector('#p-level').textContent = player.level;
    document.querySelector('#p-city').textContent = result.city?.name || 'Abidjan';
    document.querySelector('#p-cash').textContent = `${Number(player.cash).toLocaleString('fr-FR')} FCFA`;
    document.querySelector('#p-bank').textContent = `${Number(player.bank).toLocaleString('fr-FR')} FCFA`;
    document.querySelector('#character-open').textContent = character.model.startsWith('Cozy_')
      ? '🏃🏾' : character.model.startsWith('Female') ? '👩🏾' : '👨🏾';
    draw();
  }).catch(error => console.error('Impossible de charger le profil du joueur.', error));
  draw();
  loading.hidden = true;
  requestAnimationFrame(updateMovement);
}
