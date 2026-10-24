const CATEGORIES = {
  salon: '🛋️ Salon',
  chambre: '🛏️ Chambre',
  cuisine: '🍳 Cuisine',
  salle_de_bain: '🛁 Salle de bain',
  decoration: '🪴 Décoration',
  eclairage: '💡 Éclairage',
  portes_fenetres: '🚪 Portes et fenêtres',
};

export function startHouseFallback(canvas) {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Le navigateur ne fournit pas de contexte Canvas 2D.');

  const $ = selector => document.querySelector(selector);
  const escapeHTML = value => String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
  let csrf = '';
  let properties = [];
  let propertyId = 0;
  let room = { w: 10, d: 8 };
  let inventory = [];
  let placed = [];
  let selected = null;
  let dragging = false;
  let width = 0;
  let height = 0;
  let dpr = 1;
  let roomRect = { x: 0, y: 0, w: 0, h: 0 };

  function toast(message) {
    const node = $('#toast');
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => node.classList.remove('show'), 2600);
  }

  async function request(action, data = null, query = '') {
    try {
      const options = {};
      if (data !== null) {
        if (!csrf) {
          const tokenResponse = await fetch('api.php?action=csrf');
          const token = await tokenResponse.json();
          if (!tokenResponse.ok || !token.ok || !token.csrf) {
            return { ok: false, error: 'Session expirée. Recharge la page et reconnecte-toi.' };
          }
          csrf = token.csrf;
        }
        options.method = 'POST';
        options.headers = { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf };
        options.body = JSON.stringify(data);
      }
      const response = await fetch(`api.php?action=${encodeURIComponent(action)}${query}`, options);
      const result = await response.json();
      if (response.status === 419 && data !== null) {
        csrf = '';
        return request(action, data, query);
      }
      return response.ok ? result : { ok: false, error: result.error || 'La requête a échoué.' };
    } catch (error) {
      console.error(`La requête ${action} a échoué.`, error);
      return { ok: false, error: 'Impossible de contacter le serveur.' };
    }
  }

  function roomPoint(event) {
    const bounds = canvas.getBoundingClientRect();
    const px = event.clientX - bounds.left;
    const py = event.clientY - bounds.top;
    return {
      x: ((px - roomRect.x) / roomRect.w - 0.5) * room.w,
      z: ((py - roomRect.y) / roomRect.h - 0.5) * room.d,
      px,
      py,
    };
  }

  function itemDimensions(item) {
    const slug = item.slug || '';
    if (/^(bed|couch|bathroom_bathtub)/.test(slug)) return [1.8, 1.1];
    if (/^(bookshelf|kitchen_|fireplace|bathroom_shower)/.test(slug)) return [1.1, 0.75];
    return [0.75, 0.7];
  }

  function draw() {
    const nextWidth = canvas.clientWidth || innerWidth;
    const nextHeight = canvas.clientHeight || innerHeight;
    dpr = Math.min(devicePixelRatio || 1, 1.5);
    if (width !== nextWidth || height !== nextHeight || canvas.width !== Math.round(nextWidth * dpr)) {
      width = nextWidth;
      height = nextHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    context.fillStyle = '#1a2438';
    context.fillRect(0, 0, width, height);

    const inventoryHeight = $('#inv').classList.contains('open') ? $('#inv').clientHeight : 58;
    const availableHeight = Math.max(180, height - inventoryHeight - 110);
    const scale = Math.min((width - 60) / room.w, availableHeight / room.d);
    roomRect = {
      x: (width - room.w * scale) / 2,
      y: 80 + Math.max(0, (availableHeight - room.d * scale) / 2),
      w: room.w * scale,
      h: room.d * scale,
    };

    context.fillStyle = '#b58c62';
    context.fillRect(roomRect.x, roomRect.y, roomRect.w, roomRect.h);
    context.strokeStyle = '#f0e6d2';
    context.lineWidth = 10;
    context.strokeRect(roomRect.x, roomRect.y, roomRect.w, roomRect.h);
    context.strokeStyle = '#8c6a4d';
    context.lineWidth = 1;
    for (let z = 1; z < room.d; z += 1) {
      const y = roomRect.y + roomRect.h * z / room.d;
      context.beginPath();
      context.moveTo(roomRect.x, y);
      context.lineTo(roomRect.x + roomRect.w, y);
      context.stroke();
    }
    placed.forEach(item => {
      const [itemW, itemD] = itemDimensions(item);
      const x = roomRect.x + (Number(item.x) / room.w + 0.5) * roomRect.w;
      const y = roomRect.y + (Number(item.z) / room.d + 0.5) * roomRect.h;
      const displayW = Math.max(52, itemW * scale);
      const displayH = Math.max(32, itemD * scale);
      context.save();
      context.translate(x, y);
      context.rotate(Number(item.rot) || 0);
      context.fillStyle = Number(item.id) === Number(selected) ? '#ff7a00' : '#263b58';
      context.strokeStyle = Number(item.id) === Number(selected) ? '#fff' : '#a9c1de';
      context.lineWidth = 2;
      context.fillRect(-displayW / 2, -displayH / 2, displayW, displayH);
      context.strokeRect(-displayW / 2, -displayH / 2, displayW, displayH);
      context.fillStyle = '#fff';
      context.font = '12px system-ui, sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(String(item.name).slice(0, 10), 0, 0, displayW - 8);
      context.restore();
    });
  }

  function selectItem(item) {
    selected = item ? Number(item.id) : null;
    const selectedItem = placed.find(value => Number(value.id) === selected);
    $('#tools').hidden = !selectedItem;
    if (selectedItem) $('#sel-name').textContent = selectedItem.name;
    draw();
  }

  function renderInventory() {
    const total = inventory.reduce((sum, item) => sum + Number(item.left_qty), 0);
    $('#inv-count').textContent = `(${total})`;
    if (!inventory.length) {
      $('#inv-list').innerHTML = '<p class="cat" style="text-transform:none">Aucun meuble à poser. Achète-en dans l’onglet Meubles du jeu.</p>';
      return;
    }
    let html = '';
    let previousCategory = '';
    for (const item of inventory) {
      if (item.category !== previousCategory) {
        html += `<div class="cat">${CATEGORIES[item.category] || escapeHTML(item.category)}</div>`;
        previousCategory = item.category;
      }
      html += `<div class="item"><span>${escapeHTML(item.name)}<br><small>x${Number(item.left_qty)} à poser</small></span><button type="button" data-place="${Number(item.id)}">Poser</button></div>`;
    }
    $('#inv-list').innerHTML = html;
  }

  async function loadHouse(id = 0) {
    const query = id ? `&property_id=${encodeURIComponent(id)}` : '';
    const result = await request('house', null, query);
    if (!result.ok) {
      $('#msg').innerHTML = '<h2>Connecte-toi d’abord</h2><p>Ouvre le jeu et connecte-toi pour aménager ta maison.</p><a class="btn" href="index.html">Ouvrir le jeu</a>';
      $('#msg').hidden = false;
      return;
    }
    if (!result.current) {
      $('#msg').innerHTML = '<h2>Tu n’as pas encore de maison</h2><p>Achète une propriété dans le jeu avant de revenir ici.</p><a class="btn" href="index.html">Acheter une maison</a>';
      $('#msg').hidden = false;
      return;
    }

    const current = result.current;
    properties = result.properties;
    propertyId = Number(current.property.id);
    room = { w: Number(current.room.w), d: Number(current.room.d) };
    placed = current.placed.map(item => ({ ...item, id: Number(item.id) }));
    inventory = current.inventory;
    $('#prop').innerHTML = properties.map(property =>
      `<option value="${Number(property.id)}"${Number(property.id) === propertyId ? ' selected' : ''}>🏠 ${escapeHTML(property.name)} — ${escapeHTML(property.city_name)}</option>`
    ).join('');
    $('#room-info').textContent = `Pièce ${room.w} × ${room.d} m`;
    $('#msg').hidden = true;
    renderInventory();
    selectItem(null);
    draw();
  }

  $('#prop').onchange = () => loadHouse(Number($('#prop').value));
  $('#inv-toggle').onclick = () => {
    $('#inv').classList.toggle('open');
    draw();
  };
  $('#inv-list').addEventListener('click', async event => {
    const button = event.target.closest('[data-place]');
    if (!button) return;
    button.disabled = true;
    const furnitureId = Number(button.dataset.place);
    const result = await request('place_furniture', {
      property_id: propertyId, furniture_id: furnitureId, x: 0, z: 0, rot: 0,
    });
    if (!result.ok) {
      toast(result.error || 'Impossible de poser ce meuble.');
      button.disabled = false;
      return;
    }
    const item = inventory.find(value => Number(value.id) === furnitureId);
    placed.push({ id: result.id, x: result.x, z: result.z, rot: result.rot, name: item.name, slug: item.slug });
    await loadHouse(propertyId);
    selectItem(result);
  });

  canvas.addEventListener('pointerdown', event => {
    const point = roomPoint(event);
    const found = [...placed].reverse().find(item => {
      const [itemW, itemD] = itemDimensions(item);
      const scale = roomRect.w / room.w;
      const hitW = Math.max(itemW, 52 / scale);
      const hitD = Math.max(itemD, 32 / scale);
      return Math.abs(point.x - Number(item.x)) <= hitW / 2
        && Math.abs(point.z - Number(item.z)) <= hitD / 2;
    });
    if (!found) {
      selectItem(null);
      return;
    }
    selectItem(found);
    dragging = true;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', event => {
    if (!dragging || selected === null) return;
    const point = roomPoint(event);
    const item = placed.find(value => Number(value.id) === selected);
    if (!item) return;
    const [itemW, itemD] = itemDimensions(item);
    item.x = Math.max(-room.w / 2 + itemW / 2, Math.min(room.w / 2 - itemW / 2, point.x));
    item.z = Math.max(-room.d / 2 + itemD / 2, Math.min(room.d / 2 - itemD / 2, point.z));
    draw();
  });
  canvas.addEventListener('pointerup', async () => {
    if (!dragging || selected === null) return;
    dragging = false;
    const item = placed.find(value => Number(value.id) === selected);
    if (!item) return;
    const result = await request('move_furniture', { id: item.id, x: item.x, z: item.z, rot: item.rot });
    if (!result.ok) toast(result.error || 'La position du meuble n’a pas été sauvegardée.');
  });
  canvas.addEventListener('pointercancel', () => { dragging = false; });

  $('#btn-rot').onclick = async () => {
    const item = placed.find(value => Number(value.id) === selected);
    if (!item) return;
    item.rot = (Number(item.rot) || 0) + Math.PI / 2;
    draw();
    const result = await request('move_furniture', { id: item.id, x: item.x, z: item.z, rot: item.rot });
    if (!result.ok) toast(result.error || 'La rotation n’a pas été sauvegardée.');
  };
  $('#btn-del').onclick = async () => {
    if (selected === null) return;
    const result = await request('remove_furniture', { id: selected });
    if (!result.ok) return toast(result.error || 'Impossible de reprendre ce meuble.');
    placed = placed.filter(item => Number(item.id) !== selected);
    await loadHouse(propertyId);
    toast('Meuble remis dans ton inventaire.');
  };
  $('#btn-done').onclick = () => selectItem(null);
  $('#panel-close')?.addEventListener('click', () => { $('#msg').hidden = true; });
  addEventListener('resize', draw);
  addEventListener('keydown', event => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
    if (event.key.toLowerCase() === 'r') $('#btn-rot').click();
    if (event.key === 'Delete' || event.key === 'Backspace') $('#btn-del').click();
    if (event.key === 'Escape') selectItem(null);
  });

  loadHouse(Number(new URLSearchParams(location.search).get('property_id')) || 0);
}
