"""Genera el fondo con franjas tribales de la app (public/pattern-*.svg).

Dos capas que se usan como máscara CSS y se colorean con el tema:
  - pattern-neutral.svg: líneas, puntos y rayados (blanco en oscuro, negro en claro)
  - pattern-accent.svg:  franjas rellenas, arcos, zigzag y logo (azul de marca)

Mosaico de 240×240 que se repite en horizontal y vertical: las ondas tienen
periodo 120 y los motivos, periodos que dividen 240, así que empalman.
El logo sale de logos/isotipo-128.png (isotipo reducido, con transparencia).
Uso: python3 scripts/make-pattern.py
"""
import base64
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
W = H = 240
PERIOD = 120  # ondulación de las franjas


def wave_x(x0, y, amp=2.5, phase=0.0):
    return x0 + amp * math.sin(2 * math.pi * y / PERIOD + phase)


def wave_line(x0, amp=2.5, phase=0.0, step=4):
    pts = [(wave_x(x0, y, amp, phase), y) for y in range(-4, H + 5, step)]
    return 'M' + 'L'.join(f'{x:.1f} {y}' for x, y in pts)


def band(x_left, x_right, amp=2.5, phase=0.0, step=4):
    """Contorno de una franja rellena con bordes ondulados."""
    left = [(wave_x(x_left, y, amp, phase), y) for y in range(-4, H + 5, step)]
    right = [(wave_x(x_right, y, amp, phase), y) for y in range(H + 4, -5, -step)]
    return 'M' + 'L'.join(f'{x:.1f} {y}' for x, y in left + right) + 'Z'


def circle_hole(cx, cy, r):
    return f'M{cx - r:.1f} {cy}a{r} {r} 0 1 0 {2 * r} 0a{r} {r} 0 1 0 {-2 * r} 0Z'


def leaf(cx, cy, rx, ry):
    """Hoja/ojo vertical (dos arcos)."""
    return f'M{cx} {cy - ry}Q{cx + rx * 2} {cy} {cx} {cy + ry}Q{cx - rx * 2} {cy} {cx} {cy - ry}Z'


neutral, accent = [], []

# 1 · Franja azul con agujeros redondos (los puntos blancos van en la capa neutra)
holes = ''.join(circle_hole(wave_x(12, y), y, 2.6) for y in range(10, H, 20))
accent.append(f'<path fill="#000" stroke="none" fill-rule="evenodd" d="{band(5, 19)}{holes}"/>')
neutral.append('<g fill="#000" stroke="none">' + ''.join(f'<circle cx="{wave_x(12, y):.1f}" cy="{y}" r="1.6"/>' for y in range(10, H, 20)) + '</g>')

# 2 · Línea ondulada fina
neutral.append(f'<path d="{wave_line(27, amp=3, phase=1.2)}"/>')

# 3 · Arcos concéntricos a lo largo de una línea
accent.append(f'<path d="M34 -4V{H + 4}"/>')
arcs = ''.join(f'M34 {y - r}A{r} {r} 0 0 1 34 {y + r}' for y in range(20, H, 40) for r in (5, 10, 15))
accent.append(f'<path d="{arcs}" stroke-width="1.6"/>')

# 4 · Línea de puntos
neutral.append('<g fill="#000" stroke="none">' + ''.join(f'<circle cx="{wave_x(58, y, 1.5):.1f}" cy="{y}" r="1.2"/>' for y in range(4, H, 8)) + '</g>')

# 5 · Franja azul con hojas caladas; dentro, en la capa neutra, contorno y rayas
leaves = ''.join(leaf(wave_x(76, y), y, 4.5, 12) for y in range(15, H, 30))
accent.append(f'<path fill="#000" stroke="none" fill-rule="evenodd" d="{band(66, 86, phase=0.6)}{leaves}"/>')
for y in range(15, H, 30):
    cx = wave_x(76, y)
    neutral.append(f'<path d="M{cx - 2.5:.1f} {y - 5}H{cx + 2.5:.1f}M{cx - 3.5:.1f} {y}H{cx + 3.5:.1f}M{cx - 2.5:.1f} {y + 5}H{cx + 2.5:.1f}" stroke-width="1.3"/>')

# 6 · Rayado horizontal en bloques, entre dos líneas onduladas
neutral.append(f'<path d="{wave_line(94, phase=2)}{wave_line(118, phase=2)}"/>')
hatch = ''
for y in range(3, H, 6):
    if (y // 6) % 6 == 5:  # hueco cada 5 rayas
        continue
    hatch += f'M{wave_x(98, y, phase=2):.1f} {y}H{wave_x(114, y, phase=2):.1f}'
neutral.append(f'<path d="{hatch}" stroke-width="1.4"/>')

# 7 · Zigzag con triángulos
zig = 'M126 -4' + ''.join(f'L{150 if (i % 2) else 126} {i * 12 - 4}' for i in range(1, 22))
accent.append(f'<path d="{zig}" stroke-width="2.2"/>')
tris = ''
for i in range(0, 20):
    y = i * 12 + 8
    if i % 2 == 0:  # triángulo en el hueco izquierdo
        tris += f'M128 {y - 5}L135 {y + 2}L128 {y + 9}Z'
    else:           # triángulo en el hueco derecho
        tris += f'M148 {y - 5}L141 {y + 2}L148 {y + 9}Z'
neutral.append(f'<path d="{tris}" stroke-width="1.3"/>')

# 8 · Línea recta + línea de trazos
neutral.append(f'<path d="M158 -4V{H + 4}"/>')
accent.append(f'<path d="M164 -2V{H + 2}" stroke-dasharray="6 6" stroke-width="2"/>')

# 9 · Franja azul punteada (textura de puntitos en la capa neutra)
accent.append(f'<path fill="#000" stroke="none" d="{band(172, 194, phase=3.5)}"/>')
dots = ''
for row, y in enumerate(range(4, H, 8)):
    for x in ((176, 183, 190) if row % 2 == 0 else (179.5, 186.5)):
        dots += f'<circle cx="{wave_x(x, y, phase=3.5):.1f}" cy="{y}" r="1"/>'
neutral.append(f'<g fill="#000" stroke="none">{dots}</g>')

# 10 · Franja del logo de Troko Bloco entre líneas onduladas
neutral.append(f'<path d="{wave_line(202, amp=2, phase=5)}{wave_line(230, amp=2, phase=5)}"/>')
logo = base64.b64encode((ROOT / 'logos/isotipo-128.png').read_bytes()).decode()
accent.append(f'<defs><image id="logo" width="22" height="21" href="data:image/png;base64,{logo}"/></defs>')
for y in range(30, H, 60):
    accent.append(f'<use href="#logo" x="{216 - 11}" y="{y - 11}"/>')
neutral.append('<g fill="#000" stroke="none">' + ''.join(f'<circle cx="216" cy="{y}" r="1.4"/>' for y in range(0, H, 60)) + '</g>')


def svg(parts, comment, fill):
    body = '\n  '.join(parts)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" fill="{fill}" stroke="#000" '
            f'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">\n'
            f'  <!-- {comment} (generado por scripts/make-pattern.py) -->\n  {body}\n</svg>\n')


(ROOT / 'public/pattern-neutral.svg').write_text(svg(neutral, 'Fondo: líneas, puntos y rayados', 'none'))
(ROOT / 'public/pattern-accent.svg').write_text(svg(accent, 'Fondo: franjas, arcos, zigzag y logo', 'none'))
print('ok')
