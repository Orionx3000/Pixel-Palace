# Pixel Palace

Pixel Palace is a self contained pixel art studio for game developers. It combines hand drawn sprite editing, animation, tilemap building, collision markup, asset management and a built in local AI image generator into one desktop app built with Tauri. The AI runs entirely on your machine using your own Stable Diffusion models. No account, no cloud, no internet required for generation.

## What is included

The app is organized as a set of tabs in the left rail. Each tab is either a native React panel or an embedded HTML tool.

- Art Hub: central gallery of every image you create or import. Images flow between tools through the hub.
- Editor: the core pixel editor. Layers, animation frames, full drawing toolset and palette control.
- Forge: a focused sprite/texture forging tool with its own palette and quick drawing primitives.
- Studio: the full layered animation studio. Sprite sheets, GIF/APNG export, frames timeline, onion skin.
- Animator: sprite sheet slicer and animation player. Imports a sheet, slices it into frames, exports GIF and engine ready atlases.
- Water: watercolor style pixelation. Soft painterly downscale of a photo or image into a palette.
- Alpha: transparency tool. Removes a background color and builds an alpha mask.
- Extract: asset extractor. Slices or pulls objects and sprites out of a source image.
- Trace: scan trace tool. Vectorizes or pixel traces an imported scan or drawing.
- Pixscii: procedural 2D sprite and animation studio. Cel shaded ramps, pose based frames, real game palettes, plus an optional local AI hook.
- AI Studio: the generalized local AI generator. Drives your SD1.5 and 2D Pixel Toolkit models at native resolution for sprites, sheets, tilesets, scenes and maps.
- Tilemap: ID based tilemap editor inspired by TileMaker DOT. Tiles, objects and NPCs placed by ID with automatic depth sorting, chunk system and Tiled (.tmx) export.
- Collision: overlay collision shapes on a photo or on the tilemap grid. Categorize each region as platform, hazard or trigger.
- Markup: annotate maps with text and shape markup.
- Markers: place annotated positions such as player start, enemy, item, exit and save.
- Build: assemble tiles, collision and markers into an exportable project.
- Graph: node graph for linking pages and scenes.
- Game: playable preview of your built level.
- Options: UI accent color, shared grid and tile size defaults.
- Pipe: shows the full asset pipeline from drawing to engine export.
- Info: this documentation, shown inside the app.

## Editor details

The Editor is the core drawing surface.

- Pencil: paints pixels at the current brush size and color.
- Eraser: erases pixels back to transparent on the active layer.
- Eyedropper / Pick: click any pixel to copy its color into the active color.
- Fill / Bucket: flood fills a contiguous region of the same color.
- Line: draws a straight pixel perfect line from press to release.
- Rectangle / Rounded: draws a rectangle or rounded rectangle, filled or outline.
- Ellipse / Circle: draws an ellipse or circle.
- Shape presets: inserts preset geometric shapes quickly.
- Natural shapes: generates organic shapes like clouds and mountains using Perlin noise.
- Effects: opens effects such as greeble/auto texture, outline, bevel, posterize and hue shift.
- Brush size: 1 to 17 pixels per dab.
- Zoom: scales the view only, the underlying image keeps its real size.
- Layers: a stack of drawings, each with its own visibility, opacity and frame list.
- Frames timeline: animation strip for the selected layer. Add frames to build an animation.
- Palette / Presets: current color swatches and quick palette presets (P1 to P5).

## Studio and Forge details

Forge and Studio share the same drawing primitives tuned for sprite work.

- Drawing primitives: pencil, eraser, fill, line, rect, circle.
- Palettes: 16 color palettes with retro and console themes.
- Frames: add, duplicate, delete and play frames, with onion skin for animation.
- Upload Photo: loads an image to trace or sample colors from.

Studio extends this into a full layered animation workspace:

- Sprite sheet: all frames tiled into one PNG.
- GIF / APNG: animated image, composited.
- Godot .tscn / .tres: scene and resource for Godot.
- JSON: raw project data.

## Photo to pixel details

- Water: watercolor style pixelation, a soft painterly downscale to a palette.
- Alpha: transparency tool that removes a background color and makes an alpha mask.
- Extract: asset extractor that slices or pulls objects and sprites out of a source image.
- Trace: scan trace that pixel traces an imported scan or drawing.

## Tilemap details

The Tilemap tab is an ID based map editor inspired by the TileMaker DOT workflow.

- Tile strip: your collected tiles, click to select the active tile.
- Paint grid: click or drag to place the selected tile.
- Tile size / grid: sets the pixel size of each tile and the map dimensions.
- Tiles, objects, NPCs: three layers, each placed by numeric ID.
- Automatic depth sorting: the editor analyzes the bottom most non transparent pixel of each object and resolves front to back rendering for you.
- Chunk system: select any area and save it as a reusable chunk, then stamp it back into any project.
- Isometric mode: square grid projects to diamonds.
- Tiled export: writes a .tmx map plus a tilesheet, ready to open in Tiled or import into Godot, Unity or GameMaker.
- Notes: annotate the map with colored text notes at grid positions.

## Assets, Collision, Markers details

- Gallery: thumbnails of collected assets.
- Folder picker: imports a local folder of images into the gallery.
- Send: routes the selected asset to another tab.
- Collision photo mode: overlays collision shapes on a photo or imported image.
- Collision level mode: overlays collision on the tilemap grid.
- Shape types: platform, hazard and trigger categories for each collision region.
- Markers: player start (spawn point), enemy, item, exit and save positions.

## Built in local AI

Pixel Palace ships with a local AI image generator. It is not a cloud service. It runs a Stable Diffusion pipeline on your GPU using models you already own.

### How it runs

The AI is served by a Python sidecar (ai_sidecar/sidecar.py) launched automatically when the app opens. The frontend talks to it over a local HTTP API at 127.0.0.1:18755. The sidecar loads your SD1.5 checkpoint and your 2D Pixel Toolkit LoRA, then generates pixel art at the resolution you request.

On the packaged app the sidecar runs from a bundled Python virtual environment (ai_sidecar/venv). No separate Python install is required for the end user.

### Models

The AI expects your own model files. By default it looks for:

- D:\allInOnePixelModel_v1.ckpt (an SD1.5 checkpoint)
- D:\pixel sprites.safetensors (the 2D Pixel Toolkit LoRA, trigger words pixel, xiangsu)
- D:\pixel_f2.safetensors (an alternate LoRA)

You can override these with the environment variables PP_SD_CKPT and PP_SD_LORA. These model files are NOT included in the repository. You supply them.

### AI Studio

AI Studio is the main AI interface.

- Prompt: describes what to generate.
- Model preset: 2D Pixel Toolkit (anchor), All in One Pixel, or M Pixel.
- Output mode: Sprite, Sheet, Tileset, Scene, Map.
- Width and Height: 16 to 512 pixels, independent.
- Sampler: Euler a, DPM++ 2M, DPM++ 2M Karras, DPM++ SDE, Euler, DDIM, Heun, LMS.
- Steps and CFG: generation steps and classifier free guidance.
- Palette snap: optional posterize to a known palette (PICO 8, Endesga, Game Boy, Stardew, Starbound, SNES, Hero, Slime, Fire, Forest, Stone, Gold, Ice, Poison) or leave the model colors raw.
- Seed: fixed seed for reproducibility, or random.
- 2D Pixel Toolkit frame slot: for Sheet mode, sets the number of frames and the frame size. The sidecar generates each frame as its own native resolution sprite and tiles them into one animation ready sheet.
- AI console: live log of sidecar state and generation progress.
- Send to: routes the result into Pixscii, Editor, Studio, Animator, Map Gen or Asset Extract.

Trigger words, sampler choice and the pixel art negative prompt are applied under the hood so you do not have to remember them. The model output is shown at its native resolution with no forced downscale, symmetry or procedural posing.

### Other AI hooks

- Pixscii Generate (AI): sends the prompt to the sidecar and displays the result at native resolution, then tiles it across animation frames.
- Map Generator AI Tile: generates a seamless tile via the sidecar and overlays it on the map.
- Editor AI: generates a sprite through the sidecar and receives it into the editor.

## Engine integrations

Pixel Palace can launch external game engines that are bundled with the app.

- OpenStarbound: launches the OpenStarbound engine (renamed ostarbound.exe) with your mod assets.
- Solarus: launches the Solarus engine editor, runner or launcher with a quest folder.
- Tiled: launches the Tiled map editor so you can lay out maps from exported .tmx files.

These engines are bundled as binaries. Their source code lives in their own upstream repositories. See the licenses section.

## Repository layout

- src/: React shell, tabs and native panels (Editor host, Tilemap, Collision, Game, Graph, Build).
- public/tools/: the embedded HTML tools (Editor, Forge, Studio, Animator, Water, Alpha, Extract, Trace, Pixscii, AI Studio, Map Generator).
- src-tauri/: the Rust/Tauri backend, engine launchers and the AI sidecar launcher.
- ai_sidecar/sidecar.py: the local AI server.

## What is NOT in this repository

To keep the repo small and to respect licensing, the following are excluded:

- AI model checkpoints and LoRAs (.ckpt, .safetensors). You supply these.
- The Python virtual environment (ai_sidecar/venv).
- Frozen sidecar executables and build output.
- Bundled engine binaries (OpenStarbound, Solarus, Tiled) and node_modules / target build folders.

## Setup for development

1. Install Node.js and Rust.
2. Install Python 3.11 and create the venv: `python -m venv ai_sidecar/venv` then `ai_sidecar\venv\Scripts\pip install torch diffusers transformers peft safetensors tokenizers pillow`.
3. Place your model files at the default D:\ paths or set PP_SD_CKPT / PP_SD_LORA.
4. Run `npm install` then `npm run tauri dev`.

## Licenses and attribution

Pixel Palace source code is licensed under the MIT License.

Third party components bundled or used:

- TileMaker DOT (Tilemap workflow inspiration): MIT License, Andrei Voia, https://github.com/andrei-voia/TileMakerDOT. The Tilemap tab in this project is an independent reimplementation of the ID based, depth sorted workflow and is not a copy of the upstream source.
- Tiled (bundled map editor): GPL version 2 or later, https://www.tilededitor.org. libtiled is BSD 2 clause. See tiled/LICENSE.GPL.txt and tiled/LICENSE.BSD.txt.
- Solarus (bundled engine): GPL version 3, https://www.solarus-games.org.
- OpenStarbound (bundled engine): OpenStarbound license. Note that Starbound game assets are proprietary and are NOT redistributed; only the engine binary is bundled.
- Stable Diffusion models: generated output is subject to the licenses of the specific checkpoints and LoRAs you supply (for example the RAIL M license for All in One Pixel Model). You are responsible for complying with those licenses.
- PyTorch, Diffusers, Transformers, PEFT, safetensors: their respective open source licenses (BSD / Apache 2.0).

If you modify the source of any bundled engine, you must comply with that engine's license and, where required (GPL), publish your modified source.
