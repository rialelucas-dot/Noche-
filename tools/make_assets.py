"""Genera la carpeta assets/ del juego.

Baja texturas y el cielo HDR de Poly Haven (licencia CC0), los optimiza y
crea las texturas de follaje (hojas, ramas de pino y pasto) con transparencia.

Uso:  python3 tools/make_assets.py [carpeta_cache]
"""
import json, math, os, random, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets')
CACHE = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, '.cache-assets')
os.makedirs(OUT, exist_ok=True); os.makedirs(CACHE, exist_ok=True)
UA = 'Mozilla/5.0'

def get(url, path):
    if not os.path.exists(path):
        subprocess.run(['curl', '-sS', '-L', '-A', UA, '-o', path, url], check=True)
    return path

def api(kind, ident):
    p = get(f'https://api.polyhaven.com/{kind}/{ident}', os.path.join(CACHE, f'{kind}_{ident}.json'))
    return json.load(open(p))

# ── texturas PBR: color, normal (GL) y ARM (oclusión, rugosidad, metal) ──
TEX = {
    'grass': 'rocky_terrain_02', 'dirt': 'forest_ground_04', 'rock': 'rock_face_03', 'sand': 'coast_sand_01',
    'plaster': 'plastered_wall_04', 'roof': 'clay_roof_tiles_02', 'floor': 'wood_floor_worn',
    'concrete': 'concrete_wall_008', 'bark': 'bark_brown_02', 'pinebark': 'pine_bark',
}
for short, ident in TEX.items():
    files = api('files', ident)
    for key, suffix, q in (('Diffuse', 'd', 80), ('nor_gl', 'n', 84), ('arm', 'r', 78)):
        src = get(files[key]['1k']['jpg']['url'], os.path.join(CACHE, f'{ident}_{key}.jpg'))
        im = Image.open(src).convert('RGB')
        size = 1024 if suffix != 'r' else 512
        im.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, f'{short}_{suffix}.jpg'), quality=q, optimize=True)
    print('textura', short)

# ── cielo: el HDR se pasa a JPG (fondo y luz ambiental) y la dirección del sol a un JSON ──
sky = api('files', 'table_mountain_1_puresky')['hdri']['2k']['hdr']['url']
hdr = get(sky, os.path.join(CACHE, 'table_mountain_1_puresky_2k.hdr'))
raw = os.path.join(CACHE, 'sky.raw')
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', hdr, '-f', 'rawvideo', '-pix_fmt', 'gbrpf32le', raw], check=True)
SW, SH = 2048, 1024
pl = np.fromfile(raw, dtype='<f4').reshape(3, SH, SW)
rgb = np.stack([pl[2], pl[0], pl[1]], axis=-1)  # planos g, b, r -> r, g, b
lum = rgb @ np.array([0.2126, 0.7152, 0.0722])
py, px = np.unravel_index(np.argmax(lum), lum.shape)
u, v = (px + 0.5) / SW, 1 - (py + 0.5) / SH
th, ph = (u - 0.5) * 2 * math.pi, (v - 0.5) * math.pi
sun = [math.cos(ph) * math.cos(th), math.sin(ph), math.cos(ph) * math.sin(th)]
hor = rgb[int(SH * 0.47):int(SH * 0.53)].reshape(-1, 3).mean(0); fog = (hor / hor.max() * 0.85).tolist()
c = np.clip(rgb * 0.75, 0, None); c = np.clip((c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14), 0, 1)  # ACES aproximado
c = np.where(c <= 0.0031308, 12.92 * c, 1.055 * np.power(c, 1 / 2.4) - 0.055)
Image.fromarray((c * 255 + 0.5).astype(np.uint8), 'RGB').save(os.path.join(OUT, 'sky.jpg'), quality=88, optimize=True)
json.dump({'sun': sun, 'fog': fog}, open(os.path.join(OUT, 'sky.json'), 'w'))
print('cielo listo, sol', [round(x, 3) for x in sun])

random.seed(7)

# ── hojas: se recortan las hojas reales del atlas de island_tree_02 (fondo negro) ──
leaf_src = get('https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/island_tree_02/island_tree_02_leaves_diff_1k.jpg',
               os.path.join(CACHE, 'island_tree_02_leaves_diff_1k.jpg'))
atlas = np.asarray(Image.open(leaf_src).convert('RGB')).astype(np.float32)
lum = atlas.max(axis=2)
small = lum[::4, ::4] > 22
seen = np.zeros_like(small, dtype=bool); boxes = []
H, W = small.shape
for y in range(H):
    for x in range(W):
        if small[y, x] and not seen[y, x]:
            stack = [(y, x)]; seen[y, x] = True; ys = []; xs = []
            while stack:
                cy, cx = stack.pop(); ys.append(cy); xs.append(cx)
                for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                    if 0 <= ny < H and 0 <= nx < W and small[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True; stack.append((ny, nx))
            if len(ys) > 120:
                boxes.append((min(xs) * 4, min(ys) * 4, max(xs) * 4 + 4, max(ys) * 4 + 4))
leaves = []
for (x0, y0, x1, y1) in boxes:
    rgb = atlas[y0:y1, x0:x1]
    a = np.clip((rgb.max(axis=2) - 14) / 22, 0, 1) * 255
    rgba = np.dstack([rgb, a]).astype(np.uint8)
    leaves.append(Image.fromarray(rgba, 'RGBA'))
print('hojas recortadas', len(leaves))

def tint(im, r, g, b):
    arr = np.asarray(im).astype(np.float32); arr[..., 0] *= r; arr[..., 1] *= g; arr[..., 2] *= b
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGBA')

S = 2048
card = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(card)
twigs = []
for k in range(7):  # ramitas desde abajo hacia afuera
    ang = -math.pi / 2 + (k - 3) * 0.32 + random.uniform(-0.1, 0.1)
    x, y = S / 2 + random.uniform(-60, 60), S * 0.97
    pts = [(x, y)]
    for s in range(14):
        ang += random.uniform(-0.08, 0.08); x += math.cos(ang) * S * 0.055; y += math.sin(ang) * S * 0.055; pts.append((x, y))
    twigs.append(pts); d.line(pts, fill=(78, 60, 44, 255), width=10)
for n in range(260):
    pts = random.choice(twigs); i = random.randint(3, len(pts) - 1); px, py = pts[i]
    lf = random.choice(leaves); sc = random.uniform(0.55, 0.9) * (S / 2048)
    lf = lf.resize((max(4, int(lf.width * sc)), max(4, int(lf.height * sc))), Image.LANCZOS)
    t = random.uniform(0.72, 1.08); lf = tint(lf, t * random.uniform(0.85, 1.0), t, t * random.uniform(0.7, 0.95))
    lf = lf.rotate(random.uniform(-80, 80), expand=True, resample=Image.BICUBIC)
    card.alpha_composite(lf, (int(px - lf.width / 2 + random.uniform(-90, 90)), int(py - lf.height / 2 + random.uniform(-90, 90))))
card = card.resize((1024, 1024), Image.LANCZOS)
card.save(os.path.join(OUT, 'leaves.webp'), quality=88, method=6)

# ── rama de pino dibujada aguja por aguja ──
card = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(card)
d.line([(S / 2, S * 0.98), (S / 2, S * 0.04)], fill=(70, 52, 36, 255), width=14)
for k in range(34):
    y0 = S * (0.93 - k * 0.026); side = 1 if k % 2 else -1; length = S * (0.44 - k * 0.0105)
    ang = -math.pi / 2 + side * random.uniform(0.75, 1.0)
    x, y = S / 2, y0; pts = [(x, y)]
    for s in range(12):
        x += math.cos(ang) * length / 12; y += math.sin(ang) * length / 12; ang += side * 0.02; pts.append((x, y))
    d.line(pts, fill=(66, 50, 34, 255), width=6)
    for (px, py) in pts[1:]:
        for m in range(16):
            a = ang + random.uniform(-1.4, 1.4); l = random.uniform(50, 95)
            g = random.randint(62, 104); col = (int(g * 0.55), g, int(g * 0.4), 255)
            d.line([(px, py), (px + math.cos(a) * l, py + math.sin(a) * l)], fill=col, width=6)
card = card.resize((1024, 1024), Image.LANCZOS)
card.save(os.path.join(OUT, 'needles.webp'), quality=88, method=6)

# ── matas de pasto ──
S2 = 1024
card = Image.new('RGBA', (S2, S2), (0, 0, 0, 0)); d = ImageDraw.Draw(card)
for n in range(70):
    x0 = random.uniform(S2 * 0.1, S2 * 0.9); h = random.uniform(S2 * 0.45, S2 * 0.97); w = random.uniform(10, 22)
    bend = random.uniform(-0.35, 0.35) * h
    base = np.array([random.uniform(0.32, 0.42), random.uniform(0.42, 0.55), random.uniform(0.16, 0.22)]) * 255
    tip = np.array([random.uniform(0.62, 0.78), random.uniform(0.68, 0.8), random.uniform(0.32, 0.45)]) * 255
    segs = 10
    for s in range(segs):
        t0, t1 = s / segs, (s + 1) / segs
        def P(t, side):
            x = x0 + bend * t * t + side * w * (1 - t) / 2
            return (x, S2 - t * h)
        col = tuple(int(v) for v in base + (tip - base) * t0) + (255,)
        d.polygon([P(t0, -1), P(t0, 1), P(t1, 1), P(t1, -1)], fill=col)
card = card.filter(ImageFilter.GaussianBlur(0.6)).resize((512, 512), Image.LANCZOS)
card.save(os.path.join(OUT, 'grass.webp'), quality=88, method=6)
print('follaje listo')
total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
print(f'assets/: {len(os.listdir(OUT))} archivos, {total / 1e6:.1f} MB')
