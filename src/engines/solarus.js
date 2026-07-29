// Solarus engine export: builds a loadable Solarus quest from the shared Pixel
// Palace project. Follows the real Solarus quest format:
//   - tilesets/<id>.dat uses tile_pattern{ id, x, y, width, height } blocks
//   - sprites/<id>/<id>.dat is an animation set pointing at <id>.png
//   - project_db.dat declares every resource (map/tileset/sprite/enemy)
//   - maps/<id>.dat lists [map] props + [tile]/[entity] blocks
// Generated boilerplate (main.lua / game_manager.lua / enemy.lua) is a starting
// point to refine in the Solarus Quest Editor.
import { dataURLToBytes } from '../openstarbound_export.js';

const TE = new TextEncoder();

function loadImage(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = src;
  });
}
async function canvasToBytes(canvas) {
  return dataURLToBytes(canvas.toDataURL('image/png'));
}

function entityBlock(type, id, X, Y, enemyKey, safe) {
  switch (type) {
    case 'player_start':
      return `[entity]\nid = ${id}\ntype = hero_start\nx = ${X}\ny = ${Y}\nlayer = 0\n\n`;
    case 'exit':
      return `[entity]\nid = ${id}\ntype = teletransporter\nx = ${X}\ny = ${Y}\nlayer = 0\ndestination = ${safe}_dest\ndestination_map = maps/${safe}\n\n`;
    case 'save_point':
      return `[entity]\nid = ${id}\ntype = sensor\nx = ${X}\ny = ${Y}\nlayer = 0\nsavegame_variable = ${id}\n\n`;
    case 'item_pickup':
      return `[entity]\nid = ${id}\ntype = pickable\nx = ${X}\ny = ${Y}\nlayer = 0\ntreasure_name = ${id}\ntreasure_variant = 1\n\n`;
    case 'enemy':
    case 'boss':
    case 'npc':
      return `[entity]\nid = ${id}\ntype = enemy\nname = ${enemyKey}\nx = ${X}\ny = ${Y}\nlayer = 0\nsprite = ${enemyKey}/${enemyKey}\n\n`;
    default:
      return `[entity]\nid = ${id}\ntype = custom\nx = ${X}\ny = ${Y}\nlayer = 0\n\n`;
  }
}

// Returns { files: [{name, data: Uint8Array}], count, safe }.
export async function buildSolarusFiles(name, project) {
  const { tilemap, markers, entities, collisions, markup } = project;
  if (!tilemap || !tilemap.grid || !tilemap.grid.length) return { files: [], count: 0 };
  const safe = (name || 'level').replace(/[^a-z0-9_]/gi, '').toLowerCase() || 'level';
  const tileSize = tilemap.tileSize || 16;
  const { cols, rows, grid, tiles } = tilemap;

  // ---- Tileset: lay every used tile into one PNG grid; pattern id = grid index ----
  const used = new Set();
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) { const id = grid[y][x]; if (id != null && id >= 0) used.add(id); }
  const ids = [...used].sort((a, b) => a - b);
  const perRow = Math.ceil(Math.sqrt(ids.length)) || 1;
  const tRows = Math.ceil(ids.length / perRow);
  const c = document.createElement('canvas');
  c.width = perRow * tileSize; c.height = tRows * tileSize;
  const cx = c.getContext('2d'); cx.imageSmoothingEnabled = false;
  for (let i = 0; i < ids.length; i++) {
    const im = await loadImage(tiles[ids[i]]);
    const gx = (i % perRow) * tileSize, gy = Math.floor(i / perRow) * tileSize;
    cx.drawImage(im, gx, gy, tileSize, tileSize);
  }
  const tilesetId = safe + '_ts';
  let tilesetDat = `background_color { 0, 0, 0 }\n`;
  ids.forEach((id, i) => {
    const px = (i % perRow) * tileSize, py = Math.floor(i / perRow) * tileSize;
    tilesetDat += `tile_pattern {\n  id = "${i}",\n  x = ${px},\n  y = ${py},\n  width = ${tileSize},\n  height = ${tileSize},\n}\n`;
  });
  const files = [
    { name: `data/tilesets/${tilesetId}.png`, data: await canvasToBytes(c) },
    { name: `data/tilesets/${tilesetId}.dat`, data: TE.encode(tilesetDat) },
  ];

  // ---- Map: tiles + entities ----
  let map = '';
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const id = grid[y][x]; if (id == null || id < 0) continue;
    const pattern = ids.indexOf(id);
    map += `[tile]\nid = ${y * cols + x}\npattern = "${pattern}"\nx = ${x * tileSize}\ny = ${y * tileSize}\nlayer = 0\n\n`;
  }
  const px = (mx) => Math.round((mx || 0) * cols * tileSize);
  const py = (my) => Math.round((my || 0) * rows * tileSize);
  const entPx = (ex) => Math.round((Number(ex) || 0) * tileSize);

  const spriteList = [];
  let ei = 0;
  (markers || []).forEach((m) => {
    const X = px(m.x), Y = py(m.y);
    const isMob = m.type === 'enemy' || m.type === 'boss' || m.type === 'npc';
    const key = `enemy_m${ei}`;
    if (isMob && m.sprite) spriteList.push({ key, sprite: m.sprite });
    map += entityBlock(m.type, `m${ei++}`, X, Y, key, safe);
  });
  (entities || []).forEach((e) => {
    if (e.fromMarker) return;
    const X = entPx(e.x), Y = entPx(e.y);
    const isMob = e.type === 'enemy' || e.type === 'boss' || e.type === 'npc';
    const key = `enemy_e${ei}`;
    if (isMob && e.sprite) spriteList.push({ key, sprite: e.sprite });
    map += entityBlock(e.type, `e${ei++}`, X, Y, key, safe);
  });

  // Collision shapes — map to Solarus custom entities with metadata
  (collisions || []).forEach((sh, ci) => {
    const pts = (sh.points || []).map(p => `${Math.round(p.x * cols * tileSize)},${Math.round(p.y * rows * tileSize)}`).join(' ');
    const cx = sh.points ? sh.points.reduce((a, p) => a + p.x, 0) / sh.points.length : 0;
    const cy = sh.points ? sh.points.reduce((a, p) => a + p.y, 0) / sh.points.length : 0;
    const X = px(cx), Y = py(cy);
    map += `[entity]\nid = c${ci}\ntype = custom\nx = ${X}\ny = ${Y}\nlayer = 0\nproperties = { collision_type = "${sh.type || 'solid'}", points = "${pts}" }\n\n`;
  });

  // Markup paths — map to Solarus custom entities with path metadata
  let mkIdx = 0;
  (markup || []).forEach((mk) => {
    (mk.paths || []).forEach((path) => {
      if (!path || path.length < 2) return;
      const pathStr = path.map(p => `${Math.round(p.x * cols * tileSize)},${Math.round(p.y * rows * tileSize)}`).join(' ');
      const first = path[0];
      const X = px(first.x), Y = py(first.y);
      map += `[entity]\nid = mk${mkIdx}\ntype = custom\nx = ${X}\ny = ${Y}\nlayer = 0\nproperties = { markup_type = "${mk.type || 'path'}", color = "${mk.color || '#10b981'}", path = "${pathStr}" }\n\n`;
      mkIdx++;
    });
  });

  // Enemy sprites (animation set + png) and behavior scripts.
  for (const sp of spriteList) {
    const png = await dataURLToBytes(sp.sprite);
    files.push({ name: `data/sprites/${sp.key}/${sp.key}.png`, data: png });
    files.push({ name: `data/sprites/${sp.key}/${sp.key}.dat`, data: TE.encode(
      `animation {\n  name = "walk",\n  src_image = "${sp.key}.png",\n  frame_delay = 0,\n  directions = {\n    { x = 0, y = 0, frame_width = ${tileSize}, frame_height = ${tileSize}, origin_x = 8, origin_y = ${Math.round(tileSize * 0.875)}, num_frames = 1 },\n  },\n}\n`
    ) });
    files.push({ name: `data/entities/enemies/${sp.key}/enemy.lua`, data: TE.encode(
      `local enemy = ...\n\nfunction enemy:on_created()\n  self:set_size(${tileSize}, ${tileSize})\n  self:set_origin(8, ${Math.round(tileSize * 0.875)})\n  self:set_invincible()\nend\n\nfunction enemy:on_update()\nend\n\nreturn enemy\n`
    ) });
  }

  const mapDat = `[map]\nwidth = ${cols * tileSize}\nheight = ${rows * tileSize}\ntileset = ${tilesetId}\nworld = ${safe}_world\nfloor = 0\n\n${map}`;
  files.push({ name: `data/maps/${safe}.dat`, data: TE.encode(mapDat) });

  // ---- project_db.dat: declare resources so the editor is happy ----
  let db = `map{ id = "${safe}", description = "${name}" }\n`;
  db += `tileset{ id = "${tilesetId}", description = "Tileset" }\n`;
  for (const sp of spriteList) {
    db += `enemy{ id = "${sp.key}", description = "Enemy" }\n`;
    db += `sprite{ id = "${sp.key}/${sp.key}", description = "Enemy sprite" }\n`;
  }
  files.push({ name: 'project_db.dat', data: TE.encode(db) });

  // ---- Quest boilerplate ----
  files.push({ name: 'quest.dat', data: TE.encode(`[quest]\ntitle = ${name}\nrelease_date = 2026\nwebsite =\nlicense = CC-BY\nshort_description = Pixel Palace export\n`) });
  files.push({ name: 'main.lua', data: TE.encode(`local game_manager = require("game_manager")\n\nfunction sol.main.on_started()\n  sol.main.load_settings()\n  game_manager:start_game()\nend\n\nfunction sol.main.on_finished()\nend\n`) });
  files.push({ name: 'game_manager.lua', data: TE.encode(`local game_manager = {}\n\nfunction game_manager:start_game()\n  local game = sol.game.load("save1")\n  if game == nil then\n    game = sol.game.create("save1")\n    game:set_starting_map("maps/${safe}")\n  end\n  sol.game.start(game)\nend\n\nreturn game_manager\n`) });

  return { files, count: ids.length, safe };
}

