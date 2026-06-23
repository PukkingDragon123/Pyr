#!/usr/bin/env python3
"""Render the deploy thumbnail (16:9) and favicon (1:1) in the game's low-poly
isometric style. No AI generation (workspace out of credits) — pure Pillow."""
import math, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = os.path.join(os.path.dirname(__file__), "..", "game", "assets")
os.makedirs(OUT, exist_ok=True)

def hx(c): return tuple(int(c[i:i+2], 16) for i in (1, 3, 5))
def lerp(a, b, t): return tuple(int(a[i] + (b[i]-a[i])*t) for i in range(3))

# wonder 0 (Step Pyramid) palette — matches src/data.js
TOP, RIGHT, LEFT = hx("#ece0c2"), hx("#cdba93"), hx("#a2855a")
GOLD = hx("#eac24f")

def vgrad(img, top, bot, y0=0, y1=None):
    d = ImageDraw.Draw(img); y1 = y1 or img.height
    for y in range(y0, y1):
        t = (y - y0) / max(1, (y1 - y0))
        d.line([(0, y), (img.width, y)], fill=lerp(top, bot, t))

def project(gx, gy, gz, ox, oy, u):
    half, q, vh = u*0.5, u*0.25, u*0.62
    return (ox + (gx-gy)*half, oy + (gx+gy)*q - gz*vh)

def cube(d, gx, gy, j, ox, oy, u, shade=1.0):
    cx, cy = project(gx, gy, j+1, ox, oy, u)
    half, q, vh = u*0.5, u*0.25, u*0.62
    A=(cx,cy-q); B=(cx+half,cy); C=(cx,cy+q); D=(cx-half,cy)
    def sh(col): return tuple(int(c*shade) for c in col)
    d.polygon([D,C,(C[0],C[1]+vh),(D[0],D[1]+vh)], fill=sh(LEFT))
    d.polygon([C,B,(B[0],B[1]+vh),(C[0],C[1]+vh)], fill=sh(RIGHT))
    d.polygon([A,B,C,D], fill=sh(TOP))

def pyramid(d, base, layers, ox, oy, u, partial_top=None):
    for j in range(layers):
        side = base - 2*j
        cells = [(j+gx, j+gy) for gx in range(side) for gy in range(side)]
        cells.sort(key=lambda c: (c[0]+c[1], c[0]))
        n = len(cells)
        if partial_top is not None and j == layers-1:
            n = max(0, int(n*partial_top))
        for (gx, gy) in cells[:n]:
            cube(d, gx, gy, j, ox, oy, u)

def capstone(d, base, layers, ox, oy, u, glow=True):
    cx, cy = project(layers-0.5, layers-0.5, layers, ox, oy, u)
    hw, q, ch = u*0.85, u*0.42, u*1.25
    B=(cx+hw,cy); C=(cx,cy+q); D=(cx-hw,cy); apex=(cx,cy-ch)
    d.polygon([D,C,apex], fill=lerp(GOLD,(0,0,0),0.25))
    d.polygon([C,B,apex], fill=GOLD)
    d.polygon([(cx,cy-q),B,apex], fill=lerp(GOLD,(255,255,255),0.2))
    return apex

def font(sz):
    for p in ["DejaVuSans-Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"]:
        try: return ImageFont.truetype(p, sz)
        except Exception: pass
    return ImageFont.load_default()

# ---------------- THUMBNAIL 1280x720 ----------------
def thumbnail():
    W, H = 1280, 720
    img = Image.new("RGB", (W, H))
    vgrad(img, hx("#6fa8d6"), hx("#f6d79a"), 0, int(H*0.62))
    vgrad(img, hx("#e7c789"), hx("#d9b377"), int(H*0.62), H)
    d = ImageDraw.Draw(img, "RGBA")
    # sun glow
    sx, sy = int(W*0.74), int(H*0.26)
    glow = Image.new("RGBA", (W, H), (0,0,0,0)); gd = ImageDraw.Draw(glow)
    gd.ellipse([sx-150, sy-150, sx+150, sy+150], fill=(255,235,180,150))
    glow = glow.filter(ImageFilter.GaussianBlur(40)); img.paste(glow, (0,0), glow)
    d.ellipse([sx-46, sy-46, sx+46, sy+46], fill=hx("#fff3cf"))
    # dunes
    for k in range(3):
        col = lerp(hx("#e8c187"), hx("#caa069"), k/2)
        pts = [(0, H)]
        base = int(H*0.6)+k*30
        for x in range(0, W+1, 40):
            pts.append((x, base + int(math.sin((x+k*120)*0.006)*26)))
        pts += [(W, H)]
        d.polygon(pts, fill=col)
    # construction-site platform
    ox, oy, u, base, layers = int(W*0.46), int(H*0.52), 46, 14, 7
    plat = [project(-3,-3,0,ox,oy,u), project(base+2,-3,0,ox,oy,u),
            project(base+2,base+2,0,ox,oy,u), project(-3,base+2,0,ox,oy,u)]
    d.polygon(plat, fill=hx("#d2ad72"))
    # little huts
    for (a, r) in [(0.4,1.4),(1.1,1.3),(2.2,1.45),(3.5,1.3),(4.7,1.4),(5.6,1.35)]:
        gx, gy = base/2+math.cos(a)*base*r, base/2+math.sin(a)*base*r
        px, py = project(gx, gy, 0, ox, oy, u); w=u*0.5; h=u*0.8
        d.polygon([(px-w,py),(px,py+w*.5),(px,py+w*.5-h),(px-w,py-h)], fill=hx("#b98a5a"))
        d.polygon([(px+w,py),(px,py+w*.5),(px,py+w*.5-h),(px+w,py-h)], fill=hx("#9a6f44"))
        d.polygon([(px-w,py-h),(px,py+w*.5-h),(px+w,py-h),(px,py-w*.5-h)], fill=hx("#caa06a"))
    # pyramid (mostly built, top layer partial → "under construction")
    pyramid(d, base, layers, ox, oy, u, partial_top=0.55)
    # ramp + workers
    foot = project(base*0.5, base+3.5, 0, ox, oy, u)
    head = project(6, 6.5, 6, ox, oy, u)
    nx, ny = -(head[1]-foot[1]), head[0]-foot[0]; L=math.hypot(nx,ny); ux,uy=nx/L,ny/L; rw=u*1.0
    d.polygon([(foot[0]-ux*rw,foot[1]-uy*rw),(foot[0]+ux*rw,foot[1]+uy*rw),
               (head[0]+ux*rw*.4,head[1]+uy*rw*.4),(head[0]-ux*rw*.4,head[1]-uy*rw*.4)],
              fill=(150,110,60,150))
    for i in range(14):
        t=i/14.0; x=foot[0]+(head[0]-foot[0])*t+ux*((i%3-1)*rw*.5); y=foot[1]+(head[1]-foot[1])*t+uy*((i%3-1)*rw*.5)
        d.rectangle([x-3,y-9,x+3,y], fill=hx("#d8c39a")); d.rectangle([x-2,y-13,x+2,y-9], fill=hx("#5a3b25"))
    capstone(d, base, layers, ox, oy, u)
    # title
    f1, f2 = font(86), font(30)
    tx, ty = 60, 70
    for dx,dy in [(3,4)]:
        d.text((tx+dx,ty+dy),"BUILD THE", font=f1, fill=(20,12,4,180))
        d.text((tx+dx,ty+86+dy),"PYRAMID", font=f1, fill=(20,12,4,180))
    d.text((tx,ty),"BUILD THE", font=f1, fill=hx("#fff1c8"))
    d.text((tx,ty+86),"PYRAMID", font=f1, fill=hx("#f0c95a"))
    d.text((tx+4,ty+182),"Idle Egyptian megaproject — one stone at a time", font=f2, fill=hx("#3a2a14"))
    img.save(os.path.join(OUT, "thumbnail.png")); print("thumbnail.png")

# ---------------- FAVICON 512x512 ----------------
def favicon():
    S = 512
    img = Image.new("RGB", (S, S)); vgrad(img, hx("#f3b15e"), hx("#e88f49"))
    d = ImageDraw.Draw(img, "RGBA")
    cx = S//2
    d.ellipse([cx-150, 70, cx+150, 370], fill=hx("#ffd98a"))   # sun
    # bold pyramid (two faces) + base
    apex=(cx, 150); bl=(110, 420); br=(402, 420); mid=(cx, 470)
    d.polygon([apex, bl, mid], fill=LEFT)
    d.polygon([apex, br, mid], fill=RIGHT)
    # step lines for low-poly read
    for i in range(1,5):
        t=i/5.0; ly=150+(420-150)*t; lxl=cx-(cx-110)*t; lxr=cx+(402-cx)*t
        d.line([(lxl,ly),(lxr,ly)], fill=(60,40,20,90), width=3)
    # gold capstone
    d.polygon([(cx,150),(cx-46,236),(cx+46,236)], fill=GOLD)
    d.polygon([(cx,150),(cx-46,236),(cx,236)], fill=lerp(GOLD,(0,0,0),0.2))
    img.save(os.path.join(OUT, "favicon.png")); print("favicon.png")

thumbnail(); favicon()
print("done ->", os.path.abspath(OUT))
