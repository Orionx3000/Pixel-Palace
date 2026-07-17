import os
import re

css_inject = """
    <style>
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap');
        :root{
          --bg:#03050a; --panel:#0a0f1c; --panel2:#0d1424;
          --line:rgba(120,200,255,.09); --line2:rgba(120,200,255,.16);
          --accent:#10b981; --txt:#cfe8ff; --dim:#5d6f8c; --dim2:#8499b8;
        }
        body {
          background: var(--bg);
          color: var(--txt);
          font-family: 'JetBrains Mono', ui-monospace, 'Cascadia Code', Consolas, monospace !important;
        }
        .canvas-container, .card, .panel {
          background: linear-gradient(180deg, var(--panel), var(--panel2)) !important;
          border: 1px solid var(--line) !important;
          border-radius: 14px;
        }
        input, select, button {
          font-family: inherit;
        }
        /* Override tailwind backgrounds */
        .bg-white, .bg-gray-50, .bg-gray-100, .bg-blue-50 {
          background: transparent !important;
        }
        .text-gray-800, .text-gray-900, .text-gray-700 {
          color: var(--txt) !important;
        }
        .text-gray-500, .text-gray-600 {
          color: var(--dim) !important;
        }
        .border-gray-200, .border-gray-300 {
          border-color: var(--line2) !important;
        }
    </style>
"""

tools_dir = r"D:\PixelPalaceTauri\public\tools"
files = ["asset_extractor.html", "WatercolorTransparencyTool.html", "watercolor_processor.html"]

for f in files:
    path = os.path.join(tools_dir, f)
    if not os.path.exists(path):
        print(f"Not found: {path}")
        continue
        
    with open(path, 'r', encoding='utf-8') as file:
        content = file.read()
        
    # Inject dark CSS before </head> if not already there
    if "--bg:#03050a" not in content:
        content = content.replace("</head>", css_inject + "\n</head>")
        
    # Rip out the bright tailwind body classes
    content = re.sub(r'<body class="([^"]*)bg-gray-100([^"]*)">', r'<body class="\1\2">', content)
    content = re.sub(r'<body class="([^"]*)bg-white([^"]*)">', r'<body class="\1\2">', content)
    content = re.sub(r'<body class="([^"]*)bg-gray-50([^"]*)">', r'<body class="\1\2">', content)
    
    with open(path, 'w', encoding='utf-8') as file:
        file.write(content)

print("Applied dark theme to HTML tools.")
