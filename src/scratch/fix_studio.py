import os
import re

path = r"D:\PixelPalaceTauri\src\components\Studio.jsx"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# Replace the specific header and wrapper in Studio.jsx
header_pattern = r'<div className="max-w-7xl mx-auto">\s*<header className="text-center mb-2 md:mb-4">\s*<h1 className="text-2xl md:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-green-400 via-emerald-500 to-teal-400">\s*Pixel Forge Studio\s*</h1>\s*<p className="text-neutral-500 text-xs mt-0">pixel art • animation • sprite pipeline</p>\s*</header>'
new_wrapper = r'<div className="h-full flex flex-col max-w-7xl mx-auto w-full p-2 md:p-4 overflow-hidden">'

content = re.sub(header_pattern, new_wrapper, content)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)
