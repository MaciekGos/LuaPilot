# SPDX-License-Identifier: MIT
"""Builds the reference pictures (images/*.png) and LuaPilot-Style-Guide.pdf from style-guide.md.

Run:  python build_guide.py      (needs pillow and reportlab; only for the maintainer - the bridge
just reads style-guide.md and images/ at run time.)
"""
import os
import re

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(HERE, "images")
os.makedirs(IMG, exist_ok=True)


def font(size, bold=False):
    for p in ("/usr/share/fonts/truetype/dejavu/DejaVuSans%s.ttf" % ("-Bold" if bold else ""),
              "C:/Windows/Fonts/segoeui%s.ttf" % ("b" if bold else ""), "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(p, size)
        except OSError:
            continue
    return ImageFont.load_default()


BG, PANEL, FG, DIM = "#1B1F2A", "#272D3C", "#E8ECF4", "#98A2B6"


def canvas(w, h, title):
    im = Image.new("RGB", (w, h), BG)
    d = ImageDraw.Draw(im)
    d.text((28, 20), title, fill=FG, font=font(26, True))
    return im, d


def palette():
    im, d = canvas(1000, 640, "Colour palettes")
    sets = [("Dusk (default)", [("background", "#1B1F2A"), ("panel", "#272D3C"), ("text", "#E8ECF4"), ("accent", "#7C9CFF"),
                               ("success", "#34D399"), ("warning", "#FBBF24"), ("danger", "#F87171")]),
            ("Meadow", [("grass", "#6BBF59"), ("sky", "#8EC9FF"), ("wood", "#A9744F"), ("stone", "#8C8F94"),
                        ("accent", "#FFC94A"), ("danger", "#E4572E")]),
            ("Neon", [("base", "#0B0B14"), ("magenta", "#FF3EA5"), ("cyan", "#25F4EE"), ("violet", "#7A5CFF"), ("text", "#FFFFFF")])]
    y = 80
    for name, cols in sets:
        d.text((28, y), name, fill=FG, font=font(20, True))
        x, w = 28, (944 // len(cols)) - 8
        for role, hx in cols:
            d.rounded_rectangle((x, y + 36, x + w, y + 150), 12, fill=hx, outline="#3A4256")
            light = sum(int(hx[i:i + 2], 16) for i in (1, 3, 5)) > 380
            d.text((x + 10, y + 100), hx, fill="#111" if light else "#fff", font=font(15, True))
            d.text((x + 10, y + 124 - 4), role, fill="#222" if light else "#ddd", font=font(13))
            x += w + 8
        y += 190
    im.save(os.path.join(IMG, "palette.png"))


def ui_layout():
    im, d = canvas(1000, 640, "UI layout: 8 px grid, safe zones, buttons")
    x0, y0, w, h = 60, 90, 560, 500
    d.rounded_rectangle((x0, y0, x0 + w, y0 + h), 16, fill="#12151D", outline="#3A4256", width=2)
    for gx in range(x0, x0 + w, 40):
        d.line((gx, y0, gx, y0 + h), fill="#1D2230")
    for gy in range(y0, y0 + h, 40):
        d.line((x0, gy, x0 + w, gy), fill="#1D2230")
    d.rectangle((x0 + 24, y0 + 24, x0 + w - 24, y0 + h - 24), outline="#7C9CFF", width=2)
    d.text((x0 + 32, y0 + 30), "safe zone (24 px from the edge)", fill="#7C9CFF", font=font(14))
    d.rounded_rectangle((x0 + 60, y0 + 90, x0 + w - 60, y0 + 330), 8, fill=PANEL, outline="#3A4256")
    d.text((x0 + 80, y0 + 104), "Title - 24", fill=FG, font=font(24, True))
    d.text((x0 + 80, y0 + 146), "Body text - 14, 8 px padding, radius 8", fill=DIM, font=font(15))
    d.rounded_rectangle((x0 + 80, y0 + 250, x0 + 260, y0 + 306), 8, fill="#7C9CFF")
    d.text((x0 + 118, y0 + 266), "Primary 44+", fill="#0B1020", font=font(18, True))
    d.rounded_rectangle((x0 + 280, y0 + 250, x0 + 440, y0 + 306), 8, outline="#98A2B6", width=2)
    d.text((x0 + 318, y0 + 266), "Secondary", fill=FG, font=font(18))
    notes = ["Scale-based sizes (UDim2 scale)", "+ UIAspectRatioConstraint", "Padding 8 or 16, UICorner 8", "Touch targets >= 44 x 44 px",
             "Hover + pressed tween 0.12 s", "One font family, 4 sizes", "ZIndexBehavior = Sibling", "ResetOnSpawn = false for state"]
    for i, n in enumerate(notes):
        d.text((660, 110 + i * 42), "- " + n, fill=FG, font=font(17))
    im.save(os.path.join(IMG, "ui-layout.png"))


def folders():
    im, d = canvas(1000, 640, "Project structure")
    tree = ["Workspace", "  Map", "    Buildings  (Models, PrimaryPart set)", "    Props      (anchored)", "  Spawns",
            "ReplicatedStorage", "  Assets     (models to Clone)", "  Modules    (shared ModuleScripts)", "  Remotes    (...Event / ...Function)",
            "ServerScriptService", "  CombatService  InventoryService  ShopService",
            "ServerStorage", "  LuaPilot", "    Memory   (project notes)",
            "StarterGui", "  HudGui   ShopGui   (ResetOnSpawn = false)",
            "StarterPlayer > StarterPlayerScripts", "  Input   Camera   Effects"]
    f = font(20)
    for i, line in enumerate(tree):
        top = not line.startswith(" ")
        d.text((40 + (len(line) - len(line.lstrip())) * 11, 80 + i * 30), line.strip(), fill="#7C9CFF" if top else FG, font=font(20, top))
    im.save(os.path.join(IMG, "folder-structure.png"))


def lighting():
    im, d = canvas(1000, 520, "Lighting mood presets")
    moods = [("Day", ("#9ED2FF", "#E9F6FF"), ["ClockTime 14", "Brightness 2", "Ambient 70,70,80", "Atmosphere density 0.3"]),
             ("Dusk", ("#2B2D5B", "#FF9D6C"), ["ClockTime 18.3", "Brightness 1.2", "warm ColorShift_Top", "Bloom 0.3"]),
             ("Night", ("#05070F", "#1B2A55"), ["ClockTime 0", "Brightness 0.4", "blue Atmosphere", "ColorCorrection sat +0.1"])]
    for i, (name, (c1, c2), lines) in enumerate(moods):
        x = 28 + i * 320
        for yy in range(100, 300):
            t = (yy - 100) / 200
            a = [int(c1[k:k + 2], 16) for k in (1, 3, 5)]
            b = [int(c2[k:k + 2], 16) for k in (1, 3, 5)]
            d.line((x, yy, x + 296, yy), fill=tuple(int(a[j] + (b[j] - a[j]) * t) for j in range(3)))
        d.rectangle((x, 300, x + 296, 340), fill="#2A3326" if name != "Night" else "#10170F")
        d.text((x + 12, 112), name, fill="#fff" if name != "Day" else "#12233A", font=font(24, True))
        for j, t in enumerate(lines):
            d.text((x, 360 + j * 30), t, fill=FG, font=font(17))
    im.save(os.path.join(IMG, "lighting.png"))


def consistency():
    im, d = canvas(1000, 520, "Asset consistency: match the style")
    d.text((60, 80), "MATCHES (low-poly, flat colours, same scale)", fill="#34D399", font=font(18, True))
    d.text((60, 300), "CLASHES (mixed styles, wrong scale, shiny realistic)", fill="#F87171", font=font(18, True))
    cols = ["#6BBF59", "#A9744F", "#8C8F94", "#FFC94A"]
    for i, c in enumerate(cols):
        x = 70 + i * 220
        d.polygon([(x, 230), (x + 80, 140), (x + 160, 230)], fill=c)
        d.rectangle((x + 20, 230, x + 140, 280), fill=c)
    d.polygon([(70, 440), (150, 350), (230, 440)], fill="#6BBF59")
    d.ellipse((290, 340, 400, 450), fill="#C0C7D1", outline="#FFFFFF", width=4)
    d.rectangle((470, 390, 600, 450), fill="#FF3EA5")
    d.polygon([(680, 450), (700, 350), (720, 450)], fill="#25F4EE")
    d.text((760, 380), "too big / wrong palette", fill=DIM, font=font(15))
    im.save(os.path.join(IMG, "asset-consistency.png"))


# ── PDF ──────────────────────────────────────────────────────────────────
def pdf():
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Image as RLImage
    from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer

    ss = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=ss["Title"], fontSize=22, textColor=colors.HexColor("#1B1F2A"))
    h2 = ParagraphStyle("h2", parent=ss["Heading2"], fontSize=15, textColor=colors.HexColor("#3B5BDB"), spaceBefore=12)
    body = ParagraphStyle("b", parent=ss["BodyText"], fontSize=10, leading=14)
    bullet = ParagraphStyle("bl", parent=body, leftIndent=12, bulletIndent=0)
    text = open(os.path.join(HERE, "STYLE_GUIDE.md"), encoding="utf-8").read()
    story = [Paragraph("LuaPilot Style Guide", h1), Spacer(1, 6)]
    titles = {"rules": "Core rules", "structure": "Structure and naming", "colors": "Colours and lighting", "ui": "User interface",
              "assets": "Assets", "sounds": "Sounds", "images": "Reference pictures", "approved": "Approved list"}
    esc = lambda s: s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    for line in text.splitlines():
        if line.startswith("# "):
            continue
        if line.startswith("## "):
            key = line[3:].strip()
            story.append(Paragraph(titles.get(key, key), h2))
            if key == "images":
                for n, cap in (("palette", "Colour palettes"), ("ui-layout", "UI layout"), ("folder-structure", "Project structure"),
                               ("lighting", "Lighting moods"), ("asset-consistency", "Asset consistency")):
                    story += [RLImage(os.path.join(IMG, n + ".png"), width=170 * mm, height=170 * mm * (0.64 if n in ("palette", "ui-layout", "folder-structure") else 0.52)), Spacer(1, 6)]
        elif line.startswith("- "):
            story.append(Paragraph(esc(line[2:]), bullet, bulletText="\u2022"))
        elif line.strip():
            story.append(Paragraph(esc(line), body))
    SimpleDocTemplate(os.path.join(HERE, "LuaPilot-Style-Guide.pdf"), pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm,
                      topMargin=16 * mm, bottomMargin=16 * mm, title="LuaPilot Style Guide", author="LuaPilot").build(story)


if __name__ == "__main__":
    palette(); ui_layout(); folders(); lighting(); consistency(); pdf()
    print("built:", sorted(os.listdir(IMG)), "+ PDF")
