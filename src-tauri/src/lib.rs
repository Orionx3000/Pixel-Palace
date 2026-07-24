// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::io::Read;
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}


use tauri::{AppHandle, Manager};
use std::fs;
use std::env;
use std::path::Path;
use std::io::Write;
use serde::Deserialize;

// Append a debug line to pixelpalace_debug.log next to the app exe so launch
// failures (e.g. "path failed") are captured and readable instead of silent.
fn debug_log(msg: &str) {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let p = dir.join("pixelpalace_debug.log");
            if let Ok(mut f) = fs::OpenOptions::new().create(true).append(true).open(&p) {
                let _ = writeln!(f, "[{}] {}", chrono_now(), msg);
            }
        }
    }
}
fn chrono_now() -> String {
    // Avoid extra deps: use system time seconds.
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("{}", secs)
}

// ─── OpenStarbound integration ───────────────────────────────────────────────
// Pixel Palace bundles the OpenStarbound engine under resources/openstarbound,
// inside the install directory. The engine stays where the app is installed
// (self-contained — no critical files scattered to AppData). The user ports
// Starbound's base asset pack (packed.pak) once into the engine's assets folder,
// and Pixel Palace content is written into per-project mods/ folders. Launching
// runs starbound.exe with a project-specific sbinit.config so the engine loads
// the user's content.

#[derive(Deserialize)]
struct ModFile {
    name: String,
    data: Vec<u8>,
}

// OpenStarbound ships as `win/starbound.exe` on Windows, but we rename it to
// `ostarbound.exe` (and keep the others as fallbacks) so Pixel Palace does not ship
// a binary carrying the Starbound name. Returns the path to the actual engine exe.
fn engine_exe(dir: &Path) -> Option<std::path::PathBuf> {
    let names = ["ostarbound.exe", "openstarbound.exe", "starbound.exe"];
    for sub in [Some("win"), None] {
        for name in names.iter() {
            let mut p = dir.to_path_buf();
            if let Some(s) = sub {
                p = p.join(s);
            }
            p = p.join(name);
            if p.exists() {
                return Some(p);
            }
        }
    }
    None
}

fn engine_has_exe(dir: &Path) -> bool {
    engine_exe(dir).is_some()
}

// Resolve the OpenStarbound engine folder relative to the running executable so
// it works whether Pixel Palace is run as a loose build or installed anywhere —
// fully self-contained, no dependency on Tauri's resource_dir() heuristic (which
// can fail to locate resources when the exe is launched from an unexpected path).
fn find_engine(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe_dir = exe.parent().ok_or_else(|| "cannot determine executable directory".to_string())?;
    let mut candidates = vec![
        exe_dir.join("resources").join("openstarbound"),
        exe_dir.join("openstarbound"),
    ];
    if let Some(parent) = exe_dir.parent() {
        candidates.push(parent.join("resources").join("openstarbound"));
    }
    // Fall back to a user-data copy if the bundled engine is missing/incomplete.
    if let Ok(local) = app.path().app_local_data_dir() {
        candidates.push(local.join("OpenStarbound"));
    }
    for c in &candidates {
        if engine_has_exe(c) { return Ok(c.clone()); }
    }
    Err(format!("OpenStarbound engine folder not found. Looked in: {:?}", candidates))
}

#[tauri::command]
fn setup_openstarbound(app: AppHandle) -> Result<String, String> {
    let engine = find_engine(&app)?;
    Ok(engine.to_string_lossy().to_string())
}

#[tauri::command]
fn port_starbound_assets(app: AppHandle, starbound_path: String) -> Result<String, String> {
    let engine = find_engine(&app)?;
    let dst_assets = engine.join("assets");
    fs::create_dir_all(&dst_assets).map_err(|e| e.to_string())?;
    let src_pak = Path::new(&starbound_path).join("assets").join("packed.pak");
    let dst_pak = dst_assets.join("packed.pak");
    fs::copy(&src_pak, &dst_pak).map_err(|e| e.to_string())?;
    Ok(dst_pak.to_string_lossy().to_string())
}

#[tauri::command]
fn write_mod_files(files: Vec<ModFile>, dir: String) -> Result<(), String> {
    let base = Path::new(&dir);
    fs::create_dir_all(base).map_err(|e| e.to_string())?;
    for f in files {
        let p = base.join(&f.name);
        if let Some(parent) = p.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::write(&p, &f.data).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn launch_openstarbound(engine_dir: String, project_dir: String) -> Result<(), String> {
    let engine = Path::new(&engine_dir);
    let assets = engine.join("assets");
    let mods = Path::new(&project_dir).join("mods");
    let storage = Path::new(&project_dir).join("storage");
    let logs = engine.join("logs");
    fs::create_dir_all(&mods).map_err(|e| e.to_string())?;
    fs::create_dir_all(&storage).map_err(|e| e.to_string())?;
    let exe = engine_exe(engine)
        .ok_or_else(|| "OpenStarbound executable not found in engine folder".to_string())?;
    let win = exe.parent().unwrap_or(engine);
    let fix = |p: &Path| p.to_string_lossy().replace('\\', "/");
    let cfg = format!(
        "{{\n  \"assetDirectories\" : [\n    \"{a}\",\n    \"{m}\"\n  ],\n  \"storageDirectory\" : \"{s}\",\n  \"logDirectory\" : \"{l}\"\n}}\n",
        a = fix(&assets),
        m = fix(&mods),
        s = fix(&storage),
        l = fix(&logs)
    );
    fs::write(win.join("sbinit.config"), cfg).map_err(|e| e.to_string())?;
    std::process::Command::new(&exe)
        .current_dir(&win)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}


// ---- Solarus integration ----
// Pixel Palace bundles the Solarus engine (Quest Editor + runner) under
// resources/solarus, mirroring the OpenStarbound setup so it is fully
// self-contained and discoverable regardless of where the exe is launched.
fn find_solarus(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe_dir = exe.parent().ok_or_else(|| "cannot determine executable directory".to_string())?;
    let mut candidates = vec![
        exe_dir.join("resources").join("solarus"),
        exe_dir.join("solarus"),
    ];
    if let Some(parent) = exe_dir.parent() {
        candidates.push(parent.join("resources").join("solarus"));
    }
    if let Ok(local) = app.path().app_local_data_dir() {
        candidates.push(local.join("Solarus"));
    }
    for c in &candidates {
        if c.join("solarus-editor.exe").exists() { return Ok(c.clone()); }
    }
    Err(format!("Solarus engine not found. Looked in: {:?}", candidates))
}

#[tauri::command]
fn launch_solarus(app: AppHandle, quest_dir: String, mode: String) -> Result<(), String> {
    let engine = find_solarus(&app)?;
    let bin = match mode.as_str() {
        "run" => "solarus-run.exe",
        "launch" => "solarus-launcher.exe",
        _ => "solarus-editor.exe",
    };
    let exe = engine.join(bin);
    if !exe.exists() {
        return Err(format!("Solarus binary not found: {}", exe.to_string_lossy()));
    }
    let mut cmd = std::process::Command::new(&exe);
    cmd.current_dir(&engine);
    if mode != "launch" {
        cmd.arg(&quest_dir);
    }
    cmd.stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ---- Tiled integration ----
// Pixel Palace bundles the Tiled map editor (GPL application / BSD libtiled) under
// resources/tiled, launched as a separate window so the user can lay out maps from
// tiles produced in Pixel Palace. This is mere aggregation: Tiled runs as an
// independent process, so Pixel Palace's license is unaffected. Tiled's license
// files (COPYING.txt = GPL, LICENSE.BSD.txt) ship inside the bundle.
fn find_tiled(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe_dir = exe.parent().ok_or_else(|| "cannot determine executable directory".to_string())?;
    let mut candidates = vec![
        exe_dir.join("resources").join("tiled"),
        exe_dir.join("tiled"),
    ];
    if let Some(parent) = exe_dir.parent() {
        candidates.push(parent.join("resources").join("tiled"));
    }
    if let Ok(local) = app.path().app_local_data_dir() {
        candidates.push(local.join("Tiled"));
    }
    for c in &candidates {
        if c.join("tiled.exe").exists() { return Ok(c.clone()); }
    }
    Err(format!("Tiled editor not found. Looked in: {:?}", candidates))
}

#[tauri::command]
fn launch_tiled(app: AppHandle, map_path: Option<String>) -> Result<(), String> {
    let engine = find_tiled(&app)?;
    let exe = engine.join("tiled.exe");
    if !exe.exists() {
        return Err(format!("Tiled binary not found: {}", exe.to_string_lossy()));
    }
    let mut cmd = std::process::Command::new(&exe);
    cmd.current_dir(&engine);
    if let Some(mp) = map_path {
        if !mp.is_empty() {
            cmd.arg(&mp);
        }
    }
    cmd.stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ─── AI sidecar (local Stable Diffusion pixel-art generator) ──────────────────
// Launches the FROZEN standalone sidecar (ai_sidecar/dist/ai_sidecar.exe) as a
// child process serving a localhost JSON API on 127.0.0.1:<port>. The exe is a
// PyInstaller build of ai_sidecar/sidecar.py (torch CUDA + diffusers + peft) — it
// is fully self-contained, needs NO Python install at runtime. The frontend (Pixscii
// "Generate (AI)") talks to it directly over HTTP. If the exe or the model is
// missing, the command returns an informative error and the UI falls back to the
// procedural generator. The sidecar resolves the SD1.5 checkpoint + 2D Pixel Toolkit
/// Serializes all sidecar launches (auto-start thread, "Start AI" button,
/// Generate) so concurrent callers can't each spawn their own copy and pile
/// up on the port.
static SIDE_LAUNCH: std::sync::Mutex<()> = std::sync::Mutex::new(());

/// Returns true if something is already serving /health on the port.
fn sidecar_already_up(port: u16) -> bool {
    if let Ok(mut s) = std::net::TcpStream::connect(("127.0.0.1", port)) {
        use std::io::Write;
        let _ = s.write_all(format!("GET /health HTTP/1.0\r\nHost: 127.0.0.1\r\n\r\n").as_bytes());
        let mut buf = vec![0u8; 1024];
        if s.read(&mut buf).is_ok() && String::from_utf8_lossy(&buf).contains("\"ok\"") {
            return true;
        }
    }
    false
}

// LoRA from D:\ by default (env PP_SD_CKPT / PP_SD_LORA override).
#[tauri::command]
fn launch_ai_sidecar(_app: AppHandle, port: u16) -> Result<String, String> {
    use std::process::Command;
    // If something is already serving on the port (a previous launch, or the
    // auto-start thread), don't spawn a second copy — a double-bind kills the
    // new process and confuses the UI. Just report it's up.
    if sidecar_already_up(port) {
        debug_log("launch_ai_sidecar: already serving on port — skipping spawn");
        return Ok("AI sidecar already running".to_string());
    }
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe_dir = exe.parent().ok_or_else(|| "cannot determine exe dir".to_string())?;

    // Preferred: run the sidecar via the bundled Python venv (ai_sidecar/venv).
    // The frozen PyInstaller build hangs loading the SD checkpoint, so we use the
    // venv directly — it's already built on the user's machine and works reliably.
    // Use pythonw.exe (the windowless Python) so the backend never pops a
    // console window. python.exe allocates its own console when launched detached,
    // which is the "blank cmd window on Generate" the user saw.
    let mut venv_python = exe_dir.join("ai_sidecar").join("venv").join("Scripts").join("pythonw.exe");
    if !venv_python.exists() {
        venv_python = exe_dir.join("ai_sidecar").join("venv").join("Scripts").join("python.exe");
    }
    let sidecar_py = exe_dir.join("ai_sidecar").join("sidecar.py");
    // Fallback locations for the sidecar.py + venv (dev / resources layout).
    let fallback_py = vec![
        exe_dir.join("resources").join("ai_sidecar").join("sidecar.py"),
        exe_dir.join("ai_sidecar").join("dist").join("sidecar.py"),
    ];
    let (py, py_script) = if venv_python.exists() && sidecar_py.exists() {
        (venv_python, sidecar_py)
    } else if let Some(fb) = fallback_py.iter().find(|p| p.exists()) {
        let v = if fb.parent().unwrap().join("venv").join("Scripts").join("pythonw.exe").exists() {
            fb.parent().unwrap().join("venv").join("Scripts").join("pythonw.exe")
        } else {
            fb.parent().unwrap().join("venv").join("Scripts").join("python.exe")
        };
        (v, fb.clone())
    } else {
        debug_log(&format!("launch_ai_sidecar: not found. venv_python={} sidecar_py={}", venv_python.display(), sidecar_py.display()));
        return Err("AI sidecar not found (need ai_sidecar/venv + sidecar.py next to the app).".to_string());
    };
    if !py.exists() {
        debug_log(&format!("launch_ai_sidecar: venv python missing at {}", py.display()));
        return Err("AI sidecar venv Python not found. Ensure ai_sidecar/venv exists next to the app.".to_string());
    }
    let sidecar_dir = py_script.parent().unwrap_or(&exe_dir).to_path_buf();
    debug_log(&format!("launch_ai_sidecar: py={} script={} cwd={}", py.display(), py_script.display(), sidecar_dir.display()));
    // Redirect the child's stdout/stderr to a log file (next to the app exe) so a
    // crash is diagnosable instead of silent. The sidecar also writes its own
    // sidecar_debug.log, but this catches OS-level / import failures too.
    let child_log = exe_dir.join("ai_sidecar_stderr.log");
    let child_out = std::fs::File::create(&child_log).unwrap_or_else(|_| std::fs::File::create(std::env::temp_dir().join("ai_sidecar_stderr.log")).unwrap_or_else(|_| std::fs::File::open("NUL").unwrap()));
    let mut cmd = Command::new(&py);
    cmd.arg(&py_script);
    cmd.arg(port.to_string());
    cmd.current_dir(&sidecar_dir);
    // CRITICAL FIX: the Tauri app is a GUI (no-console) process. When torch/CUDA
    // initialize they pull in the Intel Fortran runtime (oneMKL etc.), which
    // installs a console-control handler. If the child is attached to the
    // parent's (nonexistent) console it receives a window-CLOSE event and aborts
    // with `forrtl: error (200): program aborting due to window-CLOSE event`,
    // killing the sidecar at `import torch`. Two guards:
    //   1) DETACHED_PROCESS — give the child its own independent process group.
    //   2) FOR_DISABLE_CONSOLE_CTRL_HANDLER=1 — tell the Fortran runtime to NOT
    //      install the handler that throws on window-close (the canonical fix).
    cmd.env("FOR_DISABLE_CONSOLE_CTRL_HANDLER", "1");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const DETACHED_PROCESS: u32 = 0x00000008;
        const CREATE_NEW_PROCESS_GROUP: u32 = 0x00000200;
        cmd.creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP);
    }
    if let Ok(v) = std::env::var("PP_SD_CKPT") { cmd.env("PP_SD_CKPT", v); }
    if let Ok(v) = std::env::var("PP_SD_LORA") { cmd.env("PP_SD_LORA", v); }
    if let Ok(v) = std::env::var("PP_SD_DEVICE") { cmd.env("PP_SD_DEVICE", v); }
    cmd.stdout(child_out.try_clone().unwrap_or_else(|_| std::fs::File::open("NUL").unwrap())).stderr(child_out);
    match cmd.spawn() {
        Ok(_) => {
            debug_log("launch_ai_sidecar: spawned OK");
            return Ok(format!("AI sidecar launched on port {}", port));
        }
        Err(e) => {
            debug_log(&format!("launch_ai_sidecar: spawn failed: {}", e));
            return Err(format!(
                "Could not start AI sidecar ({}). Ensure ai_sidecar.exe is bundled and an SD1.5 pixel checkpoint exists at D:\\allInOnePixelModel_v1.ckpt",
                e
            ));
        }
    }
}

#[tauri::command]
fn ai_sidecar_port() -> u16 { 18755 }

/// Launch the AI sidecar if it isn't already serving. Polls /health until the
/// model finishes loading (or we time out). Lets the UI bring the AI up on
/// demand instead of silently failing with "sidecar unavailable".
#[tauri::command]
async fn ensure_ai_sidecar(app: AppHandle, port: u16) -> Result<String, String> {
    // Serialize all callers through one lock so concurrent invocations
    // (auto-start thread, "Start AI" button, Generate) can't each spawn
    // their own sidecar and pile up on the port.
    let _guard = SIDE_LAUNCH.lock().unwrap();
    // Already up?
    if sidecar_already_up(port) {
        return Ok("AI sidecar already running".to_string());
    }
    launch_ai_sidecar(app, port)?;
    // Wait (up to ~45s) for the model to finish loading.
    for i in 0..45 {
        std::thread::sleep(std::time::Duration::from_secs(1));
        if let Ok(mut stream) = std::net::TcpStream::connect(("127.0.0.1", port)) {
            use std::io::Write;
            let _ = stream.write_all(
                format!("GET /health HTTP/1.0\r\nHost: 127.0.0.1\r\n\r\n").as_bytes());
            let mut buf = vec![0u8; 1024];
            if stream.read(&mut buf).is_ok() {
                if String::from_utf8_lossy(&buf).contains("\"ok\"") {
                    return Ok(format!("AI sidecar ready after ~{}s", i + 1));
                }
            }
        }
        let _ = i;
    }
    Err("AI sidecar started but did not become ready within 45s. Check D:\\ models exist.".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, setup_openstarbound, port_starbound_assets, write_mod_files, launch_openstarbound, launch_solarus, launch_tiled, launch_ai_sidecar, ensure_ai_sidecar, ai_sidecar_port])
        .setup(|app| {
            // Best-effort: try to auto-start the AI sidecar in the background.
            // If Python / the model is missing it simply fails silently and the
            // UI falls back to the procedural generator.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                // Respect the same launch lock as ensure_ai_sidecar so the
                // auto-start can't race a "Start AI" / Generate click into a
                // duplicate process.
                let _guard = SIDE_LAUNCH.lock().unwrap();
                let _ = launch_ai_sidecar(handle, 18755);
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
