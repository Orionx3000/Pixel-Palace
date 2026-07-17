import os

tools_dir = r"D:\PixelPalaceTauri\public\tools"
files = ["asset_extractor.html", "WatercolorTransparencyTool.html", "watercolor_processor.html"]

for f in files:
    path = os.path.join(tools_dir, f)
    if not os.path.exists(path):
        continue
        
    with open(path, 'r', encoding='utf-8') as file:
        content = file.read()
        
    # Fix the aggressive CSS that destroyed the grid
    content = content.replace(".canvas-container, .card, .panel {", ".card, .panel {")
    
    # Add a specific dark grid for .canvas-container if it doesn't have one
    if "dark-canvas-grid" not in content:
        dark_grid_css = """
        .canvas-container {
            background-color: #1a1a1a !important;
            background-image: linear-gradient(45deg,#111 25%,transparent 25%,transparent 75%,#111 75%,#111),linear-gradient(45deg,#111 25%,transparent 25%,transparent 75%,#111 75%,#111) !important;
            background-size: 20px 20px !important;
            background-position: 0 0,10px 10px !important;
            border: 1px solid var(--line) !important;
        } /* dark-canvas-grid */
        """
        content = content.replace("</style>", dark_grid_css + "</style>")
    
    with open(path, 'w', encoding='utf-8') as file:
        file.write(content)

print("Fixed canvas grids on HTML tools.")
