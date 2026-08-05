from PIL import Image
from pathlib import Path
import shutil

src = Path(r"F:\всякое\Git\projects\superboyna\goodboy\assets\source-ava")
assets = Path(r"F:\всякое\Git\projects\superboyna\goodboy\assets")


def punch_black(im, thr=38):
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if max(r, g, b) < thr and abs(r - g) < 15 and abs(g - b) < 15:
                px[x, y] = (0, 0, 0, 0)
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    return im


def save_padded(im, path, size):
    pad = 16
    canvas = Image.new("RGBA", (im.width + pad * 2, im.height + pad * 2), (0, 0, 0, 0))
    canvas.paste(im, (pad, pad), im)
    canvas.thumbnail(size, Image.Resampling.LANCZOS)
    canvas.save(path, "PNG", optimize=True)
    print(path.name, canvas.size, "corner", canvas.getpixel((1, 1)))
    return canvas


for name, outname, size in [
    ("1.png", "ava-1.png", (720, 720)),
    ("2.png", "ava-2.png", (720, 720)),
    ("3.png", "ava-3.png", (720, 720)),
]:
    im = punch_black(Image.open(src / name))
    save_padded(im, assets / outname, size)

# Hero = lying cute dog (1), nav/icon = front face (2)
shutil.copy(assets / "ava-1.png", assets / "goodboy-logo.png")
shutil.copy(assets / "ava-2.png", assets / "goodboy-mark.png")
icon = Image.open(assets / "ava-2.png")
icon.thumbnail((192, 192), Image.Resampling.LANCZOS)
icon.save(assets / "goodboy-icon.png", "PNG", optimize=True)

for p in src.iterdir():
    low = p.name.lower()
    if "goodboy_rb" in low and p.suffix.lower() in (".png", ".jpg", ".jpeg"):
        im = punch_black(Image.open(p), thr=30)
        save_padded(im, assets / "brand-wordmark.png", (800, 800))
        print("from", p.name)

print("done")
