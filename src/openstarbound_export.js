// Shared OpenStarbound export logic: builds a self-contained mod (per-tile
// .material + .png, a .dungeon colorkey, _metadata) as a list of files.
// Used by both the Build panel (zip download) and the Game panel (write into
// a project's mods/ folder).

const TE = new TextEncoder();
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(bytes) { let c = 0xFFFFFFFF; for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

// Minimal STORE-only ZIP writer (PNGs are already compressed). No deps.
export function buildZip(files) {
  const chunks = []; const central = []; let offset = 0;
  const u16 = v => [v & 0xFF, (v >>> 8) & 0xFF];
  const u32 = v => [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF];
  for (const f of files) {
    const nameBytes = TE.encode(f.name);
    const crc = crc32(f.data); const size = f.data.length;
    const lh = new Uint8Array([].concat(u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(size), u32(size), u16(nameBytes.length), u16(0)));
    chunks.push(lh, nameBytes, f.data);
    const ch = new Uint8Array([].concat(u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(size), u32(size), u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset)));
    central.push(ch, nameBytes);
    offset += lh.length + nameBytes.length + size;
  }
  const centralStart = offset; let centralSize = 0; for (const c of central) centralSize += c.length;
  const end = new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(centralSize), u32(centralStart), u16(0)));
  const all = [...chunks, ...central, end]; let total = 0; for (const a of all) total += a.length;
  const out = new Uint8Array(total); let p = 0; for (const a of all) { out.set(a, p); p += a.length; } return out;
}

export function downloadBlob(filename, bytes, mime) {
  const blob = new Blob([bytes], { type: mime || 'application/octet-stream' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function dataURLToBytes(dataURL) { return fetch(dataURL).then(r => r.arrayBuffer()).then(b => new Uint8Array(b)); }

// Returns { files: [{name, data: Uint8Array}], count, cols, rows }
export async function buildOpenStarboundFiles(name, tilemap) {
  const { cols, rows, grid, tiles } = tilemap;
  const ids = new Set();
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) { const id = grid[y][x]; if (id != null && id >= 0) ids.add(id); }
  if (!ids.size) return { files: [], count: 0, cols, rows };
  const idList = [...ids].sort((a, b) => a - b);
  const safeName = (name || 'pixelpalace').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'pixelpalace';
  const used = new Set(); const colorOf = {}; let ci = 0;
  idList.forEach(id => { let r, g, b, key; do { r = (ci * 73 + 37) & 255; g = (ci * 151 + 91) & 255; b = (ci * 199 + 13) & 255; ci++; key = r + ',' + g + ',' + b; } while (used.has(key)); used.add(key); colorOf[id] = [r, g, b, 255]; });
  const files = []; const tileEntries = [];
  for (const id of idList) {
    const matName = `pp_${safeName}_t${id}`;
    if (!tiles[id]) continue;
    const png = await dataURLToBytes(tiles[id]);
    files.push({ name: `materials/${matName}.png`, data: png });
    const mat = { materialId: 10000 + id, particleColor: [200, 200, 200], renderParameters: { texture: `/materials/${matName}.png`, variants: 1 }, wallType: 0, health: 5, footstepSound: '/sfx/footstep/dirt', description: `Pixel Palace tile ${id}` };
    files.push({ name: `materials/${matName}.material`, data: TE.encode(JSON.stringify(mat, null, 2)) });
    const [r, g, b, a] = colorOf[id];
    tileEntries.push({ value: [r, g, b, a], comment: `tile ${id}`, brush: [['clear'], ['front', matName]] });
  }
  const ck = document.createElement('canvas'); ck.width = cols; ck.height = rows; const cx2 = ck.getContext('2d'); cx2.clearRect(0, 0, cols, rows);
  // Starbound's world is Y-up, so flip the colorkey vertically so the in-game layout matches the editor's top-down view.
  cx2.translate(0, rows); cx2.scale(1, -1);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) { const id = grid[y][x]; if (id != null && id >= 0) { const [r, g, b] = colorOf[id]; cx2.fillStyle = `rgb(${r},${g},${b})`; cx2.fillRect(x, y, 1, 1); } }
  const ckBytes = await dataURLToBytes(ck.toDataURL('image/png'));
  const partName = safeName + '_map';
  const dungeon = { metadata: { name: safeName + '_pp', species: 'generic', rules: [], anchor: [partName], gravity: 80, maxRadius: 1000000, maxParts: 1, protected: true }, tiles: tileEntries, parts: [{ name: partName, rules: [['maxSpawnCount', [1]]], def: ['image', [safeName + '.png']] }] };
  files.push({ name: `dungeons/${safeName}/${safeName}.dungeon`, data: TE.encode(JSON.stringify(dungeon, null, 2)) });
  files.push({ name: `dungeons/${safeName}/${safeName}.png`, data: ckBytes });
  files.push({ name: `_metadata`, data: TE.encode(JSON.stringify({ name: (name || 'Pixel Palace') + ' (Pixel Palace)', author: 'Pixel Palace', description: 'Tilemap export from Pixel Palace', version: '1.0.0' }, null, 2)) });
  return { files, count: idList.length, cols, rows, safeName };
}

// Builds a fixed, hand-authored LEVEL: the tilemap dungeon wrapped in a world
// template + mission so OpenStarbound loads it as one deterministic stage
// (not a random planet), with spawn / exit / enemies from `level.entities`.
// Returns { files, count, cols, rows, safeName }.
export async function buildOpenStarboundLevelFiles(name, tilemap, level) {
  const base = await buildOpenStarboundFiles(name, tilemap);
  if (!base.count) return base;
  const safe = base.safeName;
  const lvl = level || {};
  const gravity = Number(lvl.gravity) || 80;
  const objective = lvl.objective || 'reach_exit';
  const wtemplate = {
    worldTemplate: {
      type: 'dungeon',
      dungeon: `/dungeons/${safe}/${safe}.dungeon`,
      fillTiles: false,
      anchor: [Math.floor(base.cols / 2), Math.floor(base.rows / 2)],
      parameters: { gravityOverride: gravity }
    }
  };
  const mission = {
    worldTemplate: `/worldtemplates/${safe}.worldtemplate`,
    name: name,
    description: `Pixel Palace level: ${name}`,
    repeatable: false,
    objective: { type: 'stage' },
    script: `/missions/${safe}.lua`
  };
  const ents = (lvl.entities || []).map(e => ({ ...e }));
  // Generate a real OpenStarbound monster asset for any combat entity that has an
  // assigned sprite, so it actually appears in-game instead of just being a spawn point.
  const extraFiles = [];
  for (let i = 0; i < ents.length; i++) {
    const e = ents[i];
    if ((e.type === 'enemy' || e.type === 'boss' || e.type === 'npc') && e.sprite) {
      try {
        const mid = `pp_${safe}_mob${i}`;
        const png = await dataURLToBytes(e.sprite);
        extraFiles.push({ name: `monsters/${mid}/${mid}.png`, data: png });
        extraFiles.push({ name: `monsters/${mid}/${mid}.monster`, data: TE.encode(JSON.stringify(makeMonster(mid), null, 2)) });
        extraFiles.push({ name: `monsters/${mid}/${mid}.behavior`, data: TE.encode(JSON.stringify(makeBehavior(), null, 2)) });
        e.id = `/monsters/${mid}/${mid}.monster`;
      } catch (err) { /* keep user-supplied id if sprite can't be read */ }
    }
  }
  const spawn = ents.find(e => e.type === 'spawn');
  const exits = ents.filter(e => e.type === 'exit');
  const foes = ents.filter(e => e.type === 'enemy' || e.type === 'boss');
  const sp = spawn ? [Number(spawn.x), Number(spawn.y)] : [Math.floor(base.cols / 2), Math.floor(base.rows / 2)];

  // Collision zones — mapped to Starbound region definitions
  const collisionZones = (lvl.collisions || []).map((sh, ci) => {
    const pts = (sh.points || []).map(p => ({ x: Math.round(p.x * base.cols), y: Math.round(p.y * base.rows) }));
    const cx = pts.reduce((a, p) => a + p.x, 0) / (pts.length || 1);
    const cy = pts.reduce((a, p) => a + p.y, 0) / (pts.length || 1);
    return { id: `collision_${ci}`, type: sh.type || 'solid', center: [cx, cy], points: pts };
  });

  // Markup paths — mapped to Starbound mission markers
  const markupPaths = [];
  (lvl.markup || []).forEach((mk, mi) => {
    (mk.paths || []).forEach((path, pi) => {
      if (!path || path.length < 2) return;
      const pts = path.map(p => ({ x: Math.round(p.x * base.cols), y: Math.round(p.y * base.rows) }));
      markupPaths.push({ id: `markup_${mi}_${pi}`, type: mk.type || 'path', color: mk.color || '#10b981', points: pts });
    });
  });

  const lua =
    `-- Level "${name}" (Pixel Palace)\n` +
    `-- Spawn / enemies / exits / collisions / markup from the Pixel Palace Level editor.\n` +
    `-- Enemies with an assigned sprite become real monsters in /monsters/.\n` +
    `-- Collision zones define solid/kill/one-way regions. Markup paths are navigational hints.\n` +
    `-- NOTE: validate coordinates + APIs in-engine; Starbound world space is pixels (tile*8), Y-up.\n` +
    `local spawnTile = { ${sp[0]}, ${sp[1]} }\n` +
    `local enemies = ${JSON.stringify(foes.map(e => ({ id: e.id || 'monster', x: Number(e.x), y: Number(e.y) })))}\n` +
    `local exits = ${JSON.stringify(exits.map(e => ({ x: Number(e.x), y: Number(e.y) })))}\n` +
    `local collisions = ${JSON.stringify(collisionZones)}\n` +
    `local markupPaths = ${JSON.stringify(markupPaths)}\n\n` +
    `function onInit()\n` +
    `  player.setPosition({ spawnTile[1] * 8, spawnTile[2] * 8 })\n` +
    `  for _, e in ipairs(enemies) do world.spawnMonster(e.id, { e.x * 8, e.y * 8 }) end\n` +
    `  -- Collision zones: apply world-specific collision flags per zone type\n` +
    `  for _, zone in ipairs(collisions) do\n` +
    `    if zone.type == "solid" then\n` +
    `      -- Solid collisions are handled by tile collision flags in the dungeon\n` +
    `    elseif zone.type == "killzone" then\n` +
    `      -- Kill zones: damage player on enter (implement per-engine)\n` +
    `    elseif zone.type == "oneway" then\n` +
    `      -- One-way platforms: allow jump-through from below\n` +
    `    end\n` +
    `  end\n` +
    `  -- Markup paths: available as navigation/routing data for scripts\n` +
    `  for _, mk in ipairs(markupPaths) do\n` +
    `    -- Example: if mk.type == "patrol" then spawnPatrol(mk.points) end\n` +
    `  end\n` +
    `end\n\n` +
    `function onUpdate(dt)\n` +
    `  -- TODO: when player reaches an exit tile (or boss defeated), complete the level:\n` +
    `  -- world.completeQuest(player.uniqueId(), "${safe}")\n` +
    `end\n`;
  const files = [
    ...base.files,
    ...extraFiles,
    { name: `worldtemplates/${safe}.worldtemplate`, data: TE.encode(JSON.stringify(wtemplate, null, 2)) },
    { name: `missions/${safe}.mission`, data: TE.encode(JSON.stringify(mission, null, 2)) },
    { name: `missions/${safe}.lua`, data: TE.encode(lua) }
  ];
  return { ...base, files };
}

// Minimal but valid Starbound monster generated from a single sprite frame.
function makeMonster(id) {
  return {
    type: 'monster',
    movementSettings: { gravityMultiplier: 1, airFriction: 0.5, liquidBuoyancy: 0.8, minimumLiquidStatus: 0, runSpeed: 4, walkSpeed: 2, friction: 0.8, bounceFactor: 0, stepBaseline: 8 },
    animatedParts: { stateTypes: {}, parts: [ { name: 'body', properties: { transform: [1, 0, 0, 1, 0, 0], image: `/monsters/${id}/${id}.png` }, zLevel: 0 } ] },
    animationConfig: { animations: { idle: { frames: [ { part: 'body' } ], loops: 1, frameTime: 1 } } },
    baseParameters: { lickable: false, persistent: true, scale: 1 },
    statusSettings: { stats: { maxHealth: 100, health: 100, energy: 100, energyRegen: 0, physicalResistance: 0, powerMultiplier: 1 }, statusEffects: [] },
    behavior: `/monsters/${id}/${id}.behavior`,
    aggressive: true,
    uniqueParameters: {}
  };
}
function makeBehavior() {
  return { defaultState: 'idle', states: { idle: { transitions: [], scripts: [] } } };
}
