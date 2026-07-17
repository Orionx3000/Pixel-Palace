import re

source_path = r"D:\App Creation\goStickYeah\addons\photo_level_plugin\tools\pixel_forge_studio.html"
target_path = r"D:\PixelPalaceTauri\src\components\Studio.jsx"

with open(source_path, 'r', encoding='utf-8') as f:
    source_html = f.read()

# 1. Extract the PALETTES constant block
palettes_match = re.search(r'(const PALETTES = \{.*?\n\};).*?(const CATEGORIES = Object\.keys\(PALETTES\);).*?(const FLAT_PALETTES = \{\};.*?FLAT_PALETTES\[name\] = cols;)', source_html, re.DOTALL)
if not palettes_match:
    print("Could not find PALETTES in source")
    exit(1)
    
palettes_data = palettes_match.group(1) + "\n\n" + palettes_match.group(2) + "\n\n" + palettes_match.group(3)

# 2. Extract the JSX for the Palette panel
# The panel is in the right sidebar. In the source, it's inside:
# {/* PALETTE */}
# <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-3">
# ... up to the end of that div.
panel_match = re.search(r'(\{\/\*\s*PALETTE\s*\*\/\}.*?<div className="bg-neutral-800 border border-neutral-700 rounded-xl p-3">.*?)\{\/\*\s*ACTIVE PALETTE SWATCHES\s*\*\/\}', source_html, re.DOTALL)

if not panel_match:
    print("Could not find PALETTE UI in source")
    exit(1)
    
palette_ui = panel_match.group(1)
palette_ui = palette_ui.strip()

# Now we need to also grab the ACTIVE PALETTE SWATCHES UI
active_match = re.search(r'(\{\/\*\s*ACTIVE PALETTE SWATCHES\s*\*\/\}.*?<div className="bg-neutral-800 border border-neutral-700 rounded-xl p-3">.*?(?=</div>\s*</div>\s*</div>\s*</div>))', source_html, re.DOTALL)

if not active_match:
    print("Could not find ACTIVE PALETTE SWATCHES UI in source")
    # We will try a less strict match
    active_match = re.search(r'(\{\/\*\s*ACTIVE PALETTE SWATCHES\s*\*\/\}.*?</div>\s*</div>)', source_html, re.DOTALL)

if active_match:
    palette_ui += "\n\n" + active_match.group(1)


# 3. Read target Studio.jsx
with open(target_path, 'r', encoding='utf-8') as f:
    target_jsx = f.read()

# 4. Inject PALETTES constant outside the component
if "const PALETTES = {" not in target_jsx:
    # Find the top of the file after imports
    target_jsx = target_jsx.replace("export default function Studio() {", palettes_data + "\n\nexport default function Studio() {")

# 5. Inject states inside the component
states = """
  const [showPalettes, setShowPalettes] = useState(false);
  const [paletteSearch, setPaletteSearch] = useState('');
  const [activePaletteCat, setActivePaletteCat] = useState('Value Spectrum');
  const [palette, setPalette] = useState(FLAT_PALETTES['Pico-8'] || []);
  const [selectedColor, setSelectedColor] = useState(palette[0] || '#ffffff');
  
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

if "const [showPalettes" not in target_jsx:
    target_jsx = target_jsx.replace("export default function Studio() {\n", "export default function Studio() {\n" + states)


# 6. Inject the Palette UI into the right panel
# In Studio.jsx, the right panel has:
# {/* ─── RIGHT PANEL (Layers, Palette) ─── */}
# <div className="w-56 border-l border-neutral-800 bg-neutral-900 flex flex-col flex-shrink-0">
# We should put the Palette UI inside the flex-1 overflow-y-auto area where the Layers are, or below them.
# The Layers section ends with `<div className="flex-1 p-2 overflow-y-auto scrollbar-thin">`
# Let's replace the Editor's generic palette picker with this massive new one.

# Editor's generic palette picker:
# {/* ─── CURRENT PALETTE ─── */}
editor_palette = re.search(r'\{\/\* ─── CURRENT PALETTE ─── \*\/\}.*?(?=\{\/\* ─── LAYERS ─── \*\/\})', target_jsx, re.DOTALL)
if editor_palette:
    target_jsx = target_jsx.replace(editor_palette.group(0), palette_ui + "\n\n")
else:
    # Just inject it before LAYERS
    target_jsx = target_jsx.replace("{/* ─── LAYERS ─── */}", palette_ui + "\n\n{/* ─── LAYERS ─── */}")


with open(target_path, 'w', encoding='utf-8') as f:
    f.write(target_jsx)

print("Injected Palette code into Studio.jsx")
