import os
import re

TOOLS_DIR = r"D:\PixelPalaceTauri\public\tools"
DEST_FILE = r"D:\PixelPalaceTauri\src\components\Studio.jsx"

def convert():
    path = os.path.join(TOOLS_DIR, "pixel_palace_editor.html")
    with open(path, "r", encoding="utf-8") as f:
        html = f.read()

    # Extract the React script block
    match = re.search(r'<script type="text/babel">(.*?)</script>', html, re.DOTALL)
    if not match:
        print("Failed to find script block")
        return
    script = match.group(1)

    # 1. Remove ReactDOM.render
    script = re.sub(r"ReactDOM\.render\(.*?\);", "", script)
    
    # 2. Remove const {useState...} = React;
    script = re.sub(r"const\s+\{.*?\}.*?React;", "", script)
    
    # 3. Change function App() to export default function Studio()
    script = script.replace("function App() {", "export default function Studio() {")
    
    # 4. In pixel_palace_editor.html, there might be references to window.parent.postMessage or similar.
    # The native Studio component should use the useStore directly!
    # Wait, the user's pixel_palace_editor.html was standalone, so it probably doesn't use `useStore()`.
    
    # Let's add the imports at the top
    imports = "import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';\n"
    imports += "import { useStore } from '../store';\n\n"
    
    final_code = imports + script

    # 5. Let's fix the postMessage to Art Hub to use the store instead.
    # `window.parent.postMessage({ type: 'SEND_TO_HUB', dataURL: cvs.toDataURL(), name: 'Editor_Artwork' }, '*');`
    final_code = final_code.replace(
        "window.parent.postMessage({ type: 'SEND_TO_HUB', dataURL: cvs.toDataURL(), name: 'Editor_Artwork' }, '*');",
        "useStore.getState().addAsset({ name: 'Studio_Artwork', dataURL: cvs.toDataURL() });"
    )
    
    with open(DEST_FILE, "w", encoding="utf-8") as f:
        f.write(final_code)
    
    print("Successfully converted pixel_palace_editor.html to Studio.jsx")

convert()
