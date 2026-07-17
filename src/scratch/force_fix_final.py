import os
import re

file_path = r"D:\PixelPalaceTauri\src\components\Studio.jsx"

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Splitting precisely at {/* Palettes */}
parts = content.split("{/* Palettes */}")
if len(parts) != 2:
    print("Could not find {/* Palettes */} uniquely")
    exit(1)

left_side = parts[0]

palette_ui = """{/* Palettes */}
          <div className="flex-1 p-2 overflow-y-auto scrollbar-thin">
            <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-2 mb-2">
                <button onClick={()=>setShowPalettes(!showPalettes)}
                    className="flex items-center gap-2 w-full text-left font-bold text-xs mb-2 text-white">
                    <span>??</span> Palettes ({palette.length} colors) {showPalettes?'?':'?'}
                </button>
                {showPalettes && (
                    <>
                        <input type="text" value={paletteSearch} onChange={e=>setPaletteSearch(e.target.value)}
                            placeholder="Search palettes..."
                            className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-1.5 text-[10px] text-white mb-2 outline-none focus:border-green-500" />
                        <div className="flex flex-wrap gap-1 mb-2">
                            {CATEGORIES.map(cat => (
                                <button key={cat} onClick={()=>setActivePaletteCat(cat)}
                                    className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${activePaletteCat===cat?'bg-green-500 text-white':'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'}`}>
                                    {cat}
                                </button>
                            ))}
                        </div>
                        <div className="max-h-48 overflow-y-auto space-y-1 scrollbar-thin pr-1">
                            {Object.entries(filteredPalettes).map(([cat, pals]) => (
                                <div key={cat} style={{display: activePaletteCat!==cat && paletteSearch ? 'block' : activePaletteCat!==cat ? 'none' : 'block'}}>
                                    <div className="text-[9px] text-neutral-500 font-bold uppercase mb-1">{cat}</div>
                                    {Object.entries(pals).map(([name, colors]) => (
                                        <div key={name} onClick={()=>selectPalette(name)}
                                            className={`rounded p-1 mb-1 cursor-pointer hover:bg-neutral-700 ${palette===colors?'bg-neutral-700 border border-green-500':''}`}>
                                            <div className="text-[10px] text-white truncate mb-1">{name}</div>
                                            <div className="flex flex-wrap gap-0.5">
                                                {colors.map((c,i)=>(
                                                    <div key={i} className="w-3 h-3 rounded-sm" style={{background:c}}/>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>

            <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-2">
                <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-2">Active Palette</div>
                <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto scrollbar-thin">
                    {palette.map((c, i) => (
                        <button key={i} onClick={()=>{setColor(c);setSelectedColor(c);}}
                            className={`w-6 h-6 rounded border ${selectedColor===c?'border-white scale-110':'border-transparent hover:scale-105'}`}
                            style={{backgroundColor: c}}
                            title={c} />
                    ))}
                </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}"""

final_content = left_side + palette_ui

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(final_content)

print("Palettes UI forced successfully!")
