import os
import re

def fix_app():
    path = r"D:\PixelPalaceTauri\src\App.jsx"
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    # Add width:'100%' to Editor and Studio wrappers
    content = content.replace(
        "<div style={{display: active==='editor'?'block':'none', height:'100%'}}>",
        "<div style={{display: active==='editor'?'block':'none', height:'100%', width:'100%', flex:1}}>"
    )
    content = content.replace(
        "<div style={{display: active==='studio'?'block':'none', height:'100%'}}>",
        "<div style={{display: active==='studio'?'block':'none', height:'100%', width:'100%', flex:1}}>"
    )
    
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print("Fixed App.jsx")

def fix_editor():
    path = r"D:\PixelPalaceTauri\src\components\Editor.jsx"
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    # Fix getPos
    old_getpos = """const getPos=(e)=>{
      const c=displayRef.current;if(!c)return null;
      const rect=c.getBoundingClientRect();
      const scale = Math.min(rect.width / c.width, rect.height / c.height);
      const offsetX = (rect.width - (c.width * scale)) / 2;
      const offsetY = (rect.height - (c.height * scale)) / 2;
      const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left - offsetX;
      const cy = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top - offsetY;
      const px = Math.floor(cx / scale);
      const py = Math.floor(cy / scale);
      if(px<0||px>=w||py<0||py>=h)return null;
      return {x:px,y:py};
  };"""
  
    new_getpos = """const getPos=(e)=>{
      const c=displayRef.current;if(!c)return null;
      const rect=c.getBoundingClientRect();
      const scaleX = rect.width / w;
      const scaleY = rect.height / h;
      const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      const cy = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
      const px = Math.floor(cx / scaleX);
      const py = Math.floor(cy / scaleY);
      if(px<0||px>=w||py<0||py>=h)return null;
      return {x:px,y:py};
  };"""
  
    content = content.replace(old_getpos, new_getpos)

    # Fix canvas centering and width
    # We replace:
    # <div className="flex-1 flex flex-col items-center justify-center p-2 overflow-auto" style={{background:'#0a0a0a'}}>
    #   <div style={{position:'relative', width:`${480*zoom/100}px`, display:'flex'}}>
    old_canvas_wrap = """<div className="flex-1 flex flex-col items-center justify-center p-2 overflow-auto" style={{background:'#0a0a0a'}}>
          <div style={{position:'relative', width:`${480*zoom/100}px`, display:'flex'}}>"""
    
    new_canvas_wrap = """<div className="flex-1 overflow-auto" style={{background:'#0a0a0a'}}>
          <div style={{minHeight:'100%', display:'flex', alignItems:'center', justifyContent:'center', padding:'2rem', flexDirection:'column'}}>
            <div style={{position:'relative', width:`${Math.max(w, h)*10*zoom/100}px`, flexShrink:0, display:'flex', boxShadow:'0 0 40px rgba(0,0,0,0.8)', borderRadius:8}}>"""
            
    content = content.replace(old_canvas_wrap, new_canvas_wrap)
    
    # Wait, the timeline is ALSO inside the centering div?
    # Yes, Editor.jsx has:
    #   <div style={{position:'relative'...>
    #   {/* Timeline */}
    #   <div className="w-full max-w-3xl mt-2 flex-shrink-0">
    # If we made flexDirection:'column', it works!
    
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print("Fixed Editor.jsx")

def fix_studio():
    path = r"D:\PixelPalaceTauri\src\components\Studio.jsx"
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    # Fix canvas centering and width
    old_canvas_wrap = """<div className="flex-1 bg-[#0a0a0a] border border-neutral-700 rounded-xl flex items-center justify-center overflow-auto relative">
                        <div style={{position:'relative', width:`${480*zoom/100}px`, display:'flex'}}>"""
                        
    new_canvas_wrap = """<div className="flex-1 bg-[#0a0a0a] border border-neutral-700 rounded-xl overflow-auto relative">
                        <div style={{minHeight:'100%', display:'flex', alignItems:'center', justifyContent:'center', padding:'2rem'}}>
                            <div style={{position:'relative', width:`${res*10*zoom/100}px`, flexShrink:0, display:'flex', boxShadow:'0 0 40px rgba(0,0,0,0.8)', borderRadius:8}}>"""

    content = content.replace(old_canvas_wrap, new_canvas_wrap)
    
    # We must also close the extra div we added
    old_canvas_end = """onTouchStart={handleDown} onTouchMove={handleMove} onTouchEnd={handleUp} />
                        </div>
                    </div>"""
    new_canvas_end = """onTouchStart={handleDown} onTouchMove={handleMove} onTouchEnd={handleUp} />
                            </div>
                        </div>
                    </div>"""
                    
    content = content.replace(old_canvas_end, new_canvas_end)

    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print("Fixed Studio.jsx")

if __name__ == "__main__":
    fix_app()
    fix_editor()
    fix_studio()
