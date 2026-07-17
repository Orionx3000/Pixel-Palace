import os

path = r"D:\PixelPalaceTauri\src\index.css"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

css_to_add = """
/* Tool Buttons (Pixel Forge Style) */
.tool-btn { padding:6px 12px; border-radius:6px; font-size:13px; font-weight:600; transition:all .1s; background:#333; color:#aaa; border:none; cursor:pointer; }
.tool-btn:hover { background:#444; color:#fff; }
.tool-btn.active { background:#22c55e; color:#fff; }
@media (max-width:768px) { .toolbar-wrap { gap:4px; } .tool-btn { padding:4px 8px; font-size:11px; } }

.palette-card:hover { border-color:#22c55e; background:#222; }
.palette-card.active { border-color:#22c55e; background:#1a3a1a; }
"""

if ".tool-btn {" not in content:
    with open(path, "a", encoding="utf-8") as f:
        f.write(css_to_add)
    print("Added .tool-btn styles to index.css")
else:
    print(".tool-btn already exists")
