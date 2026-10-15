"""Generate the four local, illustrative analysis module thumbnails."""
from pathlib import Path
import math
import random

OUT = Path(__file__).resolve().parents[1] / 'public' / 'capabilities'
OUT.mkdir(parents=True, exist_ok=True)
rng = random.Random(2026)


def start(title, desc):
    return [f'''<svg xmlns="http://www.w3.org/2000/svg" width="640" height="300" viewBox="0 0 640 300" role="img" aria-labelledby="title desc">
<title id="title">{title}</title><desc id="desc">{desc}</desc>
<defs>
 <radialGradient id="bg"><stop stop-color="#174237"/><stop offset="1" stop-color="#071e18"/></radialGradient>
 <linearGradient id="height" x1="0" y1="1" x2="0" y2="0"><stop stop-color="#45b5dd"/><stop offset=".5" stop-color="#8ce8a4"/><stop offset="1" stop-color="#f4cf7b"/></linearGradient>
 <linearGradient id="bar" x2="0" y2="1"><stop stop-color="#94efb6"/><stop offset="1" stop-color="#268767"/></linearGradient>
</defs>
<rect width="640" height="300" fill="url(#bg)"/>
<g stroke="#8be9b2" stroke-opacity=".055" stroke-width="1">'''] + [
        f'<path d="M{x} 0V300"/>' for x in range(0, 641, 32)
    ] + [f'<path d="M0 {y}H640"/>' for y in range(12, 301, 32)] + ['</g>']


def circle(parts, x, y, r, color, opacity=1):
    parts.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.1f}" fill="{color}" opacity="{opacity:.2f}"/>')


def label(parts, x, y, text, color='#a4cbb9', size=12, anchor='start'):
    parts.append(f'<text x="{x}" y="{y}" fill="{color}" font-family="Segoe UI,Arial,sans-serif" font-size="{size}" letter-spacing="1.5" text-anchor="{anchor}">{text}</text>')


def save(name, parts):
    (OUT / f'{name}.svg').write_text('\n'.join(parts + ['</svg>']) + '\n', encoding='utf-8')


# Forest point cloud: discrete returns reveal canopy, stems and ground.
p = start('森林点云解析示意', '离散激光回波按高度着色，展示地面、树干及冠层结构。')
for i in range(12):
    x = 72 + i * 39
    p.append(f'<path d="M{x} 252l100 -56M72 {205+i*5}l446 28" fill="none" stroke="#67bca0" stroke-opacity=".15"/>')
trees = [(126, 225, 120, 39), (196, 213, 159, 48), (269, 224, 125, 40),
         (345, 228, 180, 55), (419, 211, 132, 42), (481, 231, 161, 47)]
for cx, base, height, radius in trees:
    for _ in range(50):
        z = rng.random() * height * .73
        circle(p, cx + rng.gauss(0, 1.6), base-z, rng.uniform(.7, 1.25), '#69ceae', .7)
    for _ in range(400):
        t = rng.random()
        z = height * (.25 + .75*t)
        spread = radius * (1-t)**.64
        x = cx + rng.uniform(-1, 1)*spread
        y = base-z + rng.gauss(0, 3.5)
        color = '#f4cf7b' if t > .74 else '#a3eab0' if t > .35 else '#4ab8cb'
        circle(p, x, y, rng.uniform(.65, 1.4), color, rng.uniform(.5, .95))
for _ in range(310):
    x, y = rng.uniform(80, 530), rng.uniform(228, 265)
    circle(p, x, y, .8, '#53a7b9', rng.uniform(.2, .6))
p.append('<path d="M85 199v59h46M85 258l-21 12" fill="none" stroke="#7bb9a1" stroke-width="1.5"/>')
label(p, 72, 191, 'Z', size=10)
p.append('<rect x="562" y="71" width="6" height="146" rx="3" fill="url(#height)"/>')
label(p, 580, 80, 'H', size=10)
label(p, 580, 219, '0', size=10)
label(p, 35, 31, 'LAS / POINT RETURNS', size=10)
save('point-cloud', p)


# Segmentation: separate point clusters, crown outlines and tree-top markers.
p = start('单木树冠分割示意', '俯视树冠以独立颜色区分，轮廓和中心十字表示单木分割范围与树顶。')
crowns = [(130, 93, 44, 36, '#6dd5bc'), (228, 72, 44, 33, '#f3cc78'),
          (321, 97, 46, 43, '#92bafa'), (425, 72, 45, 32, '#e4a7ca'),
          (516, 116, 43, 39, '#b3dc77'), (115, 191, 43, 39, '#9cb5ee'),
          (217, 168, 47, 44, '#dfaf77'), (321, 205, 45, 39, '#70dcb1'),
          (418, 172, 45, 43, '#68c6d9'), (509, 221, 45, 35, '#dfc776')]
for idx, (cx, cy, rx, ry, color) in enumerate(crowns, 1):
    coords = []
    for i in range(48):
        a = i/48*math.tau
        ripple = 1 + .06*math.sin(a*5+idx) + .04*math.cos(a*7)
        coords.append(f'{cx+math.cos(a)*rx*ripple:.1f},{cy+math.sin(a)*ry*ripple:.1f}')
    p.append(f'<polygon points="{" ".join(coords)}" fill="{color}" fill-opacity=".09" stroke="{color}" stroke-opacity=".75"/>')
    for _ in range(200):
        a, r = rng.random()*math.tau, math.sqrt(rng.random())*.94
        circle(p, cx+math.cos(a)*rx*r, cy+math.sin(a)*ry*r, rng.uniform(.65, 1.55), color, rng.uniform(.3, .9))
    p.append(f'<path d="M{cx-6} {cy}h12M{cx} {cy-6}v12" stroke="#e7fff1" stroke-width="1.4"/>')
    p.append(f'<rect x="{cx+8}" y="{cy-20}" width="25" height="17" rx="4" fill="#061b16" fill-opacity=".85"/>')
    label(p, cx+21, cy-8, f'{idx:02}', '#e2f9ec', 9, 'middle')
label(p, 35, 31, 'INDIVIDUAL TREE CROWNS', size=10)
save('tree-segmentation', p)


# Stand statistics: height profile, percentile lines and height histogram.
p = start('林分结构统计示意', '林分高度剖面叠加高度分位线，右侧直方图表示树高分布和林分统计。')
label(p, 35, 31, 'STAND HEIGHT DISTRIBUTION', size=10)
for y, txt in [(81, 'H95'), (145, 'H50')]:
    p.append(f'<path d="M85 {y}H355" stroke="#d9c583" stroke-opacity=".6" stroke-dasharray="5 5"/>')
    label(p, 39, y+4, txt, '#dbc98e', 10)
for i, h in enumerate([87, 128, 106, 157, 118, 142, 173, 127, 155, 109, 137, 91]):
    x, bottom = 96+i*22, 238
    p.append(f'<path d="M{x} {bottom}V{bottom-h+23}" stroke="#6db28c" stroke-opacity=".8" stroke-width="2"/>')
    p.append(f'<path d="M{x} {bottom-h}l-12 30h6l-10 23h32l-10 -23h6Z" fill="#6bd39a" fill-opacity="{.25+(i%3)*.12:.2f}" stroke="#8fe6ad" stroke-opacity=".5"/>')
p.append('<path d="M85 60v180h270" fill="none" stroke="#77aa95" stroke-opacity=".6"/>')
label(p, 200, 267, 'CANOPY PROFILE', size=10, anchor='middle')
p.append('<rect x="387" y="61" width="212" height="183" rx="10" fill="#061c17" fill-opacity=".7" stroke="#426b58"/>')
label(p, 405, 86, 'HEIGHT / m', '#bedfcd', 10)
for i, h in enumerate([28, 49, 84, 106, 79, 46, 22]):
    p.append(f'<rect x="{408+i*25}" y="{216-h}" width="17" height="{h}" rx="3" fill="url(#bar)" opacity="{.5+i*.06:.2f}"/>')
p.append('<path d="M405 218h176" stroke="#5b947c"/>')
label(p, 411, 234, '0', size=8)
label(p, 567, 234, '30', size=8)
label(p, 494, 267, 'DENSITY / COVER', size=10, anchor='middle')
save('stand-statistics', p)


# Ecology: tree measurements connected to component biomass estimates.
p = start('树木生态指标估算示意', '树高和胸径测量连接树干、树枝及树叶的生物量组分估算。')
label(p, 35, 31, 'TREE METRICS / BIOMASS', size=10)
p.append('<ellipse cx="223" cy="257" rx="93" ry="12" fill="#73c795" fill-opacity=".08"/>')
p.append('<path d="M212 241l7 -132h9l9 132-12 -4Z" fill="#bfa174" stroke="#d5bf95" stroke-opacity=".6"/>')
p.append('<path d="M222 242l-25 15m26 -13l6 17m-6 -17l30 10m-31 -5l-8 12" stroke="#9f956c" stroke-width="2" fill="none"/>')
for cx, cy, rx, ry in [(177, 140, 39, 33), (262, 139, 41, 35), (172, 109, 29, 31),
                       (221, 119, 47, 43), (264, 105, 31, 31), (204, 83, 33, 34), (237, 71, 30, 32)]:
    p.append(f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="#4daf79" fill-opacity=".35" stroke="#8ae0a2" stroke-opacity=".5"/>')
    for _ in range(35):
        a, r = rng.random()*math.tau, math.sqrt(rng.random())*.9
        circle(p, cx+math.cos(a)*rx*r, cy+math.sin(a)*ry*r, .9, '#aceab3', rng.uniform(.25, .8))
p.append('<path d="M117 47v193m-6 -193h12m-12 193h12" stroke="#9fe9b6" fill="none"/>')
label(p, 96, 146, 'H', '#c6efd2', 13)
p.append('<path d="M205 211h34m-34 -5v10m34 -10v10" stroke="#f0cf8a" fill="none"/>')
label(p, 247, 215, 'DBH', '#f0cf8a', 10)
p.append('<path d="M301 139h49m-6 -5l6 5-6 5" stroke="#85cea6" fill="none" stroke-width="1.5"/>')
p.append('<rect x="372" y="57" width="221" height="188" rx="12" fill="#071e18" fill-opacity=".75" stroke="#436d58"/>')
label(p, 391, 82, 'BIOMASS', '#c6efd2', 12)
for y, text, width, color in [(111, 'STEM', 124, '#92dfae'), (155, 'BRANCH', 78, '#58b99e'), (199, 'FOLIAGE', 48, '#d3cd86')]:
    label(p, 391, y, text, '#a7cbbb', 9)
    p.append(f'<rect x="391" y="{y+8}" width="180" height="7" rx="3.5" fill="#1c3b2e"/>')
    p.append(f'<rect x="391" y="{y+8}" width="{width}" height="7" rx="3.5" fill="{color}"/>')
label(p, 321, 284, 'H + DBH + SPECIES → MODEL ESTIMATE', size=9, anchor='middle')
save('ecological-estimation', p)
