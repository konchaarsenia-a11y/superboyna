"""Сборка бренд-ассетов Goodboy: маскот в оранжевом круге (ГБ / attached brand)."""
from pathlib import Path
import shutil

src = Path(r"F:\всякое\Git\projects\superboyna\goodboy\assets\source-ava")
assets = Path(r"F:\всякое\Git\projects\superboyna\goodboy\assets")

# Предпочтительно: файл, который прислал владелец / ГБ.png
candidates = [
    assets / "goodboy-brand.png",
    src / "ГБ.png",
]
brand = None
for p in candidates:
    if p.exists():
        brand = p
        break
if brand is None:
    raise SystemExit("нет goodboy-brand.png / ГБ.png")

for name in (
    "logo-wordmark-v3.png",
    "logo-mark-v3.png",
    "logo-icon-v3.png",
    "brand-wordmark.png",
    "goodboy-brand.png",
):
    shutil.copyfile(brand, assets / name)
    print("copied", name, "from", brand.name)
print("done — exact file, no rewrite")
