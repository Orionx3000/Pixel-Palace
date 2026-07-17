import re

source_path = r"D:\App Creation\goStickYeah\addons\photo_level_plugin\tools\pixel_forge_studio.html"
target_path = r"D:\PixelPalaceTauri\src\components\Studio.jsx"

with open(source_path, 'r', encoding='utf-8') as f:
    html = f.read()

# Extract script content
script_match = re.search(r'<script type="text/babel">(.*?)</script>', html, re.DOTALL)
if not script_match:
    print("Could not find babel script")
    exit(1)

script = script_match.group(1)

# Remove ReactDOM.render
script = re.sub(r'const\s+root\s*=\s*ReactDOM\.createRoot.*?root\.render.*?;\s*', '', script, flags=re.DOTALL)
script = re.sub(r'ReactDOM\.render\(.*?\);', '', script, flags=re.DOTALL)

# Remove React hooks destructuring as they are imported from 'react' in Vite
script = re.sub(r'const\s+\{\s*useState,\s*useRef,\s*useEffect,\s*useCallback,\s*useMemo\s*\}\s*=\s*React;', '', script)

# Add imports
imports = """import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
"""

# Add export default to App
script = script.replace('function App()', 'export default function Studio()')

final_code = imports + "\n" + script

with open(target_path, 'w', encoding='utf-8') as f:
    f.write(final_code)

print("Proper Studio extracted and converted successfully.")
