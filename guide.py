# SPDX-License-Identifier: MIT
"""Project documents and reference pictures for the AI, answered by the bridge itself.

    style_guide       - how to work, visual style, approved assets, known issues, the long design handbook
    reference_images  - the user's own example pictures (REFERENCES/oldcity.png, mainmenu.png, ...)

The documents are plain files the user can edit. Defaults ship in ./guide; on first run they are copied
to the user's own folder (LP_GUIDE_DIR, default ~/LuaPilot/Guide) and from then on that copy is used, so
edits survive updates and the folder is writable. Files are never overwritten.
"""
import base64
import io
import os
import re
import shutil
import sys

HERE = os.path.dirname(sys.executable) if getattr(sys, "frozen", False) else os.path.dirname(os.path.abspath(__file__))
BUNDLED = os.path.join(HERE, "guide")
USER = os.environ.get("LP_GUIDE_DIR") or os.path.join(os.path.expanduser("~"), "LuaPilot", "Guide")
DOCS = {"agent": "AGENT_INSTRUCTIONS.md", "style": "STYLE_GUIDE.md", "assets": "ASSETS.md",
        "issues": "KNOWN_ISSUES.md", "design": "GAME_DESIGN.md"}
SECTIONS = ["rules", "structure", "colors", "ui", "assets", "sounds", "images", "approved"]
IMG_EXT = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}
MAX_IMG = 900_000
MAX_DOC = 14_000
PICTURES = [("palette", "Colour palettes (Dusk, Meadow, Neon) with hex values"),
            ("ui-layout", "UI layout: 8 px grid, safe zone, button sizes"),
            ("folder-structure", "Recommended project structure"),
            ("lighting", "Lighting mood presets: Day, Dusk, Night"),
            ("asset-consistency", "Assets that match the style vs assets that clash")]

TOOLS = [
    {"name": "style_guide",
     "description": "Project documents: how to work, the visual style, approved/rejected assets, known issues, and a long "
                    "game-design handbook in chapters. Without arguments returns the essentials and lists what else exists.",
     "inputSchema": {"type": "object", "properties": {
         "doc": {"type": "string", "enum": ["start", "agent", "style", "assets", "issues", "design", "sounds"],
                 "description": "which document (default start)"},
         "section": {"type": "string", "description": "style: rules|structure|colors|ui|assets|sounds|images|approved; "
                                                       "design: a chapter number (7), a range (7-9) or a word from the title (lighting)"},
         "images": {"type": "boolean", "description": "attach the guide's example pictures (default false)"}}}},
    {"name": "reference_images",
     "description": "The user's reference pictures for how things should look (files like oldcity.png, mainmenu.png). "
                    "No arguments: lists the names. names or query: returns the matching pictures (max 6) as images.",
     "inputSchema": {"type": "object", "properties": {
         "list": {"type": "boolean", "description": "only list the available names"},
         "names": {"type": "array", "items": {"type": "string"}, "description": "picture names without extension"},
         "query": {"type": "string", "description": "a word to look for in the names, e.g. city"}}}},
]
NAMES = {t["name"] for t in TOOLS}


def ensure_user_dir():
    """Copy missing default files to the user's folder. Never overwrites. Returns the folder path."""
    try:
        for root, _dirs, files in os.walk(BUNDLED):
            rel = os.path.relpath(root, BUNDLED)
            if rel.split(os.sep)[0] in ("images", "__pycache__"):
                continue
            dest = os.path.join(USER, rel) if rel != "." else USER
            os.makedirs(dest, exist_ok=True)
            for f in files:
                if f.endswith((".py", ".pdf")):
                    continue
                target = os.path.join(dest, f)
                if not os.path.exists(target):
                    shutil.copyfile(os.path.join(root, f), target)
        os.makedirs(os.path.join(USER, "REFERENCES"), exist_ok=True)
        return USER
    except OSError:
        return BUNDLED


def _dir():
    return USER if os.path.isdir(USER) else BUNDLED


def _read(rel):
    for base in (_dir(), BUNDLED):
        path = os.path.join(base, rel)
        if os.path.isfile(path):
            with open(path, encoding="utf-8", errors="replace") as fh:
                return fh.read()
    raise RuntimeError(f"{rel} is missing from the guide folder ({_dir()}).")


def _cap(text, n=MAX_DOC):
    text = text.strip()
    return text if len(text) <= n else text[:n] + "\n...[cut: ask for a smaller section]"


def _sections(text):
    head, parts, cur = [], {}, None
    for line in text.splitlines():
        if line.startswith("## "):
            cur = line[3:].strip().lower()
            parts[cur] = []
        elif cur is None:
            head.append(line)
        else:
            parts[cur].append(line)
    return "\n".join(head).strip(), {k: "\n".join(v).strip() for k, v in parts.items()}


_CH = re.compile(r"^#{1,2}\s+(\d+)\.\s+(.*\S)\s*$")


def _chapters(text):
    """[(number, title, body)] for the numbered chapters of the design handbook."""
    out, cur = [], None
    for line in text.splitlines():
        m = _CH.match(line)
        if m:
            cur = [int(m.group(1)), m.group(2), []]
            out.append(cur)
        elif cur is not None:
            cur[2].append(line)
    return [(n, t, "\n".join(b).strip()) for n, t, b in out]


def _design(section):
    chapters = _chapters(_read(DOCS["design"]))
    if not section:
        lines = [f"{n}. {t}" for n, t, _ in chapters]
        return ("Game design and visual handbook - chapters. Ask again with doc \"design\" and section = a number (7), "
                "a range (7-9) or a word from the title (lighting).\n" + "\n".join(lines))
    sec = str(section).strip().lower()
    m = re.fullmatch(r"(\d+)\s*-\s*(\d+)", sec)
    if m:
        lo, hi = int(m.group(1)), int(m.group(2))
        pick = [c for c in chapters if lo <= c[0] <= hi]
    elif sec.isdigit():
        pick = [c for c in chapters if c[0] == int(sec)]
    else:
        pick = [c for c in chapters if sec in c[1].lower()]
    if not pick:
        raise RuntimeError("no chapter matches; call style_guide with doc \"design\" and no section to see the list")
    return _cap("\n\n".join(f"# {n}. {t}\n{b}" for n, t, b in pick), 18_000)


def _refs():
    base = os.path.join(_dir(), "REFERENCES")
    out = {}
    for root, _d, files in os.walk(base):
        for f in sorted(files):
            stem, ext = os.path.splitext(f)
            if ext.lower() in IMG_EXT:
                rel = os.path.relpath(os.path.join(root, f), base).replace(os.sep, "/")
                out[os.path.splitext(rel)[0]] = os.path.join(root, f)
    return out


def _load_image(path):
    ext = os.path.splitext(path)[1].lower()
    with open(path, "rb") as fh:
        data = fh.read()
    mime = IMG_EXT[ext]
    if len(data) > MAX_IMG:
        try:
            from PIL import Image
            im = Image.open(io.BytesIO(data)).convert("RGB")
            im.thumbnail((1280, 1280))
            buf = io.BytesIO()
            im.save(buf, "JPEG", quality=82)
            data, mime = buf.getvalue(), "image/jpeg"
        except Exception:
            return None
        if len(data) > MAX_IMG:
            return None
    return {"data": base64.b64encode(data).decode("ascii"), "mimeType": mime}


def _reference_images(args):
    refs = _refs()
    if not refs:
        return {"text": "There are no reference pictures yet. The user can add them to the REFERENCES folder of the "
                        f"guide ({os.path.join(_dir(), 'REFERENCES')}), named after what they show (oldcity.png, mainmenu.png). "
                        "Continue with the written style guide.", "images": []}
    names, query = args.get("names") or [], str(args.get("query") or "").strip().lower()
    if args.get("list") or not (names or query):
        return {"text": "Reference pictures (ask for them with names or query):\n" + "\n".join(f"- {k}" for k in sorted(refs)), "images": []}
    chosen = []
    for n in names:
        n = str(n).strip().lower().rsplit(".", 1)[0] if str(n).lower().endswith(tuple(IMG_EXT)) else str(n).strip().lower()
        hit = [k for k in refs if k.lower() == n or k.lower().rsplit("/", 1)[-1] == n]
        chosen += hit or [k for k in refs if n and n in k.lower()]
    if query:
        chosen += [k for k in refs if query in k.lower()]
    seen, ordered = set(), []
    for k in chosen:
        if k not in seen:
            seen.add(k)
            ordered.append(k)
    if not ordered:
        return {"text": "No picture matches. Available:\n" + "\n".join(f"- {k}" for k in sorted(refs)), "images": []}
    images, lines, skipped = [], [], []
    for k in ordered[:6]:
        img = _load_image(refs[k])
        if img:
            images.append(img)
            lines.append(f"Picture {len(images)}: {k}")
        else:
            skipped.append(k)
    text = "Attached in this order:\n" + "\n".join(lines) if lines else "None of the matching pictures could be attached."
    if skipped:
        text += f"\nToo large to attach (ask the user to shrink them): {', '.join(skipped)}"
    if len(ordered) > 6:
        text += f"\n{len(ordered) - 6} more match; narrow the query to see them."
    return {"text": text, "images": images}


def _example_pictures(body):
    images = []
    for stem, cap in PICTURES:
        path = os.path.join(BUNDLED, "images", stem + ".png")
        if os.path.isfile(path) and os.path.getsize(path) < MAX_IMG:
            with open(path, "rb") as fh:
                images.append({"data": base64.b64encode(fh.read()).decode("ascii"), "mimeType": "image/png"})
            body += f"\nPicture {len(images)}: {cap}"
    return body, images


def call(name, args, timeout=30):
    args = args or {}
    if name == "reference_images":
        return _reference_images(args)
    doc = str(args.get("doc") or ("style" if args.get("section") else "start")).lower()
    section = args.get("section")
    images = []
    if doc == "start":
        refs = _refs()
        design = _chapters(_read(DOCS["design"]))
        body = "\n\n".join([
            _cap(_read(DOCS["agent"]), 6000),
            _cap(_read(DOCS["style"]), 9000),
            "# Approved and rejected assets (the user's list)\n" + _cap(_read(DOCS["assets"]), 3000),
            "# Known issues\n" + _cap(_read(DOCS["issues"]), 2000),
            "# More\n- style_guide doc \"design\": the long game-design handbook, %d chapters (genre, map size, assets, lighting, UI, multi-view review...). Read the chapters that match the task.\n"
            "- reference_images: %s\n- Your documents live in: %s" % (
                len(design), (f"{len(refs)} reference pictures: " + ", ".join(sorted(refs)[:30])) if refs else "none yet",
                _dir())])
    elif doc == "design":
        body = _design(section)
    elif doc in ("style", "sounds"):
        head, parts = _sections(_read(DOCS["style"]))
        want = "sounds" if doc == "sounds" else str(section or "all").lower()
        if want != "all" and want not in parts:
            raise RuntimeError(f"section must be one of: all, {', '.join(parts)}")
        if want == "all":
            body = _cap(_read(DOCS["style"]))
        else:
            body = f"## {want}\n{parts[want]}"
            if parts.get("approved") and want != "approved":
                body += f"\n\n## approved (overrides the above)\n{parts['approved']}"
        if want == "images" or args.get("images"):
            body, images = _example_pictures(body)
    elif doc in DOCS:
        body = _cap(_read(DOCS[doc]))
    else:
        raise RuntimeError("doc must be one of: start, agent, style, assets, issues, design, sounds")
    if args.get("images") and not images:
        body, images = _example_pictures(body)
    return {"text": body.strip(), "images": images}
