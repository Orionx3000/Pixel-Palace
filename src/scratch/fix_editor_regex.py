import re

path = r"D:\PixelPalaceTauri\src\components\Editor.jsx"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# Find the div with minHeight:'100%' and justifyContent:'center'
# We want to replace justifyContent:'center' with nothing (or change to margin: auto in the child)
# Let's just find "justifyContent:'center'" in the context of the canvas wrapper.

pattern = r"(minHeight:'100%'.*?)justifyContent:'center'(.*?padding:'2rem')"
content = re.sub(pattern, r"\1\2", content)

pattern2 = r"(width:`\$\{Math\.max\(w,\s*h\)\*10\*zoom/100\}px`.*?)(display:'flex')"
content = re.sub(pattern2, r"margin:'auto', \1\2", content)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)
print("Regex replace complete for Editor.jsx")
