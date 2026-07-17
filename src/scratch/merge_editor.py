import re
import os

source_path = r"D:\PixelPalaceExe\PixelPalace\tools\pixel_palace_editor.html"
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

# Remove React hooks destructuring
script = re.sub(r'const\s+\{\s*useState,\s*useRef,\s*useEffect,\s*useCallback,\s*useMemo\s*\}\s*=\s*React;', '', script)

# Add imports
imports = "import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';\n"
script = imports + script

# Rename App to Studio and export
script = script.replace('function App()', 'export default function Studio()')

# Add "Pixel Forge Studio" header to the top of the app
header = """
        <header className="text-center mb-2 md:mb-4 w-full">
            <h1 className="text-2xl md:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-green-400 via-emerald-500 to-teal-400">
                Pixel Forge Studio
            </h1>
            <p className="text-neutral-500 text-xs mt-0">pixel art • animation • layers • effects</p>
        </header>
        <div className="flex flex-1 overflow-hidden">
"""
script = script.replace('<div className="flex flex-1 overflow-hidden">', header)

# Change the solid #0a0a0a background behind the canvas to a dark checkerboard
checkered_bg = """style={{backgroundColor: '#1a1a1a', backgroundImage: 'linear-gradient(45deg,#111 25%,transparent 25%,transparent 75%,#111 75%,#111),linear-gradient(45deg,#111 25%,transparent 25%,transparent 75%,#111 75%,#111)', backgroundSize:'20px 20px', backgroundPosition:'0 0,10px 10px'}}"""
script = script.replace("style={{background:'#0a0a0a'}}", checkered_bg)

# Make sure canvas doesn't have a solid background itself
script = script.replace("style={{background:'#111',", "style={{background:'transparent',")
# And the displayRef canvas
script = script.replace("style={{borderRadius:8,border:'1px solid #333',maxWidth:'100%',maxHeight:'100%',objectFit:'contain',cursor:mode==='tile'?'crosshair':'crosshair'}}", "style={{background:'transparent', borderRadius:8,border:'1px solid #333',maxWidth:'100%',maxHeight:'100%',objectFit:'contain',cursor:mode==='tile'?'crosshair':'crosshair'}}")


with open(target_path, 'w', encoding='utf-8') as f:
    f.write(script)

print("Merged Editor into Studio layout.")
