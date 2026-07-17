import os

for filename in ["Editor.jsx", "Studio.jsx"]:
    path = rf"D:\PixelPalaceTauri\src\components\{filename}"
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    # Remove ml-auto from the Underlay / Export group
    # Look for: className="flex items-center gap-1 shrink-0 ml-auto pl-2 border-l border-neutral-700"
    content = content.replace(
        'className="flex items-center gap-1 shrink-0 ml-auto pl-2 border-l border-neutral-700"',
        'className="flex items-center gap-1 shrink-0 pl-2 border-l border-neutral-700"'
    )
    
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"Fixed ml-auto in {filename}")
