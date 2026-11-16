# Импорт сгенерированной графики (art-raw/content_v1) в игру: public/v2/<кат>/<имя>.webp с прозрачностью
# и манифест src/data/art.ts.  Запуск: C:/Android/tools/upy/Scripts/python.exe -I scripts/import_art.py
# Светлое на тёмном → альфа по яркости; тёмное на светлом (мобы) → альфа по инверсии.
import os, sys, json
from PIL import Image, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "art-raw", "content_v1")
OUT = os.path.join(ROOT, "public", "v2")
SIZES = {"spell_fx": 256, "world": 256, "spell_icons": 128, "combo_icons": 128, "ultimate_icons": 128,
         "passives": 96, "synergies": 96, "classes": 128, "research": 96, "artifacts": 96}
# обрезка «подписи»/каймы по краю (доля с каждой стороны) — из ART_REVIEW
CROP = {"combo_06_demon_equation": 0.08, "combo_35_great_impact": 0.08, "ult_brimstone": 0.08, "ult_zero_nova": 0.08}


def lum(im):
    return ImageOps.grayscale(im)


def to_alpha(im, dark_on_light, solid=False, thr=26):
    im = im.convert("RGB")
    L = lum(im)
    if solid:
        # цветной предмет на чёрном: непрозрачно всё, что заметно ярче фона
        r, g, b = im.split()
        from PIL import ImageChops
        L = ImageChops.lighter(ImageChops.lighter(r, g), b)
    if dark_on_light:
        L = ImageOps.invert(L)
    # порог: фон 0..~0.1 → прозрачный, дальше линейно
    a = L.point(lambda v: 0 if v < thr else min(255, int((v - thr) * 255 / 200))) if not solid else L.point(lambda v: 0 if v < 18 else min(255, int((v - 18) * 255 / 40)))
    if not dark_on_light and not solid:
        a = a.point(lambda v: min(255, int(v * 1.6)))
    if dark_on_light:
        rgb = Image.new("RGB", im.size, (14, 14, 16))  # чернила
    else:
        # «распремножаем» цвет, чтобы полупрозрачные края не темнели
        px, ap = im.load(), a.load()
        rgb = im.copy(); rp = rgb.load()
        w, h = im.size
        for y in range(h):
            for x in range(w):
                al = ap[x, y]
                if 0 < al < 255:
                    r, g, b = px[x, y]
                    k = 255 / max(al, 1)
                    rp[x, y] = (min(255, int(r * k)), min(255, int(g * k)), min(255, int(b * k)))
    out = rgb.convert("RGBA"); out.putalpha(a)
    return out


def main():
    manifest = {}
    for cat, size in SIZES.items():
        d = os.path.join(SRC, cat)
        if not os.path.isdir(d):
            continue
        od = os.path.join(OUT, cat); os.makedirs(od, exist_ok=True)
        for fn in sorted(os.listdir(d)):
            if not fn.endswith(".png"):
                continue
            key = fn[:-4]
            im = Image.open(os.path.join(d, fn)).convert("RGB")
            c = CROP.get(key)
            if c:
                w, h = im.size; im = im.crop((int(w * c), int(h * c), int(w * (1 - c)), int(h * (1 - c))))
            im = im.resize((size, size), Image.LANCZOS)
            corners = [im.getpixel(p) for p in [(1, 1), (size - 2, 1), (1, size - 2), (size - 2, size - 2)]]
            bright = sum(sum(c) / 3 for c in corners) / 4 > 160
            # серый (не чёрный) фон, напр. pas_39, res_264: порог альфы поднимаем над яркостью края,
            # иначе вокруг иконки остаётся полупрозрачный серый квадрат
            thr = 26
            if not bright:
                edge = sorted(lum(im).getpixel(p) for p in [(1, 1), (size - 2, 1), (1, size - 2), (size - 2, size - 2), (size // 2, 1), (1, size // 2), (size - 2, size // 2), (size // 2, size - 2)])
                thr = max(26, edge[len(edge) // 2] + 16)
            out = to_alpha(im, bright, solid=(cat == 'world' and not bright), thr=thr)
            out.save(os.path.join(od, key + ".webp"), "WEBP", quality=82, method=6)
            manifest[key] = f"v2/{cat}/{key}.webp"
    ts = ["// АВТОГЕНЕРАЦИЯ scripts/import_art.py — ключ картинки → путь в public/", "export const ART: Record<string, string> = " + json.dumps(manifest, ensure_ascii=False, indent=1) + ";", ""]
    os.makedirs(os.path.join(ROOT, "src", "data"), exist_ok=True)
    open(os.path.join(ROOT, "src", "data", "art.ts"), "w", encoding="utf-8").write("\n".join(ts))
    print("images", len(manifest))


main()
