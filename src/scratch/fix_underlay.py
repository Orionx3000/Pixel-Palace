import os

path = r"D:\PixelPalaceTauri\src\components\Studio.jsx"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Add loadRefImg
if "const loadRefImg =" not in content:
    idx = content.find("const handleUpload =")
    if idx != -1:
        load_ref_fn = """    const loadRefImg = (file) => {
        if(!file)return;
        const r=new FileReader();
        r.onload=e=>setRefImg(e.target.result);
        r.readAsDataURL(file);
    };\n\n"""
        content = content[:idx] + load_ref_fn + content[idx:]

# 2. Fix the header Underlay button
old_header_btn = """                <div className="flex items-center gap-1 shrink-0 ml-auto pl-2 border-l border-neutral-700">
                    <label className="tool-btn text-[10px] cursor-pointer bg-neutral-800" title="Load Reference Underlay">
                        🖼️ Underlay
                        <input type="file" accept="image/*" className="hidden" onChange={handleUpload} />
                    </label>
                    <button onClick={()=>setShowSave(true)} className="neon-btn vi !py-1 !px-3 text-[11px]">🎬 Export</button>
                </div>"""

new_header_btn = """                <div className="flex items-center gap-1 shrink-0 ml-auto pl-2 border-l border-neutral-700">
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
                    <button onClick={()=>setShowSave(true)} className="neon-btn vi !py-1 !px-3 text-[11px] ml-1">🎬 Export</button>
                </div>"""

content = content.replace(old_header_btn, new_header_btn)

# 3. Add img to canvas wrapper
# In Studio, the canvas is rendered like this:
old_canvas = """                    {/* CANVAS AREA */}
                    <div className="flex-1 bg-[#0a0a0a] border border-neutral-700 rounded-xl flex items-center justify-center overflow-auto relative">
                        <canvas ref={canvasRef} style={{width:`${480*zoom/100}px`, height:'auto', imageRendering:'pixelated', borderRadius:8, boxShadow:'0 0 40px rgba(0,0,0,0.5)', cursor:'crosshair'}} 
                                onMouseDown={handleDown} onMouseMove={handleMove} onMouseUp={handleUp} onMouseLeave={handleUp}
                                onTouchStart={handleDown} onTouchMove={handleMove} onTouchEnd={handleUp} />
                    </div>"""

new_canvas = """                    {/* CANVAS AREA */}
                    <div className="flex-1 bg-[#0a0a0a] border border-neutral-700 rounded-xl flex items-center justify-center overflow-auto relative">
                        <div style={{position:'relative', width:`${480*zoom/100}px`, display:'flex'}}>
                            {refImg && <img src={refImg} style={{position:'absolute', top:0, left:0, width:'100%', height:'100%', objectFit:'contain', opacity:refOpacity, pointerEvents:'none', zIndex:1}} />}
                            <canvas ref={canvasRef} style={{width:'100%', height:'auto', imageRendering:'pixelated', borderRadius:8, boxShadow:'0 0 40px rgba(0,0,0,0.5)', cursor:'crosshair', position:'relative', zIndex:10}} 
                                onMouseDown={handleDown} onMouseMove={handleMove} onMouseUp={handleUp} onMouseLeave={handleUp}
                                onTouchStart={handleDown} onTouchMove={handleMove} onTouchEnd={handleUp} />
                        </div>
                    </div>"""

content = content.replace(old_canvas, new_canvas)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)
print("Underlay fixed in Studio")
