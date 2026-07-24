#!/usr/bin/env python3
"""
Pixel Palace AI sidecar.

A tiny local HTTP server that wraps a Stable Diffusion 1.5 pixel-art checkpoint
(+ optional pixel LoRA) and turns text prompts into clean pixel-art PNGs.

It is launched by the Tauri app as a sidecar. The port is passed as argv[1]
(default 18755). The frontend (Pixscii "Generate (AI)") calls it through
window.PP_AI.generate -> http://127.0.0.1:<port>/generate.

Design notes (the "tuned for pixel art" part):
  * We generate at a LOW native resolution (height/width capped ~128) so the
    model produces blocky, readable pixel art instead of mushy high-res.
  * We then NEAREST-NEIGHBOR upscale to the requested size (no blur).
  * Optional palette posterize snaps colors to a small fixed ramp so the result
    drops straight into the Editor / Studio / engine pipeline.

Models (user-provided, NOT bundled):
  * SD1.5 pixel checkpoint, e.g. allInOnePixelModel_v1.ckpt / PixNite 1.5 /
    PixelMonster (CreativeML OpenRAIL-M -> commercial use allowed).
  * Optional M_Pixel LoRA (144 MB, trigger "pixel") for character/scene style.

Dependencies: pip install torch diffusers pillow numpy safetensors
"""
import sys
import os
import io
import json
import math
import random
import traceback
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse

# Redirect EVERYTHING (stdout, stderr, uncaught exceptions) to a log file next to
# this script so that when the Tauri app spawns us with Stdio::null() we can still
# see why we failed to come up. The app itself cannot capture our output.
_SIDECAR_LOG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sidecar_debug.log")
def _sc_log(msg):
    try:
        with open(_SIDECAR_LOG, "a", encoding="utf-8") as f:
            f.write(msg + "\n")
            f.flush()
    except Exception:
        pass
# Mirror prints + capture all exceptions to the file.
class _ScLogFile:
    def write(self, s):
        _sc_log(s.rstrip("\n"))
    def flush(self):
        pass
sys.stdout = _ScLogFile()
sys.stderr = _ScLogFile()
def _sc_excepthook(t, v, tb):
    _sc_log("UNCAUGHT EXCEPTION:\n" + "".join(traceback.format_exception(t, v, tb)))
sys.excepthook = _sc_excepthook
_sc_log("=== sidecar start pid=%d python=%s cwd=%s ===" % (os.getpid(), sys.executable, os.getcwd()))


PORT = 18755
if len(sys.argv) > 1 and sys.argv[1].isdigit():
    PORT = int(sys.argv[1])

# --- paths: override with env vars ---
# Default to the user's downloaded models on D:\ so it "just works" once
# the sidecar is launched from the built app.
def _default_ckpt():
    cand = [
        os.environ.get("PP_SD_CKPT", ""),
        r"D:\allInOnePixelModel_v1.ckpt",
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "allInOnePixelModel_v1.ckpt"),
    ]
    for c in cand:
        if c and os.path.exists(c):
            return c
    return cand[0] or r"allInOnePixelModel_v1.ckpt"

def _default_lora():
    cand = [
        os.environ.get("PP_SD_LORA", ""),
        r"D:\pixel sprites.safetensors",   # 2D Pixel Toolkit SD1.5 LoRA (trigger: pixel, xiangsu)
        r"D:\pixel_f2.safetensors",        # alternate pixel LoRA
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "pixel sprites.safetensors"),
    ]
    for c in cand:
        if c and os.path.exists(c):
            return c
    return ""

CHECKPOINT = _default_ckpt()
LORA_PATH = _default_lora()

PIPE = None
IS_SDXL = False


def _cuda_ok():
    try:
        import torch
        return torch.cuda.is_available()
    except Exception:
        return False


DEVICE = os.environ.get("PP_SD_DEVICE", "cuda" if _cuda_ok() else "cpu")
if DEVICE == "cuda":
    try:
        import torch
        torch.backends.cuda.matmul.allow_tf32 = True
        torch.backends.cudnn.benchmark = True
    except Exception:
        pass


# Pixel-art palettes for posterize/quantize. Index 0 = darkest/outline.
# These are the real game ramps Pixscii already exposes, plus the classic
# restricted sets — so the AI output snaps to a believable ramp instead of
# producing Rorschach gradients.
POSTERIZE_PALETTES = {
    "none": [],
    "raw": [],
    "gameboy": ["#0f380f", "#306230", "#8bac0f", "#9bbc0f"],
    "pico8": ["#000000", "#1d2b53", "#7e2553", "#008751", "#ab5236", "#5f574f",
              "#c2c3c7", "#ff004d", "#ffa300", "#ffec27", "#00e436", "#29adff",
              "#83769c", "#ff77a8", "#ffccaa", "#ffffff"],
    "endesga": ["#be4a2f", "#d77643", "#ead4aa", "#e4a672", "#b86f50", "#733e39",
                "#3e2731", "#a22633", "#e43b44", "#f77622", "#feae34", "#fee761",
                "#63c74d", "#3e8948", "#265c42", "#193c3e"],
    "stardew": ["#211c34", "#4a3b5c", "#7c5c9c", "#c49adf", "#e8b06a", "#f2e2c4",
                "#6ab04c", "#e15f41"],
    "starbound": ["#1d1d28", "#3b3b52", "#5c6c8a", "#8fb3ff", "#ffd57a", "#eef2f7",
                  "#d9443b", "#4fd68a"],
    "snes": ["#000000", "#3a3a5c", "#6b6b9c", "#9b9bd6", "#f2c14e", "#f7f7f7",
             "#d23b3b", "#3bbf6b"],
    "hero": ["#1a1a2e", "#2b2b3a", "#4a4a6a", "#7a8cff", "#ffd27a", "#e8e8f0",
             "#c0392b", "#3ad99a"],
    "slime": ["#0b3d2e", "#1f7a5a", "#3ad99a", "#bff7e0", "#0a2a20", "#7affd1",
              "#2bd4a0", "#0e5a44"],
    "fire": ["#3a0d0d", "#a02b14", "#ff6b1a", "#ffd23f", "#5a1500", "#ffae5e",
             "#7a1a0a", "#ffb347"],
    "forest": ["#1c2e16", "#3c6b2e", "#6fc24a", "#bff08a", "#0f1f0c", "#2e8b57",
               "#4a8b3a", "#e0f0a0"],
    "stone": ["#2a2a2e", "#4a4a52", "#7a7a86", "#b8b8c4", "#15151a", "#5a5a66",
              "#3a3a42", "#d0d0dc"],
    "gold": ["#3a2e0d", "#a07b14", "#ffd23f", "#fff3b0", "#5a4500", "#ffb347",
             "#7a5e10", "#fff7d0"],
    "ice": ["#0d243a", "#14618a", "#46c8ff", "#d6f4ff", "#06203a", "#9adcff",
            "#2a7ac8", "#eafaff"],
    "poison": ["#2a0d3a", "#6a1a8a", "#c44aff", "#f0c0ff", "#1a062a", "#e07aff",
               "#5a2a8a", "#fae0ff"],
}

# SD samplers diffusers supports out of the box. Euler a / DPM++ are the
# pixel-art favourites; we expose them so the UI can pick under the hood.
SAMPLERS = {
    "euler_a": "EulerAncestralDiscreteScheduler",
    "euler": "EulerDiscreteScheduler",
    "dpmpp_2m": "DPM++ 2M",
    "dpmpp_2m_karras": "DPM++ 2M Karras",
    "dpmpp_sde": "DPM++ SDE",
    "ddim": "DDIMScheduler",
    "lms": "LMSDiscreteScheduler",
    "heun": "HeunDiscreteScheduler",
}


def hex2rgb(h):
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def load_pipeline():
    """Load either an SD1.5 or SDXL checkpoint (+ optional LoRA), based on the
    checkpoint filename / env hint. Auto-detects SDXL via 'xl'/'sdxl' in the path
    or PP_SD_ARCH=sd15|sdxl."""
    global PIPE, IS_SDXL
    if PIPE is not None:
        return PIPE
    print("[sidecar] importing torch + diffusers ...", flush=True)
    import torch
    from diffusers import StableDiffusionPipeline, StableDiffusionXLPipeline
    print("[sidecar] torch + diffusers imported OK", flush=True)
    arch = os.environ.get("PP_SD_ARCH", "").lower()
    if not arch:
        low = CHECKPOINT.lower()
        arch = "sdxl" if ("xl" in low or "sdxl" in low) else "sd15"
    IS_SDXL = arch == "sdxl"
    pipe_cls = StableDiffusionXLPipeline if IS_SDXL else StableDiffusionPipeline
    print(f"[sidecar] loading {arch} checkpoint {CHECKPOINT} on {DEVICE} ...", flush=True)
    if CHECKPOINT.lower().endswith((".safetensors", ".ckpt")):
        pipe = pipe_cls.from_single_file(CHECKPOINT, torch_dtype=torch.float32)
    else:
        pipe = pipe_cls.from_pretrained(CHECKPOINT, torch_dtype=torch.float32)
    if LORA_PATH:
        try:
            if IS_SDXL:
                pipe.load_lora_weights(LORA_PATH, adapter_name="pixel")
                pipe.set_adapters(["pixel"], adapter_weights=[float(os.environ.get("PP_LORA_SCALE", "0.8"))])
            else:
                # SD1.5: load + fuse the LoRA so it bakes into the weights
                pipe.load_lora_weights(LORA_PATH)
                pipe.fuse_lora(lora_scale=float(os.environ.get("PP_LORA_SCALE", "0.8")))
            print(f"[sidecar] LoRA loaded: {LORA_PATH}", flush=True)
        except Exception as e:
            print(f"[sidecar] LoRA load failed: {e}", flush=True)
    pipe = pipe.to(DEVICE)
    pipe.safety_checker = None
    PIPE = pipe
    print("[sidecar] ready.", flush=True)
    return PIPE


def posterize(image, palette_name):
    """Snap every pixel to the nearest colour in a fixed ramp. This is what makes
    AI output read as pixel art instead of a blurry gradient."""
    pal = POSTERIZE_PALETTES.get(palette_name)
    if not pal:
        return image
    pal = [hex2rgb(c) for c in pal]
    px = image.load()
    w, h = image.size
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y][:3]
            best = min(pal, key=lambda c: (c[0]-r)**2 + (c[1]-g)**2 + (c[2]-b)**2)
            px[x, y] = (best[0], best[1], best[2], px[x, y][3] if len(px[x, y]) == 4 else 255)
    return image


def nearest_upscale(image, target):
    if image.size == target:
        return image
    return image.resize(target, resample=0)  # resample=0 == NEAREST


def build_scheduler(name):
    """Resolve an SD scheduler class by short name. Pixel-art favourites are
    Euler a and DPM++ 2M Karras — chosen under the hood by the UI."""
    import diffusers
    mapping = {
        "euler_a": diffusers.EulerAncestralDiscreteScheduler,
        "euler": diffusers.EulerDiscreteScheduler,
        "ddim": diffusers.DDIMScheduler,
        "lms": diffusers.LMSDiscreteScheduler,
        "heun": diffusers.HeunDiscreteScheduler,
        "dpmpp_2m": diffusers.DPMSolverMultistepScheduler,
        "dpmpp_2m_karras": lambda: diffusers.DPMSolverMultistepScheduler.from_config(
            diffusers.DPMSolverMultistepScheduler.load_config(), use_karras_sigmas=True),
        "dpmpp_sde": diffusers.DPMSolverSinglestepScheduler,
    }
    cls = mapping.get(name, diffusers.EulerAncestralDiscreteScheduler)
    try:
        return cls.from_config(cls.load_config()) if not callable(cls) else cls()
    except Exception:
        return diffusers.EulerAncestralDiscreteScheduler()


def generate(req):
    """Model-driven pixel-art generation. Returns PNG bytes at the requested
    native resolution (no forced downscale, no symmetry, no procedural posing —
    those are the front-end's job, not the model's).

    req keys: prompt, negative_prompt, width, height, size(alias), seed,
              palette, model, sampler, steps, cfg, scale(lora), mode.
    """
    from PIL import Image
    import torch
    pipe = load_pipeline()
    base_prompt = req.get("prompt", "pixel art, game asset")
    seed = int(req.get("seed", 0)) if req.get("seed") is not None and req.get("seed") != "" else random.randint(0, 1 << 31)
    palette = req.get("palette", "none")
    preset = (req.get("model") or "allinone").lower()
    sampler = req.get("sampler", "euler_a")
    mode = (req.get("mode") or "sprite").lower()

    # Independent W/H (default to a sane pixel-art native res, NOT capped tiny).
    w = int(req.get("width") or req.get("size") or 64)
    h = int(req.get("height") or req.get("size") or 64)
    w = max(16, min(768, w))
    h = max(16, min(768, h))

    # Trigger words baked in per model so the user never has to remember them.
    # 2D Pixel Toolkit is the anchor for the whole toolset.
    triggers = {
        "allinone": "pixelsprite, pixel art, video game asset",
        "2dpixel": "pixel, xiangsu, 2d game asset, sprite, clean pixel art",
        "mpixel": "pixel, 2d game asset",
        "pixelxl": "",
    }
    # Universal pixel-art negative prompt — keeps the model off Rorschach noise.
    neg = req.get("negative_prompt") or (
                  "blurry, smooth gradient, noise, photorealistic, 3d render, "
                  "anti-aliased, jpeg artifacts, lowres, watermark, text, fuzzy, "
                  "painting, sketch")
    if mode == "scene" or mode == "map":
        neg += ", single object, character portrait, plain background"

    trig = triggers.get(preset, "")
    prompt = base_prompt.strip()
    if trig:
        prompt = f"{prompt}, {trig}"
    # Pixel-art composition hints under the hood (not user-facing clutter).
    if mode in ("sprite", "sheet"):
        prompt += ", flat colors, hard edges, solid background, no gradient"
    elif mode == "tileset":
        prompt += ", seamless tile, tileable, flat colors, hard pixel edges"
    elif mode in ("scene", "map"):
        prompt += ", top-down, flat shading, hard pixel edges, game background"

    gen = torch.Generator(device=DEVICE).manual_seed(seed)
    scheduler = build_scheduler(sampler)
    pipe.scheduler = scheduler
    common = dict(
        width=w, height=h,
        num_inference_steps=int(req.get("steps", 28)),
        guidance_scale=float(req.get("cfg", 7.5)),
        generator=gen, negative_prompt=neg,
    )
    # Sheet mode: the 2D Pixel Toolkit's signature output — an animation-ready
    # sprite sheet. We generate `frames` individual sprites (each at frame_size)
    # and tile them horizontally into one sheet, so a frame slot is meaningful.
    if mode == "sheet":
        frames = max(1, int(req.get("frames", 4)))
        fw = int(req.get("frame_size", w))
        fh = int(req.get("frame_size", h))
        fw = max(16, min(768, fw)); fh = max(16, min(768, fh))
        sheet = Image.new("RGBA", (fw * frames, fh))
        for f in range(frames):
            fseed = seed + f * 1013
            fgen = torch.Generator(device=DEVICE).manual_seed(fseed)
            fcommon = dict(common); fcommon["generator"] = fgen
            fcommon["width"], fcommon["height"] = fw, fh
            fout = pipe(prompt=prompt, **fcommon)
            fimg = fout.images[0].convert("RGBA")
            if palette and palette not in ("none", "raw"):
                fimg = posterize(fimg, palette)
            sheet.paste(fimg, (f * fw, 0))
        buf = io.BytesIO(); sheet.save(buf, format="PNG"); return buf.getvalue()

    out = pipe(prompt=prompt, **common)
    img = out.images[0].convert("RGBA")
    # Optional palette snap. "none"/"raw" = leave the model's own colours.
    if palette and palette not in ("none", "raw"):
        img = posterize(img, palette)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

    def _send(self, code, body, ctype="application/json"):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/health"):
            ready = PIPE is not None
            self._send(200, json.dumps({
                "ok": True,
                "ready": ready,
                "model": os.path.basename(CHECKPOINT),
                "lora": os.path.basename(LORA_PATH) if LORA_PATH else None,
            }).encode())
            return
        self._send(404, b"{}")

    def do_POST(self):
        if not self.path.startswith("/generate"):
            self._send(404, b"{}")
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length)
            req = json.loads(raw or b"{}")
            png = generate(req)
            self._send(200, png, "image/png")
        except Exception as e:
            self._send(500, json.dumps({"error": str(e)}).encode())

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    # Self-test mode: `ai_sidecar.exe selftest` generates one sprite to out.png
    # and exits. Used to validate the frozen binary without running the server.
    if len(sys.argv) > 1 and sys.argv[1] == "selftest":
        print("[sidecar] SELFTEST", flush=True)
        try:
            png = generate({
                "prompt": "cute slime monster, side view, full body",
                "size": 64, "seed": 7, "palette": "pico8",
                "model": "2dpixel", "steps": 16, "cfg": 7.5,
            })
            open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "out.png"), "wb").write(png)
            print(f"[sidecar] SELFTEST OK bytes={len(png)}", flush=True)
        except Exception as e:
            import traceback
            traceback.print_exc()
            print(f"[sidecar] SELFTEST FAIL: {e}", flush=True)
            sys.exit(1)
        sys.exit(0)

    print(f"[sidecar] Pixel Palace AI sidecar on port {PORT}", flush=True)
    print(f"[sidecar] checkpoint={CHECKPOINT} lora={LORA_PATH} device={DEVICE}", flush=True)
    # Eagerly load the model in a background thread so the first /generate is
    # fast and the app (which auto-launches us) doesn't have to wait on demand.
    import threading
    def _preload():
        try:
            load_pipeline()
            print("[sidecar] model preloaded and ready.", flush=True)
        except Exception as e:
            print("[sidecar] preload failed:\n" + traceback.format_exc(), flush=True)
    threading.Thread(target=_preload, daemon=True).start()
    try:
        # ThreadingHTTPServer so concurrent /health polls don't block a slow
        # /generate request (BaseHTTPServer is single-threaded and would
        # serialize them, which made Generate appear to hang).
        from http.server import ThreadingHTTPServer
        ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
    except Exception as e:
        print("[sidecar] SERVER FAILED to start:\n" + traceback.format_exc(), flush=True)
        sys.exit(1)
