import os
import re

TOOLS_DIR = r"D:\PixelPalaceExe\PixelPalace\tools"
DEST_DIR = r"D:\PixelPalaceTauri\src\components"

TOOLS_TO_CONVERT = {
    "pixel_forge.html": "Editor",
    "pixel_forge_studio.html": "Studio",
    "water_caustics.html": "Water",
    "alpha_mask.html": "Alpha",
    "sprite_extractor.html": "Extract"
}

def remove_redundant_header(js_code):
    # The header usually looks like:
    # <div className="h-12 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between px-4 shrink-0">
    #   ...
    # </div>
    # We can try to use a regex that matches this block, but since JSX is nested, regex might fail.
    # Instead, let's look for "PIXEL PALACE" and try to rip out that specific header block.
    # It starts with `<div className="h-12 bg-neutral-900 border-b border-neutral-800`
    # and ends with `</div>` before `<div className="flex-1 flex overflow-hidden">`
    # Since they all follow a similar pattern, let's just replace it carefully.
    
    pattern = r'<div className="h-12 bg-neutral-[89]00 border-b border-neutral-800 flex items-center justify-between px-4 shrink-0">.*?<div className="flex items-center gap-4">\s*<h1.*?PIXEL PALACE.*?</h1>.*?</div>.*?</div>'
    js_code = re.sub(pattern, '', js_code, flags=re.DOTALL)
    
    return js_code

def convert_tool(html_filename, component_name):
    html_path = os.path.join(TOOLS_DIR, html_filename)
    if not os.path.exists(html_path):
        print(f"File not found: {html_path}")
        return
        
    with open(html_path, "r", encoding="utf-8") as f:
        content = f.read()
        
    match = re.search(r'<script type="text/babel">([\s\S]*?)</script>', content)
    if not match:
        print(f"Could not find babel script in {html_filename}")
        return
        
    js = match.group(1)
    
    # 1. Remove ReactDOM and root render
    js = re.sub(r'const root\s*=\s*ReactDOM\.createRoot.*?root\.render.*?;\s*\n', '', js, flags=re.DOTALL)
    
    # 2. Rename App to Component Name
    js = js.replace("function App()", f"export default function {component_name}()")
    js = js.replace("function App ()", f"export default function {component_name}()")
    
    # 3. Handle imports
    imports = f"import React, {{ useState, useEffect, useRef, useCallback, useMemo }} from 'react';\nimport {{ useStore }} from '../store';\n\n"
    
    # Remove existing destructuring of React
    js = re.sub(r'const\s*\{\s*(.*?)\s*\}\s*=\s*React;', '', js)
    
    # 4. Strip redundant headers
    js = remove_redundant_header(js)
    
    # 5. Interlinking (replace postMessage with Hub sends, and add direct sends)
    # The original files use window.parent.postMessage or just postMessage
    js = re.sub(r'window\.parent\.postMessage\(\s*\{\s*type:\'SEND_TO_HUB\',\s*dataURL:(.*?),.*?\}.*?\);', 
                r'useStore.getState().addAsset({ name: "' + component_name + '_Artwork", dataURL: \1 });', js)
                
    js = re.sub(r'parent\.postMessage\(\s*\{\s*type:\'CANVAS_DATA\',\s*from:\'(.*?)\',\s*data:(.*?)\}.*?\);',
                r'useStore.getState().addAsset({ name: "\1_Data", dataURL: \2 });', js)

    # 6. We also need to inject interlink buttons into the toolbars, but we can do that in a follow-up script once the base components are fully restored.
    
    out_path = os.path.join(DEST_DIR, f"{component_name}.jsx")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(imports + js)
    print(f"Successfully converted {html_filename} to {component_name}.jsx")

for filename, comp_name in TOOLS_TO_CONVERT.items():
    convert_tool(filename, comp_name)
