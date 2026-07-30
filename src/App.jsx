import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import TileMakerPanel from './components/TileMakerPanel';
import GamePanel from './components/GamePanel';
import { invoke } from '@tauri-apps/api/core';
import { save as tauriSave, open as tauriOpen } from '@tauri-apps/plugin-dialog';
import { writeTextFile, writeFile, readTextFile, readFile } from '@tauri-apps/plugin-fs';

window.__tauriSave = async (data, defaultName, extension) => {
  try {
    const isImage = extension === 'png' || extension === 'gif' || defaultName.endsWith('.png');
    const filters = extension === 'png' ? [{name: 'Image', extensions: ['png']}]
                  : extension === 'pproj' ? [{name: 'Pixel Palace Project', extensions: ['pproj']}]
                  : extension === 'json' ? [{name: 'JSON File', extensions: ['json']}]
                  : extension === 'gif' ? [{name: 'GIF', extensions: ['gif']}]
                  : extension === 'tres' ? [{name: 'Godot TileSet', extensions: ['tres']}]
                  : [];
    const filePath = await tauriSave({ defaultPath: defaultName, filters });
    if (!filePath) return;
    if (isImage || (typeof data === 'string' && data.startsWith('data:image'))) {
      const res = await fetch(data);
      const buffer = await res.arrayBuffer();
      await writeFile(filePath, new Uint8Array(buffer));
    } else {
      await writeTextFile(filePath, data);
    }
    return filePath;
  } catch(e) {
    console.error("Tauri Save Error", e);
    if (window.__ppToast) window.__ppToast("Save cancelled or failed");
  }
};

window.__tauriLoad = async (extension) => {
  try {
    const filters = extension === 'pproj' ? [{name: 'Pixel Palace Project', extensions: ['pproj']}]
                  : extension === 'png' ? [{name: 'Image', extensions: ['png', 'jpg', 'jpeg']}]
                  : [];
    const filePath = await tauriOpen({ multiple: false, filters });
    if (!filePath) return null;
    if (extension === 'pproj' || extension === 'json' || extension === 'txt') {
      const text = await readTextFile(filePath);
      return text;
    } else {
      const bytes = await readFile(filePath);
      const blob = new Blob([bytes], {type: extension === 'png' ? 'image/png' : 'application/octet-stream'});
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsDataURL(blob);
      });
    }
  } catch(e) {
    console.error("Tauri Load Error", e);
    alert("Error loading: " + e.message);
    return null;
  }
};

import './index.css';



// ── shared project bus (survives tab switches) ──
window.PP = window.PP || {
  inbox:{}, assets:[], collisions:[], markers:[], markup:[], graph:[], tilemap:null, workingCanvas:{},
  options:{ tileSize:16, gridW:40, gridH:30, accent:'#10b981', showGrid:true, exportFmt:'json', cursorStyle:'cross', noDoubles:false, aiEnabled:true }
};
const PP = window.PP;
// Event bus so receiving tabs react to Sends automatically (real inter-tab threading).
PP.inboxListeners = [];
PP.notifyInbox = (target, data) => { PP.inbox[target] = data; (PP.inboxListeners || []).forEach(fn => { try { fn(target, data); } catch (e) {} }); };

const SHAPE_DEFS = {
  platform:{name:'Walkable Platform',color:'#10b981'},
  wall:    {name:'Wall',color:'#22d3ee'},
  slope:   {name:'Slope',color:'#a78bfa'},
  oneway:  {name:'One-Way Platform',color:'#fbbf24'},
  killzone:{name:'Kill Zone',color:'#ff4ecd'},
};
const MARKER_DEFS = {
  player_start:{name:'Player Start',color:'#10b981',glyph:'P'},
  enemy_spawn: {name:'Enemy Spawn',color:'#ff4ecd',glyph:'E'},
  item_pickup: {name:'Item Pickup',color:'#fbbf24',glyph:'I'},
  exit:        {name:'Pipe / Exit',color:'#22d3ee',glyph:'X'},
  save_point:  {name:'Save Point',color:'#a78bfa',glyph:'S'},
};

const TABS = [
  {id:'hub', label:'Art Hub', icon:'🎨', kind:'native'},
  {id:'editor', label:'Editor', icon:'◆', kind:'iframe', src:'tools/pixel_palace_editor.html'},
  {id:'forge',  label:'Forge',  icon:'▦', kind:'iframe', src:'tools/pixel_forge.html'},
  {id:'studio', label:'Studio', icon:'❉', kind:'iframe', src:'tools/pixel_forge_studio.html'},
  {id:'animator', label:'Animator', icon:'◈', kind:'iframe', src:'tools/sprite_animator.html'},
  {id:'water',  label:'Water',  icon:'🌊', kind:'iframe', src:'tools/watercolor_processor.html'},
  {id:'alpha',  label:'Alpha',  icon:'◌', kind:'iframe', src:'tools/WatercolorTransparencyTool.html'},
  {id:'extract',label:'Extract',icon:'⊡', kind:'iframe', src:'tools/asset_extractor.html'},
  {id:'trace',  label:'Trace',  icon:'✏', kind:'iframe', src:'tools/scan_trace.html'},
  {id:'pixscii',label:'Pixscii',icon:'✦', kind:'iframe', src:'tools/pixscii.html'},
  {id:'aistudio',label:'AI Studio',icon:'✨', kind:'iframe', src:'tools/ai_studio.html'},
  {id:'tilemap',label:'Tilemap',icon:'▦', kind:'native'},
  {id:'collision',label:'Collision',icon:'▱',kind:'native'},
  {id:'markup',label:'Markup',icon:'✎',kind:'native'},
  {id:'markers',label:'Markers',icon:'⌖', kind:'native'},
  {id:'build',  label:'Build',  icon:'▤', kind:'native'},
  {id:'graph',  label:'Graph',  icon:'⧉', kind:'native'},
  {id:'game',   label:'Game',   icon:'🎮', kind:'native'},
  {id:'options',label:'Options',icon:'⚙', kind:'native'},
  {id:'pipeline',label:'Pipe', icon:'⇄', kind:'native'},
  {id:'info',  label:'Info',  icon:'ℹ', kind:'native'},
];

function loadImg(dataURL){return new Promise((res,rej)=>{const im=new Image();im.onload=()=>res(im);im.onerror=rej;im.src=dataURL;});}
function download(filename,text){ const content = typeof text==='string'?text:JSON.stringify(text,null,2); const ext = filename.split('.').pop() || 'txt'; if(window.__tauriSave) window.__tauriSave(content, filename, ext); }
function dataURLtoBlob(dataURL){const [h,body]=dataURL.split(',');const mime=h.match(/:(.*?);/)[1];const bin=atob(body);const arr=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);return new Blob([arr],{type:mime});}

/* ---- shared: render PP.tilemap grid to a dataURL (used by Collision, Markup, Markers) ---- */
function loadTilemapBg(){
  if(!PP.tilemap||!PP.tilemap.grid||!PP.tilemap.grid.length) return null;
  const {tileSize,cols,rows,grid,tiles}=PP.tilemap;
  const W=cols*tileSize,H=rows*tileSize;
  const c=document.createElement('canvas');c.width=W;c.height=H;const cx=c.getContext('2d');
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const idx=grid[y][x];if(idx>=0&&tiles[idx]){const im=new Image();im.onload=()=>cx.drawImage(im,x*tileSize,y*tileSize,tileSize,tileSize);im.src=tiles[idx];}}
  return c.toDataURL();
}

/* ---- canvas loader for native panels ---- */
function useCanvasStage(draw){
  const canvasRef=useRef(null); const imgRef=useRef(null); const scaleRef=useRef(1);
  const [hasImg,setHasImg]=useState(false);
  const loadFile=(file)=>{const r=new FileReader();r.onload=e=>{const im=new Image();im.onload=()=>{imgRef.current=im;setHasImg(true);};im.src=e.target.result;};r.readAsDataURL(file);};
  const loadDataURL=(url)=>{const im=new Image();im.onload=()=>{imgRef.current=im;setHasImg(true);};im.src=url;};
  const render=()=>{const cv=canvasRef.current;if(!cv||!imgRef.current)return;const im=imgRef.current;
    const par=cv.parentElement;
    const maxW=(par?par.clientWidth:0)-24, maxH=(par?par.clientHeight:0)-24;
    if(maxW<1||maxH<1)return;
    const s=Math.min(maxW/im.width,maxH/im.height,8);scaleRef.current=s;
    cv.width=Math.max(1,Math.round(im.width*s));cv.height=Math.max(1,Math.round(im.height*s));
    const ctx=cv.getContext('2d');ctx.clearRect(0,0,cv.width,cv.height);ctx.drawImage(im,0,0,cv.width,cv.height);
    if(draw)draw(ctx,cv,s);};
  useEffect(()=>{if(hasImg)render();},[hasImg]);
  useEffect(()=>{const h=()=>{if(hasImg&&canvasRef.current&&canvasRef.current.parentElement){const par=canvasRef.current.parentElement;if(par.clientWidth>1&&par.clientHeight>1)render();}};window.addEventListener('resize',h);return()=>window.removeEventListener('resize',h);},[hasImg]);
  return {canvasRef,loadFile,loadDataURL,render,imgRef,scaleRef,hasImg};
}

/* =================== ASSETS =================== */

/* =================== ART HUB (was Assets) =================== */
function HubPanel({toast, setActive, projects={}, fmtTime=()=>'', onOpenProject, onDeleteProject, onSaveProject, projName, setProjName}){
  const [items,setItems]=useState(PP.assets);
  const [activeFolder, setActiveFolder] = useState('All');
  const [showProjects,setShowProjects]=useState(true);
  
  const refresh=()=>{ setItems([...PP.assets]); }; window.__ppRefreshHub = refresh;
  const projThumb=(p)=>{ try{ const s=p&&p.data&&p.data.iframeState; const f=s&&s.layers&&s.layers[0]&&s.layers[0].frames&&s.layers[0].frames[0]; return f?f.canvas:null; }catch(e){ return null; } };
  useEffect(()=>{ const fn=(t,data)=>{ if(t==='assets'&&data){ PP.assets.unshift({id:Date.now()+'_'+Math.random().toString(36).slice(2,7),name:'from_send',dataURL:data, folder:'Main'}); refresh(); toast('Received into gallery'); } }; PP.inboxListeners.push(fn); return ()=>{ PP.inboxListeners=PP.inboxListeners.filter(x=>x!==fn); }; },[]);
  
  // Folders logic
  const folders = ['All', 'Main', ...new Set(PP.assets.map(a=>a.folder||'Main').filter(f=>f!=='Main'))];
  const filtered = activeFolder==='All' ? items : items.filter(a=>(a.folder||'Main')===activeFolder);
  
  const addFiles=(files)=>{ [...files].forEach(f=>{ if(!f.type.startsWith('image/'))return; const url = URL.createObjectURL(f); PP.assets.unshift({id:Date.now()+'_'+Math.random().toString(36).slice(2,7),name:f.name,dataURL:url, folder: activeFolder==='All'?'Main':activeFolder}); refresh(); }); };
  
  const pickFolder=async()=>{ try{ if(!window.showDirectoryPicker)throw 0; const dir=await window.showDirectoryPicker(); let n=0; const folderName = dir.name; for await(const [name,handle] of dir.entries()){ if(handle.kind==='file'&&/\.(png|jpe?g|gif|webp|bmp)$/i.test(name)){ const f=await handle.getFile(); const url = URL.createObjectURL(f); PP.assets.push({id:Date.now()+'_'+n,name,dataURL:url, folder:folderName}); n++; if(n%5===0)refresh(); } } refresh(); toast('Imported '+n+' images into folder: '+folderName); }catch(err){ toast('Folder picker unavailable — use Add Images'); } };
  
  const receive=()=>{ const k=Object.keys(PP.inbox); if(!k.length){toast('Nothing sent.');return;} k.forEach(t=>{ if(PP.inbox[t]){ PP.assets.unshift({id:Date.now()+'_'+Math.random().toString(36).slice(2,7),name:'from_'+t,dataURL:PP.inbox[t], folder:'Main'}); } }); refresh(); toast('Received '+k.length+' sent image(s)'); };
  
  const sendTo=(asset,target)=>{ try { PP.notifyInbox(target, asset.dataURL); if(target==='editor') setActive('editor'); if(target==='studio') setActive('studio'); if(target==='extract') setActive('extract'); if(target==='tilemap') setActive('tilemap'); if(target==='collision') setActive('collision'); if(target==='markup') setActive('markup'); if(target==='pixscii') setActive('pixscii'); if(target==='editor' || target==='studio' || target==='extract' || target==='pixscii'){ document.querySelectorAll('.tool-iframe').forEach(iframe => { if(iframe.contentWindow) iframe.contentWindow.postMessage({ type: 'LOAD_CANVAS', data: { [target]: asset.dataURL } }, '*'); }); } toast('Sent "'+asset.name+'" to '+target); } catch(err) { toast('Error sending: ' + err.message); } };
  
  const del=(id)=>{ PP.assets=PP.assets.filter(a=>a.id!==id); refresh(); };
  
  const moveToFolder=(id)=>{ const folder = prompt("Move to folder name:"); if(folder) { const asset = PP.assets.find(a=>a.id===id); if(asset) { asset.folder = folder; refresh(); } } };

  // Disk Exports!
  const exportPNG=(asset)=>{ if(window.__tauriSave) window.__tauriSave(asset.dataURL, asset.name+'.png', 'png'); toast('Exported PNG dialog opened'); };
  const exportJSON=(asset)=>{ if(window.__tauriSave) window.__tauriSave(JSON.stringify({name:asset.name, data:asset.dataURL}), asset.name+'.json', 'json'); toast('Exported JSON dialog opened'); };

  return (
    <div className="panel" style={{display:'flex', flexDirection:'column', height:'100%'}}>
      <div className="titlebar"><h2 className="glow-c" style={{fontSize:15}}>Art Hub</h2>
        <span className="chip">{PP.assets.length} assets</span>
        <button className="neon-btn" style={{padding:'2px 8px', fontSize:11, marginLeft:'auto'}} onClick={()=>setShowProjects(v=>!v)}>{showProjects?'Hide':'Show'} Projects</button>
      </div>

      {showProjects && (
        <div style={{marginBottom:10, background:'#0b1220', border:'1px solid var(--line)', borderRadius:8, padding:8}}>
          <div className="row" style={{marginBottom:6}}>
            <span className="glow-c" style={{fontSize:12, fontWeight:600}}>Projects</span>
            <span className="muted" style={{fontSize:11}}>{Object.keys(projects||{}).length} saved · auto-saved & restored on launch</span>
            <input style={{marginLeft:'auto', background:'#1a1a1a',border:'1px solid #333',color:'#eee',borderRadius:8,padding:'3px 8px',fontSize:11,width:120}} value={projName} onChange={(e)=>setProjName(e.target.value)} placeholder="Project name"/>
            <button className="neon-btn cy" style={{padding:'3px 8px', fontSize:11}} onClick={()=>onSaveProject&&onSaveProject()}>Save</button>
          </div>
          <div className="row" style={{flexWrap:'wrap', gap:6, alignContent:'flex-start'}}>
            {Object.keys(projects||{}).length===0 && <span className="muted" style={{fontSize:11}}>No projects yet. Draw something, then Save.</span>}
            {Object.values(projects||{}).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0)).map(p=>{
              const thumb=projThumb(p);
              return (
                <div key={p.id} style={{width:104, display:'flex', flexDirection:'column', background:'#0f172a', border:'1px solid var(--line)', borderRadius:6, overflow:'hidden'}}>
                  <div onClick={()=>onOpenProject&&onOpenProject(p.id)} style={{height:80, display:'flex', alignItems:'center', justifyContent:'center', background:'#000', cursor:'pointer'}}>
                    {thumb ? <img src={thumb} style={{maxWidth:'100%', maxHeight:'100%', imageRendering:'pixelated', objectFit:'contain'}}/> : <span className="muted" style={{fontSize:10}}>no canvas</span>}
                  </div>
                  <div style={{fontSize:10, padding:'3px 5px', color:'var(--txt)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}} title={p.name}>{p.name}</div>
                  <div style={{fontSize:9, padding:'0 5px 4px', color:'var(--dim)'}}>{fmtTime(p.updatedAt)}</div>
                  <button className="neon-btn am" style={{padding:'2px', fontSize:10, borderRadius:0}} onClick={()=>onDeleteProject&&onDeleteProject(p.id)}>Delete</button>
                </div>
              );
            })}
          </div>
        </div>
      )}
      
      <div className="seg" style={{justifyContent: 'center', marginBottom: 10}}>
          <button className="neon-btn cy" onClick={()=>setActive('editor')}>+ Create Sprite</button>
          <button className="neon-btn mg" onClick={()=>setActive('studio')}>+ Create Anim</button>
          <button className="neon-btn vi" onClick={()=>setActive('tilemap')}>+ Map Editor</button>
      </div>

      <div className="seg">
        <label className="neon-btn cy">Upload Files<input type="file" accept="image/*" multiple style={{display:'none'}} onChange={e=>addFiles(e.target.files)}/></label>
        <button className="neon-btn vi" onClick={pickFolder}>Import Folder...</button>
        <button className="neon-btn" onClick={receive}>Fetch Inbox</button>
      </div>
      
      <div className="row" style={{marginTop: 8}}>
        <label style={{marginRight: 10, color:'var(--dim)'}}>Folders:</label>
        {folders.map(f=>(
            <button key={f} className={"neon-btn " + (activeFolder===f?'on':'')} style={{padding:'2px 8px'}} onClick={()=>setActiveFolder(f)}>{f}</button>
        ))}
      </div>

      <div className="hint" style={{marginTop: 8}}>The central gallery. ALL your tools save here automatically. Click an artwork to route it to another tool, or export it to disk.</div>
      
      <div className="gal" style={{flex:1, minHeight:0, alignContent:'flex-start'}}>
        {filtered.length===0&&<div className="muted" style={{fontSize:12}}>No art in this folder yet.</div>}
        {filtered.map(a=>(
          <div className="asset" key={a.id}               style={{position:'relative', width: '100%', aspectRatio:'auto', display:'flex', flexDirection:'column', padding: 5, background: '#0f172a', border: '1px solid var(--line)', borderRadius: 6}}>
            <div style={{flex:1, display:'flex', justifyContent:'center', alignItems:'center', background:'#000', borderRadius: 4, overflow:'hidden', marginBottom: 5}}>
                <img src={a.dataURL} style={{maxWidth:'100%', maxHeight:'100%', objectFit:'contain', imageRendering:'pixelated'}}/>
            </div>
            <div style={{fontSize: 11, color:'var(--txt)', textAlign:'center', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', marginBottom: 5}} title={a.name}>{a.name}</div>
            
            {/* Routing Buttons */}
            <div style={{display:'flex', gap:2, flexWrap:'wrap', justifyContent:'center'}}>
              <button className="neon-btn cy" style={{padding:'2px 4px', fontSize:10}} onClick={()=>sendTo(a,'editor')} title="Edit Layer">Edit</button>
              <button className="neon-btn mg" style={{padding:'2px 4px', fontSize:10}} onClick={()=>sendTo(a,'studio')} title="Edit Animation">Anim</button>
              <button className="neon-btn" style={{padding:'2px 4px', fontSize:10}} onClick={()=>sendTo(a,'tilemap')} title="Send to Map">Map</button>
              <button className="neon-btn" style={{padding:'2px 4px', fontSize:10, borderColor:'#f59e0b'}} onClick={()=>sendTo(a,'pixscii')} title="Send to Pixscii for processing">✦ Pix</button>
              <button className="neon-btn" style={{padding:'2px 4px', fontSize:10}} onClick={()=>moveToFolder(a.id)} title="Move Folder">📁</button>
            </div>
            
            {/* Disk Export Buttons */}
            <div style={{display:'flex', gap:2, marginTop: 4, justifyContent:'center'}}>
              <button className="neon-btn vi" style={{padding:'2px 4px', fontSize:10}} onClick={()=>exportPNG(a)} title="Export to PNG Disk">.PNG</button>
              <button className="neon-btn" style={{padding:'2px 4px', fontSize:10}} onClick={()=>exportJSON(a)} title="Export JSON Metadata">.JSON</button>
              <button className="neon-btn am" style={{padding:'2px 4px', fontSize:10}} onClick={()=>del(a.id)} title="Delete">🗑</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CollisionPanel(toast){
  const {canvasRef,loadFile,loadDataURL,render,imgRef,scaleRef,hasImg}=useCanvasStage((ctx,cv,s)=>{
    if(pts.length>0){ const d=SHAPE_DEFS[curType]; ctx.strokeStyle=d.color;ctx.lineWidth=2;ctx.globalAlpha=.95;ctx.beginPath();
      pts.forEach((p,i)=>{const X=p.x*cv.width,Y=p.y*cv.height;i?ctx.lineTo(X,Y):ctx.moveTo(X,Y);});ctx.stroke();
      pts.forEach(p=>{ctx.fillStyle=d.color;ctx.beginPath();ctx.arc(p.x*cv.width,p.y*cv.height,3.5,0,7);ctx.fill();}); }
    PP.collisions.forEach(sh=>{const d=SHAPE_DEFS[sh.type];ctx.strokeStyle=d.color;ctx.fillStyle=d.color;ctx.globalAlpha=.22;ctx.beginPath();
      sh.points.forEach((p,i)=>{const X=p.x*cv.width,Y=p.y*cv.height;i?ctx.lineTo(X,Y):ctx.moveTo(X,Y);});ctx.closePath();ctx.fill();ctx.globalAlpha=.9;ctx.lineWidth=2;ctx.stroke();ctx.globalAlpha=1;});
  });
  const [curType,setCurType]=useState('platform'); const [pts,setPts]=useState([]); const [shapes,setShapes]=useState([]);
  const [mode,setMode]=useState('photo'); // photo | level
  const loadLevel=async()=>{ const url=loadTilemapBg(); if(!url){toast('No tilemap yet — build one in Tilemap.');return;} setMode('level'); loadDataURL(url); toast('Loaded tilemap as level background'); };
  const onClick=(e)=>{const cv=canvasRef.current;const r=cv.getBoundingClientRect();const x=(e.clientX-r.left)/cv.width,y=(e.clientY-r.top)/cv.height;if(x<0||y<0||x>1||y>1)return;setPts(p=>[...p,{x,y}]);};
  const finish=()=>{ if(pts.length<3){setPts([]);return;} const sh={type:curType,points:pts};PP.collisions.push(sh);setShapes(s=>[...s,sh]);setPts([]);render(); };
  const clearAll=()=>{PP.collisions.length=0;setShapes([]);render();};
  const delShape=(i)=>{PP.collisions.splice(i,1);setShapes(s=>s.filter((_,j)=>j!==i));render();};
  const useSentBg=()=>{ if(PP.inbox.collisionBg){loadDataURL(PP.inbox.collisionBg);toast('Loaded sent background');} else if(PP.inbox.collision){loadDataURL(PP.inbox.collision);toast('Loaded sent image');} else toast('Nothing sent.'); };
  useEffect(() => { if(PP.inbox.collisionBg || PP.inbox.collision) useSentBg(); }, []);
  useEffect(()=>{ const fn=(t,data)=>{ if((t==='collision'||t==='collisionBg')&&data){ loadDataURL(data); setMode('photo'); toast('Collision background received'); } }; PP.inboxListeners.push(fn); return ()=>{ PP.inboxListeners=PP.inboxListeners.filter(x=>x!==fn); }; },[]);
  const exportJson=()=>download('collision_'+Date.now()+'.json',{tool:'collision',mode,shapes:PP.collisions});
  const importJson=()=>{
    const inp=document.createElement('input');inp.type='file';inp.accept='.json';
    inp.onchange=()=>{const f=inp.files[0];if(!f)return;const r=new FileReader();
    r.onload=()=>{try{const d=JSON.parse(r.result);if(d.tool!=='collision'||!Array.isArray(d.shapes)){toast('Not a collision JSON');return;}
    PP.collisions.length=0;d.shapes.forEach(s=>PP.collisions.push(s));setShapes([...PP.collisions]);render();toast('Imported '+d.shapes.length+' collision shapes');}catch(e){toast('Parse error');}};r.readAsText(f);};
    inp.click();
  };
  return (
    <div className="panel">
      <div className="titlebar"><h2 className="glow" style={{fontSize:15}}>Collision Painter</h2>
        <span className="chip">{mode} mode</span></div>
      <div className="seg">
        <button className={"neon-btn "+(mode==='photo'?'on':'')} onClick={()=>setMode('photo')}>Photo Mode</button>
        <button className={"neon-btn "+(mode==='level'?'on':'')} onClick={loadLevel}>Level / Tilemap Mode</button>
      </div>
      <div className="seg">
        {Object.entries(SHAPE_DEFS).map(([k,d])=>(<button key={k} className={"neon-btn "+(curType===k?'on':'')} onClick={()=>setCurType(k)}><span className="dot" style={{background:d.color,color:d.color,display:'inline-block',marginRight:6}}></span>{d.name}</button>))}
      </div>
      <div className="row">
        <label className="neon-btn cy">Load Photo<input type="file" accept="image/*" style={{display:'none'}} onChange={e=>e.target.files[0]&&loadFile(e.target.files[0])}/></label>
        <button className="neon-btn" onClick={useSentBg}>Use Sent</button>
        <button className="neon-btn" onClick={finish} disabled={pts.length<3}>Finish ({pts.length})</button>
        <button className="neon-btn am" onClick={()=>setPts([])} disabled={!pts.length}>Cancel</button>
        <button className="neon-btn mg" onClick={clearAll}>Clear</button>
        <button className="neon-btn cy" onClick={exportJson}>Export JSON</button>
        <button className="neon-btn" onClick={importJson}>Load JSON</button>
      </div>
      <div className="hint">Photo Mode traces collision over any photo. Level Mode renders your Tilemap as the background so you can design collision for tile-built levels. Both feed Build.</div>
      <div className="stage">
        {!hasImg && <div className="muted">No background — Load Photo, Use Sent, or switch to Level Mode.</div>}
        <canvas ref={canvasRef} style={{display:hasImg?'block':'none'}} onClick={onClick}/>
      </div>
      <div className="list">
        {shapes.length===0&&<div className="muted" style={{fontSize:12}}>No shapes yet.</div>}
        {shapes.map((sh,i)=>(<div className="li" key={i}><span className="dot" style={{background:SHAPE_DEFS[sh.type].color,color:SHAPE_DEFS[sh.type].color}}></span><span style={{flex:1}}>{SHAPE_DEFS[sh.type].name} · {sh.points.length} pts</span><button className="neon-btn mg" style={{padding:'3px 9px'}} onClick={()=>delShape(i)}>del</button></div>))}
      </div>
    </div>
  );
}

/* =================== MARKUP PAINTER (semantic layers on scanned pages) =================== */
const MARKUP_TYPES = {
  path:       {name:'Path / Walk',   color:'#10b981', glyph:'▒'},
  collision:  {name:'Collision',      color:'#22d3ee', glyph:'▦'},
  water:      {name:'Water',          color:'#3b82f6', glyph:'≈'},
  hazard:     {name:'Hazard / Kill',  color:'#ff4ecd', glyph:'☠'},
  interact:   {name:'Interactable',   color:'#fbbf24', glyph:'◆'},
  zone:       {name:'Zone / Region',  color:'#a78bfa', glyph:'◌'},
};
function MarkupPanel(toast){
  const {canvasRef,loadFile,loadDataURL,render,imgRef,scaleRef,hasImg}=useCanvasStage((ctx,cv)=>{
    // draw finished layers (semi-transparent fills) under the in-progress stroke
    PP.markup.forEach(L=>{
      if(!L.visible) return;
      const d=MARKUP_TYPES[L.type]||{color:L.color};
      L.paths.forEach(p=>{
        ctx.strokeStyle=d.color; ctx.fillStyle=d.color; ctx.globalAlpha=0.22; ctx.lineWidth=2;
        ctx.beginPath(); p.forEach((pt,i)=>{ const X=pt.x*cv.width,Y=pt.y*cv.height; i?ctx.lineTo(X,Y):ctx.moveTo(X,Y); });
        if(p.length>2){ ctx.closePath(); ctx.fill(); }
        ctx.globalAlpha=0.9; ctx.stroke();
      });
    });
    // in-progress
    if(pts.length){ const d=MARKUP_TYPES[curType]||{color:'#fff'}; ctx.strokeStyle=d.color; ctx.fillStyle=d.color; ctx.globalAlpha=.9; ctx.lineWidth=2;
      ctx.beginPath(); pts.forEach((p,i)=>{const X=p.x*cv.width,Y=p.y*cv.height;i?ctx.lineTo(X,Y):ctx.moveTo(X,Y);}); ctx.stroke();
      pts.forEach(p=>{ctx.beginPath();ctx.arc(p.x*cv.width,p.y*cv.height,3.5,0,7);ctx.fill();}); }
  });
  const [layers,setLayers]=useState([{id:1,name:'Path',type:'path',color:'#10b981',visible:true,paths:[]}]);
  const [curLayer,setCurLayer]=useState(1);
  const [pts,setPts]=useState([]);
  const [mode,setMode]=useState('photo');
  const layerOf=id=>layers.find(l=>l.id===id);
  const loadLevel=async()=>{ const url=loadTilemapBg(); if(!url){toast('No tilemap yet — build one in Tilemap.');return;} setMode('level'); loadDataURL(url); toast('Loaded tilemap as background'); };
  const onClick=(e)=>{ const cv=canvasRef.current; const r=cv.getBoundingClientRect(); const x=(e.clientX-r.left)/cv.width,y=(e.clientY-r.top)/cv.height; if(x<0||y<0||x>1||y>1)return; setPts(p=>[...p,{x,y}]); };
  const finish=()=>{ if(pts.length<2){setPts([]);return;} const L=layerOf(curLayer); if(!L)return;
    const nl=layers.map(l=>l.id===curLayer?{...l,paths:[...l.paths,pts]}:l); setLayers(nl); PP.markup.push({type:L.type,color:L.color,paths:[pts]}); setPts([]); render(); };
  const clearLayer=(id)=>{ const L=layerOf(id); if(!L)return; setLayers(ls=>ls.map(l=>l.id===id?{...l,paths:[]}:l));
    PP.markup=PP.markup.filter(m=>m!==undefined && !(m._layer===id)); render(); };
  const delLayer=(id)=>{ setLayers(ls=>ls.filter(l=>l.id!==id)); PP.markup=PP.markup.filter(m=>m._layer!==id); if(curLayer===id)setCurLayer(layers[0]?.id); render(); };
  const addLayer=()=>{ const id=Date.now(); const type='zone'; setLayers(ls=>[...ls,{id,name:'Layer '+(ls.length+1),type,color:(MARKUP_TYPES[type]||{}).color||'#a78bfa',visible:true,paths:[]}]); setCurLayer(id); };
  const useSentBg=()=>{ if(PP.inbox.markupBg){loadDataURL(PP.inbox.markupBg);toast('Loaded sent background');} else if(PP.inbox.collisionBg){loadDataURL(PP.inbox.collisionBg);toast('Loaded sent bg');} else if(PP.inbox.collision){loadDataURL(PP.inbox.collision);toast('Loaded sent image');} else toast('Nothing sent.'); };
  useEffect(()=>{ const fn=(t,data)=>{ if((t==='markup'||t==='markupBg'||t==='collisionBg'||t==='collision')&&data){ loadDataURL(data); setMode('photo'); toast('Markup background received'); } }; PP.inboxListeners.push(fn); return ()=>{ PP.inboxListeners=PP.inboxListeners.filter(x=>x!==fn); }; },[]);
  const exportJson=()=>{ const out={tool:'markup',mode,layers:layers.map(l=>({name:l.name,type:l.type,color:l.color,paths:l.paths}))};
    download('markup_'+Date.now()+'.json',out); toast('Exported markup JSON'); };
  return (
    <div className="panel">
      <div className="titlebar"><h2 className="glow" style={{fontSize:15}}>Markup Painter</h2><span className="chip">{mode} mode</span></div>
      <div className="seg">
        <button className={"neon-btn "+(mode==='photo'?'on':'')} onClick={()=>setMode('photo')}>Photo / Scan Mode</button>
        <button className={"neon-btn "+(mode==='level'?'on':'')} onClick={loadLevel}>Level / Tilemap Mode</button>
      </div>
      <div className="seg">
        <label className="neon-btn cy">Load Scan<input type="file" accept="image/*" style={{display:'none'}} onChange={e=>e.target.files[0]&&loadFile(e.target.files[0])}/></label>
        <button className="neon-btn" onClick={useSentBg}>Use Sent</button>
        <button className="neon-btn" onClick={finish} disabled={pts.length<2}>Finish ({pts.length})</button>
        <button className="neon-btn am" onClick={()=>setPts([])} disabled={!pts.length}>Cancel</button>
        <button className="neon-btn cy" onClick={exportJson}>Export JSON</button>
      </div>
      <div className="hint">Load a scanned hand-drawn page as the background, then paint semantic layers — each color = a meaning (path, collision, water, hazard, interactable, zone). Semi-transparent, toggleable per layer. This is the markup foundation for stitching pages into a mega-map later.</div>
      {/* layer list */}
      <div className="seg" style={{flexWrap:'wrap'}}>
        <span className="hint" style={{width:'100%',marginBottom:2}}>Active layer:</span>
        {layers.map(l=>(
          <div key={l.id} className="neon-btn" style={{display:'flex',alignItems:'center',gap:6,padding:'3px 8px',borderColor:l.id===curLayer?'var(--accent)':'var(--line2)',background:l.id===curLayer?'#0f1830':'transparent'}}>
            <input type="color" value={l.color} style={{width:18,height:18,padding:0,border:'none'}} onChange={e=>{const c=e.target.value;setLayers(ls=>ls.map(x=>x.id===l.id?{...x,color:c}:x));syncMarkup();render();}}/>
            <button style={{background:'none',border:'none',color:l.visible?'var(--txt)':'var(--dim2)',cursor:'pointer'}} onClick={()=>{setLayers(ls=>ls.map(x=>x.id===l.id?{...x,visible:!x.visible}:x));render();}} title="toggle visibility">{l.visible?'👁':'🚫'}</button>
            <select value={l.type} onChange={e=>{const t=e.target.value;setLayers(ls=>ls.map(x=>x.id===l.id?{...x,type:t,color:(MARKUP_TYPES[t]||{}).color||x.color}:x));syncMarkup();render();}} className="godown" style={{fontSize:11}}>
              {Object.entries(MARKUP_TYPES).map(([k,d])=><option key={k} value={k}>{d.name}</option>)}
            </select>
            <button style={{background:'none',border:'none',color:'var(--bad)',cursor:'pointer'}} onClick={()=>delLayer(l.id)}>✕</button>
          </div>
        ))}
        <button className="neon-btn vi" onClick={addLayer}>+ Layer</button>
        <button className="neon-btn mg" onClick={()=>clearLayer(curLayer)}>Clear layer</button>
      </div>
      <div className="stage">
        {!hasImg && <div className="muted">No background — Load Scan, Use Sent, or switch to Level Mode.</div>}
        <canvas ref={canvasRef} style={{display:hasImg?'block':'none'}} onClick={onClick}/>
      </div>
    </div>
  );
  function syncMarkup(){ PP.markup = layers.filter(l=>l.paths.length).flatMap(l=>l.paths.map(p=>({_layer:l.id,type:l.type,color:l.color,paths:[p]}))); }
}

/* =================== MARKERS =================== */
function MarkersPanel(toast){
  const {canvasRef,loadFile,loadDataURL,render,imgRef,scaleRef,hasImg}=useCanvasStage((ctx,cv,s)=>{
    PP.markers.forEach(m=>{const d=MARKER_DEFS[m.type];const X=m.x*cv.width,Y=m.y*cv.height;ctx.strokeStyle=d.color;ctx.fillStyle=d.color;ctx.lineWidth=2;ctx.globalAlpha=.95;
      ctx.beginPath();ctx.arc(X,Y,9,0,7);ctx.stroke();ctx.beginPath();ctx.moveTo(X,Y-13);ctx.lineTo(X,Y+13);ctx.moveTo(X-13,Y);ctx.lineTo(X+13,Y);ctx.stroke();
      ctx.globalAlpha=1;ctx.fillStyle=d.color;ctx.font='bold 12px monospace';ctx.textAlign='center';ctx.fillText(d.glyph,X,Y+4);});
  });
  const [curType,setCurType]=useState('player_start'); const [items,setItems]=useState([]);
  const onClick=(e)=>{const cv=canvasRef.current;const r=cv.getBoundingClientRect();const x=(e.clientX-r.left)/cv.width,y=(e.clientY-r.top)/cv.height;if(x<0||y<0||x>1||y>1)return;const m={type:curType,x,y};PP.markers.push(m);setItems(s=>[...s,m]);};
  const clearAll=()=>{PP.markers.length=0;setItems([]);render();};
  const del=(i)=>{PP.markers.splice(i,1);setItems(s=>s.filter((_,j)=>j!==i));render();};
  const useSentBg=()=>{ if(PP.inbox.collisionBg)loadDataURL(PP.inbox.collisionBg); else if(PP.inbox.collision)loadDataURL(PP.inbox.collision); else toast('Nothing sent.'); };
  const loadTilemap=()=>{ const url=loadTilemapBg(); if(!url){toast('No tilemap yet — build one in Tilemap.');return;} loadDataURL(url); toast('Loaded tilemap as marker background'); };
  useEffect(()=>{ const fn=(t,data)=>{ if((t==='markers'||t==='collision'||t==='collisionBg')&&data){ loadDataURL(data); toast('Marker background received'); } }; PP.inboxListeners.push(fn); return ()=>{ PP.inboxListeners=PP.inboxListeners.filter(x=>x!==fn); }; },[]);
  const exportJson=()=>download('markers_'+Date.now()+'.json',{tool:'markers',markers:PP.markers});
  return (
    <div className="panel">
      <div className="titlebar"><h2 className="glow-c" style={{fontSize:15}}>Game Markers</h2><span className="chip">place spawns & exits</span></div>
      <div className="seg">
        {Object.entries(MARKER_DEFS).map(([k,d])=>(<button key={k} className={"neon-btn "+(curType===k?'on':'')} onClick={()=>setCurType(k)}><span className="dot" style={{background:d.color,color:d.color,display:'inline-block',marginRight:6}}></span>{d.name}</button>))}
      </div>
      <div className="row">
        <label className="neon-btn cy">Load Photo<input type="file" accept="image/*" style={{display:'none'}} onChange={e=>e.target.files[0]&&loadFile(e.target.files[0])}/></label>
        <button className="neon-btn" onClick={useSentBg}>Use Sent</button>
        <button className="neon-btn vi" onClick={loadTilemap}>Load Tilemap</button>
        <button className="neon-btn mg" onClick={clearAll}>Clear</button>
        <button className="neon-btn cy" onClick={exportJson}>Export JSON</button>
      </div>
      <div className="hint">Click to drop markers (player start, enemies, items, exits, saves). Works over photos or sent backgrounds.</div>
      <div className="stage">
        {!hasImg && <div className="muted">No background — Load Photo or Use Sent.</div>}
        <canvas ref={canvasRef} style={{display:hasImg?'block':'none'}} onClick={onClick}/>
      </div>
      <div className="list">
        {items.length===0&&<div className="muted" style={{fontSize:12}}>No markers yet.</div>}
        {items.map((m,i)=>(<div className="li" key={i}><span className="dot" style={{background:MARKER_DEFS[m.type].color,color:MARKER_DEFS[m.type].color}}></span><span style={{flex:1}}>{MARKER_DEFS[m.type].name} · ({m.x.toFixed(3)},{m.y.toFixed(3)})</span><button className="neon-btn mg" style={{padding:'3px 9px'}} onClick={()=>del(i)}>del</button></div>))}
      </div>
    </div>
  );
}

/* =================== BUILD =================== */
function buildTscn(data){
  let s='[gd_scene format=3 uid="uid://'+Math.floor(Math.random()*1e9)+'"]\n\n';
  // External resources: background + tile textures
  s+='[ext_resource path="res://background.png" type="Texture2D" id="bg_1"]\n';
  const tileResIds={};
  let resIdx=2;
  if(data.tilemap&&data.tilemap.tiles){
    Object.keys(data.tilemap.tiles).forEach(id=>{
      const tid='tile_'+id;
      tileResIds[id]=tid;
      s+=`[ext_resource path="res://tiles/tile_${id}.png" type="Texture2D" id="${tid}"]\n`;
    });
  }
  s+='\n[node name="Level" type="Node2D"]\n\n';
  s+='[node name="Background" type="Sprite2D" parent="."]\ntexture = ExtResource("bg_1")\n\n';
  // Tilemap as tile instances
  if(data.tilemap&&data.tilemap.grid){
    const {cols,rows,grid,tileSize}=data.tilemap;
    const ts=tileSize||16;
    s+='[node name="TileMap" type="Node2D" parent="."]\n\n';
    for(let y=0;y<rows;y++) for(let x=0;x<cols;x++){
      const id=grid[y]&&grid[y][x];
      if(id==null||id<0||!tileResIds[id]) continue;
      s+=`[node name="Tile_${x}_${y}" type="Sprite2D" parent="TileMap"]\nposition = Vector2(${x*ts+ts/2}, ${y*ts+ts/2})\ntexture = ExtResource("${tileResIds[id]}")\n\n`;
    }
  }
  // Collisions
  (data.collisions||[]).forEach((sh,i)=>{
    const bodyType=sh.type==='killzone'?'Area2D':(sh.type==='oneway'?'AnimatableBody2D':'StaticBody2D');
    const nodeName=sh.type==='killzone'?'KillZone':(sh.type==='oneway'?'OneWayPlatform':(sh.type.charAt(0).toUpperCase()+sh.type.slice(1)));
    s+=`[node name="${nodeName}${i}" type="${bodyType}" parent="."]\n`;
    if(sh.type==='oneway')s+='platform_floor_layers = 1\n';
    if(sh.type==='killzone'){
      const cx=sh.points.reduce((a,p)=>a+p.x,0)/sh.points.length;
      const cy=sh.points.reduce((a,p)=>a+p.y,0)/sh.points.length;
      const minX=Math.min(...sh.points.map(p=>p.x)),maxX=Math.max(...sh.points.map(p=>p.x));
      const minY=Math.min(...sh.points.map(p=>p.y)),maxY=Math.max(...sh.points.map(p=>p.y));
      s+=`[sub_resource type="RectangleShape2D" id="KillRect_${i}"]\nsize = Vector2(${((maxX-minX)*1024).toFixed(1)}, ${((maxY-minY)*576).toFixed(1)})\n\n`;
      s+=`[node name="KillShape" type="CollisionShape2D" parent="${nodeName}${i}"]\nposition = Vector2(${(cx*1024).toFixed(1)}, ${(cy*576).toFixed(1)})\nshape = SubResource("KillRect_${i}")\n\n`;
    } else {
      const pts=sh.points.map(p=>`Vector2(${(p.x*1024).toFixed(1)}, ${(p.y*576).toFixed(1)})`).join(', ');
      s+=`[node name="CollisionPolygon" type="CollisionPolygon2D" parent="${nodeName}${i}"]\npolygon = PackedVector2Array(${pts})\n\n`;
    }
  });
  // Markers
  (data.markers||[]).forEach((mk,i)=>{
    const def=MARKER_DEFS[mk.type]||{name:mk.type||'Marker',color:'#ffffff'};
    s+=`[node name="${(def.name||'Marker').replace(/\s/g,'')}${i}" type="Marker2D" parent="."]\nposition = Vector2(${(mk.x*1024).toFixed(1)}, ${(mk.y*576).toFixed(1)})\nmetadata = {"marker_type":"${mk.type}","label":"${def.name||mk.type}"}\n\n`;
  });
  // Markup paths
  (data.markup||[]).forEach((mk,i)=>{
    const mkType=mk.type||'path';
    const mkColor=mk.color||'#10b981';
    const r=parseInt(mkColor.slice(1,3),16)/255, g=parseInt(mkColor.slice(3,5),16)/255, b=parseInt(mkColor.slice(5,7),16)/255;
    (mk.paths||[]).forEach((p,pi)=>{
      if(!p||p.length<2) return;
      const pts=p.map(pt=>`Vector2(${(pt.x*1024).toFixed(1)}, ${(pt.y*576).toFixed(1)})`).join(', ');
      s+=`[node name="Markup_${mkType}${i}_${pi}" type="Line2D" parent="."]\npoints = PackedVector2Array(${pts})\nwidth = 2.0\ncolor = Color(${r.toFixed(3)}, ${g.toFixed(3)}, ${b.toFixed(3)}, 0.9)\nmetadata = {"markup_type":"${mkType}"}\n\n`;
    });
  });
  return s;
}

/* =================== OPENSTARBOUND EXPORT =================== */
import { buildOpenStarboundFiles, buildOpenStarboundLevelFiles, buildZip, downloadBlob } from './openstarbound_export.js';

// Export the current tilemap as a self-contained OpenStarbound mod .zip.
async function exportOpenStarboundMod(name, toast){
  if(!PP.tilemap||!PP.tilemap.grid||!PP.tilemap.grid.length){ toast('Build a tilemap first (Tilemap tab).'); return null; }
  const level={collisions:PP.collisions, markup:PP.markup, entities:PP.markers.map(m=>({type:m.type,x:m.x,y:m.y,fromMarker:true}))};
  const { files, count, cols, rows } = await buildOpenStarboundLevelFiles(name, PP.tilemap, level);
  if(!count){ toast('Tilemap has no placed tiles.'); return null; }
  const zip=buildZip(files);
  downloadBlob((name||'pixelpalace')+'_openstarbound.zip', zip, 'application/zip');
  return {count, cols, rows};
}

function BuildPanel(toast){
  const [name,setName]=useState('Level_01'); const [log,setLog]=useState('');
  const c=PP.collisions.length,m=PP.markers.length,mk=PP.markup?PP.markup.length:0,tm=PP.tilemap?PP.tilemap.cols*PP.tilemap.rows:0;
  const exportLevel=()=>{ const data={name,background:'background.png',collisions:PP.collisions,markers:PP.markers,markup:PP.markup,tilemap:PP.tilemap,exportedAt:new Date().toISOString()}; download(name+'_level.json',data); setLog('Exported '+name+'_level.json ('+c+' collisions, '+m+' markers, '+(PP.markup?PP.markup.length:0)+' markup, tilemap '+(PP.tilemap?('on'):'off')+')'); };
  const exportTscn=()=>{ const data={name,collisions:PP.collisions,markers:PP.markers,markup:PP.markup,tilemap:PP.tilemap}; download(name+'.tscn',buildTscn(data)); setLog('Exported Godot scene '+name+'.tscn'); };
  return (
    <div className="panel">
      <div className="titlebar"><h2 className="glow" style={{fontSize:15}}>Build & Export Level</h2><span className="chip">{c} collisions · {m} markers · {mk} markup</span></div>
      <div className="row">
        <div className="col" style={{flex:1,minWidth:220}}><label>Level Name</label><input type="text" value={name} onChange={e=>setName(e.target.value)}/></div>
        <div className="col"><label>Status</label><div className="chip" style={{fontSize:12}}>{c} collisions · {m} markers · {mk} markup · {tm} tiles</div></div>
      </div>
      <div className="seg">
        <button className="neon-btn" onClick={exportLevel}>Export Level JSON</button>
        <button className="neon-btn cy" onClick={exportTscn}>Export Godot .tscn</button>
        <button className="neon-btn vi" onClick={async ()=>{ const r=await exportOpenStarboundMod(name,toast); if(r) setLog(`Exported ${name}_openstarbound.zip (${r.count} materials, ${r.cols}x${r.rows} dungeon)`); }}>Export OpenStarbound Mod</button>
      </div>
      <div className="hint">Assembles collisions + markers + tilemap into a shippable level for the photo_level_plugin. Also save the whole project from the top bar (Save) for full state restore. The OpenStarbound export packs each tile as a real <span className="kbd">.material</span> + a <span className="kbd">.dungeon</span> colorkey — unzip into OpenStarbound/mods/ and spawn with <span className="kbd">/placedungeon</span>. May appear vertically mirrored (Starbound Y-up); flip the tilemap if so.</div>
      {log&&<div className="li"><span className="dot" style={{background:'var(--accent)',color:'var(--accent)'}}></span>{log}</div>}
    </div>
  );
}


/* =================== NODE GRAPH (engine-agnostic stitching) =================== */
const NODE_TYPES = {
  page:   {name:'Scanned Page', color:'#22d3ee', glyph:'▦'},
  level:  {name:'Tilemap Level',color:'#10b981', glyph:'▣'},
  hub:    {name:'Hub / Town',   color:'#a78bfa', glyph:'⌂'},
  battle: {name:'Battle / Sim', color:'#ff4ecd', glyph:'⚔'},
};
function NodeGraphPanel(toast){
  const [nodes,setNodes]=useState(PP.graph.length?PP.graph:[{id:'n1',name:'Start',type:'page',x:60,y:60,doors:[],src:null}]);
  const [sel,setSel]=useState(null);
  const [start,setStart]=useState('n1');
  const [edges,setEdges]=useState(PP.graph.__edges||[]);
  const [drag,setDrag]=useState(null); // {id, dx,dy} moving a node
  const [link,setLink]=useState(null); // {from, side} drawing an edge
  const ref=useRef(null);
  const persist=(ns,es)=>{ const g=ns.map(n=>({id:n.id,name:n.name,type:n.type,x:n.x,y:n.y,doors:n.doors,src:n.src})); PP.graph=g; PP.graph.__edges=es||edges; };
  const addNode=()=>{ const id='n'+(Date.now()); const t='level'; const n={id,name:'Node '+(nodes.length+1),type:t,x:60+((nodes.length*40)%300),y:60+((nodes.length*30)%200),doors:[],src:null}; const ns=[...nodes,n]; setNodes(ns); persist(ns,edges); setSel(id); };
  const delNode=(id)=>{ if(nodes.length<=1){toast('Keep at least one node.');return;} const ns=nodes.filter(n=>n.id!==id); const es=edges.filter(e=>e.from!==id&&e.to!==id); setNodes(ns); setEdges(es); persist(ns,es); };
  const onDown=(e,n)=>{ const r=ref.current.getBoundingClientRect(); const x=e.clientX-r.left,y=e.clientY-r.top; setDrag({id:n.id,dx:x-n.x,dy:y-n.y}); };
  const onMove=(e)=>{ if(!drag)return; const r=ref.current.getBoundingClientRect(); const x=e.clientX-r.left,y=e.clientY-r.top; const ns=nodes.map(n=>n.id===drag.id?{...n,x:Math.max(0,x-drag.dx),y:Math.max(0,y-drag.dy)}:n); setNodes(ns); };
  const onUp=()=>{ if(drag){ persist(nodes,edges); setDrag(null); } if(link){ setLink(null); } };
  const startLink=(e,n,side)=>{ e.stopPropagation(); setLink({from:n.id,side}); };
  const endLink=(e,n)=>{ e.stopPropagation(); if(link&&link.from!==n.id){ const es=[...edges,{id:'e'+Date.now(),from:link.from,to:n.id,fromSide:link.side}]; setEdges(es); persist(nodes,es); setLink(null); toast('Linked '+link.from+' → '+n.id); } };
  const changeType=(id,t)=>{ const ns=nodes.map(n=>n.id===id?{...n,type:t}:n); setNodes(ns); persist(ns,edges); };
  const rename=(id,v)=>{ const ns=nodes.map(n=>n.id===id?{...n,name:v}:n); setNodes(ns); persist(ns,edges); };
  const grabSrc=()=>{ if(PP.tilemap){ const n=sel&&nodes.find(x=>x.id===sel); if(n){ const ns=nodes.map(x=>x.id===sel?{...x,src:{kind:'tilemap',cols:PP.tilemap.cols,rows:PP.tilemap.rows}}:x); setNodes(ns); persist(ns,edges); toast('Bound tilemap to '+n.name); } } else toast('Build a tilemap first.'); };
  const exportJson=()=>{ const data={tool:'nodegraph',start,nodes:nodes.map(n=>({id:n.id,name:n.name,type:n.type,x:Math.round(n.x),y:Math.round(n.y),doors:n.doors,src:n.src})),edges}; download('nodegraph_'+Date.now()+'.json',data); toast('Exported node graph JSON'); };
  const exportGodot=()=>{ let s='[gd_scene format=3 load_steps=2]\n\n';
    nodes.forEach((n,i)=>{ s+=`[node name="Node_${n.id}" type="Node2D" parent="."]\nposition = Vector2(${Math.round(n.x)}, ${Math.round(n.y)})\nmetadata = {"type":"${n.type}","name":"${n.name}"}\n`; });
    edges.forEach((e,i)=>{ s+=`[node name="Door_${e.id}" type="Area2D" parent="."]\nmetadata = {"from":"${e.from}","to":"${e.to}"}\n[node name="CS" type="CollisionShape2D" parent="Door_${e.id}"]\nshape = SubResource("rect_${e.id}")\n\n`; });
    s+='[resource]\n'; edges.forEach(e=>{ s+=`[sub_resource type="RectangleShape2D" id="rect_${e.id}"]\nsize = Vector2(32, 32)\n`; });
    download('world_graph.tscn',s); toast('Exported Godot world_graph.tscn ('+nodes.length+' nodes, '+edges.length+' doors)'); };
  const stitch=()=>{ toast('Stitch: layering ' + nodes.length + ' nodes into mega-map (PNG via Export coming next build).'); };
  const selN=sel&&nodes.find(n=>n.id===sel);
  return (
    <div className="panel">
      <div className="titlebar"><h2 className="glow-c" style={{fontSize:15}}>Node Graph — Stitch &amp; Doors</h2><span className="chip">engine-agnostic</span></div>
      <div className="hint">Connect hand-drawn pages, tilemaps and hubs into one world. Each node is a level (any engine). Drag nodes to position; drag from a node's <b>●</b> port onto another node to link a door/transition. Mark one as the Start. Export the graph JSON (engine-agnostic) or a Godot world scene.</div>
      <div className="seg">
        <button className="neon-btn cy" onClick={addNode}>+ Node</button>
        <button className="neon-btn am" onClick={()=>sel&&delNode(sel)} disabled={!sel}>Delete</button>
        <button className="neon-btn" onClick={()=>{ setStart(sel||start); toast('Start = '+(selN?selN.name:start)); }}>Set Start</button>
        <button className="neon-btn" onClick={grabSrc}>Bind Tilemap</button>
        <button className="neon-btn vi" onClick={stitch}>Stitch Map</button>
        <button className="neon-btn cy" onClick={exportJson}>Export JSON</button>
        <button className="neon-btn" onClick={exportGodot}>Godot .tscn</button>
      </div>
      <div className="row">
        {nodes.length} node(s) · {edges.length} door(s) · start: <b style={{color:'var(--accent)'}}>{(nodes.find(n=>n.id===start)||{}).name||start}</b>
      </div>
      <div className="stage" style={{minHeight:340,alignItems:'stretch',background:'#070b14'}}>
        <div ref={ref} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
             style={{position:'relative',flex:1,minHeight:320,overflow:'auto',cursor:drag?'grabbing':'default'}}>
          {/* edges */}
          <svg style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}}>
            {edges.map(e=>{ const a=nodes.find(n=>n.id===e.from),b=nodes.find(n=>n.id===e.to); if(!a||!b)return null; const x1=a.x+70,y1=a.y+30,x2=b.x+70,y2=b.y+30; return <line key={e.id} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#10b981" strokeWidth="2" strokeDasharray="5 4"/>; })}
          </svg>
          {nodes.map(n=>{
            const d=NODE_TYPES[n.type]||{color:'#888',glyph:'?'};
            const isStart=n.id===start;
            return (
              <div key={n.id}
                   onMouseDown={(e)=>{ onDown(e,n); setSel(n.id); }}
                   onMouseUp={(e)=>endLink(e,n)}
                   style={{position:'absolute',left:n.x,top:n.y,width:140,background:'#0e1626',border:'1px solid '+(isStart?'#10b981':d.color),borderRadius:10,padding:6,boxShadow:'0 4px 16px #0008',cursor:'grab'}}>
                <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
                  <span style={{color:d.color,fontSize:14}}>{d.glyph}</span>
                  <input value={n.name} onChange={e=>rename(n.id,e.target.value)} onClick={e=>e.stopPropagation()} style={{flex:1,background:'#070b15',border:'1px solid #22324a',color:'#dfe7f0',borderRadius:6,fontSize:11,padding:'2px 4px'}}/>
                </div>
                <div style={{display:'flex',gap:3}}>
                  {(Object.keys(NODE_TYPES)).map(t=>(
                    <button key={t} onClick={(e)=>{e.stopPropagation();changeType(n.id,t);}} title={NODE_TYPES[t].name}
                      style={{flex:1,fontSize:9,padding:'2px 0',borderRadius:5,border:'1px solid '+(n.type===t?NODE_TYPES[t].color:'#22324a'),background:n.type===t?NODE_TYPES[t].color+'22':'transparent',color:'#cfe3ff',cursor:'pointer'}}>{t[0].toUpperCase()}</button>
                  ))}
                </div>
                {isStart && <div style={{fontSize:9,color:'#10b981',marginTop:3}}>★ START</div>}
                {/* link port */}
                <div title="drag to another node to link a door" onMouseDown={(e)=>startLink(e,n)} onClick={e=>e.stopPropagation()}
                     style={{position:'absolute',right:-7,top:24,width:14,height:14,borderRadius:'50%',background:'#10b981',border:'2px solid #071',cursor:'crosshair'}}/>
              </div>
            );
          })}
        </div>
      </div>
      {selN && <div className="li"><span className="dot" style={{background:(NODE_TYPES[selN.type]||{}).color,color:(NODE_TYPES[selN.type]||{}).color}}></span>Selected <b>{selN.name}</b> · type {selN.type} · {selN.src?('bound: '+(selN.src.kind||'image')):'no source'} · doors in/out via port →</div>}
    </div>
  );
}

/* =================== OPTIONS =================== */
function OptionsPanel({toast,doc,onDoc}){
  const [o,setO]=useState({...PP.options});
  const apply=(patch)=>{ const n={...o,...patch}; setO(n); Object.assign(PP.options,n); document.documentElement.style.setProperty('--accent',n.accent); };
  const save=async()=>{ const data={type:'pixelpalace-settings',options:PP.options,savedAt:new Date().toISOString()};
    try{ if(window.showDirectoryPicker){ const d=await window.showDirectoryPicker(); const h=await d.getFileHandle('settings.json',{create:true}); const w=await h.createWritable(); await w.write(JSON.stringify(data,null,2)); await w.close(); toast('Saved settings.json to folder'); return; } }catch(e){}
    download('pixelpalace_settings.json',data); toast('Downloaded settings.json'); };
  const load=()=>{ const inp=document.createElement('input');inp.type='file';inp.accept='.json';inp.onchange=()=>{const f=inp.files[0];const r=new FileReader();r.onload=()=>{try{const d=JSON.parse(r.result);if(d.options){Object.assign(PP.options,d.options);setO({...PP.options});document.documentElement.style.setProperty('--accent',PP.options.accent);toast('Loaded settings');}else toast('Invalid settings file');}catch(e){toast('Parse error');}};r.readAsText(f);};inp.click();};
  return (
    <div className="panel">
      <div className="titlebar"><h2 className="glow" style={{fontSize:15}}>Options</h2><span className="chip">global settings · JSON to folder</span></div>
      <div className="row">
        <div className="col" style={{minWidth:120}}><label>Canvas W (shared)</label><input type="number" min={1} max={2048} value={doc?doc.w:64} onChange={e=>onDoc&&onDoc({w:Math.max(1,Math.min(2048,+e.target.value||64))})}/></div>
        <div className="col" style={{minWidth:120}}><label>Canvas H (shared)</label><input type="number" min={1} max={2048} value={doc?doc.h:64} onChange={e=>onDoc&&onDoc({h:Math.max(1,Math.min(2048,+e.target.value||64))})}/></div>
        <div className="col" style={{minWidth:180}}><label>Palette (shared)</label><div style={{display:'flex',gap:3,marginTop:4,flexWrap:'wrap'}}>{(doc?doc.palette:['#000000','#ffffff']).map((c,i)=>(<span key={i} title={c} style={{width:16,height:16,background:c,borderRadius:3,display:'inline-block',border:'1px solid #333'}}/>))}</div></div>
      </div>
      <div className="row">
        <div className="col" style={{minWidth:140}}><label>Tile Size</label><select value={o.tileSize} onChange={e=>apply({tileSize:+e.target.value})}><option>8</option><option>16</option><option>32</option><option>64</option></select></div>
        <div className="col" style={{minWidth:120}}><label>Grid W (mural)</label><input type="number" value={o.gridW} onChange={e=>apply({gridW:+e.target.value})}/></div>
        <div className="col" style={{minWidth:120}}><label>Grid H (mural)</label><input type="number" value={o.gridH} onChange={e=>apply({gridH:+e.target.value})}/></div>
        <div className="col" style={{minWidth:120}}><label>Accent</label><input type="text" value={o.accent} onChange={e=>apply({accent:e.target.value})}/></div>
      </div>
      <div className="row">
        <label className="neon-btn">Show Grid<input type="checkbox" checked={o.showGrid} onChange={e=>apply({showGrid:e.target.checked})} style={{display:'none'}}/></label>
        <button className={"neon-btn "+(o.showGrid?'on':'')} onClick={()=>apply({showGrid:!o.showGrid})}>{o.showGrid?'Grid: On':'Grid: Off'}</button>
        <span style={{color:'var(--dim)',fontSize:12,marginLeft:12}}>Cursor:</span>
        <button className={"neon-btn "+(o.cursorStyle==='cross'?'on':'')} onClick={()=>apply({cursorStyle:'cross'})}>﹢ Cross</button>
        <button className={"neon-btn "+(o.cursorStyle==='dot'?'on':'')} onClick={()=>apply({cursorStyle:'dot'})}>● Dot</button>
        <button className={"neon-btn "+(o.cursorStyle==='none'?'on':'')} onClick={()=>apply({cursorStyle:'none'})}>◌ None</button>
      </div>
      <div className="row">
        <button className={"neon-btn "+(o.noDoubles?'on':'')} onClick={()=>apply({noDoubles:!o.noDoubles})}>{o.noDoubles?'No Doubles: On':'No Doubles: Off'}</button>
        <span style={{color:'var(--dim)',fontSize:11,marginLeft:8}}>Skip drawing pixels that already match the active color</span>
      </div>
      <div className="row">
        <button className={"neon-btn "+(o.aiEnabled===false?'':'on')} onClick={()=>apply({aiEnabled:!o.aiEnabled})}>{o.aiEnabled===false?'AI: Off':'AI: On'}</button>
        <span style={{color:'var(--dim)',fontSize:11,marginLeft:8}}>Disable to skip the AI sidecar entirely (no model needed for download installs)</span>
      </div>
      <div className="seg">
        <button className="neon-btn cy" onClick={save}>Save Settings → Folder</button>
        <button className="neon-btn" onClick={load}>Load Settings</button>
      </div>
      <div className="hint">Settings persist in the project (top-bar Save) and can be exported as <span className="kbd">settings.json</span> into a folder. Accent recolors the whole UI live.</div>
    </div>
  );
}

/* =================== PIPELINE =================== */
function PipelinePanel(setActive){
  const steps=[
    {t:'Create art',d:'Use Editor (layers, frames, RotSprite, pixel-perfect, pattern brush, blend modes) or Studio (animation, shade finder, dithering).',tab:'editor'},
    {t:'Build a tilemap',d:'TileMap: scan an assets folder, drag-and-drop images, or slice spritesheets. Paint with brush, random scatter, or chunk tools. Supports isometric.',tab:'tilemap'},
    {t:'Gather assets',d:'Art Hub: central gallery with folders. All tools save here. Route assets to any panel via Edit/Anim/Map buttons.',tab:'hub'},
    {t:'Mark up the scan',d:'Markup Painter: load a scanned page and paint semantic layers (path, collision, water, hazard, interactable, zone).',tab:'markup'},
    {t:'Trace collision',d:'Collision: Photo mode (over any image) or Level mode (over your tilemap). Export/import JSON.',tab:'collision'},
    {t:'Place markers',d:'Markers: drop player start, enemies, items, exits, saves. Load tilemap or photo as background.',tab:'markers'},
    {t:'Build & export',d:'Build assembles collisions + markers + markup + tilemap. Export Level JSON, Godot .tscn, or OpenStarbound mod.',tab:'build'},
    {t:'Stitch the world',d:'Node Graph: connect pages/levels/hubs with doors into one engine-agnostic world; export graph JSON or Godot world scene.',tab:'graph'},
  ];
  return (
    <div className="panel">
      <div className="titlebar"><h2 className="glow-c" style={{fontSize:15}}>Photo → Level Pipeline</h2><span className="chip">every tool, connected</span></div>
      {steps.map((s,i)=>(<div className="step" key={i}><div className="n">{i+1}</div><div className="col" style={{flex:1}}><div style={{fontWeight:700,color:'#eafff6'}}>{s.t}</div><div className="hint">{s.d}</div><button className="neon-btn" style={{alignSelf:'flex-start',marginTop:6}} onClick={()=>setActive(s.tab)}>Open →</button></div></div>))}
      <div className="hint">Send assets between tabs any time: use the top-bar Send menu or Art Hub route buttons (or use “Send” on an Editor/Forge canvas) to push it to Tilemap, Collision, Markup, Markers, or the Art Hub gallery.</div>
    </div>
  );
}

/* =================== INFO / HELP =================== */
const HELP = {
  start:{
    heading:'Welcome to Pixel Palace',
    blurb:`Pixel Palace is a unified pixel-art studio with built-in local AI, layers, animation, photo→pixel converters, a full tilemap painter, collision/markup/marker tools, and one-click export to Godot/Starbound. Everything is connected via the Send menu and shared project state.`,
    steps:[
      `Pick a tab on the left rail. Start in Editor (the core drawing tool).`,
      `In Editor: select a layer, choose a tool, pick a color and brush size, then draw on the canvas.`,
      `Add frames on the bottom timeline to animate; each layer can have its own frames.`,
      `Send finished art to any panel with the top-bar "Send ▾" menu (Tilemap, Collision, Markup, Markers, Art Hub).`,
      `Paint tilemaps in TileMap, trace collision in Collision, annotate scans in Markup, place spawns in Markers.`,
      `Build assembles everything into a level export. Top-bar Save stores the full project (.pproj).`
    ],
    note:`If a tool "does nothing", you usually need (1) an active layer selected and (2) to actually click on the canvas itself — not the surrounding UI.`
  },
  editor:{
    heading:'Editor — the core pixel studio',
    blurb:`The main drawing surface (loads the full Pixel Palace editor). Layout: tool dock on the left, canvas in the center, Layers on the right, Frames timeline along the bottom.`,
    steps:[
      `Make sure a layer is active. "Layer 1" exists by default; click it in the right panel to select it.`,
      `Click a tool in the left toolbar (pencil, eraser, fill, line, shapes, eyedropper…).`,
      `Pick a color from the Palette and a brush size (1–17px).`,
      `Draw directly on the center canvas. Use + / − to zoom; the image is small by default (e.g. 64×64) — that is normal for pixel art, zoom in to place pixels.`,
      `Right panel: 👁 = show/hide layer, ⧉ = duplicate, ✕ = delete, + = add layer.`,
      `Bottom timeline: + = add frame, ⧉ = duplicate frame, ▶ = play, set FPS and Loop. Each layer animates independently.`,
      `📥 import image, 📤 export, 💾 save. Top-bar Save stores layers+frames+everything.`
    ],
    tools:[
      {name:'Pencil (✎ / PX)', icon:'✎', desc:`Paints pixels at the current brush size and color. The basic drawing tool.`},
      {name:'Eraser (⌫)', icon:'⌫', desc:`Erases pixels back to transparent on the active layer.`},
      {name:'Eyedropper / Pick (💉)', icon:'💉', desc:`Click any pixel to copy its color into the active color.`},
      {name:'Fill / Bucket (▣)', icon:'▣', desc:`Flood-fills a contiguous region of the same color.`},
      {name:'Line (╱)', icon:'╱', desc:`Draws a straight line from press to release (pixel-perfect).`},
      {name:'Rectangle (▮) / Rounded (▭)', icon:'▮', desc:`Draws a rectangle or rounded rectangle (filled or outline).`},
      {name:'Ellipse / Circle (○)', icon:'○', desc:`Draws an ellipse or circle.`},
      {name:'Shape presets (⊞)', icon:'⊞', desc:`Inserts preset geometric shapes quickly.`},
      {name:'Natural shapes (🌿)', icon:'🌿', desc:`Generates organic shapes (clouds, mountains) using Perlin noise.`},
      {name:'Effects (✦)', icon:'✦', desc:`Opens effects: greeble/auto-texture, outline, bevel, posterize, hue-shift and more.`},
      {name:'Brush size 1–17px', desc:`Sets how many pixels the pencil/eraser covers per dab.`},
      {name:'Zoom − / +', desc:`Scales the view only; the underlying image keeps its real size.`},
      {name:'Layers (right)', desc:`Stack of drawings. Each layer has its own visibility, opacity and frame list.`},
      {name:'Frames timeline (bottom)', desc:`Animation strip for the selected layer. Add frames to build an animation.`},
      {name:'Palette / Presets (P1–P5)', desc:`Current color swatches and quick palette presets.`}
    ],
    note:`If drawing does nothing: confirm a layer is selected (right panel) and that you clicked ON the canvas, not the surrounding panels.`
  },
  forge:{
    heading:'Forge / Studio',
    blurb:`Pixel Forge Studio: a sprite & animation generator with palettes and frame tools. Great for palette work, dithering, and quick sprite/animation drafts.`,
    steps:[
      `Pick a tool (pencil, eraser, fill, line, rect, circle…).`,
      `Choose a palette (Retro Console, Game Boy, Pico-8…) from the dropdown.`,
      `Draw and add frames with + Add / ⧉ Dup; press ▶ Play to preview; set FPS / Loop / Onion skin.`,
      `Upload a photo to trace, or draw from scratch.`,
      `Use top-bar "Send ▾" to push the canvas to Tilemap, Collision or Assets.`
    ],
    tools:[
      {name:'Pencil / Eraser / Fill / Line / Rect / Circle', desc:`Same drawing primitives as the Editor, tuned for sprite work.`},
      {name:'Palettes (16 colors)', desc:`Swaps the active 16-color palette; includes retro/console themes.`},
      {name:'Frames (FRAMES panel)', desc:`Add, duplicate, delete and play frames; onion-skin for animation.`},
      {name:'Upload Photo', desc:`Loads an image to trace or sample colors from.`}
    ],
    note:`Forge is best for sprites/animation; the Editor is best when you need layers + frames together.`
  },
  photo:{
    heading:'Photo → Pixel (Water / Alpha / Extract)',
    blurb:`Three converters that turn real photos into pixel art. Water = painterly watercolor pixelation; Alpha = transparency/background removal; Extract = pull assets/sprites out of an image.`,
    steps:[
      `Open one of the three tabs (Water, Alpha or Extract).`,
      `Upload a photo (button inside the tool).`,
      `Adjust the controls (palette, dithering, threshold, scale) until it looks right.`,
      `Export, or use top-bar "Send ▾" to push the result into Tilemap / Collision / Assets / Editor.`
    ],
    tools:[
      {name:'Water (🌊)', icon:'🌊', desc:`Watercolor-style pixelation: soft, painterly downscale to a palette.`},
      {name:'Alpha (◌)', icon:'◌', desc:`Transparency tool: removes a background color / makes an alpha mask.`},
      {name:'Extract (⊡)', icon:'⊡', desc:`Asset extractor: slices or pulls objects/sprites out of a source image.`}
    ],
    note:`These are photo utilities — they need an uploaded image before anything visible happens.`
  },
  tilemap:{
    heading:'TileMap (TileMaker DOT)',
    blurb:`Full tilemap painter with three asset layers (tiles, objects, NPCs), brush/random scatter/chunk tools, isometric mode, and Tiled integration.`,
    steps:[
      `Scan an assets folder (F4) to load your tile PNGs into the palette, or drag-and-drop images onto the sidebar.`,
      `Select a tile from the sidebar, then click/drag on the grid to paint.`,
      `Use Random Scatter for variety, Chunk Tool to select/copy regions, and Notes for annotations.`,
      `Toggle Isometric mode for diamond-projection tilemaps.`,
      `The tilemap auto-publishes to PP.tilemap so Collision, Markers, and Build can use it.`,
      `Export as Tiled JSON, TMX, TMJ, CSV, or open directly in Tiled.`
    ],
    tools:[
      {name:'Brush (o)', desc:`Paint single tiles on the grid with the selected tile(s).`},
      {name:'Random Scatter (Y2)', desc:`Click multiple tiles in the sidebar to build a selection, then paint with random picks from the set.`},
      {name:'Chunk Tool (Y)', desc:`Drag to select a rectangular region. Save/load chunks as .tmdot files for modular level design.`},
      {name:'Notes (S)', desc:`Click to drop annotated pins with colored labels. Cycle colors with the dot button.`},
      {name:'Scan Assets Folder', desc:`Opens a folder picker; reads tiles/, objects/, npcs/ subfolders for PNGs.`},
      {name:'Slice Spritesheet', desc:`Imports a PNG and slices it into tileSize×tileSize tiles.`},
      {name:'Import Tiled JSON/TMJ', desc:`Loads a previously exported Tiled map JSON back into the editor.`},
      {name:'Transform (H / V / 90°)', desc:`Flip or rotate the entire tilemap grid.`},
      {name:'Export (.TMX / .TMJ / JSON / CSV / .LVL)', desc:`Export the tilemap in various formats, always accompanied by a tilesheet PNG.`},
      {name:'Open in Tiled', desc:`Writes tilesheet.png + tilemap.tmx to a folder and launches the bundled Tiled editor.`}
    ],
    note:`Send → Tilemap from any editor pushes the image into the tile palette. Toggle "Slice as grid" for spritesheets, or turn it off to add whole images as single tiles.`
  },
  assets:{
    heading:'Art Hub',
    blurb:`Central gallery of all your art. Every tool saves here automatically. Organize with folders, route assets to any panel, and export to disk.`,
    steps:[
      `Use "Send ▾ → Assets gallery" from any editor/forge tab to drop art here.`,
      `Or click Upload Files to add images, or Import Folder to scan a directory.`,
      `Click an asset's route buttons: Edit (→ Editor), Anim (→ Studio), Map (→ TileMap).`,
      `Organize with folders: use the folder bar at the top, or click 📁 to move assets.`,
      `Export to disk: .PNG or .JSON buttons on each asset.`
    ],
    tools:[
      {name:'Gallery', desc:`Thumbnails of collected assets with route/export buttons.`},
      {name:'Upload Files / Import Folder', desc:`Add images from disk.`},
      {name:'Fetch Inbox', desc:`Pulls all pending Send data into the gallery.`},
      {name:'Route buttons', desc:`Send assets to Editor, Studio, or TileMap.`}
    ]
  },
  collision:{
    heading:'Collision Painter',
    blurb:`Define collision/trigger shapes over photos or your tilemap. Two modes: Photo (trace over any image) and Level (trace over the TileMap grid). All shapes feed into Build export.`,
    steps:[
      `Choose mode: Photo or Level.`,
      `Photo: upload/load an image (or Send one from Editor/Forge) then draw collision shapes on top.`,
      `Level: click "Level / Tilemap Mode" to load the tilemap as background, then mark collision zones.`,
      `Pick a shape type (platform, wall, slope, one-way, kill zone), click to place points, then Finish.`,
      `Export JSON to save shapes, or Load JSON to restore previously saved shapes.`,
      `All shapes are included automatically in Build export (JSON + Godot .tscn).`
    ],
    tools:[
      {name:'Photo mode', desc:`Overlays collision shapes on a photo/imported image.`},
      {name:'Level / Tilemap Mode', desc:`Loads the tilemap grid as background for designing level collision.`},
      {name:'Shape types', desc:`Platform (walkable), Wall, Slope, One-Way Platform, Kill Zone — each with a distinct color.`},
      {name:'Export / Load JSON', desc:`Save collision shapes to disk or reload them later.`}
    ],
    note:`Shapes must have 3+ points. Click Finish to complete a shape, Cancel to abort. All collision data feeds into Build export automatically.`
  },
  markers:{
    heading:'Game Markers',
    blurb:`Place annotated spawn/exit/save points on top of photos or your tilemap. All markers feed into Build export.`,
    steps:[
      `Load a background: use Load Photo, Use Sent (from top-bar Send), or Load Tilemap.`,
      `Choose a marker type from the toolbar (Player Start, Enemy Spawn, Item Pickup, Pipe/Exit, Save Point).`,
      `Click on the canvas to place markers. Each shows its glyph and color.`,
      `All markers are included automatically in Build export (JSON + Godot .tscn).`
    ],
    tools:[
      {name:'Player Start (P)', desc:`Green spawn point marker.`},
      {name:'Enemy Spawn (E)', desc:`Pink enemy spawn marker.`},
      {name:'Item Pickup (I)', desc:`Gold item pickup marker.`},
      {name:'Pipe / Exit (X)', desc:`Cyan exit/transition marker.`},
      {name:'Save Point (S)', desc:`Purple save point marker.`},
      {name:'Export JSON', desc:`Saves marker positions to a JSON file.`}
    ],
    note:`Markers store relative (x, y) positions (0–1 range), so they scale with any resolution. All marker data feeds into Build export automatically.`
  },
  build:{
    heading:'Build & Export Level',
    blurb:`Assembles collisions, markers, markup paths, and tilemap into shippable game assets. Exports to JSON, Godot .tscn, or OpenStarbound mod.`,
    steps:[
      `Name the level in the text field.`,
      `All data (collisions, markers, markup, tilemap) is collected automatically from the other tabs.`,
      `Export Level JSON: full level data including all collision shapes, markers, markup paths, and tilemap.`,
      `Export Godot .tscn: generates a Godot scene with StaticBody2D, Area2D, Line2D (markup), and Marker2D nodes.`,
      `Export OpenStarbound Mod: packs tiles as .material + .dungeon for Starbound.`,
      `Use top-bar Save to keep the full editable project (.pproj) with all panel state.`
    ],
    tools:[
      {name:'Level JSON', desc:`Complete level data: collisions + markers + markup + tilemap + metadata.`},
      {name:'Godot .tscn', desc:`Godot scene file with collision polygons, markers, markup lines, and tilemap node.`},
      {name:'OpenStarbound Mod', desc:`Starbound-compatible .zip with materials and dungeon files.`},
      {name:'Save (.pproj)', desc:`Full project state: options, assets, collisions, markers, markup, tilemap, graph, editor state.`}
    ],
    note:`Markup paths (from the Markup tab) are exported as Godot Line2D nodes with color and type metadata. All data persists in .pproj save files.`
  },
  options:{
    heading:'Options',
    blurb:`Global settings: accent color, grid, tile size, cursor style, and more. Tile size syncs with TileMap.`,
    steps:[
      `Change the accent theme color — recolors the whole UI live.`,
      `Toggle grid on/off.`,
      `Set tile size (8/16/32/64) — shared with TileMap.`,
      `Choose cursor style: Cross, Dot, or None.`,
      `No Doubles: skip drawing pixels that already match the active color.`,
      `Settings persist in the project (top-bar Save) and can be exported as settings.json.`
    ],
    tools:[
      {name:'Accent', desc:`UI highlight color.`},
      {name:'Grid', desc:`Toggle grid overlay across tabs.`},
      {name:'Tile Size', desc:`Default tile size, shared with TileMap panel.`},
      {name:'Cursor Style', desc:`Cross, Dot, or None for the drawing cursor.`},
      {name:'No Doubles', desc:`Skip redundant pixels when drawing.`}
    ]
  },
  pipeline:{
    heading:'Full Pipeline (recommended order)',
    blurb:`One coherent flow from blank to exported game level.`,
    steps:[
      `Editor or Forge: create your sprites / animations.`,
      `Photo → Pixel: convert reference photos if needed (Water, Alpha, Extract).`,
      `Art Hub: collect everything in the central gallery.`,
      `TileMap: paint a level from your tile assets (scan folder, drag-drop, or slice spritesheets).`,
      `Collision: trace collision shapes over the tilemap (Level mode) or a photo (Photo mode).`,
      `Markup: paint semantic layers (path, collision, water, hazard, interactable, zone) over scans.`,
      `Markers: place player start, enemies, items, exits, saves.`,
      `Build: export level JSON, Godot scene, or OpenStarbound mod. Top-bar Save for full project.`
    ]
  },
  markup:{
    heading:'Markup Painter',
    blurb:`Paint semantic layers on scanned hand-drawn pages or tilemaps. Each layer color represents a meaning (path, collision, water, hazard, interactable, zone).`,
    steps:[
      `Load a scanned page or tilemap (Load Scan, Use Sent, or Level/Tilemap Mode).`,
      `Pick or add a layer (Path, Collision, Water, Hazard, Interactable, Zone).`,
      `Click to place points, then Finish to complete a stroke. Semi-transparent fills show the area.`,
      `Toggle layer visibility with the eye icon. Add new layers with "+ Layer".`,
      `Markup paths export to Godot as Line2D nodes, and are included in .pproj save files.`
    ],
    tools:[
      {name:'Path / Walk', desc:`Green walkable path layer.`},
      {name:'Collision', desc:`Cyan collision region layer.`},
      {name:'Water', desc:`Blue water region layer.`},
      {name:'Hazard / Kill', desc:`Pink hazard/death zone layer.`},
      {name:'Interactable', desc:`Gold interactable object layer.`},
      {name:'Zone / Region', desc:`Purple general zone/region layer.`}
    ],
    note:`Markup data is saved in .pproj projects and exported in Build (both JSON and Godot .tscn as Line2D nodes).`
  }
};
function InfoPanel(){
  const [sel,setSel]=useState('start');
  const [openTool,setOpenTool]=useState(null);
  const SECTIONS=[
    {id:'start',title:'★ Getting Started'},
    {id:'editor',title:'◆ Editor (core)'},
    {id:'forge',title:'▦ Forge / Studio'},
    {id:'photo',title:'🌊 Photo → Pixel'},
    {id:'tilemap',title:'▦ Tilemap'},
    {id:'assets',title:'▣ Assets'},
    {id:'collision',title:'▱ Collision'},
    {id:'markers',title:'⌖ Markers'},
    {id:'markup',title:'✎ Markup'},
    {id:'build',title:'▤ Build & Export'},
    {id:'options',title:'⚙ Options'},
    {id:'pipeline',title:'⇄ Full Pipeline'},
  ];
  const sec=HELP[sel];
  return (
    <div className="panel" style={{display:'flex',flexDirection:'column'}}>
      <div className="titlebar"><h2 className="glow-c" style={{fontSize:15}}>How to use Pixel Palace</h2><span className="chip">click a topic →</span></div>
      <div style={{display:'flex',flex:1,minHeight:0}}>
        <div style={{width:210,flex:'0 0 210px',overflowY:'auto',padding:10,display:'flex',flexDirection:'column',gap:6,borderRight:'1px solid var(--line)'}}>
          {SECTIONS.map(s=>(
            <button key={s.id} className={'neon-btn'+(sel===s.id?' on':'')} style={{textAlign:'left'}} onClick={()=>{setSel(s.id);setOpenTool(null);}}>{s.title}</button>
          ))}
        </div>
        <div style={{flex:1,overflowY:'auto',padding:18}}>
          <h3 className="glow" style={{marginBottom:8}}>{sec.heading}</h3>
          <div className="hint" style={{marginBottom:12}}>{sec.blurb}</div>
          {sec.steps && <ol style={{margin:'0 0 14px 18px',lineHeight:1.7,color:'var(--txt)'}}>{sec.steps.map((st,i)=><li key={i}>{st}</li>)}</ol>}
          {sec.tools && (
            <div>
              <div style={{fontWeight:700,color:'#eafff6',marginBottom:8}}>Tools & what they do</div>
              {sec.tools.map(t=>(
                <div key={t.name} style={{marginBottom:6,border:'1px solid var(--line)',borderRadius:10,overflow:'hidden',background:'#0a1120'}}>
                  <button className="neon-btn" style={{width:'100%',textAlign:'left',border:0,borderRadius:0,background:'transparent'}} onClick={()=>setOpenTool(openTool===t.name?null:t.name)}>
                    <b>{t.icon?t.icon+' ':''}{t.name}</b> <span style={{float:'right',color:'var(--dim)'}}>{openTool===t.name?'▲':'▼'}</span>
                  </button>
                  {openTool===t.name && <div style={{padding:'10px 12px',color:'var(--dim2)',fontSize:13,lineHeight:1.6}}>{t.desc}</div>}
                </div>
              ))}
            </div>
          )}
          {sec.note && <div className="hint" style={{marginTop:14,borderLeft:'2px solid var(--accent)',paddingLeft:10}}>{sec.note}</div>}
        </div>
      </div>
    </div>
  );
}

/* =================== SAVE / LOAD PROJECT =================== */
function pickOpenText(){
  return new Promise((resolve)=>{
    const inp=document.createElement('input'); inp.type='file'; inp.accept='.json,.pproj';
    inp.onchange=()=>{ const f=inp.files[0]; if(!f){ resolve(null); return; } const r=new FileReader();
      r.onload=()=>resolve(r.result); r.onerror=()=>resolve(null); r.readAsText(f); };
    inp.click();
  });
}

/* =================== APP SHELL =================== */
function App(){
  const [active,setActive]=useState('hub');
  const [toastMsg,setToastMsg]=useState('');
  const toast=useCallback((m)=>{ setToastMsg(m); setTimeout(()=>setToastMsg(''),2600); },[]);
  window.__ppToast = toast;
  const iframeRef=useRef(null);
  const [undoAvail,setUndoAvail]=useState(false);
  const [redoAvail,setRedoAvail]=useState(false);
  const [doc,setDoc]=useState({w:64,h:64,palette:['#000000','#ffffff','#ff004d','#ffa300','#ffec27','#00e436','#29adff','#83769c']});
  const docRef=useRef(doc); docRef.current=doc;
  const [contentKey,setContentKey]=useState(0);
  const [projName,setProjName]=useState('Untitled');
  const projIdRef=useRef(null);
  const projNameRef=useRef('Untitled'); projNameRef.current=projName;
  const broadcastDoc=()=>{ try{ if(iframeRef.current&&iframeRef.current.contentWindow) iframeRef.current.contentWindow.postMessage({type:'DOC_SYNC',doc:docRef.current},'*'); }catch(e){} };
  useEffect(()=>{ broadcastDoc(); },[doc]);
  const tab=TABS.find(t=>t.id===active);

  // Ask the EDITOR iframe for its full state (layers/frames/canvas) — independent of active tab.
  const editorIframe=()=>document.querySelector('iframe.tool-iframe[src*="pixel_palace_editor"]');
  const pendingEditorStateRef=useRef(null);
  const requestEditorState=()=>new Promise((resolve)=>{
    const el=editorIframe();
    if(!el || !el.contentWindow){ resolve(null); return; }
    const t=setTimeout(()=>resolve(null),2500);
    const h=(e)=>{ const d=e.data||{}; if(d.type==='EDITOR_STATE'){ clearTimeout(t); window.removeEventListener('message',h); resolve(d.data); } };
    window.addEventListener('message',h);
    el.contentWindow.postMessage({type:'GET_STATE'},'*');
  });
  const applyEditorState=(data)=>{ const el=editorIframe(); if(el && el.contentWindow && data) el.contentWindow.postMessage({type:'SET_STATE',data},'*'); };

  // ── Art Hub (Procreate-like): projects persist in localStorage ──
  const HUB_KEY='pixelpalace_hub_v1';
  const hubLoad=()=>{ try{ return JSON.parse(localStorage.getItem(HUB_KEY))||{projects:{}}; }catch(e){ return {projects:{}}; } };
  const hubSave=(h)=>{ try{ localStorage.setItem(HUB_KEY, JSON.stringify(h)); }catch(e){} };
  const [projects,setProjects]=useState(()=>hubLoad().projects||{});
  const newProjId=()=>'p_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,6);
  const fmtTime=(ts)=>{ try{ const d=new Date(ts); return d.toLocaleDateString()+' '+d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}); }catch(e){ return ''; } };
  const buildSnapshot=async()=>{
    const iframeState=await requestEditorState();
    return { id: projIdRef.current||(projIdRef.current=newProjId()), name: projNameRef.current||'Untitled',
      updatedAt: Date.now(), active: active, doc: docRef.current,
      data:{ options:PP.options, assets:PP.assets, collisions:PP.collisions, markers:PP.markers, markup:PP.markup, tilemap:PP.tilemap, graph:PP.graph, iframeState } };
  };
  const applySnapshot=(snap)=>{
    const d=snap&&snap.data; if(!d) return;
    if(d.options) Object.assign(PP.options, d.options);
    if(d.assets) PP.assets=d.assets;
    if(d.collisions) PP.collisions=d.collisions;
    if(d.markers) PP.markers=d.markers;
    if(d.markup) PP.markup=d.markup;
    if(d.tilemap) PP.tilemap=d.tilemap;
    if(d.graph){ PP.graph=Array.isArray(d.graph)?d.graph:(d.graph.nodes||[]); PP.graph.__edges=d.graph.__edges||d.graph.edges||[]; }
    if(d.doc) Object.assign(docRef.current, d.doc);
    document.documentElement.style.setProperty('--accent', PP.options.accent);
    projIdRef.current=snap.id; setProjName(snap.name||'Untitled');
    if(snap.active) setActive(snap.active);
    setDoc({...docRef.current});
    setContentKey(v=>v+1); // remount panels so they re-read PP fresh
    if(d.iframeState){ pendingEditorStateRef.current=d.iframeState; setTimeout(()=>applyEditorState(d.iframeState), 1000); }
  };
  const autosaveHub=useCallback(async ()=>{
    try{ const snap=await buildSnapshot(); const h=hubLoad(); h.current=snap; h.projects[snap.id]=snap; hubSave(h); setProjects(h.projects); }catch(e){}
  },[active]);

  const saveProject=async()=>{
    try{
      const snap=await buildSnapshot();
      const name=(snap.name||'project').replace(/[^\w\-]+/g,'_')+'_'+new Date().toISOString().slice(0,10)+'.pproj';
      const h=hubLoad(); h.current=snap; h.projects[snap.id]=snap; hubSave(h); setProjects(h.projects);
      download(name, snap); toast('Project saved');
    }catch(e){ console.error(e); toast('Save failed'); }
  };
  const loadProject=async()=>{
    try{
      const text=await pickOpenText(); if(!text) return;
      const snap=JSON.parse(text);
      if(!snap || !snap.data){ toast('Not a project file'); return; }
      applySnapshot(snap); toast('Project loaded');
    }catch(e){ console.error(e); toast('Load failed'); }
  };
  const openProject=(id)=>{ const h=hubLoad(); const snap=h.projects[id]; if(snap){ applySnapshot(snap); toast('Opened '+snap.name); } };
  const deleteProject=(id)=>{ const h=hubLoad(); delete h.projects[id]; hubSave(h); setProjects(h.projects||{}); toast('Deleted project'); };

  // Autosave current session (debounced + on hide/unload) and resume last session on launch.
  useEffect(()=>{
    let timer; const schedule=()=>{ clearTimeout(timer); timer=setTimeout(autosaveHub,2000); };
    const onHide=()=>{ if(document.visibilityState==='hidden') autosaveHub(); };
    const onBlur=()=>{ autosaveHub(); };
    window.addEventListener('beforeunload', autosaveHub);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onHide);
    const iv=setInterval(autosaveHub, 60000);
    return ()=>{ clearTimeout(timer); clearInterval(iv); window.removeEventListener('beforeunload', autosaveHub); window.removeEventListener('blur', onBlur); document.removeEventListener('visibilitychange', onHide); };
  },[autosaveHub]);
  useEffect(()=>{ // resume last session when the app opens
    try{ const h=hubLoad(); if(h.current && h.current.data){ applySnapshot(h.current); } }catch(e){}
  // eslint-disable-next-line
  },[]);
  // Global undo/redo keyboard shortcuts
  useEffect(()=>{
    const h=(e)=>{
      const tag=document.activeElement&&document.activeElement.tagName;
      if(tag==='INPUT'||tag==='TEXTAREA') return;
      if((e.ctrlKey||e.metaKey)&&e.key==='z'&&!e.shiftKey){ e.preventDefault(); if(iframeRef.current&&iframeRef.current.contentWindow) iframeRef.current.contentWindow.postMessage({type:'UNDO'},'*'); }
      if((e.ctrlKey||e.metaKey)&&(e.key==='y'||(e.key==='z'&&e.shiftKey))){ e.preventDefault(); if(iframeRef.current&&iframeRef.current.contentWindow) iframeRef.current.contentWindow.postMessage({type:'REDO'},'*'); }
    };
    window.addEventListener('keydown',h); return ()=>window.removeEventListener('keydown',h);
  },[]);
  // listen for canvas data coming back from iframe tools
  useEffect(()=>{
    const h=(e)=>{ 
      const d=e.data||{}; 
       if(d.type==='CANVAS_DATA'){ const target=window.__pendingSend; if(target){ PP.notifyInbox(target, d.data); toast('Sent canvas → '+target); window.__pendingSend=null; } } 
       if(d.type==='INBOX'){ const t=d.target==='markup'?'markupBg':d.target; PP.notifyInbox(t, d.payload); toast('Received into '+(d.target||'inbox')); }
       if(d.type==='LOAD_CANVAS'){ // an iframe tool wants to push its canvas into editor/studio/animator
         const keys=Object.keys(d.data||{});
         document.querySelectorAll('.tool-iframe').forEach(iframe=>{ if(iframe.contentWindow) iframe.contentWindow.postMessage({type:'LOAD_CANVAS',data:d.data},'*'); });
         if(keys.length){ const k=keys[0]; const map={editor:'editor',studio:'studio',animator:'animator'}; if(map[k]) setActive(map[k]); toast('Sent to '+(map[k]||k)); }
       }
        if(d.type==='DOC_UPDATE'){ setDoc(prev=>({...prev,...(d.patch||{})})); }
        if(d.type==='UPDATE_CANVAS'){ PP.workingCanvas[d.from] = d.data; }
        if(d.type==='REQUEST_IMAGE'){
          const src=d.data&&d.data.source;
          const map={editor:'editor',studio:'studio'};
          const targetKey=map[src]||src;
          document.querySelectorAll('.tool-iframe').forEach(iframe=>{
            if(iframe.contentWindow) iframe.contentWindow.postMessage({type:'CANVAS_REQUEST',data:{requestId:'pixscii_import',target:targetKey}},'*');
          });
          // Also try to pull from the active canvas directly
          setTimeout(()=>{
            const srcKey=d.data&&d.data.source;
            const url=PP.workingCanvas&&PP.workingCanvas[srcKey];
            if(url) document.querySelectorAll('.tool-iframe').forEach(f=>{ if(f.contentWindow) f.contentWindow.postMessage({type:'LOAD_CANVAS',data:{pixscii:url}},'*'); });
          },300);
        }
        if(d.type==='SAVE_TO_ART_HUB'){
          const name=d.data&&d.data.name;
          const image=d.data&&d.data.image;
          if(image){ PP.assets.unshift({id:Date.now()+'_'+Math.random().toString(36).slice(2,7), name:name||('pixscii_'+Date.now()), dataURL:image, folder:'Main'}); if(window.__ppRefreshHub) window.__ppRefreshHub(); toast('Saved to Art Hub: '+(name||'Pixscii export')); }
        }
       if(d.type==='ADD_TO_HUB'){
           PP.assets.unshift({
              id: Date.now() + '_' + Math.random().toString(36).slice(2,7),
              name: d.name || ('export_' + Date.now()),
              dataURL: d.dataURL,
              folder: 'Exports'
           });
           if(window.__ppRefreshHub) window.__ppRefreshHub();
           toast('Saved to Art Hub: ' + (d.name || 'Export'));
        }
        if(d.type==='GENERATE_AI'){
          if(!PP.options.aiEnabled){ toast('AI disabled (enable in Options)'); return; }
          // Generalized AI: route the request straight to the local sidecar over
          // HTTP. Works from Editor, Studio, Map Gen, etc. (Any tool can post this.)
          (async ()=>{
            try{
              const AI_PORT = (window.PP_AI_PORT || 18755);
              const [w,h] = String(d.size||'64').split('x').map(s=>parseInt(s)||64);
              const body = JSON.stringify({
                prompt: d.prompt || 'pixel art, game asset',
                model: d.model || '2dpixel',
                mode: d.mode || 'sprite',
                width: Math.max(16, Math.min(512, w)),
                height: Math.max(16, Math.min(512, h)),
                palette: d.palette || 'none',
                steps: d.steps || 28,
                cfg: d.cfg || 7.5,
                sampler: d.sampler || 'euler_a',
                seed: d.seed || Math.floor(Math.random()*1e6)
              });
              const res = await fetch('http://127.0.0.1:'+AI_PORT+'/generate', {method:'POST', headers:{'Content-Type':'application/json'}, body});
              if(!res.ok) throw new Error('sidecar '+res.status);
              const blob = await res.blob();
              const url = await new Promise((ok,err)=>{ const r=new FileReader(); r.onload=()=>ok(r.result); r.onerror=err; r.readAsDataURL(blob); });
              // send the result back to every iframe tool (they pick what they need)
              document.querySelectorAll('.tool-iframe').forEach(f=>{ if(f.contentWindow) f.contentWindow.postMessage({type:'AI_RESULT', data:{image:url, prompt:d.prompt, mode:d.mode}}, '*'); });
              toast('AI generated ('+w+'×'+h+')');
            }catch(err){
              toast('AI sidecar unavailable: '+err.message);
            }
          })();
        }
        if(d.type==='GENERATE_AI_IMG2IMG'){
          if(!PP.options.aiEnabled){ toast('AI disabled (enable in Options)'); return; }
          (async ()=>{
            try{
              const AI_PORT = (window.PP_AI_PORT || 18755);
              const body = JSON.stringify({
                image: d.image || '',
                prompt: d.prompt || 'pixel art',
                strength: d.strength || 0.4,
                model: d.model || '2dpixel',
                palette: d.palette || 'none',
                steps: d.steps || 20,
                cfg: d.cfg || 7.0,
                sampler: d.sampler || 'euler_a',
                seed: d.seed || Math.floor(Math.random()*1e6)
              });
              const res = await fetch('http://127.0.0.1:'+AI_PORT+'/img2img', {method:'POST', headers:{'Content-Type':'application/json'}, body});
              if(!res.ok) throw new Error('sidecar '+res.status);
              const blob = await res.blob();
              const url = await new Promise((ok,err)=>{ const r=new FileReader(); r.onload=()=>ok(r.result); r.onerror=err; r.readAsDataURL(blob); });
              document.querySelectorAll('.tool-iframe').forEach(f=>{ if(f.contentWindow) f.contentWindow.postMessage({type:'AI_RESULT', data:{image:url, prompt:d.prompt, mode:'img2img'}}, '*'); });
              toast('AI img2img done');
            }catch(err){
              toast('AI sidecar unavailable: '+err.message);
            }
          })();
        }
        if(d.type==='AI_RESULT'){
          // a tool (e.g. AI Studio) sent a result; drop it into the hub + active tool
          const url = d.data && (d.data.dataURL || d.data.image);
          if(url){ PP.assets.unshift({ id: Date.now()+'_'+Math.random().toString(36).slice(2,7), name:(d.data&&d.data.prompt||'ai')+'.png', dataURL:url, folder:'AI' }); if(window.__ppRefreshHub) window.__ppRefreshHub(); toast('AI result → Art Hub'); }
        }
        if(d.type==='UNDO_STATUS'){
          setUndoAvail(!!d.canUndo);
          setRedoAvail(!!d.canRedo);
        }

    };
    window.addEventListener('message',h); return ()=>window.removeEventListener('message',h);
  },[toast]);

  const sendCurrentCanvas=(target)=>{ if(tab.kind!=='iframe'){ toast('Open an editor/forge tab to send its canvas'); return; } window.__pendingSend=target; if(iframeRef.current&&iframeRef.current.contentWindow){ iframeRef.current.contentWindow.postMessage({type:'EXPORT_CANVAS'},'*'); } };

    const handleAIGenerated = (b64) => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ type: "AI_RESULT", image: b64 }, "*");
    }
  };

  return (
    <React.Fragment>
      <div className="rail">
        <div className="logo">P</div><div className="ver">v3</div>
        {TABS.map(t=>(
          <div key={t.id} className={"tab"+(active===t.id?' active':'')} onClick={()=>setActive(t.id)} title={t.label}><div className="ic">{t.icon}</div><div className="lb">{t.label}</div></div>
        ))}
      </div>
      <div className="main">
        <div className="topbar">
          <h1 className="glow">PIXEL PALACE</h1><span className="sub">UNIFIED STUDIO</span>
          <div style={{flex:1}}></div>
          {tab.kind==='iframe' && (
            <div className="sendmenu">
              <button className="neon-btn mg" onClick={(e)=>{const p=e.currentTarget.parentElement.querySelector('.pop');if(p)p.style.display=p.style.display==='block'?'none':'block';}}>Send ▾</button>
              <div className="pop" style={{display:'none'}}>
                <button onClick={()=>sendCurrentCanvas('tilemap')}>→ Tilemap (source)</button>
                <button onClick={()=>sendCurrentCanvas('collision')}>→ Collision (bg)</button>
                <button onClick={()=>sendCurrentCanvas('collisionBg')}>→ Collision background</button>
                <button onClick={()=>sendCurrentCanvas('markup')}>→ Markup (bg)</button>
                <button onClick={()=>sendCurrentCanvas('markers')}>→ Markers (bg)</button>
                <button onClick={()=>sendCurrentCanvas('assets')}>→ Assets gallery</button>
              </div>
            </div>
          )}
          <button className="neon-btn cy" onClick={()=>saveProject()}>Save</button>
          <button className="neon-btn" onClick={()=>loadProject()}>Load</button>
          {tab.kind==='iframe' && <>
            <button className="neon-btn" disabled={!undoAvail} onClick={()=>{ if(iframeRef.current&&iframeRef.current.contentWindow) iframeRef.current.contentWindow.postMessage({type:'UNDO'},'*'); }} title="Undo (Ctrl+Z)">↩ Undo</button>
            <button className="neon-btn" disabled={!redoAvail} onClick={()=>{ if(iframeRef.current&&iframeRef.current.contentWindow) iframeRef.current.contentWindow.postMessage({type:'REDO'},'*'); }} title="Redo (Ctrl+Y)">↪ Redo</button>
          </>}
          <input style={{background:'#1a1a1a',border:'1px solid #333',color:'#eee',borderRadius:8,padding:'4px 8px',fontSize:12,width:130}} value={projName} onChange={(e)=>setProjName(e.target.value)} placeholder="Project name" title="Project name" />
          <span className="chip">{tab.label}</span>
        </div>
        <div className="content">
          {TABS.map(t => t.kind === 'iframe' && (
             <iframe
               key={t.id}
               ref={t.id === active ? iframeRef : null}
               className="tool-iframe"
               src={t.src}
               title={t.label}
               style={{ 
                 position: active === t.id ? 'relative' : 'absolute', 
                 visibility: active === t.id ? 'visible' : 'hidden', 
                 left: active === t.id ? '0' : '-9999px',
                 width: '100%', height: '100%', border: 'none' 
               }}
                onLoad={() => { broadcastDoc(); if(pendingEditorStateRef.current){ applyEditorState(pendingEditorStateRef.current); pendingEditorStateRef.current=null; } }}
             />
          ))}
          <div key={'tilemap_'+contentKey} style={{ display: active === 'tilemap' ? 'block' : 'none', width: '100%', height: '100%' }}><TileMakerPanel toast={toast}/></div>
          <div key={'hub_'+contentKey} style={{ display: active === 'hub' ? 'block' : 'none', width: '100%', height: '100%' }}><HubPanel toast={toast} setActive={setActive} projects={projects} fmtTime={fmtTime} onOpenProject={openProject} onDeleteProject={deleteProject} onSaveProject={()=>saveProject()} projName={projName} setProjName={setProjName}/></div>
<div key={'collision_'+contentKey} style={{ display: active === 'collision' ? 'block' : 'none', width: '100%', height: '100%' }}><CollisionPanel toast={toast}/></div>
<div key={'markup_'+contentKey} style={{ display: active === 'markup' ? 'block' : 'none', width: '100%', height: '100%' }}><MarkupPanel toast={toast}/></div>
<div key={'markers_'+contentKey} style={{ display: active === 'markers' ? 'block' : 'none', width: '100%', height: '100%' }}><MarkersPanel toast={toast}/></div>
          <div key={'build_'+contentKey} style={{ display: active === 'build' ? 'block' : 'none', width: '100%', height: '100%' }}><BuildPanel toast={toast}/></div>
<div key={'graph_'+contentKey} style={{ display: active === 'graph' ? 'block' : 'none', width: '100%', height: '100%' }}><NodeGraphPanel toast={toast}/></div>
          <div key={'game_'+contentKey} style={{ display: active === 'game' ? 'block' : 'none', width: '100%', height: '100%' }}><GamePanel toast={toast}/></div>
          <div key={'options_'+contentKey} style={{ display: active === 'options' ? 'block' : 'none', width: '100%', height: '100%' }}><OptionsPanel toast={toast} doc={doc} onDoc={(patch)=>setDoc(prev=>({...prev,...patch}))}/></div>
          <div key={'pipeline_'+contentKey} style={{ display: active === 'pipeline' ? 'block' : 'none', width: '100%', height: '100%' }}><PipelinePanel setActive={setActive}/></div>
          <div key={'info_'+contentKey} style={{ display: active === 'info' ? 'block' : 'none', width: '100%', height: '100%' }}><InfoPanel/></div>
        </div>
      </div>
      {toastMsg && <div className="toast">{toastMsg}</div>}
      </React.Fragment>
  );
}


export default App;
