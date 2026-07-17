import os
import re

source_html_path = r"D:\PixelPalaceExe\PixelPalace\index.html"
dest_jsx_path = r"D:\PixelPalaceTauri\src\App.jsx"
source_tools_dir = r"D:\PixelPalaceExe\PixelPalace\tools"
dest_tools_dir = r"D:\PixelPalaceTauri\public\tools"

def migrate():
    # 1. Read original HTML
    with open(source_html_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # 2. Extract everything inside <script type="text/babel"> ... </script>
    match = re.search(r'<script type="text/babel">(.*?)</script>', content, re.DOTALL)
    if not match:
        print("Failed to find babel script block")
        return
    
    js_code = match.group(1).strip()
    
    # 3. Clean up the js_code for Vite
    # Remove the `const {useState...} = React;` line
    js_code = re.sub(r'const\s*\{.*?\}\s*=\s*React;', '', js_code)
    
    # Remove ReactDOM.render at the bottom
    js_code = re.sub(r'ReactDOM\.createRoot.*?render\(<App\s*/>\);', '', js_code)
    
    # Add proper imports
    header = """import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import './index.css';

"""
    footer = "\n\nexport default App;\n"
    
    final_jsx = header + js_code + footer

    # 4. Write to App.jsx
    with open(dest_jsx_path, 'w', encoding='utf-8') as f:
        f.write(final_jsx)
        
    print(f"Successfully migrated App.jsx ({len(final_jsx)} bytes)")

    # 5. Copy the tools folder over to public/tools
    import shutil
    if os.path.exists(dest_tools_dir):
        shutil.rmtree(dest_tools_dir)
    shutil.copytree(source_tools_dir, dest_tools_dir)
    print("Successfully copied tools directory to public/tools")

if __name__ == "__main__":
    migrate()
