import re

file_path = r"D:\PixelPalaceTauri\src\components\Studio.jsx"
source_html = r"D:\App Creation\goStickYeah\addons\photo_level_plugin\tools\pixel_forge_studio.html"

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Fix checkSidecar
# Match from "const checkSidecar=async()=>{" up to "};"
content = re.sub(
    r'const checkSidecar=async\(\)=>\{.*?\}\s*\};',
    r"const checkSidecar=async()=>{\n    setSidecarStatus('connected');\n    return { status: 'ok' };\n  };",
    content,
    flags=re.DOTALL
)

# 2. Fix generate fetch
content = re.sub(
    r'const res=await fetch\(sidecarUrl\+\'/generate\'.*?const result=await res\.json\(\);\s*if\(result\.error\)throw new Error\(result\.error\);',
    r"const b64Image = await invoke('generate_ai_sprite', { prompt, size, palette: 'pico8', count: 1 });\n        const result = { image: b64Image, width: size, height: size };",
    content,
    flags=re.DOTALL
)

# 3. Fix import invoke
if "import { invoke }" not in content:
    content = content.replace("import React,", "import { invoke } from '@tauri-apps/api/core';\nimport React,")


# 4. Palettes!
with open(source_html, 'r', encoding='utf-8') as f:
    html_content = f.read()

palettes_match = re.search(r'(const PALETTES = \{.*?\n\};).*?(const CATEGORIES = Object\.keys\(PALETTES\);).*?(const FLAT_PALETTES = \{\};.*?FLAT_PALETTES\[name\] = cols;)', html_content, re.DOTALL)
if palettes_match:
    pal_code = palettes_match.group(1) + "\n\n" + palettes_match.group(2) + "\n\n" + palettes_match.group(3) + "\n\n"
    if "const PALETTES = {" not in content:
        content = content.replace("export default function Studio() {", pal_code + "export default function Studio() {")

# Add the states
states = """
  const [showPalettes, setShowPalettes] = useState(false);
  const [paletteSearch, setPaletteSearch] = useState('');
  const [activePaletteCat, setActivePaletteCat] = useState('Value Spectrum');
  const [selectedColor, setSelectedColor] = useState('#ffffff');
  
  const selectPalette = (name) => {
      const colors = FLAT_PALETTES[name];
      if (!colors) return;
      setPalette(colors);
      if (colors.length) setSelectedColor(colors[0]);
  };
  
  const filteredPalettes = useMemo(() => {
      const result = {};
      for (const [cat, pals] of Object.entries(PALETTES)) {
          const filtered = Object.entries(pals).filter(([name]) =>
              !paletteSearch || name.toLowerCase().includes(paletteSearch.toLowerCase())
          );
          if (filtered.length > 0) result[cat] = Object.fromEntries(filtered);
      }
      return result;
  }, [paletteSearch]);
"""
if "const [showPalettes" not in content:
    content = content.replace("export default function Studio() {\n", "export default function Studio() {\n" + states)


# 5. UI for Palettes
palette_ui = """
          {/* Palettes */}
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
"""

content = re.sub(r'\{\/\* Palettes \*\/\}.*?<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*\)\;\s*\}\s*\Z', palette_ui + "\n        </div>\n      </div>\n    </div>\n  );\n}", content, flags=re.DOTALL)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Regex fixes applied!")
