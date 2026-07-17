import os
import re

TOOLS_DIR = r"D:\PixelPalaceTauri\public\tools"

def fix_pixel_forge():
    path = os.path.join(TOOLS_DIR, "pixel_forge.html")
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Remove redundant header
    # The header starts with <header className="text-center mb-4">
    # and ends with </header>
    content = re.sub(r'<header className="text-center mb-4">.*?</header>', '', content, flags=re.DOTALL)
    
    # 2. Inject "Send to Studio" button next to "Send Hub"
    # Actually, in pixel_forge.html, there is a button that says "Send Hub" or it might not exist.
    # Let's inject it next to the Redo button.
    # The Redo button is: <button onClick={handleRedo}...<Redo size={20}/></button>
    
    send_btn = r'<button onClick={handleRedo} disabled={redoStack.length===0} className="p-2 text-neutral-400 hover:text-white disabled:opacity-30" title="Redo"><Redo size={20}/></button>'
    replacement = send_btn + r'''
                                    <button onClick={() => {
                                          if(canvasRef.current) window.parent.postMessage({ type: 'SEND_TO_HUB', dataURL: canvasRef.current.toDataURL(), name: 'Editor_Artwork' }, '*');
                                      }} className="ml-2 px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded" title="Send to Studio">Send to Studio</button>'''
    
    content = content.replace(send_btn, replacement)
    
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


def fix_pixel_forge_studio():
    path = os.path.join(TOOLS_DIR, "pixel_forge_studio.html")
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Remove redundant header
    content = re.sub(r'<header className="text-center mb-2 md:mb-4">.*?</header>', '', content, flags=re.DOTALL)
    
    # 2. Inject "Send to Editor" button next to redo button
    # <button onClick={redo} disabled={!redoStack.length} className="tool-btn" style={redoStack.length?{}:{opacity:.3}}>&#x21aa;</button>
    # Wait, the character might be unicode or literal. Let's just match the start.
    redo_btn = r'<button onClick={redo} disabled={!redoStack.length}'
    # We can use regex to find the whole redo button.
    # <button onClick={redo}.*?</button>
    match = re.search(r'<button onClick=\{redo\}.*?</button>', content)
    if match:
        orig = match.group(0)
        replacement = orig + r'''
                    <button onClick={() => {
                        const activeFrame = frames[currentFrame];
                        if (activeFrame && activeFrame.canvas) {
                            window.parent.postMessage({ type: 'SEND_TO_HUB', dataURL: activeFrame.canvas.toDataURL(), name: 'Studio_Artwork' }, '*');
                        }
                    }} className="ml-2 px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold rounded" title="Send to Editor">Send to Editor</button>'''
        content = content.replace(orig, replacement)
        
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)

fix_pixel_forge()
fix_pixel_forge_studio()
print("Done fixing HTML files.")
