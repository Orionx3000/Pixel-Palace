import re
import os

def fix_editor():
    path = r"D:\PixelPalaceTauri\src\components\Editor.jsx"
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    # Find the start of the return statement
    start_idx = content.find('  return (\n    <div className="h-full flex flex-col w-full"')
    if start_idx == -1:
        print("Editor start not found")
        return

    # Find the end of the topbar. It ends right before {/* ─── MAIN AREA ─── */}
    end_idx = content.find('      {/* ─── MAIN AREA ─── */}', start_idx)
    if end_idx == -1:
        print("Editor end not found")
        return

    new_header = r'''    <div className="h-full flex flex-col w-full" style={{background:'var(--bg)'}}>
        {/* ROW 1: MASTER TOOLBAR (Unified) */}
        <div className="topbar flex items-center shrink-0 w-full overflow-hidden" style={{height:'54px', padding:'0 18px', background:'linear-gradient(90deg,rgba(8,12,22,.92),rgba(6,9,16,.6))', borderBottom:'1px solid var(--line)', gap:'12px'}}>
          <h1 className="glow text-emerald-400 font-bold text-[15px] tracking-[2px] m-0 shrink-0">PIXEL PALACE</h1>
          <div className="chip shrink-0">Editor</div>
          
          <div className="flex-1"></div>

          <div className="flex items-center gap-2 bg-neutral-900 rounded-lg px-3 py-1 border border-neutral-700">
            <span className="text-[10px] text-neutral-400">Size:</span>
            <input type="number" min={1} max={2048} value={szW} onChange={e=>setSzW(Math.max(1,Math.min(2048,+e.target.value||64)))} className="w-14 text-xs bg-neutral-800 rounded px-1 py-0.5 text-center text-white" title="Width"/>
            <span className="text-[10px] text-neutral-500">×</span>
            <input type="number" min={1} max={2048} value={szH} onChange={e=>setSzH(Math.max(1,Math.min(2048,+e.target.value||64)))} className="w-14 text-xs bg-neutral-800 rounded px-1 py-0.5 text-center text-white" title="Height"/>
            <button onClick={()=>applySize(szW,szH)} className="tool-btn text-[10px] !py-0.5" title="Apply Size">Apply</button>
          </div>

          <div className="flex items-center gap-2 bg-neutral-900 rounded-lg px-2 py-1 border border-neutral-700">
            <button onClick={()=>setZoom(Math.max(25,zoom-25))} className="tool-btn text-xs !px-2">−</button>
            <span className="text-[11px] font-mono text-neutral-300 w-12 text-center">{zoom}%</span>
            <button onClick={()=>setZoom(Math.min(2000,zoom+25))} className="tool-btn text-xs !px-2">+</button>
          </div>

          <div className="flex gap-1 border-l border-neutral-700 pl-3 ml-1">
             <button onClick={()=>setShowProject(true)} className="neon-btn cy !py-1 !px-3 text-[11px]">💾 Save</button>
             <button onClick={()=>{
                const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');
                [...layers].reverse().forEach(l=>{if(l.visible){ctx.globalAlpha=l.opacity;ctx.drawImage(l.frames[l.currentFrame].canvas,0,0);}});
                useStore.getState().addAsset({ name: 'Editor_Artwork', dataURL: c.toDataURL() });
             }} className="neon-btn mg !py-1 !px-3 text-[11px]">🎨 Send Hub</button>
          </div>
        </div>

        {/* ROW 2: LOCAL TOOLS */}
        <div className="flex items-center shrink-0 w-full overflow-x-auto scrollbar-thin bg-neutral-900 border-b border-neutral-800 px-3 py-1.5" style={{gap:'8px'}}>
          
          <div className="flex items-center bg-neutral-800 rounded-lg p-0.5 border border-neutral-700 shrink-0">
            <button onClick={()=>setMode('pixel')} className={`tool-btn text-[10px] ${mode==='pixel'?'active':''}`} title="Pixel Mode">PX</button>
            <button onClick={()=>setMode('tile')} className={`tool-btn text-[10px] ${mode==='tile'?'active':''}`} title="Tile Mode">⊞</button>
          </div>
          
          <div className="flex items-center bg-neutral-800 rounded-lg p-0.5 border border-neutral-700 shrink-0">
            <button onClick={()=>setTool('pencil')} className={`tool-btn ${tool==='pencil'?'active':''}`} title="Pencil">✎</button>
            <button onClick={()=>setTool('eraser')} className={`tool-btn ${tool==='eraser'?'active':''}`} title="Eraser">⌫</button>
            <button onClick={()=>setTool('eyedropper')} className={`tool-btn ${tool==='eyedropper'?'active':''}`} title="Eyedropper">💉</button>
            <button onClick={()=>setTool('fill')} className={`tool-btn ${tool==='fill'?'active':''}`} title="Fill">▣</button>
            <button onClick={()=>setTool('erasefill')} className={`tool-btn ${tool==='erasefill'?'active':''}`} title="Erase Fill">⊘</button>
          </div>

          <div className="flex items-center bg-neutral-800 rounded-lg p-0.5 border border-neutral-700 shrink-0">
            <button onClick={()=>setTool('line')} className={`tool-btn ${tool==='line'?'active':''}`} title="Line">╱</button>
            <button onClick={()=>setTool('rect')} className={`tool-btn ${tool==='rect'?'active':''}`} title="Rect">▮</button>
            <button onClick={()=>setTool('rect_outline')} className={`tool-btn ${tool==='rect_outline'?'active':''}`} title="Rect Out">▭</button>
            <button onClick={()=>setTool('circle')} className={`tool-btn ${tool==='circle'?'active':''}`} title="Circle">●</button>
            <button onClick={()=>setTool('circle_outline')} className={`tool-btn ${tool==='circle_outline'?'active':''}`} title="Circle Out">○</button>
          </div>

          <div className="flex items-center bg-neutral-800 rounded-lg p-0.5 border border-neutral-700 shrink-0">
            <button onClick={()=>setTool('greeble')} className={`tool-btn ${tool==='greeble'?'active':''}`} title="Greeble">🌿</button>
            <button onClick={()=>setTool('natural')} className={`tool-btn ${tool==='natural'?'active':''}`} title="Natural">☁</button>
            <button onClick={()=>setTool('highlight')} className={`tool-btn ${tool==='highlight'?'active':''}`} title="Highlight">🔆</button>
            <button onClick={()=>setTool('shade')} className={`tool-btn ${tool==='shade'?'active':''}`} title="Shade">🌘</button>
            <button onClick={()=>setTool('gradient')} className={`tool-btn ${tool==='gradient'?'active':''}`} title="Gradient">🌈</button>
          </div>

          <div className="flex items-center gap-1 shrink-0 px-2 border-l border-neutral-700">
             <span className="text-[10px] text-neutral-400">Brush</span>
             <select value={brushSize} onChange={e=>setBrushSize(+e.target.value)} className="bg-neutral-800 border border-neutral-700 rounded px-1.5 py-0.5 text-xs text-white">
              {[1,2,3,5,7,9,13,17].map(s=><option key={s} value={s}>{s}px</option>)}
             </select>
             <input type="color" value={color} onChange={e=>setColor(e.target.value)} className="w-6 h-6 p-0 border-0 rounded cursor-pointer"/>
             <input type="color" value={gradEnd} onChange={e=>setGradEnd(e.target.value)} title="Grad End" className="w-6 h-6 p-0 border-0 rounded cursor-pointer"/>
          </div>

          <div className="flex flex-col gap-1 shrink-0 px-2 border-l border-neutral-700 min-w-[120px]">
             <div className="flex items-center gap-1 w-full">
                 <span className="text-[9px] text-neutral-400 w-8">Opac.</span>
                 <input type="range" min="1" max="100" value={brushOpacity} onChange={e=>setBrushOpacity(+e.target.value)} className="flex-1 accent-green-500" />
             </div>
             <div className="flex items-center gap-1 w-full">
                 <span className="text-[9px] text-neutral-400 w-8">Amnt.</span>
                 <input type="range" min="1" max="100" value={toolAmount} onChange={e=>setToolAmount(+e.target.value)} className="flex-1 accent-green-500" />
             </div>
          </div>

          <div className="flex items-center gap-1 shrink-0 px-2 border-l border-neutral-700">
             <label className="tool-btn text-[10px] cursor-pointer bg-neutral-800" title="Load Reference Underlay">
               🖼️ Underlay
               <input type="file" accept="image/*" className="hidden" onChange={e=>loadRefImg(e.target.files[0])} />
             </label>
             {refImg && (
               <div className="flex items-center gap-1 bg-neutral-800 rounded px-1 py-0.5">
                 <input type="range" min="0" max="1" step="0.05" value={refOpacity} onChange={e=>setRefOpacity(parseFloat(e.target.value))} className="w-12 accent-indigo-500" title="Opacity" />
                 <button className="text-[10px] text-red-400 hover:text-red-300 px-1" onClick={()=>setRefImg(null)}>✖</button>
               </div>
             )}
          </div>
          
          <div className="flex items-center gap-1 shrink-0 ml-auto pl-2 border-l border-neutral-700">
            <button onClick={()=>setShowImport(!showImport)} className="tool-btn text-[10px] bg-neutral-800" title="Import Image">📥 Import</button>
            <button onClick={()=>setShowExtract(true)} className="tool-btn text-[10px] bg-neutral-800" title="Sprite Extractor">✂ Extract</button>
            <button onClick={()=>setShowEffects(true)} className="tool-btn text-[10px] bg-neutral-800" title="Effects">✦ FX</button>
            <button onClick={()=>setShowTiles(!showTiles)} className={`tool-btn text-[10px] bg-neutral-800 ${showTiles?'active':''}`} title="Tileset">⊞ Tiles</button>
          </div>
        </div>
'''

    content = content[:start_idx] + new_header + content[end_idx:]
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print("Fixed Editor")

def fix_studio():
    path = r"D:\PixelPalaceTauri\src\components\Studio.jsx"
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    start_idx = content.find('    return (\n        <div className="h-full flex flex-col w-full"')
    if start_idx == -1:
        print("Studio start not found")
        return

    end_idx = content.find('            {/* MAIN GRID */}', start_idx)
    if end_idx == -1:
        print("Studio end not found")
        return

    new_header = r'''    return (
        <div className="h-full flex flex-col w-full" style={{background:'var(--bg)'}}>
              {/* ROW 1: MASTER TOOLBAR (Unified) */}
              <div className="topbar flex items-center shrink-0 w-full overflow-hidden" style={{height:'54px', padding:'0 18px', background:'linear-gradient(90deg,rgba(8,12,22,.92),rgba(6,9,16,.6))', borderBottom:'1px solid var(--line)', gap:'12px'}}>
                <h1 className="glow text-emerald-400 font-bold text-[15px] tracking-[2px] m-0 shrink-0">PIXEL PALACE</h1>
                <div className="chip shrink-0">Studio</div>
                
                <div className="flex-1"></div>
                
                <div className="flex items-center gap-2 bg-neutral-900 rounded-lg px-3 py-1 border border-neutral-700">
                    <span className="text-[10px] text-neutral-400">Size:</span>
                    <input type="number" min={1} max={2048} value={res} onChange={e=>setRes(Math.max(1,Math.min(2048,+e.target.value||64)))} className="w-14 text-xs bg-neutral-800 rounded px-1 py-0.5 text-center text-white" title="Canvas Resolution" />
                </div>
                
                <div className="flex items-center gap-2 bg-neutral-900 rounded-lg px-2 py-1 border border-neutral-700">
                    <button onClick={()=>setZoom(Math.max(25,zoom-25))} className="tool-btn text-xs !px-2">−</button>
                    <span className="text-[11px] font-mono text-neutral-300 w-12 text-center">{zoom}%</span>
                    <button onClick={()=>setZoom(Math.min(2000,zoom+25))} className="tool-btn text-xs !px-2">+</button>
                </div>

                <div className="flex gap-1 border-l border-neutral-700 pl-3 ml-1">
                    <button onClick={undo} disabled={!undoStack.length} className="neon-btn cy !py-1 !px-2 text-[11px]" style={undoStack.length?{}:{opacity:.3}}>↩ Undo</button>
                    <button onClick={redo} disabled={!redoStack.length} className="neon-btn mg !py-1 !px-2 text-[11px]" style={redoStack.length?{}:{opacity:.3}}>↪ Redo</button>
                    <button onClick={clearCanvas} className="neon-btn am !py-1 !px-2 text-[11px]">🗑️ Clear</button>
                </div>
              </div>

              {/* ROW 2: LOCAL TOOLS */}
              <div className="flex items-center shrink-0 w-full overflow-x-auto scrollbar-thin bg-neutral-900 border-b border-neutral-800 px-3 py-1.5" style={{gap:'8px'}}>
                <div className="flex items-center bg-neutral-800 rounded-lg p-0.5 border border-neutral-700 shrink-0">
                    {[['pencil','✎'],['eraser','⌫'],['eyedropper','💉'],['fill','▣']].map(([t,icon]) => (
                        <button key={t} onClick={()=>setTool(t)} className={`tool-btn ${tool===t?'active':''}`}>{icon} {t==='eyedropper'?'pick':t}</button>
                    ))}
                </div>
                
                <div className="flex items-center bg-neutral-800 rounded-lg p-0.5 border border-neutral-700 shrink-0">
                    {[['line','╱'],['rect','▮'],['rect_outline','▭'],['circle','●'],['circle_outline','○']].map(([t,icon]) => (
                        <button key={t} onClick={()=>setTool(t)} className={`tool-btn ${tool===t?'active':''}`}>{icon} {t.replace('_outline',' out')}</button>
                    ))}
                </div>
                
                <div className="flex items-center gap-1 shrink-0 px-2 border-l border-neutral-700">
                    <span className="text-[10px] text-neutral-400">Brush</span>
                    <select value={brushSize} onChange={e=>setBrushSize(Number(e.target.value))} className="bg-neutral-800 border border-neutral-700 rounded px-1.5 py-0.5 text-xs text-white">
                        {[1,2,3,5,7,9].map(s=><option key={s} value={s}>{s}px</option>)}
                    </select>
                </div>

                <div className="flex items-center gap-1 shrink-0 ml-auto pl-2 border-l border-neutral-700">
                    <label className="tool-btn text-[10px] cursor-pointer bg-neutral-800" title="Load Reference Underlay">
                        🖼️ Underlay
                        <input type="file" accept="image/*" className="hidden" onChange={handleUpload} />
                    </label>
                    <button onClick={()=>setShowSave(true)} className="neon-btn vi !py-1 !px-3 text-[11px]">🎬 Export</button>
                </div>
              </div>

'''

    content = content[:start_idx] + new_header + content[end_idx:]
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print("Fixed Studio")

if __name__ == "__main__":
    fix_editor()
    fix_studio()
