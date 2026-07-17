import re
import os

target = r"D:\PixelPalaceTauri\src\components\Studio.jsx"
with open(target, 'r', encoding='utf-8') as f:
    content = f.read()

# Add state
if 'const [swapA, setSwapA]' not in content:
    state_injection = """
    const [swapA, setSwapA] = useState(null);
    const [swapB, setSwapB] = useState(null);
"""
    content = content.replace("const [saveName", state_injection.strip() + "\n    const [saveName")

# Add swap function
if 'const swapColors =' not in content:
    swap_func = """
    const swapColors = () => {
        if (!swapA || !swapB || swapA === swapB) return;
        const ar=parseInt(swapA.slice(1,3),16),ag=parseInt(swapA.slice(3,5),16),ab=parseInt(swapA.slice(5,7),16);
        const br=parseInt(swapB.slice(1,3),16),bg=parseInt(swapB.slice(3,5),16),bb=parseInt(swapB.slice(5,7),16);
        
        const newFrames = frames.map(f => {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = res; tempCanvas.height = res;
            const tCtx = tempCanvas.getContext('2d');
            tCtx.putImageData(f.data, 0, 0);
            const imgData = tCtx.getImageData(0,0,res,res);
            const d = imgData.data;
            for(let p=0;p<d.length;p+=4){
                if(d[p]===ar&&d[p+1]===ag&&d[p+2]===ab&&d[p+3]>0){d[p]=br;d[p+1]=bg;d[p+2]=bb;}
                else if(d[p]===br&&d[p+1]===bg&&d[p+2]===bb&&d[p+3]>0){d[p]=ar;d[p+1]=ag;d[p+2]=ab;}
            }
            return { ...f, data: imgData };
        });
        setFrames(newFrames);
        if (canvasRef.current) dataToFrame(canvasRef.current, newFrames[currentFrame]);
        saveFrameState(); // Ensure it pushes to undo stack
    };
"""
    content = content.replace("function drawShape(", swap_func + "\n    function drawShape(")

# Inject UI
if 'Swap colors' not in content:
    ui_injection = """
                  <div className="w-px h-6 bg-neutral-700 mx-1 hidden md:block" />
                  <div className="flex items-center gap-1 bg-neutral-900 p-0.5 rounded-lg border border-neutral-800">
                    <input type="color" value={swapA||'#000000'} onChange={e=>setSwapA(e.target.value)} className="w-6 h-6 bg-transparent border-none rounded cursor-pointer p-0" title="Color A"/>
                    <button onClick={swapColors} className="text-[10px] px-2 py-1 bg-cyan-900 hover:bg-cyan-700 text-cyan-100 rounded transition-colors" title="Swap A and B across all frames">Swap colors</button>
                    <input type="color" value={swapB||'#ffffff'} onChange={e=>setSwapB(e.target.value)} className="w-6 h-6 bg-transparent border-none rounded cursor-pointer p-0" title="Color B"/>
                  </div>
"""
    content = content.replace('<div className="w-px h-6 bg-neutral-700 mx-1 hidden md:block" />', ui_injection, 1)

with open(target, 'w', encoding='utf-8') as f:
    f.write(content)

print("Injected Palette Swap feature successfully.")
