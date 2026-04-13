import re
import sys

path = r's:\Projects\LightshowGenerator\src\components\LayoutGridEditor.jsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Pattern to match the grid ID resolution block
# Using a more flexible regex for whitespace and backticks
pattern = r'(\s+)let carId = cell\?\.manualId;\s+if \(!carId\) \{\s+carId = data\.colFirst\s+\?\s+`\$\{data\.colIds\[c\]\}\$\{data\.rowIds\[r\]\}`\s+:\s+`\$\{data\.rowIds\[r\]\}\$\{data\.colIds\[c\]\}`;\s+\}'

replacement = r'\1const colId = data.colIds[c] || "";\n\1const rowId = data.rowIds[r] || "";\n\1const carId = resolveId(cell?.manualId || "{COL}{ROW}", colId, rowId);'

new_content = re.sub(pattern, replacement, content)

if new_content != content:
    with open(path, 'w', encoding='utf-8', newline='') as f:
        f.write(new_content)
    print("Successfully updated LayoutGridEditor.jsx")
else:
    # Try a simpler match if the complex one fails
    print("Could not find the complex pattern, trying a simpler one...")
    pattern2 = r'let carId = cell\?\.manualId;.*?if \(!carId\) \{.*?data\.colFirst.*?\}'
    new_content2 = re.sub(pattern2, r'const colId = data.colIds[c] || ""; const rowId = data.rowIds[r] || ""; const carId = resolveId(cell?.manualId || "{COL}{ROW}", colId, rowId);', content, flags=re.DOTALL)
    if new_content2 != content:
        with open(path, 'w', encoding='utf-8', newline='') as f:
           f.write(new_content2)
        print("Successfully updated LayoutGridEditor.jsx with simple pattern")
    else:
        print("Could not find any pattern in LayoutGridEditor.jsx")
