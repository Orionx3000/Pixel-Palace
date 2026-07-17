import re

jsx_path = r"D:\PixelPalaceTauri\src\components\Studio.jsx"

with open(jsx_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add invoke import if not present
if "import { invoke }" not in content:
    content = content.replace("import React,", "import { invoke } from '@tauri-apps/api/core';\nimport React,")

# 2. Update `checkSidecar` to just return true (Tauri sidecars don't need health checks in the same way, we just assume connected)
check_sidecar_regex = r"const checkSidecar=async\(\)=>\{.*?setSidecarStatus\('disconnected'\);\n\s*\}\n\s*\};"
new_check_sidecar = """const checkSidecar=async()=>{ setSidecarStatus('connected'); return { status: 'ok' }; };"""
content = re.sub(check_sidecar_regex, new_check_sidecar, content, flags=re.DOTALL)

# 3. Update the generate fetch logic
gen_regex = r"const res=await fetch\(sidecarUrl\+'/generate',\{.*?\}\);\n\s*if\(!res\.ok\)\{.*?\n\s*throw new Error\(.*?\);\n\s*\}\n\s*const data=await res\.json\(\);"
new_gen = """
        const b64Image = await invoke('generate_ai_sprite', { prompt, size, palette: 'pico8', count: 1 });
        const data = { image: b64Image, width: size, height: size };
"""
content = re.sub(gen_regex, new_gen, content, flags=re.DOTALL)

with open(jsx_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Injected invoke into Studio.jsx")
