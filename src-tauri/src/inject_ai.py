import re

lib_path = r"D:\PixelPalaceTauri\src-tauri\src\lib.rs"

with open(lib_path, 'r', encoding='utf-8') as f:
    content = f.read()
    
# We want to add the command
rust_cmd = """
use tauri_plugin_shell::ShellExt;
use tauri::AppHandle;
use std::fs;
use std::env;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};

#[tauri::command]
async fn generate_ai_sprite(app: AppHandle, prompt: String, size: u32, palette: String, count: u32) -> Result<String, String> {
    let sidecar = app.shell().sidecar("pixel-forge").map_err(|e| e.to_string())?;
    
    let tmp_dir = env::temp_dir();
    let time = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis();
    let out_file = tmp_dir.join(format!("pixel-forge-out_{}.png", time));
    
    let output = sidecar.args(["sprite", &prompt, "--size", &size.to_string(), "--palette", &palette, "--frames", &count.to_string(), "-o", out_file.to_str().unwrap()])
        .output()
        .await
        .map_err(|e| e.to_string())?;
        
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    
    if !out_file.exists() {
        return Err("Output file not created".to_string());
    }
    
    let img = fs::read(&out_file).map_err(|e| e.to_string())?;
    let _ = fs::remove_file(&out_file);
    
    let b64 = BASE64.encode(img);
    Ok(format!("data:image/png;base64,{}", b64))
}
"""

if "generate_ai_sprite" not in content:
    # Inject it before the run() function
    content = content.replace("#[cfg_attr(mobile, tauri::mobile_entry_point)]", rust_cmd + "\n\n#[cfg_attr(mobile, tauri::mobile_entry_point)]")
    # Add it to generate_handler!
    content = content.replace("tauri::generate_handler![greet]", "tauri::generate_handler![greet, generate_ai_sprite]")
    
    with open(lib_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Injected generate_ai_sprite into lib.rs")
else:
    print("Already injected")
