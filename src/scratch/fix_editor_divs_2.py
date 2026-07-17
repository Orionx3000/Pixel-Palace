import os

path = r"D:\PixelPalaceTauri\src\components\Editor.jsx"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

target = "{/* ─── RIGHT PANEL: LAYERS + PALETTE ─── */}"
if target in content:
    content = content.replace(target, "</div>\n          " + target)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print("Fixed missing div in Editor.jsx")
else:
    print("Could not find", target)
