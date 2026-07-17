import os

# --- Editor.jsx ---
path = r"D:\PixelPalaceTauri\src\components\Editor.jsx"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# Replace the flex centering with margin: auto centering
old_wrapper = """<div style={{minHeight:'100%', display:'flex', alignItems:'center', justifyContent:'center', padding:'2rem', flexDirection:'column'}}>
              <div style={{position:'relative', width:`${Math.max(w, h)*10*zoom/100}px`, flexShrink:0, display:'flex', boxShadow:'0 0 40px rgba(0,0,0,0.8)', borderRadius:8}}>"""

new_wrapper = """<div style={{minHeight:'100%', minWidth:'100%', display:'flex', padding:'2rem'}}>
              <div style={{margin:'auto', position:'relative', width:`${Math.max(w, h)*10*zoom/100}px`, flexShrink:0, display:'flex', flexDirection:'column', boxShadow:'0 0 40px rgba(0,0,0,0.8)', borderRadius:8}}>"""

if old_wrapper in content:
    content = content.replace(old_wrapper, new_wrapper)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print("Fixed Editor.jsx canvas centering")
else:
    print("Could not find old_wrapper in Editor.jsx")


# --- Studio.jsx ---
path = r"D:\PixelPalaceTauri\src\components\Studio.jsx"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

old_wrapper2 = """<div style={{minHeight:'100%', display:'flex', alignItems:'center', justifyContent:'center', padding:'2rem'}}>
                            <div style={{position:'relative', width:`${res*10*zoom/100}px`, flexShrink:0, display:'flex', boxShadow:'0 0 40px rgba(0,0,0,0.8)', borderRadius:8}}>"""

new_wrapper2 = """<div style={{minHeight:'100%', minWidth:'100%', display:'flex', padding:'2rem'}}>
                            <div style={{margin:'auto', position:'relative', width:`${res*10*zoom/100}px`, flexShrink:0, display:'flex', flexDirection:'column', boxShadow:'0 0 40px rgba(0,0,0,0.8)', borderRadius:8}}>"""

if old_wrapper2 in content:
    content = content.replace(old_wrapper2, new_wrapper2)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print("Fixed Studio.jsx canvas centering")
else:
    print("Could not find old_wrapper2 in Studio.jsx")
