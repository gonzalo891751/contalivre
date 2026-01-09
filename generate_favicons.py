from PIL import Image
import os

source_path = r"C:/Users/gonza/.gemini/antigravity/brain/ad6a624e-8da4-4e07-a2a6-0f22879eadea/uploaded_image_1767998825526.png"
output_dir = r"d:/Git/ContaLivre/public"

if not os.path.exists(output_dir):
    os.makedirs(output_dir)

img = Image.open(source_path)

# Generate PNGs
sizes = [
    (16, "favicon-16x16.png"),
    (32, "favicon-32x32.png"),
    (180, "apple-touch-icon.png"),
    (192, "android-chrome-192x192.png"),
    (512, "android-chrome-512x512.png")
]

for size, name in sizes:
    resized = img.resize((size, size), Image.Resampling.LANCZOS)
    resized.save(os.path.join(output_dir, name))
    print(f"Generated {name}")

# Generate ICO (multi-size)
icon_sizes = [(16, 16), (32, 32), (48, 48)]
img.save(os.path.join(output_dir, "favicon.ico"), sizes=icon_sizes)
print("Generated favicon.ico")
