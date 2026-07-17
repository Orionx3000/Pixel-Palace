import os
import re

path = r"D:\PixelPalaceTauri\public\tools\pixel_palace_editor.html"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Remove redundant header
# The header looks like:
# <header className="text-center mb-4">
#    <h1 className="...">PIXEL PALACE ... </h1>
#    <p ...>Asset Pipeline & Refinement</p>
# </header>
content = re.sub(r'<header className="text-center mb-4">.*?</header>', '', content, flags=re.DOTALL)

# 2. Inject "Send to Studio" button next to Redo
# <button onClick={handleRedo} disabled={redoStack.length===0} className="p-2 text-neutral-400 hover:text-white disabled:opacity-30" title="Redo"><Redo size={20}/></button>
# Let's use a regex to find the redo button.
match = re.search(r'<button onClick=\{handleRedo\}.*?</button>', content)
if match:
    orig = match.group(0)
    replacement = orig + r'''
                                    <button onClick={() => {
                                          const cvs = document.querySelector('canvas');
                                          if(cvs) window.parent.postMessage({ type: 'SEND_TO_HUB', dataURL: cvs.toDataURL(), name: 'Editor_Artwork' }, '*');
                                      }} className="ml-2 px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white text-[10px] font-bold rounded" title="Send to Studio">Send to Studio</button>'''
    content = content.replace(orig, replacement)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)
print("Done fixing pixel_palace_editor.html")
