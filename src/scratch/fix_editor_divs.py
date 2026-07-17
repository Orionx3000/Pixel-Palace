import os

path = r"D:\PixelPalaceTauri\src\components\Editor.jsx"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# The Editor has this at the end:
#         </div>
#       )}
# 
#       {/* ─── TOAST ─── */}
#       {toast&&<div className="toast">{toast}</div>}
#     </div>
#   );
# }

# The missing </div> is for the `minHeight:'100%'` flex container we wrapped around Canvas and Timeline.
# The original container ended with a </div> that we need to duplicate.
# Wait, let's find the end of the flex-1 overflow-auto block.
# Actually, the easiest way to fix it is to just append `</div>` before the closing of the outer flex block.
# But wait, we have `</div>` at the end of MAIN AREA:
# 
#               <div className="border-t border-neutral-700 pt-2 mt-2">
#                 <span className="text-[10px] text-neutral-500 block mb-1">Tile Size</span>
#                 <select value={tileSize} onChange={e=>setTileSize(+e.target.value)} className="godown text-xs">
#                   {[8,16,24,32,48,64].map(s=><option key={s} value={s}>{s}px</option>)}
#                 </select>
#               </div>
#             </div>
#           </div>
#         </div>
#       )}
#
#       {/* ─── TOAST ─── */}

# In Editor, the new structure:
#         {/* Canvas */}
#         <div className="flex-1 overflow-auto" style={{background:'#0a0a0a'}}>
#           <div style={{minHeight:'100%', display:'flex', alignItems:'center', justifyContent:'center', padding:'2rem', flexDirection:'column'}}>
#             <div style={{position:'relative', width:`${Math.max(w, h)*10*zoom/100}px`, flexShrink:0, display:'flex', boxShadow:'0 0 40px rgba(0,0,0,0.8)', borderRadius:8}}>
#               {refImg && ... }
#               <canvas ... />
#             </div>
#             {/* Timeline */}
#             <div className="w-full max-w-3xl mt-2 flex-shrink-0">
#               ...
#             </div>
#           </div>   <--- THIS IS MISSING!!!

# I need to insert `</div>` after the Timeline's `</div>` and before the next sibling (the Layers sidebar).
# The layers sidebar starts with:
#         {/* Layers / Props */}
#         <div className="w-64 bg-[#05070d] border-l border-neutral-700 flex flex-col overflow-hidden shrink-0">

# Let's insert `</div>` right before `        {/* Layers / Props */}`
target = "        {/* Layers / Props */}"
if target in content:
    content = content.replace(target, "          </div>\n" + target)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print("Fixed missing div in Editor.jsx")
else:
    print("Could not find Layers / Props")
