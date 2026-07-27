import React, { useState, useRef, useEffect } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { readDir, readFile, writeFile, mkdir } from '@tauri-apps/plugin-fs';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { appDataDir } from '@tauri-apps/api/path';

export default function TileMakerDotPanel({ toast }) {
  const [activeTab, setActiveTab] = useState('tiles'); // tiles, objects, npcs
  const [activeTool, setActiveTool] = useState('brush'); // brush, random, chunk, note
  const [theme, setTheme] = useState('dark');
  const [basePath, setBasePath] = useState('');
   const [tileSize, setTileSize] = useState(PP.options?.tileSize || 32);
  const [gridSize, setGridSize] = useState({ w: 50, h: 50 });
  const [zoom, setZoom] = useState(1);
  
  const [assets, setAssets] = useState({ tiles: [], objects: [], npcs: [] });
  const [selectedIds, setSelectedIds] = useState([]); // for random brush
  const [incomingLayer, setIncomingLayer] = useState('tiles'); // where "Send → Tilemap" lands: tiles | objects | npcs
   const [sourceImg, setSourceImg] = useState(null); // image sent from the hub
   const [sliceAsGrid, setSliceAsGrid] = useState(true); // true = slice into grid, false = add as whole tile
  const [notes, setNotes] = useState([]); // annotated notes {x,y,text,color}
  const [chunkRect, setChunkRect] = useState(null); // {x0,y0,x1,y1}
  const [tiledDir, setTiledDir] = useState(''); // folder where Tiled project files are written
  const [isoMode, setIsoMode] = useState(false); // isometric projection toggle (square grid -> diamonds)
  const noteColors = ['#eab308', '#22c55e', '#3b82f6', '#ef4444', '#a855f7', '#ec4899'];
  const [noteColorIdx, setNoteColorIdx] = useState(0);
  
   const [gridData, setGridData] = useState([]); // Map of 'x,y' -> { id, layer: 'tiles|objects|npcs', z: number }
   const canvasRef = useRef(null);

   // Sync tileSize back to PP.options so Options panel stays in sync
   useEffect(() => { if (window.PP && window.PP.options) window.PP.options.tileSize = tileSize; }, [tileSize]);

  const [isDrawing, setIsDrawing] = useState(false);
  const [chunkStart, setChunkStart] = useState(null);

   const handleDrop = (e) => {
      e.preventDefault();
      const files = [...(e.dataTransfer.files || [])].filter(f => f.type.startsWith('image/'));
      if (!files.length) return;
      files.forEach(f => {
         const r = new FileReader();
         r.onload = () => ingestImage(r.result);
         r.readAsDataURL(f);
      });
      toast(`Dropping ${files.length} image(s) into tile palette`);
   };
   const handleDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; };


  const getCell = (e) => {
     const rect = canvasRef.current.getBoundingClientRect();
     if (!isoMode) {
        const x = Math.floor((e.clientX - rect.left) / (tileSize * zoom));
        const y = Math.floor((e.clientY - rect.top) / (tileSize * zoom));
        return { x, y };
     }
     // Inverse isometric projection: screen point -> grid (x,y).
     // Tile diamond half-extents: hw = tileSize*zoom, hh = hw/2.
     const hw = tileSize * zoom, hh = hw / 2;
     // Center the field so (0,0) maps to the middle.
     const px = (e.clientX - rect.left) - hw;          // shift so first diamond starts at origin
     const py = (e.clientY - rect.top) - hh;
     const gx = (px / hw + py / hh) / 2;
     const gy = (py / hh - px / hw) / 2;
     return { x: Math.floor(gx), y: Math.floor(gy) };
  };

  // Project a grid cell to its diamond top-center screen position (iso mode).
  const isoPos = (cx, cy) => {
     const hw = tileSize * zoom, hh = hw / 2;
     const sx = (cx - cy) * hw + hw;       // shift so field is on-canvas
     const sy = (cx + cy) * hh;
     return { sx, sy, hw, hh };
  };

  const handlePointerDown = (e) => {
     if (activeTool === 'chunk') { setChunkStart(getCell(e)); return; }
     if (activeTool === 'note') {
        const cell = getCell(e);
        const text = window.prompt('Note text:');
        if (text) setNotes(prev => [...prev, { x: cell.x, y: cell.y, text, color: noteColors[noteColorIdx] }]);
        return;
     }
     setIsDrawing(true);
     paintCell(getCell(e));
  };

  const handlePointerMove = (e) => {
     if (!isDrawing) return;
     if (activeTool === 'chunk' || activeTool === 'note') return;
     paintCell(getCell(e));
  };

  const handlePointerUp = (e) => {
     setIsDrawing(false);
     if (activeTool === 'chunk' && chunkStart) {
        const end = getCell(e);
        const rect = { x0: Math.min(chunkStart.x, end.x), y0: Math.min(chunkStart.y, end.y), x1: Math.max(chunkStart.x, end.x), y1: Math.max(chunkStart.y, end.y) };
        setChunkRect(rect);
        toast(`Chunk selected ${rect.x1 - rect.x0 + 1}×${rect.y1 - rect.y0 + 1}`);
        setChunkStart(null);
     }
  };

  const paintCell = ({ x, y }) => {
     if (x < 0 || y < 0 || x >= gridSize.w || y >= gridSize.h) return;
     if (selectedIds.length === 0) return;
     
     // Random Brush Logic
     const idToPaint = selectedIds[Math.floor(Math.random() * selectedIds.length)];
     
     // Find the asset to determine layer (tiles=0, objects=y, npcs=y)
     const asset = [...assets.tiles, ...assets.objects, ...assets.npcs].find(a => a.id === idToPaint);
     if (!asset) return;
     
     let z = 0;
     if (assets.objects.find(a => a.id === idToPaint) || assets.npcs.find(a => a.id === idToPaint)) {
        z = y * tileSize; // Bottom-most pixel sorting simulation
     }
     if (asset.name.includes('#B') || asset.name.includes('#b#')) z = -9999;
     if (asset.name.includes('#A') || asset.name.includes('#a#')) z = 9999;

      setGridData(prev => {
         const key = `${x},${y},${z}`; // allow stacking different Zs on same cell
         const next = [...prev.filter(i => !(i.x===x && i.y===y && i.z===z)), { x, y, z, id: idToPaint }];
         return next;
      });
   };

   // ── Ingest a sent image (from the art hub "Send → Tilemap") into collectible tiles ──
   const ingestImage = (dataURL) => {
      if (!dataURL) return;
      const img = new Image();
      img.onload = () => {
         setSourceImg(dataURL);
         const ts = tileSize;
         const newTiles = [];
         if (!sliceAsGrid) {
            // Add as a single whole tile (resize to tile size)
            const oc = document.createElement('canvas'); oc.width = ts; oc.height = ts;
            const octx = oc.getContext('2d');
            octx.drawImage(img, 0, 0, ts, ts);
            newTiles.push({ id: Date.now() + 1, name: 'sent_whole', src: oc.toDataURL('image/png') });
            toast(`Added image as 1 whole tile (${img.width}×${img.height} → ${ts}px)`);
         } else {
            // Slice into grid (original behavior)
            const cols = Math.max(1, Math.floor(img.width / ts));
            const rows = Math.max(1, Math.floor(img.height / ts));
            for (let ry = 0; ry < rows; ry++) for (let cx = 0; cx < cols; cx++) {
               const oc = document.createElement('canvas'); oc.width = ts; oc.height = ts;
               const octx = oc.getContext('2d');
               octx.drawImage(img, cx * ts, ry * ts, ts, ts, 0, 0, ts, ts);
               newTiles.push({ id: Date.now() + newTiles.length + cx + ry * 100, name: `sent_${cx}_${ry}`, src: oc.toDataURL('image/png') });
            }
            toast(`Collected ${newTiles.length} tiles from sent image (${cols}×${rows})`);
         }
         setAssets(prev => {
            const maxId = Math.max(0, ...prev.tiles.map(a => a.id), ...prev.objects.map(a => a.id), ...prev.npcs.map(a => a.id));
            let nid = maxId + 1;
            const arr = [...prev[incomingLayer]];
            newTiles.forEach(t => arr.push({ ...t, id: nid++ }));
            return { ...prev, [incomingLayer]: arr };
         });
      };
      img.onerror = () => toast('Failed to load sent image');
      img.src = dataURL;
   };

   // Listen for images pushed from the art hub
   useEffect(() => {
      const fn = (t, data) => { if (t === 'tilemap' && data) ingestImage(data); };
      if (window.PP && window.PP.inboxListeners) window.PP.inboxListeners.push(fn);
      if (window.PP && window.PP.inbox && window.PP.inbox.tilemap) ingestImage(window.PP.inbox.tilemap);
      return () => { if (window.PP && window.PP.inboxListeners) window.PP.inboxListeners = window.PP.inboxListeners.filter(x => x !== fn); };
      // eslint-disable-next-line
   }, []);

   const downloadText = (name, text) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      a.download = name; document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(a.href);
   };
   const downloadDataURL = (name, dataURL) => {
      const a = document.createElement('a');
      a.href = dataURL; a.download = name; document.body.appendChild(a); a.click(); a.remove();
   };
   const buildTileList = () => [...assets.tiles].sort((a, b) => a.id - b.id);
   const buildAtlas = async () => {
      const ts = tileSize; const list = buildTileList(); const n = list.length;
      if (!n) return null;
      const cols = Math.ceil(Math.sqrt(n)); const rows = Math.ceil(n / cols);
      const atlas = document.createElement('canvas'); atlas.width = cols * ts; atlas.height = rows * ts;
      const actx = atlas.getContext('2d');
      const loaded = await Promise.all(list.map(t => new Promise(res => {
         const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = t.src;
      })));
      loaded.forEach((im, i) => { if (im) actx.drawImage(im, (i % cols) * ts, Math.floor(i / cols) * ts, ts, ts); });
      const gidOf = {}; list.forEach((t, i) => gidOf[t.id] = i + 1);
      return { atlas, list, cols, rows, n, gidOf };
   };
   const layerData = () => {
      const W = gridSize.w, H = gridSize.h;
      const gidOf = {}; buildTileList().forEach((t, i) => gidOf[t.id] = i + 1);
      const cellTop = {};
      for (const it of gridData) { const key = it.y * W + it.x; if (!(key in cellTop) || it.z > cellTop[key].z) cellTop[key] = it; }
      const data = new Array(W * H).fill(0);
      for (const key in cellTop) data[+key] = gidOf[cellTop[key].id] || 0;
      return { W, H, data };
   };
    // id-indexed array (tiles[id] = src) for collision/markers/level consumers
    const buildIdIndexedTiles = () => {
       const arr = [];
       ['tiles', 'objects', 'npcs'].forEach(type => assets[type].forEach(a => { arr[a.id] = a.src; }));
       return arr;
    };
    const publishTilemap = () => {
       const ts = tileSize; const W = gridSize.w, H = gridSize.h;
       // 2D grid[y][x] with top-most tile id (or -1 when empty) — shape expected by Collision/Markers/Level
       const grid2d = Array.from({ length: H }, () => new Array(W).fill(-1));
       const cellTop = {};
       for (const it of gridData) {
          const key = it.y * W + it.x;
          if (!(key in cellTop) || it.z > cellTop[key].z) cellTop[key] = it;
       }
       for (const key in cellTop) { const it = cellTop[key]; grid2d[it.y][it.x] = it.id; }
       if (window.PP) window.PP.tilemap = {
          tileSize: ts, cols: W, rows: H,
          grid: grid2d,
          tiles: buildIdIndexedTiles(),   // tiles[id] = src (id-indexed)
          gridData,                        // keep sparse 1D form for round-tripping
       };
    };
    // Keep PP.tilemap in sync for Collision / Markers / Level tabs
    useEffect(() => { publishTilemap(); }, [gridData, assets, gridSize, tileSize]); // eslint-disable-line
    const buildExport = async () => {
        const built = await buildAtlas(); if (!built) return null;
        const { atlas, cols, n } = built;
        const { W, H, data } = layerData();
        const orientation = isoMode ? 'isometric' : 'orthogonal';
        // Isometric tiles are diamonds: width = tileSize, height = tileSize*2 in Tiled/Godot.
        const tw = isoMode ? tileSize : tileSize;
        const th = isoMode ? tileSize * 2 : tileSize;
        const map = {
           type: 'map', version: 1, orientation, renderorder: 'right-down',
           width: W, height: H, tilewidth: tw, tileheight: th,
           tilesets: [{ firstgid: 1, name: 'tiles', image: 'tilesheet.png', imagewidth: atlas.width, imageheight: atlas.height, tilewidth: tw, tileheight: th, margin: 0, spacing: 0, columns: cols, tilecount: n }],
           layers: [{ type: 'tilelayer', name: 'Tile Layer 1', width: W, height: H, data, x: 0, y: 0, opacity: 1, visible: true }]
        };
        let csv = '';
        for (let y = 0; y < H; y++) { csv += data.slice(y * W, y * W + W).join(',') + '\n'; }
        const tmx = `<?xml version="1.0" encoding="UTF-8"?>\n<map version="1.10" tiledversion="1.10" orientation="${orientation}" renderorder="right-down" width="${W}" height="${H}" tilewidth="${tw}" tileheight="${th}" infinite="0" nextlayerid="2" nextobjectid="1">\n <tileset firstgid="1" name="tiles" tilewidth="${tw}" tileheight="${th}" tilecount="${n}" columns="${cols}">\n  <image source="tilesheet.png" width="${atlas.width}" height="${atlas.height}"/>\n </tileset>\n <layer id="1" name="Tile Layer 1" width="${W}" height="${H}">\n  <data encoding="csv">\n${csv}  </data>\n </layer>\n</map>`;
        return { atlas, cols, n, W, H, data, map, tmx };
    };
    const exportJSON = async () => {
       const ex = await buildExport(); if (!ex) { toast('No tiles to export'); return; }
       publishTilemap();
       downloadDataURL('tilesheet.png', ex.atlas.toDataURL('image/png'));
       downloadText('tilemap_' + Date.now() + '.json', JSON.stringify(ex.map, null, 2));
       toast('Exported Tiled JSON + tilesheet (' + ex.n + ' tiles)');
    };
    const exportTMJ = async () => {
       const ex = await buildExport(); if (!ex) { toast('No tiles to export'); return; }
       publishTilemap();
       downloadDataURL('tilesheet.png', ex.atlas.toDataURL('image/png'));
       downloadText('tilemap_' + Date.now() + '.tmj', JSON.stringify(ex.map, null, 2));
       toast('Exported Tiled TMJ + tilesheet');
    };
    const exportTMX = async () => {
       const ex = await buildExport(); if (!ex) { toast('No tiles to export'); return; }
       publishTilemap();
       downloadDataURL('tilesheet.png', ex.atlas.toDataURL('image/png'));
       downloadText('tilemap_' + Date.now() + '.tmx', ex.tmx);
       toast('Exported Tiled TMX + tilesheet');
    };
    const exportCSV = () => {
       const { W, H, data } = layerData();
       publishTilemap();
       let csv = '';
       for (let y = 0; y < H; y++) csv += data.slice(y * W, y * W + W).join(',') + '\n';
       downloadText('tilemap_' + Date.now() + '.csv', csv);
       toast('Exported CSV grid (' + W + '×' + H + ')');
    };
    const exportLVL = () => {
       const { W, H, data } = layerData();
       publishTilemap();
       let out = '';
       for (let y = 0; y < H; y++) out += data.slice(y * W, y * W + W).join(' ') + '\n';
       downloadText('tilemap_' + Date.now() + '.lvl', out);
       toast('Exported ultra-light .LVL');
    };
     const importSpritesheet = async () => {
        try {
           const p = await open({ multiple: false, filters: [{ name: 'PNG', extensions: ['png'] }] });
           if (!p) return;
           const bytes = await readFile(p);
           let bin = ''; bytes.forEach(b => bin += String.fromCharCode(b));
           ingestImage('data:image/png;base64,' + btoa(bin));
           toast('Sliced spritesheet into tiles');
        } catch (e) { toast('Spritesheet import failed: ' + e); }
     };
     const importTiledJson = async () => {
        try {
           const p = await open({ multiple: false, filters: [{ name: 'Tiled JSON', extensions: ['json', 'tmj'] }] });
           if (!p) return;
           const bytes = await readFile(p);
           let txt = ''; bytes.forEach(b => txt += String.fromCharCode(b));
           const map = JSON.parse(txt);
           if (!map.layers || !map.tilesets) { toast('Not a valid Tiled JSON'); return; }
           const ts = map.tilewidth || tileSize;
           const W = map.width || 50, H = map.height || 50;
           setTileSize(ts);
           setGridSize({ w: W, h: H });
           // Import tileset images if available
           const newTiles = [];
           for (const tsDef of map.tilesets) {
              if (tsDef.image) {
                 // Try to load the tilesheet image
                 const imgSrc = tsDef.image.startsWith('/') ? convertFileSrc(tsDef.image) : tsDef.image;
                 const img = await new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = imgSrc; });
                 if (img) {
                    const cols = tsDef.columns || Math.ceil(img.width / ts);
                    const rows = Math.ceil((tsDef.tilecount || cols * Math.ceil(img.height / ts)) / cols);
                    for (let ry = 0; ry < rows; ry++) for (let cx = 0; cx < cols; cx++) {
                       const gid = (tsDef.firstgid || 1) + ry * cols + cx;
                       const oc = document.createElement('canvas'); oc.width = ts; oc.height = ts;
                       const octx = oc.getContext('2d');
                       octx.drawImage(img, cx * ts, ry * ts, ts, ts, 0, 0, ts, ts);
                       newTiles.push({ id: gid, name: `imported_${gid}`, src: oc.toDataURL('image/png') });
                    }
                 }
              }
           }
           if (newTiles.length) {
              setAssets(prev => ({ ...prev, tiles: [...prev.tiles, ...newTiles] }));
           }
           // Import layer data
           const layer = (map.layers || []).find(l => l.type === 'tilelayer');
           if (layer && layer.data) {
              const gd = [];
              for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
                 const gid = layer.data[y * W + x] || 0;
                 if (gid > 0) gd.push({ x, y, z: 0, id: gid });
              }
              setGridData(gd);
           }
           toast('Imported Tiled JSON (' + W + '×' + H + ', ' + newTiles.length + ' tiles)');
        } catch (e) { toast('Tiled JSON import failed: ' + e); }
     };
    const saveChunk = () => {
       if (!chunkRect) { toast('Select a chunk first (Chunk tool → drag)'); return; }
       const sel = gridData.filter(it => it.x >= chunkRect.x0 && it.x <= chunkRect.x1 && it.y >= chunkRect.y0 && it.y <= chunkRect.y1)
                           .map(it => ({ ...it, x: it.x - chunkRect.x0, y: it.y - chunkRect.y0 }));
       const chunk = { type: 'tmdot', w: chunkRect.x1 - chunkRect.x0 + 1, h: chunkRect.y1 - chunkRect.y0 + 1, tiles: buildIdIndexedTiles(), data: sel };
       downloadText('chunk_' + Date.now() + '.tmdot', JSON.stringify(chunk));
       toast('Saved chunk ' + chunk.w + '×' + chunk.h);
    };
     const loadChunk = async () => {
        try {
           const p = await open({ multiple: false, filters: [{ name: 'Chunk', extensions: ['tmdot', 'json'] }] });
           if (!p) return;
           const bytes = await readFile(p);
           let txt = ''; bytes.forEach(b => txt += String.fromCharCode(b));
           const chunk = JSON.parse(txt);
           const ox = chunkRect ? chunkRect.x0 : 0, oy = chunkRect ? chunkRect.y0 : 0;
           const incoming = (chunk.data || []).map(it => ({ ...it, x: it.x + ox, y: it.y + oy }));
           setGridData(prev => [...prev, ...incoming]);
           toast('Loaded chunk at ' + ox + ',' + oy);
        } catch (e) { toast('Chunk load failed: ' + e); }
     };

     // Write the current map (tilesheet.png + tilemap.tmx) and open it in the
     // bundled Tiled editor. Tiled is GPL / libtiled BSD; it runs as a separate
     // process (mere aggregation), so Pixel Palace's license is unaffected.
     const dataURLToBytes = (dataURL) => {
        const base64 = dataURL.split(',')[1] || '';
        const bin = atob(base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return bytes;
     };
     const openInTiled = async () => {
        const ex = await buildExport();
        let dir = tiledDir;
        if (!dir) {
           dir = await open({ directory: true, multiple: false, title: 'Pick Tiled project folder (writes tilesheet + map)' });
           if (!dir) {
              try { dir = (await appDataDir()) + 'PixelPalace/tiled'; } catch { toast('No folder selected for Tiled'); return; }
           }
           setTiledDir(dir);
        }
        try {
           if (!ex) { await invoke('launch_tiled', { mapPath: null }); toast('Opened Tiled'); return; }
           await mkdir(dir, { recursive: true });
           await writeFile(`${dir}/tilesheet.png`, dataURLToBytes(ex.atlas.toDataURL('image/png')));
           await writeFile(`${dir}/tilemap.tmx`, new TextEncoder().encode(ex.tmx));
           await invoke('launch_tiled', { mapPath: `${dir}/tilemap.tmx` });
           toast('Opened map in Tiled (' + ex.n + ' tiles)');
        } catch (e) { toast('Tiled launch failed: ' + e); }
     };

     // ── Whole-map transforms (Flip H / Flip V / Rotate 90° CW) ──
     const transformGrid = (op) => {
        const W = gridSize.w, H = gridSize.h;
        const isRot = op === 'rotCW';
        const nW = isRot ? H : W, nH = isRot ? W : H;
        const mapXY = (x, y) => {
           if (op === 'flipH') return { x: W - 1 - x, y };
           if (op === 'flipV') return { x, y: H - 1 - y };
           if (op === 'rotCW') return { x: H - 1 - y, y: x };
           return { x, y };
        };
        const isObjNpc = (id) => assets.objects.some(a => a.id === id) || assets.npcs.some(a => a.id === id);
        setGridData(prev => prev.map(it => {
           const { x, y } = mapXY(it.x, it.y);
           const z = isObjNpc(it.id) ? y * tileSize : it.z;
           return { ...it, x, y, z };
        }));
        setNotes(prev => prev.map(n => { const { x, y } = mapXY(n.x, n.y); return { ...n, x, y }; }));
        if (chunkRect) {
           const c0 = mapXY(chunkRect.x0, chunkRect.y0), c1 = mapXY(chunkRect.x1, chunkRect.y1);
           setChunkRect({ x0: Math.min(c0.x, c1.x), y0: Math.min(c0.y, c1.y), x1: Math.max(c0.x, c1.x), y1: Math.max(c0.y, c1.y) });
        }
        if (isRot) setGridSize({ w: nW, h: nH });
        toast(op === 'flipH' ? 'Flipped map horizontally' : op === 'flipV' ? 'Flipped map vertically' : 'Rotated map 90°');
     };



  const scanAssets = async () => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (!selected) return;
      setBasePath(selected);
      
       const newAssets = { tiles: [], objects: [], npcs: [] };
       let nextId = 1;
       const scanFolder = async (folderName, type) => {
          try {
             const entries = await readDir(`${selected}/${folderName}`);
             for (const entry of entries) {
                if (entry.name.endsWith('.png') && !entry.name.includes('#hidden')) {
                   const match = entry.name.match(/^(\d+)_/);
                   const id = match ? parseInt(match[1]) : nextId++;
                   const src = convertFileSrc(`${selected}/${folderName}/${entry.name}`);
                   newAssets[type].push({ id, name: entry.name, src });
                   if (id >= nextId) nextId = id + 1;
                }
             }
          } catch (e) {
             console.warn(`Could not read ${folderName}: `, e);
          }
       };
      
      await scanFolder('tiles', 'tiles');
      await scanFolder('objects', 'objects');
      await scanFolder('npcs', 'npcs');
      
      setAssets(newAssets);
      toast(`Loaded assets from ${selected}`);
    } catch (e) {
      toast("Error scanning assets: " + e);
    }
  };

  const drawGrid = () => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const tw = tileSize * zoom;
    // In iso mode the canvas needs room for the diamond spread (w+h) * half-height.
    const cw = cv.width = isoMode ? (gridSize.w + gridSize.h + 1) * tw : gridSize.w * tw;
    const ch = cv.height = isoMode ? (gridSize.w + gridSize.h + 1) * (tw / 2) + tw : gridSize.h * tw;
    
    ctx.clearRect(0, 0, cw, ch);
    
    if (!isoMode) {
       // Draw background grid lines
       ctx.strokeStyle = theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
       ctx.lineWidth = 1;
       for(let x=0; x<=gridSize.w; x++) { ctx.beginPath(); ctx.moveTo(x*tw, 0); ctx.lineTo(x*tw, ch); ctx.stroke(); }
       for(let y=0; y<=gridSize.h; y++) { ctx.beginPath(); ctx.moveTo(0, y*tw); ctx.lineTo(cw, y*tw); ctx.stroke(); }
    } else {
       // Iso grid guides (diamonds)
       ctx.strokeStyle = theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
       ctx.lineWidth = 1;
       for (let cy=0; cy<gridSize.h; cy++) for (let cx=0; cx<gridSize.w; cx++) {
          const { sx, sy, hw, hh } = isoPos(cx, cy);
          ctx.beginPath();
          ctx.moveTo(sx, sy); ctx.lineTo(sx+hw, sy+hh); ctx.lineTo(sx, sy+2*hh); ctx.lineTo(sx-hw, sy+hh); ctx.closePath();
          ctx.stroke();
       }
    }
    
    // Sort items by Z (Layer simplicity)
    const sorted = [...gridData].sort((a,b) => a.z - b.z);
    
    sorted.forEach(item => {
       const asset = [...assets.tiles, ...assets.objects, ...assets.npcs].find(a => a.id === item.id);
       if (asset) {
          const img = new Image();
          img.onload = () => {
             if (!isoMode) {
                ctx.drawImage(img, item.x * tw, item.y * tw, img.width * zoom, img.height * zoom);
             } else {
                // Draw the tile as the top face of a diamond (squash vertically by half).
                const { sx, sy, hw, hh } = isoPos(item.x, item.y);
                ctx.save();
                ctx.translate(sx, sy + hh);            // diamond top-center
                ctx.scale(1, 0.5);                     // iso squash
                ctx.drawImage(img, -hw, -hw, hw*2, hw*2);
                ctx.restore();
             }
          };
          img.src = asset.src;
       }
    });
     // Annotated notes layer
      notes.forEach(n => {
         const cx = n.x * tileSize * zoom + tileSize * zoom / 2;
         const cy = n.y * tileSize * zoom + tileSize * zoom / 2;
         const r = Math.max(3, tileSize * zoom * 0.28);
         ctx.fillStyle = n.color; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
         ctx.fillStyle = '#000'; ctx.font = `bold ${Math.max(9, tileSize * zoom * 0.4)}px monospace`;
         ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
         ctx.fillText((n.text || '?').slice(0, 1).toUpperCase(), cx, cy);
      });

      // Chunk selection highlight (purple dashed box)
      if (chunkRect) {
         const x = chunkRect.x0 * tileSize * zoom;
         const y = chunkRect.y0 * tileSize * zoom;
         const w = (chunkRect.x1 - chunkRect.x0 + 1) * tileSize * zoom;
         const h = (chunkRect.y1 - chunkRect.y0 + 1) * tileSize * zoom;
         ctx.save();
         ctx.fillStyle = 'rgba(168,85,247,0.14)';
         ctx.fillRect(x, y, w, h);
         ctx.strokeStyle = '#a855f7';
         ctx.lineWidth = 2;
         ctx.setLineDash([6, 4]);
         ctx.strokeRect(x, y, w, h);
         ctx.restore();
      }
   };
   
  useEffect(() => { drawGrid(); }, [gridData, zoom, theme, gridSize, assets, notes]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: theme === 'dark' ? '#1e1e1e' : '#f5f5f5', color: theme === 'dark' ? '#fff' : '#000' }}>
      
      {/* TOP TOOLBAR */}
      <div style={{ display: 'flex', padding: '10px 20px', background: theme === 'dark' ? '#2d2d2d' : '#e0e0e0', borderBottom: theme === 'dark' ? '1px solid #444' : '1px solid #ccc', gap: '15px', alignItems: 'center' }}>
         <h3 style={{ margin: 0, fontWeight: 800, letterSpacing: 1 }}>TileMaker DOT</h3>
         
         <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', background: theme === 'dark' ? '#111' : '#ddd', padding: 4, borderRadius: 6 }}>
           <button onClick={() => setActiveTool('brush')} style={{ background: activeTool === 'brush' ? '#22c55e' : 'transparent', color: activeTool === 'brush' ? '#000' : (theme === 'dark' ? '#fff' : '#000'), border: 'none', padding: '5px 12px', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold' }}>o Brush</button>
           <button onClick={() => setActiveTool('random')} style={{ background: activeTool === 'random' ? '#3b82f6' : 'transparent', color: activeTool === 'random' ? '#fff' : (theme === 'dark' ? '#fff' : '#000'), border: 'none', padding: '5px 12px', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold' }}>Y2 Random Scatter</button>
           <button onClick={() => setActiveTool('chunk')} style={{ background: activeTool === 'chunk' ? '#a855f7' : 'transparent', color: activeTool === 'chunk' ? '#fff' : (theme === 'dark' ? '#fff' : '#000'), border: 'none', padding: '5px 12px', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold' }}>Y Chunk Tool</button>
           
        <div style={{ display: 'flex', gap: 15, background: theme === 'dark' ? '#111' : '#ddd', padding: 4, borderRadius: 6, alignItems: 'center' }}>
           <label style={{ fontSize: 11, display: 'flex', gap: 4, alignItems: 'center' }}>Grid W: <input type="number" value={gridSize.w} onChange={e=>setGridSize(prev=>({...prev, w: parseInt(e.target.value)||50}))} style={{width: 60, padding: '2px 4px', background: '#000', color: '#fff', border: '1px solid #444', textAlign: 'left'}} /></label>
           <label style={{ fontSize: 11, display: 'flex', gap: 4, alignItems: 'center' }}>Grid H: <input type="number" value={gridSize.h} onChange={e=>setGridSize(prev=>({...prev, h: parseInt(e.target.value)||50}))} style={{width: 60, padding: '2px 4px', background: '#000', color: '#fff', border: '1px solid #444', textAlign: 'left'}} /></label>
           <label style={{ fontSize: 11, display: 'flex', gap: 4 }}>Tile Size: 
              <select value={tileSize} onChange={e=>setTileSize(parseInt(e.target.value))} style={{background: '#000', color: '#fff', border: '1px solid #444'}}>
                 <option value="16">16px</option><option value="32">32px</option><option value="64">64px</option>
              </select>
           </label>
           <label style={{ fontSize: 11, display: 'flex', gap: 4 }}>Zoom: 
              <select value={zoom} onChange={e=>setZoom(parseFloat(e.target.value))} style={{background: '#000', color: '#fff', border: '1px solid #444'}}>
                 <option value="0.5">0.5x</option><option value="1">1x</option><option value="2">2x</option><option value="4">4x</option>
              </select>
           </label>
        </div>

            <button onClick={() => setActiveTool('note')} style={{ background: activeTool === 'note' ? '#eab308' : 'transparent', color: activeTool === 'note' ? '#000' : (theme === 'dark' ? '#fff' : '#000'), border: 'none', padding: '5px 12px', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold' }}>S Notes</button>
            <button onClick={() => setNoteColorIdx(i => (i + 1) % noteColors.length)} title="Cycle note color" style={{ background: noteColors[noteColorIdx], border: 'none', width: 24, height: 24, borderRadius: 4, cursor: 'pointer' }}></button>
         </div>
         
         <div style={{ flex: 1 }}></div>
         
           <button className="neon-btn cy" onClick={exportTMX}>Export .TMX</button>
           <button className="neon-btn" onClick={openInTiled} title="Open this map in the bundled Tiled editor" style={{ background: '#7c3aed', color: '#fff' }}>◆ Open in Tiled</button>
           <button className="neon-btn mg" onClick={exportJSON}>Export JSON</button>
           <button className="neon-btn vi" onClick={exportTMJ}>Export .TMJ</button>
           <button className="neon-btn" onClick={exportCSV}>Export CSV</button>
           <button className="neon-btn" onClick={exportLVL}>Export .LVL</button>
           <button className="neon-btn am" onClick={saveChunk}>Save Chunk</button>
           <button className="neon-btn am" onClick={loadChunk}>Load Chunk</button>
           <span style={{ background: theme === 'dark' ? '#111' : '#ddd', padding: '2px 6px', borderRadius: 6, display: 'flex', gap: 4, alignItems: 'center', fontSize: 11 }}>Transform:
             <button className="neon-btn" style={{ padding: '4px 8px' }} title="Flip map horizontally" onClick={() => transformGrid('flipH')}>⇄ H</button>
             <button className="neon-btn" style={{ padding: '4px 8px' }} title="Flip map vertically" onClick={() => transformGrid('flipV')}>⇅ V</button>
             <button className="neon-btn" style={{ padding: '4px 8px' }} title="Rotate map 90°" onClick={() => transformGrid('rotCW')}>⟳ 90°</button>
           </span>
           <button onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} className="neon-btn">{theme==='dark'?'~ Light Mode':'~ Dark Mode'}</button>
           <button onClick={() => setIsoMode(v => !v)} className="neon-btn" style={{ background: isoMode ? '#7c3aed' : 'transparent', color: isoMode ? '#fff' : (theme === 'dark' ? '#fff' : '#000') }} title="Toggle isometric diamond projection (you still draw on a square grid)">◆ Isometric {isoMode ? 'On' : 'Off'}</button>
      </div>
      
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        
        {/* LEFT SIDEBAR - ASSETS */}
        <div style={{ width: '320px', display: 'flex', flexDirection: 'column', borderRight: theme === 'dark' ? '1px solid #444' : '1px solid #ccc', background: theme === 'dark' ? '#252525' : '#e8e8e8' }} onDrop={handleDrop} onDragOver={handleDragOver}>
           <div style={{ display: 'flex', borderBottom: theme === 'dark' ? '1px solid #444' : '1px solid #ccc' }}>
              <button onClick={() => setActiveTab('tiles')} style={{ flex: 1, padding: '12px 10px', background: activeTab === 'tiles' ? (theme === 'dark' ? '#333' : '#fff') : 'transparent', color: theme === 'dark' ? '#fff' : '#000', border: 'none', cursor: 'pointer', fontWeight: activeTab === 'tiles' ? 'bold' : 'normal' }}>Tiles</button>
              <button onClick={() => setActiveTab('objects')} style={{ flex: 1, padding: '12px 10px', background: activeTab === 'objects' ? (theme === 'dark' ? '#333' : '#fff') : 'transparent', color: theme === 'dark' ? '#fff' : '#000', border: 'none', cursor: 'pointer', fontWeight: activeTab === 'objects' ? 'bold' : 'normal' }}>Objects</button>
              <button onClick={() => setActiveTab('npcs')} style={{ flex: 1, padding: '12px 10px', background: activeTab === 'npcs' ? (theme === 'dark' ? '#333' : '#fff') : 'transparent', color: theme === 'dark' ? '#fff' : '#000', border: 'none', cursor: 'pointer', fontWeight: activeTab === 'npcs' ? 'bold' : 'normal' }}>NPCs</button>
           </div>
           
           <div style={{ padding: '15px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
               <button onClick={scanAssets} className="neon-btn vi" style={{ width: '100%' }}>" Scan Assets Folder (F4)</button>
                <button onClick={importSpritesheet} className="neon-btn vi" style={{ width: '100%' }}>⊞ Slice Spritesheet (PNG)</button>
                <button onClick={importTiledJson} className="neon-btn" style={{ width: '100%' }}>↗ Import Tiled JSON/TMJ</button>
                <label style={{ fontSize: 11, display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
                  Send&nbsp;→&nbsp;
                  <select value={incomingLayer} onChange={e=>setIncomingLayer(e.target.value)} style={{ background: '#000', color: '#fff', border: '1px solid #444', flex: 1 }}>
                    <option value="tiles">Tiles</option>
                    <option value="objects">Objects</option>
                    <option value="npcs">NPCs</option>
                  </select>
                </label>
                <label style={{ fontSize: 11, display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                  <input type="checkbox" checked={sliceAsGrid} onChange={e=>setSliceAsGrid(e.target.checked)} style={{accentColor:'#22c55e'}} />
                  Slice sent images as grid
                </label>
                <div style={{ fontSize: 10, opacity: 0.6 }}>{sliceAsGrid?'Images are sliced into tileSize tiles.':'Images are added as one whole tile.'}</div>
               <div style={{ fontSize: '11px', color: '#888' }}>
                  Base: {basePath || 'None Selected'}
               </div>
               {sourceImg && (
                  <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 11, marginBottom: 4, color: '#9ad' }}>Sent image ({sliceAsGrid?'sliced as grid':'added as whole tile'}):</div>
                     <img src={sourceImg} style={{ width: '100%', imageRendering: 'pixelated', border: '1px solid #555', borderRadius: 4 }} />
                      <button onClick={() => ingestImage(sourceImg)} className="neon-btn vi" style={{ width: '100%', marginTop: 6 }}>↻ Re-collect ({sliceAsGrid?'grid':'whole'})</button>
                  </div>
               )}
            </div>
           
           <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {assets[activeTab].map(item => (
                 <div key={item.id} onClick={() => {
                    if (activeTool === 'random') {
                       setSelectedIds(prev => prev.includes(item.id) ? prev.filter(id => id !== item.id) : [...prev, item.id]);
                    } else {
                       setSelectedIds([item.id]);
                    }
                 }} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px', background: selectedIds.includes(item.id) ? '#22c55e' : (theme === 'dark' ? '#333' : '#fff'), color: selectedIds.includes(item.id) ? '#000' : (theme === 'dark' ? '#fff' : '#000'), borderRadius: 6, cursor: 'pointer', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}>
                    <div style={{ width: 40, height: 40, background: '#111', border: '1px solid #555', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: 4 }}>
                       <img src={item.src} style={{ maxWidth: '100%', maxHeight: '100%', imageRendering: 'pixelated' }} />
                    </div>
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                       <div style={{ fontWeight: 'bold', fontSize: 13 }}>ID: {item.id}</div>
                       <div style={{ fontSize: 11, opacity: 0.7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                    </div>
                 </div>
              ))}
               {assets[activeTab].length === 0 && (
                  <div style={{ padding: 20, textAlign: 'center', color: '#888', fontStyle: 'italic' }}>
                     Click Scan Assets to load images, or drag-and-drop images here.<br/><br/>Images must be named like:<br/>`101_grass.png`
                  </div>
               )}
           </div>
        </div>
        
        {/* MAIN CANVAS */}
        <div style={{ flex: 1, background: theme === 'dark' ? '#111' : '#ccc', position: 'relative', overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
           <canvas ref={canvasRef} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp}  style={{ background: theme === 'dark' ? '#222' : '#fff', boxShadow: '0 0 30px rgba(0,0,0,0.5)', imageRendering: 'pixelated' }}></canvas>
        </div>
        
      </div>
    </div>
  );
}
