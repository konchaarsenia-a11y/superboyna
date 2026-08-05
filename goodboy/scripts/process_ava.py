"""Сборка бренд-ассетов Goodboy: только лапка + GOODBOY, без мультяшных собак."""
from PIL import Image
from pathlib import Path

src = Path(r"F:\всякое\Git\projects\superboyna\goodboy\assets\source-ava")
assets = Path(r"F:\всякое\Git\projects\superboyna\goodboy\assets")


def punch_black(im, thr=30):
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
    print(path.name, canvas.size)
    return canvas


def crop_paw(im):
    """Верхняя часть вордмарка — лапка без текста."""
    w, h = im.size
    return im.crop((0, 0, w, int(h * 0.62)))


word = None
for p in sorted(src.iterdir()):
    low = p.name.lower()
    if "goodboy_rb" in low and p.suffix.lower() in (".png", ".jpg", ".jpeg"):
        word = punch_black(Image.open(p), thr=30)
        print("source:", p.name)
        break

if word is None:
    raise SystemExit("не найден goodboy_rb* в source-ava")

save_padded(word, assets / "logo-wordmark-v3.png", (800, 800))
save_padded(word, assets / "brand-wordmark.png", (800, 800))
paw = crop_paw(word)
save_padded(paw, assets / "logo-mark-v3.png", (256, 256))
save_padded(paw, assets / "logo-icon-v3.png", (192, 192))
print("done — dogs not used")
