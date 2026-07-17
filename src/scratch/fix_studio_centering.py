import os

path = r"D:\PixelPalaceTauri\src\components\Studio.jsx"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace(
    'className="w-full h-full overflow-auto p-6 flex items-start justify-center"',
    'className="w-full h-full overflow-auto p-6 flex"'
)

content = content.replace(
    '<canvas ref={canvasRef}',
    '<canvas ref={canvasRef}\n                                  style={{ margin: "auto", width:`${480*zoom/100}px`, imageRendering:"pixelated", backgroundColor:"transparent" }}'
)
# remove the old style inline
content = content.replace(
    "style={{ width:`${480*zoom/100}px`, imageRendering:'pixelated', \nbackgroundColor:'transparent' }}\n",
    ""
)
content = content.replace(
    "style={{ width:`${480*zoom/100}px`, imageRendering:'pixelated', backgroundColor:'transparent' }}\n",
    ""
)
content = content.replace(
    "style={{ width:`${480*zoom/100}px`, imageRendering:'pixelated', \n                                  backgroundColor:'transparent' }}",
    ""
)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)
print("Studio canvas centering fixed")
