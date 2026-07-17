import os

path = r"D:\PixelPalaceTauri\src\components\Editor.jsx"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# Add return (
if "  return (\n    <div className=\"h-full flex flex-col w-full\"" not in content:
    content = content.replace(
        "    <div className=\"h-full flex flex-col w-full\" style={{background:'var(--bg)'}}>",
        "  return (\n    <div className=\"h-full flex flex-col w-full\" style={{background:'var(--bg)'}}>"
    )

with open(path, "w", encoding="utf-8") as f:
    f.write(content)
print("Added return (")

# Now let's recount divs to see if we're actually missing closing divs, or if it was just because of `<div` regex matching things it shouldn't.
import re
open_divs = len(re.findall(r'<div(?=[\s>])', content))
close_divs = len(re.findall(r'</div>', content))
print(f"Open: {open_divs}, Close: {close_divs}")
