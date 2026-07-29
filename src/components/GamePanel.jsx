import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open as tauriOpen } from '@tauri-apps/plugin-dialog';
import { openPath } from '@tauri-apps/plugin-opener';
import { readDir, mkdir, exists, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { buildOpenStarboundFiles, buildOpenStarboundLevelFiles } from '../openstarbound_export.js';
import { buildSolarusFiles } from '../engines/solarus.js';

const STARBOUND_DEFAULT = 'F:\\SteamLibrary\\steamapps\\common\\Starbound';
const TE = new TextEncoder();
const emptyMeta = () => ({ scripts: {}, cinematics: [], quests: [], level: { mode: 'mission', gravity: 80, objective: 'reach_exit', entities: [] } });

export default function GamePanel({ toast }) {
  const [engineDir, setEngineDir] = useState('');
  const [assetsPorted, setAssetsPorted] = useState(false);
  const [projects, setProjects] = useState([]);
  const [current, setCurrent] = useState('');
  const [log, setLog] = useState('');
  const [meta, setMeta] = useState(emptyMeta);
  const [engine, setEngine] = useState('openstarbound');
  const [storyTab, setStoryTab] = useState('scripts');
  const [activeEntity, setActiveEntity] = useState(0);
  const [activeScript, setActiveScript] = useState('');
  const [activeCin, setActiveCin] = useState(0);
  const [activeQuest, setActiveQuest] = useState(0);

  const projDir = (n) => `${engineDir}/projects/${n}`;
  const modsDir = (n) => `${projDir(n)}/mods`;
  const questDir = (n) => `${projDir(n)}/solarus`;
  const metaPath = (n) => `${projDir(n)}/meta.json`;

  const refreshProjects = async (dir) => {
    try {
      const entries = await readDir(`${dir}/projects`, { recursive: false });
      const names = entries.map(e => e.name).filter(Boolean);
      setProjects(names);
      if (names.length && !names.includes(current)) setCurrent(names[0]);
    } catch (e) { setProjects([]); }
  };

  const loadMeta = async (n) => {
    if (!n) { setMeta(emptyMeta()); setActiveScript(''); setActiveCin(0); setActiveQuest(0); return; }
    try {
      const txt = await readTextFile(metaPath(n));
      const m = JSON.parse(txt);
      setMeta({ ...emptyMeta(), ...m });
      setActiveScript(Object.keys(m.scripts || {})[0] || '');
      setActiveCin(0); setActiveQuest(0);
    } catch (e) { setMeta(emptyMeta()); setActiveScript(''); setActiveCin(0); setActiveQuest(0); }
  };

  const persist = async (next) => {
    setMeta(next);
    if (!current) return;
    try { await writeTextFile(metaPath(current), JSON.stringify(next, null, 2)); } catch (e) {}
  };

  useEffect(() => {
    (async () => {
      try {
        const dir = await invoke('setup_openstarbound');
        setEngineDir(dir);
        setAssetsPorted(await exists(`${dir}/assets/packed.pak`));
        await refreshProjects(dir);
      } catch (e) { toast('Engine setup failed: ' + e); }
    })();
  }, [toast]);

  useEffect(() => { loadMeta(current); }, [current]);

  const portAssets = async () => {
    try {
      const sel = await tauriOpen({ directory: true, defaultPath: STARBOUND_DEFAULT, title: 'Select your Starbound install' });
      if (!sel) return;
      setLog('Copying packed.pak from ' + sel + ' ...');
      const dst = await invoke('port_starbound_assets', { starboundPath: sel });
      setAssetsPorted(true);
      setLog('Ported base assets -> ' + dst);
    } catch (e) { setLog('Port failed: ' + e); }
  };

  const newProject = async () => {
    const name = window.prompt('Project name:');
    if (!name) return;
    const base = projDir(name);
    await mkdir(`${base}/mods`, { recursive: true });
    await mkdir(`${base}/storage`, { recursive: true });
    await refreshProjects(engineDir);
    setCurrent(name);
    setLog('Created project "' + name + '"');
  };

  const addTilemap = async () => {
    if (!current) { toast('Create a project first.'); return; }
    if (!window.PP || !window.PP.tilemap || !window.PP.tilemap.grid) { toast('Build a tilemap first (Tilemap tab).'); return; }
    try {
      setLog('Building mod from tilemap...');
      const { files, count } = await buildOpenStarboundFiles(current, window.PP.tilemap);
      if (!count) { toast('Tilemap has no placed tiles.'); return; }
      const payload = files.map(f => ({ name: f.name, data: Array.from(f.data) }));
      await invoke('write_mod_files', { files: payload, dir: modsDir(current) });
      setLog(`Wrote ${count} materials + dungeon into ${current}/mods`);
    } catch (e) { setLog('Export failed: ' + e); }
  };

  const launch = async () => {
    if (!current) { toast('Create a project first.'); return; }
    if (!assetsPorted) { toast('Port Starbound base assets first (Game tab).'); return; }
    try {
      setLog('Launching OpenStarbound...');
      await invoke('launch_openstarbound', { engineDir, projectDir: projDir(current) });
      setLog('Launched! The OpenStarbound window should appear.');
    } catch (e) { setLog('Launch failed: ' + e); }
  };

  const openFolder = async () => { if (current) try { await openPath(projDir(current)); } catch (e) {} };

  // ---- Story & Logic ----
  const newScript = () => {
    const name = window.prompt('Script name (letters/numbers, no extension):', 'myquest');
    if (!name) return;
    const key = name.replace(/[^a-z0-9_]/gi, '_');
    const next = { ...meta, scripts: { ...meta.scripts, [key]: '-- ' + key + '.lua\n' } };
    persist(next); setActiveScript(key); setStoryTab('scripts');
  };

  const editScript = (val) => {
    const next = { ...meta, scripts: { ...meta.scripts, [activeScript]: val } };
    setMeta(next);
    if (current) writeTextFile(metaPath(current), JSON.stringify(next, null, 2)).catch(() => {});
  };

  const newCinematic = () => {
    const name = window.prompt('Cinematic name:', 'intro');
    if (!name) return;
    const key = name.replace(/[^a-z0-9_]/gi, '_');
    const next = { ...meta, cinematics: [...meta.cinematics, { name: key, fadeIn: 1.0, fadeOut: 1.0, steps: [{ type: 'text', text: 'Chapter I', duration: 3 }] }] };
    persist(next); setActiveCin(meta.cinematics.length); setStoryTab('cinematics');
  };

  const updateCinematic = (patch) => {
    const arr = meta.cinematics.map((c, i) => i === activeCin ? { ...c, ...patch } : c);
    const next = { ...meta, cinematics: arr };
    setMeta(next);
    if (current) writeTextFile(metaPath(current), JSON.stringify(next, null, 2)).catch(() => {});
  };

  const updateStep = (si, patch) => {
    const c = meta.cinematics[activeCin];
    const steps = c.steps.map((s, i) => i === si ? { ...s, ...patch } : s);
    updateCinematic({ steps });
  };

  const addStep = () => { const c = meta.cinematics[activeCin]; updateCinematic({ steps: [...c.steps, { type: 'text', text: '', duration: 2 }] }); };
  const removeStep = (si) => { const c = meta.cinematics[activeCin]; updateCinematic({ steps: c.steps.filter((_, i) => i !== si) }); };

  const newQuest = () => {
    const name = window.prompt('Quest name:', 'mainstory');
    if (!name) return;
    const key = name.replace(/[^a-z0-9_]/gi, '_');
    const next = { ...meta, quests: [...meta.quests, { name: key, cinematics: meta.cinematics.map(c => c.name) }] };
    persist(next); setActiveQuest(meta.quests.length); setStoryTab('quest');
  };

  const updateQuest = (patch) => {
    const arr = meta.quests.map((q, i) => i === activeQuest ? { ...q, ...patch } : q);
    const next = { ...meta, quests: arr };
    setMeta(next);
    if (current) writeTextFile(metaPath(current), JSON.stringify(next, null, 2)).catch(() => {});
  };

  const updateLevel = (patch) => {
    const next = { ...meta, level: { ...(meta.level || {}), ...patch } };
    setMeta(next);
    if (current) writeTextFile(metaPath(current), JSON.stringify(next, null, 2)).catch(() => {});
  };

  const addEntity = () => {
    const e = { type: 'enemy', id: 'monster', x: 0, y: 0 };
    updateLevel({ entities: [...(meta.level?.entities || []), e] });
    setActiveEntity((meta.level?.entities || []).length);
  };

  const updateEntity = (patch) => {
    const arr = (meta.level?.entities || []).map((e, i) => i === activeEntity ? { ...e, ...patch } : e);
    updateLevel({ entities: arr });
  };

  const removeEntity = (i) => {
    const arr = (meta.level?.entities || []).filter((_, j) => j !== i);
    updateLevel({ entities: arr });
    setActiveEntity(0);
  };

  // Bridge: pull the markers drawn in the Markers tab into level entities so the
  // tabs flow into each other. Marker-derived entities are tagged fromMarker so a
  // re-import cleanly replaces them without dropping hand-authored ones.
  const mergeMarkersInto = (level) => {
    const tm = window.PP && window.PP.tilemap; if (!tm) return level;
    const cols = tm.cols || 0, rows = tm.rows || 0;
    const map = { player_start: 'spawn', enemy_spawn: 'enemy', exit: 'exit', item_pickup: 'item', save_point: 'door' };
    const derived = (window.PP.markers || []).map(m => ({
      type: map[m.type] || 'item',
      x: Math.round((m.x || 0) * cols),
      y: Math.round((m.y || 0) * rows),
      fromMarker: true,
      id: map[m.type] === 'enemy' ? 'monster' : ''
    }));
    const manual = (level.entities || []).filter(e => !e.fromMarker);
    return { ...level, entities: [...manual, ...derived] };
  };

  const importMarkers = () => {
    if (!window.PP || !window.PP.tilemap) { toast('Build a tilemap first (Tilemap tab).'); return; }
    updateLevel({ entities: mergeMarkersInto(meta.level || {}).entities });
    setActiveEntity(0);
    toast('Imported markers as level entities');
  };

  const exportStory = async () => {
    if (!current) { toast('Create a project first.'); return; }
    const files = [];
    for (const [name, content] of Object.entries(meta.scripts || {})) {
      files.push({ name: `scripts/${name}.lua`, data: Array.from(TE.encode(content)) });
    }
    for (const c of meta.cinematics || []) {
      const obj = {
        fadeIn: Number(c.fadeIn) || 0,
        fadeOut: Number(c.fadeOut) || 0,
        steps: (c.steps || []).map(s => s.type === 'wait'
          ? { type: 'wait', duration: Number(s.duration) || 1 }
          : { type: 'text', text: s.text || '', duration: Number(s.duration) || 2 })
      };
      files.push({ name: `cinematics/${c.name}.cinematic`, data: Array.from(TE.encode(JSON.stringify(obj, null, 2))) });
    }
    for (const q of meta.quests || []) {
      const id = `pp_${current}_${q.name}`.replace(/[^a-z0-9_]/gi, '_').toLowerCase();
      const questFile = `quests/${q.name}.quest`;
      const luaFile = `quests/${q.name}.lua`;
      const questJson = {
        id, name: q.name, description: `Pixel Palace quest: ${q.name}`,
        script: `/${luaFile}`,
        objectives: [{ title: 'Begin', events: { complete: true } }]
      };
      const cinList = (q.cinematics || []).map(n => `/cinematics/${n}.cinematic`);
      const lua = `-- Auto-generated quest backbone for "${q.name}"\n` +
        `-- Cinematics play in sequence when the quest starts.\n` +
        `-- Verify the cinematic API for your engine version; typical call is player.cinematic(path).\n` +
        `local cinematics = ${JSON.stringify(cinList, null, 2)}\n\n` +
        `function questStart()\n  for _, c in ipairs(cinematics) do\n    player.cinematic(c)\n  end\nend\n\n` +
        `function questUpdate(dt) end\n\nfunction questComplete() end\n`;
      files.push({ name: questFile, data: Array.from(TE.encode(JSON.stringify(questJson, null, 2))) });
      files.push({ name: luaFile, data: Array.from(TE.encode(lua)) });
    }
    if (!files.length) { toast('No story content to export.'); return; }
    try {
      await invoke('write_mod_files', { files, dir: modsDir(current) });
      setLog(`Exported ${files.length} story files (scripts/cinematics/quests) into ${current}/mods`);
    } catch (e) { setLog('Story export failed: ' + e); }
  };

  const cin = meta.cinematics[activeCin];
  const quest = meta.quests[activeQuest];

  const openSolarusEditor = async () => {
    if (!current) { toast('Create a project first.'); return; }
    try {
      setLog('Opening quest in Solarus editor…');
      await invoke('launch_solarus', { questDir: questDir(current), mode: 'editor' });
    } catch (e) { setLog('Could not launch Solarus: ' + e); }
  };

  const openTiled = async () => {
    if (!current) { toast('Create a project first.'); return; }
    try {
      const dir = projDir(current);
      const tmx = `${dir}/tilemap.tmx`;
      const fs = await import('@tauri-apps/plugin-fs');
      const has = await fs.exists(tmx);
      await invoke('launch_tiled', { mapPath: has ? tmx : null });
      toast('Opened Tiled');
    } catch (e) { toast('Could not launch Tiled: ' + e); }
  };

  const renderTilemapPng = async (tm) => {
    const { grid, tiles, tileSize } = tm;
    const rows = grid.length, cols = grid[0].length;
    const cv = document.createElement('canvas'); cv.width = cols * tileSize; cv.height = rows * tileSize;
    const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
    const load = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const id = grid[y][x]; if (id == null || id === '' || id === -1) continue;
      const src = tiles[id] || (tiles[parseInt(id)]); if (!src) continue;
      const img = await load(src); if (img) ctx.drawImage(img, x * tileSize, y * tileSize, tileSize, tileSize);
    }
    return cv.toDataURL('image/png');
  };

  const exportLevel = async () => {
    if (!current) { toast('Create a project first.'); return; }
    if (!window.PP || !window.PP.tilemap || !window.PP.tilemap.grid) { toast('Build a tilemap first (Tilemap tab).'); return; }
    try {
      setLog('Building level for ' + engine + '...');
      const merged = mergeMarkersInto(meta.level || {});
      merged.collisions = window.PP.collisions || [];
      merged.markup = window.PP.markup || [];
      const project = { name: current, tilemap: window.PP.tilemap, collisions: window.PP.collisions || [], markers: window.PP.markers || [], markup: window.PP.markup || [], entities: merged.entities };
      let res, dir;
      if (engine === 'solarus') {
        res = await buildSolarusFiles(current, project);
        dir = questDir(current);
      } else if (engine === 'godot') {
        const pngDataUrl = await renderTilemapPng(window.PP.tilemap);
        const b64 = pngDataUrl.split(',')[1];
        const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        const { cols, rows, tileSize } = window.PP.tilemap;
        const tscn = `[gd_scene format=3 uid="uid://pp_${current.replace(/\W/g, '_')}"]\n\n[ext_resource type="Texture2D" uid="uid://pp_${current.replace(/\W/g, '_')}_tex" path="res://${current}/godot/level.png" id="1_tex"]\n\n[sub_resource type="TileSet" id="TileSet_1"]\n\n[sub_resource type="TileSetAtlasSource" id="Atlas_1"]\ntexture = ExtResource("1_tex")\n\n[node name="Level" type="Node2D"]\n\n[node name="TileMap" type="TileMapLayer" parent="."]\nposition = Vector2(0, 0)\n\n[node name="Terrain" type="TileMapLayer" parent="."]\ntile_set = SubResource("TileSet_1")\n\n[node name="Sprite" type="Sprite2D" parent="."]\ntexture = ExtResource("1_tex")\ncentered = false\n`;
        res = { count: 1, safeName: current, files: [
          { name: 'level.png', data: bin },
          { name: 'level.tscn', data: new TextEncoder().encode(tscn) },
        ] };
        dir = `${projDir(current)}/godot`;
      } else {
        res = await buildOpenStarboundLevelFiles(current, window.PP.tilemap, merged);
        dir = modsDir(current);
      }
      if (!res.count) { toast('Tilemap has no placed tiles.'); return; }
      const payload = res.files.map(f => ({ name: f.name, data: Array.from(f.data) }));
      await invoke('write_mod_files', { files: payload, dir });
      if (engine === 'solarus') setLog(`Exported Solarus quest (${res.files.length} files) into ${current}/solarus — open in the Solarus editor.`);
      else if (engine === 'godot') setLog(`Exported Godot project (${res.files.length} files) into ${current}/godot — open level.tscn in Godot.`);
      else setLog(`Exported level (${res.files.length} files) into ${current}/mods — launch, then run /mission /missions/${res.safeName}.mission`);
    } catch (e) { setLog('Level export failed: ' + e); }
  };

  return (
    <div className="panel">
      <div className="titlebar"><h2 className="glow" style={{ fontSize: 15 }}>Build your game</h2><span className="chip">{projects.length} projects</span></div>

      {/* ─── GENERAL: engine picker (top, always visible) ─── */}
      <div className="seg" style={{ marginTop: 4 }}>
        <label className="neon-btn" style={{ padding: '2px 8px' }}>Target engine
          <select value={engine} onChange={e => setEngine(e.target.value)} style={{ marginLeft: 6 }}>
            <option value="openstarbound">OpenStarbound</option>
            <option value="solarus">Solarus</option>
            <option value="godot">Godot</option>
          </select>
        </label>
        <button className="neon-btn cy" onClick={openTiled} disabled={!current}>◆ Open in Tiled</button>
        {engine === 'solarus' && <button className="neon-btn cy" onClick={openSolarusEditor} disabled={!current}>◆ Open in Solarus</button>}
      </div>
      <div className="hint">Pick the engine your level exports for. <b>Godot</b> = primary flat 2D export (sprite sheet + .tscn). <b>Solarus</b> = quest/.lua. <b>OpenStarbound</b> = bundled sim (dungeon + mission). Tiled opens the raw tilemap any time.</div>

      <div className="row" style={{ alignItems: 'center' }}>
        <div className="col" style={{ flex: 1 }}>
          <label>Engine path</label>
          <div className="chip" style={{ fontSize: 11, wordBreak: 'break-all' }}>{engineDir ? 'Ready · ' + engineDir : 'Setting up…'}</div>
        </div>
        <div className="col">
          <label>Base assets</label>
          <div className="chip" style={{ fontSize: 11, color: assetsPorted ? '#7CFFB0' : '#ffb4b4' }}>{assetsPorted ? 'packed.pak ported' : 'not ported'}</div>
        </div>
      </div>

      <div className="row" style={{ marginTop: 10, alignItems: 'center' }}>
        <label style={{ marginRight: 8 }}>Project</label>
        <select value={current} onChange={e => setCurrent(e.target.value)} style={{ flex: 1 }}>
          {projects.length === 0 && <option value="">(none)</option>}
          {projects.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <button className="neon-btn" onClick={newProject}>New</button>
      </div>


      {/* ---------------- Story & Logic ---------------- */}
      <div className="titlebar" style={{ marginTop: 14 }}><h2 className="glow" style={{ fontSize: 14 }}>Story &amp; Logic (cutscenes, flow, code)</h2></div>
      <div className="seg">
        <button className={storyTab === 'scripts' ? 'neon-btn cy' : 'neon-btn'} onClick={() => setStoryTab('scripts')}>Lua Scripts</button>
        <button className={storyTab === 'cinematics' ? 'neon-btn cy' : 'neon-btn'} onClick={() => setStoryTab('cinematics')}>Cinematics</button>
        <button className={storyTab === 'quest' ? 'neon-btn cy' : 'neon-btn'} onClick={() => setStoryTab('quest')}>Quest Flow</button>
        <button className={storyTab === 'level' ? 'neon-btn cy' : 'neon-btn'} onClick={() => setStoryTab('level')}>Level</button>
        <button className="neon-btn vi" onClick={exportStory} disabled={!current}>⤓ Export → mods</button>
      </div>

      {storyTab === 'scripts' && (
        <div style={{ marginTop: 8 }}>
          <div className="row" style={{ alignItems: 'center' }}>
            <select value={activeScript} onChange={e => setActiveScript(e.target.value)} style={{ flex: 1 }}>
              {Object.keys(meta.scripts).length === 0 && <option value="">(no scripts)</option>}
              {Object.keys(meta.scripts).map(s => <option key={s} value={s}>{s}.lua</option>)}
            </select>
            <button className="neon-btn" onClick={newScript}>New</button>
          </div>
          <textarea
            value={meta.scripts[activeScript] || ''}
            onChange={e => editScript(e.target.value)}
            disabled={!activeScript}
            spellCheck={false}
            style={{ width: '100%', minHeight: 220, marginTop: 8, fontFamily: 'monospace', fontSize: 12, background: '#0b0f17', color: '#cfe', border: '1px solid #1d2a3a', borderRadius: 6, padding: 8 }}
            placeholder="Write Lua here — quest logic, hooks, helpers. Exported to scripts/<name>.lua in the mod."
          />
          <div className="hint">Use this for custom flow logic. Starbound gives you <span className="kbd">player</span>, <span className="kbd">world</span>, <span className="kbd">entity</span> Lua APIs. Scripts are saved per-project in <span className="kbd">meta.json</span> and exported into the mod's <span className="kbd">scripts/</span> folder.</div>
        </div>
      )}

      {storyTab === 'cinematics' && (
        <div style={{ marginTop: 8 }}>
          <div className="row" style={{ alignItems: 'center' }}>
            <select value={activeCin} onChange={e => setActiveCin(Number(e.target.value))} style={{ flex: 1 }}>
              {meta.cinematics.length === 0 && <option value={0}>(no cinematics)</option>}
              {meta.cinematics.map((c, i) => <option key={c.name} value={i}>{c.name}.cinematic</option>)}
            </select>
            <button className="neon-btn" onClick={newCinematic}>New</button>
          </div>
          {cin && (
            <div style={{ marginTop: 8 }}>
              <div className="row">
                <label style={{ flex: 1 }}>Fade In (s)<input type="number" step="0.1" value={cin.fadeIn} onChange={e => updateCinematic({ fadeIn: e.target.value })} style={{ width: '100%', marginTop: 2 }} /></label>
                <label style={{ flex: 1 }}>Fade Out (s)<input type="number" step="0.1" value={cin.fadeOut} onChange={e => updateCinematic({ fadeOut: e.target.value })} style={{ width: '100%', marginTop: 2 }} /></label>
              </div>
              <div className="hint" style={{ marginTop: 6 }}>Steps (shown in order):</div>
              {cin.steps.map((s, si) => (
                <div className="row" key={si} style={{ alignItems: 'center', marginTop: 4 }}>
                  <select value={s.type} onChange={e => updateStep(si, { type: e.target.value })} style={{ width: 90 }}>
                    <option value="text">text</option>
                    <option value="wait">wait</option>
                  </select>
                  {s.type === 'text'
                    ? <input value={s.text} onChange={e => updateStep(si, { text: e.target.value })} placeholder="Text to show" style={{ flex: 1 }} />
                    : <span style={{ flex: 1, fontSize: 11, opacity: .7 }}>pause</span>}
                  <input type="number" step="0.5" value={s.duration} onChange={e => updateStep(si, { duration: e.target.value })} style={{ width: 64 }} title="duration (s)" />
                  <button className="neon-btn" onClick={() => removeStep(si)} style={{ padding: '2px 8px' }}>✕</button>
                </div>
              ))}
              <button className="neon-btn" onClick={addStep} style={{ marginTop: 6 }}>＋ Add step</button>
              <div className="hint" style={{ marginTop: 6 }}>Generated as a <span className="kbd">cinematics/&lt;name&gt;.cinematic</span> asset. Trigger in-game with the debug console: <span className="kbd">/cinematic /cinematics/{cin.name}.cinematic</span></div>
            </div>
          )}
        </div>
      )}

      {storyTab === 'quest' && (
        <div style={{ marginTop: 8 }}>
          <div className="row" style={{ alignItems: 'center' }}>
            <select value={activeQuest} onChange={e => setActiveQuest(Number(e.target.value))} style={{ flex: 1 }}>
              {meta.quests.length === 0 && <option value={0}>(no quests)</option>}
              {meta.quests.map((q, i) => <option key={q.name} value={i}>{q.name}</option>)}
            </select>
            <button className="neon-btn" onClick={newQuest}>New</button>
          </div>
          {quest && (
            <div style={{ marginTop: 8 }}>
              <div className="hint">Play these cinematics in order when the quest starts:</div>
              {meta.cinematics.length === 0 && <div className="hint" style={{ color: '#ffb4b4' }}>Make a Cinematic first.</div>}
              {meta.cinematics.map((c, i) => (
                <label key={c.name} className="row" style={{ fontSize: 12, marginTop: 3 }}>
                  <input type="checkbox" checked={(quest.cinematics || []).includes(c.name)} onChange={e => {
                    const set = new Set(quest.cinematics || []);
                    if (e.target.checked) set.add(c.name); else set.delete(c.name);
                    updateQuest({ cinematics: [...set] });
                  }} />
                  <span>{c.name}.cinematic</span>
                </label>
              ))}
              <div className="hint" style={{ marginTop: 6 }}>Exports <span className="kbd">quests/&lt;name&gt;.quest</span> + <span className="kbd">.lua</span>. Start it in-game with <span className="kbd">/quest /quests/{quest.name}.quest</span> (enable the debug console in OpenStarbound settings). This is the backbone of your game flow.</div>
            </div>
          )}
        </div>
      )}

      {storyTab === 'level' && (
        <div style={{ marginTop: 8 }}>
          <div className="row">
            <label style={{ flex: 1 }}>World mode
              <select value={meta.level?.mode} onChange={e => updateLevel({ mode: e.target.value })} style={{ width: '100%', marginTop: 2 }}>
                <option value="mission">Mission (fixed level)</option>
                <option value="planet">Planet (procedural biome)</option>
                <option value="ship">Ship hub</option>
              </select>
            </label>
            <label style={{ flex: 1 }}>Gravity
              <input type="number" step="1" value={meta.level?.gravity} onChange={e => updateLevel({ gravity: e.target.value })} style={{ width: '100%', marginTop: 2 }} />
            </label>
            <label style={{ flex: 1 }}>Objective
              <select value={meta.level?.objective} onChange={e => updateLevel({ objective: e.target.value })} style={{ width: '100%', marginTop: 2 }}>
                <option value="reach_exit">Reach exit</option>
                <option value="defeat_boss">Defeat boss</option>
                <option value="collect">Collect N</option>
                <option value="custom">Custom Lua</option>
              </select>
            </label>
          </div>
          <div className="hint" style={{ marginTop: 6 }}>Entity stamps placed on the level (tile coordinates). At least one <b>spawn</b> and one <b>exit</b> for a stage.</div>
          <div className="row" style={{ marginTop: 4, alignItems: 'center' }}>
            <select value={activeEntity} onChange={e => setActiveEntity(Number(e.target.value))} style={{ flex: 1 }}>
              {meta.level?.entities?.length === 0 && <option value={0}>(no entities)</option>}
              {(meta.level?.entities || []).map((e, i) => <option key={i} value={i}>{e.type} {e.id ? '(' + e.id + ')' : ''} @ {e.x},{e.y}</option>)}
            </select>
            <button className="neon-btn" onClick={addEntity}>＋ Add</button>
          </div>
          {meta.level?.entities?.[activeEntity] && (
            <>
            <div className="row" style={{ marginTop: 4, alignItems: 'center' }}>
              <select value={meta.level.entities[activeEntity].type} onChange={e => updateEntity({ type: e.target.value })} style={{ width: 110 }}>
                <option value="spawn">spawn</option>
                <option value="exit">exit</option>
                <option value="enemy">enemy</option>
                <option value="boss">boss</option>
                <option value="npc">npc</option>
                <option value="item">item</option>
                <option value="door">door</option>
              </select>
              <input value={meta.level.entities[activeEntity].id || ''} onChange={e => updateEntity({ id: e.target.value })} placeholder="id (monster/item/object)" style={{ flex: 1 }} />
              <input type="number" value={meta.level.entities[activeEntity].x} onChange={e => updateEntity({ x: e.target.value })} style={{ width: 56 }} title="tile x" />
              <input type="number" value={meta.level.entities[activeEntity].y} onChange={e => updateEntity({ y: e.target.value })} style={{ width: 56 }} title="tile y" />
              <button className="neon-btn" onClick={() => removeEntity(activeEntity)} style={{ padding: '2px 8px' }}>✕</button>
            </div>
            <div className="row" style={{ marginTop: 4, alignItems: 'center' }}>
              <label className="neon-btn" style={{ padding: '2px 8px' }} title="Assign a drawn sprite for this character/enemy">Sprite<input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => updateEntity({ sprite: r.result }); r.readAsDataURL(f); }} /></label>
              {meta.level.entities[activeEntity].sprite
                ? <img src={meta.level.entities[activeEntity].sprite} alt="" style={{ width: 28, height: 28, imageRendering: 'pixelated', border: '1px solid #1d2a3a', borderRadius: 4 }} />
                : <span style={{ fontSize: 11, opacity: .6 }}>no sprite (uses default id)</span>}
            </div>
            </>
          )}
          <div className="seg" style={{ marginTop: 8 }}>
            <button className="neon-btn" onClick={importMarkers} disabled={!current}>⇲ Import Markers</button>
            <button className="neon-btn vi" onClick={exportLevel} disabled={!current}>⤓ Export Level → {engine === 'solarus' ? 'quest' : engine === 'godot' ? 'Godot project' : 'mods'}</button>
          </div>

          {/* ─── STARBOUND-ONLY SECTION (packing / launch) ─── */}
          <details style={{ marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
            <summary className="neon-btn" style={{ cursor: 'pointer' }}>▾ OpenStarbound setup &amp; launch (port assets, packed.pak)</summary>
            <div style={{ marginTop: 8 }}>
              <div className="seg">
                <button className="neon-btn vi" onClick={portAssets} disabled={!engineDir}>Port Base Assets</button>
              </div>
              {!assetsPorted && <div className="hint">The engine needs its base asset pack (<span className="kbd">packed.pak</span>) to run. Click above and select your Starbound install (default <span className="kbd">{STARBOUND_DEFAULT}</span>) — it's copied once into the engine folder. No AI involved.</div>}
              <div className="hint">Builds the tilemap as a dungeon, then wraps it in a <span className="kbd">worldtemplates/&lt;name&gt;.worldtemplate</span> + <span className="kbd">missions/&lt;name&gt;.mission</span> so OpenStarbound loads it as one fixed stage. Launch the game, open the debug console, and run <span className="kbd">/mission /missions/{current}.mission</span> to play your level. Coordinates/APIs are a starting point — validate in-engine. May appear vertically mirrored; flip the tilemap if so.</div>
              <div className="seg" style={{ marginTop: 8 }}>
                <button className="neon-btn" onClick={addTilemap} disabled={!current}>Add Tilemap → mods</button>
                <button className="neon-btn" onClick={openFolder} disabled={!current}>Open Folder</button>
                <button className="neon-btn vi" onClick={launch} disabled={!current || !assetsPorted}>▶ Launch Game</button>
              </div>
              <div className="hint">Build content in the other tabs, then <b>Add Tilemap → mods</b> drops your Pixel Palace tiles in as real OpenStarbound materials + a dungeon. <b>Launch Game</b> runs the bundled engine with your project loaded.</div>
            </div>
          </details>
        </div>
      )}

      {log && <div className="li" style={{ marginTop: 10 }}><span className="dot" style={{ background: 'var(--accent)', color: 'var(--accent)' }}></span>{log}</div>}
    </div>
  );
}
