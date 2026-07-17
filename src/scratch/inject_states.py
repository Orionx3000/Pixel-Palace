import re

file_path = r"D:\PixelPalaceTauri\src\components\Studio.jsx"
source_html = r"D:\App Creation\goStickYeah\addons\photo_level_plugin\tools\pixel_forge_studio.html"

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Grab PALETTES
with open(source_html, 'r', encoding='utf-8') as f:
    html_content = f.read()

palettes_match = re.search(r'(const PALETTES = \{.*?\n\};).*?(const CATEGORIES = Object\.keys\(PALETTES\);).*?(const FLAT_PALETTES = \{\};.*?FLAT_PALETTES\[name\] = cols;)', html_content, re.DOTALL)
if palettes_match:
    pal_code = palettes_match.group(1) + "\n\n" + palettes_match.group(2) + "\n\n" + palettes_match.group(3) + "\n\n"
    if "const PALETTES =" not in content:
        # Inject right before export default
        content = re.sub(r'export default function Studio', pal_code + "export default function Studio", content)

# 2. Grab State Variables
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
    # Inject right after export default function Studio(){
    content = re.sub(r'export default function Studio\(\)\{', r'export default function Studio(){\n' + states, content)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("States injected successfully!")
