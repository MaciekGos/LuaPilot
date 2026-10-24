# SPDX-License-Identifier: MIT
"""Roblox catalog tools for LuaPilot (search the Creator Store, look at thumbnails).

These two commands are answered by the bridge itself, not by Roblox Studio, so the AI can
browse assets and see their pictures before it decides what to insert:

    catalog_search  - find assets by keyword; returns a numbered list and thumbnails
    catalog_images  - thumbnails for asset ids you already have

Only public Roblox web endpoints are used (no login, nothing is sent except the search words).
"""
import base64
import json
import urllib.error
import urllib.parse
import urllib.request

UA = "LuaPilot/2.0 (+https://github.com/MaciekGos)"
CATEGORY = {"model": 10, "decal": 13, "image": 1, "audio": 3, "mesh": 4, "plugin": 38,
            "animation": 24, "video": 62}
MAX_IMG_BYTES = 600_000

TOOLS = [
    {"name": "catalog_search",
     "description": "Search the Roblox Creator Store (free assets) by keyword. Returns a numbered list "
                    "(id, name, creator, votes) and, when images is true, a thumbnail for each of the first results "
                    "in the same order, so you can pick the best one. Insert the chosen asset with "
                    "insert_from_creator_store.",
     "inputSchema": {"type": "object", "required": ["query"], "properties": {
         "query": {"type": "string", "description": "search words, e.g. 'medieval sword'"},
         "type": {"type": "string", "enum": sorted(CATEGORY), "description": "asset type, default model"},
         "limit": {"type": "integer", "description": "how many results, 1-12, default 8"},
         "images": {"type": "boolean", "description": "attach thumbnails (default true)"}}}},
    {"name": "catalog_images",
     "description": "Fetch thumbnails of Roblox assets by id (up to 8), returned as images in the order given.",
     "inputSchema": {"type": "object", "required": ["ids"], "properties": {
         "ids": {"type": "array", "items": {"type": "integer"}, "description": "asset ids"},
         "size": {"type": "integer", "description": "pixel size: 150, 250 or 420 (default 150)"}}}},
]
NAMES = {t["name"] for t in TOOLS}


def _get(url, timeout=12, raw=False):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = resp.read(MAX_IMG_BYTES * 2 if raw else 4_000_000)
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"Roblox answered HTTP {exc.code} for {url.split('?')[0]}")
    except Exception as exc:
        raise RuntimeError(f"Could not reach Roblox ({exc}). Check the internet connection.")
    return data if raw else json.loads(data.decode("utf-8", "replace"))


def _ids_from_search(payload):
    out = []
    for item in (payload.get("data") or []):
        if isinstance(item, dict):
            i = item.get("id") or (item.get("asset") or {}).get("id")
            if isinstance(i, int):
                out.append(i)
    return out


def _details(ids):
    if not ids:
        return {}
    url = "https://apis.roblox.com/toolbox-service/v1/items/details?assetIds=" + ",".join(map(str, ids))
    info = {}
    try:
        for item in (_get(url).get("data") or []):
            asset, creator, vote = item.get("asset") or {}, item.get("creator") or {}, item.get("voting") or {}
            if asset.get("id"):
                info[asset["id"]] = {"name": asset.get("name", "?"), "creator": creator.get("name", "?"),
                                     "up": vote.get("upVotes"), "down": vote.get("downVotes"),
                                     "scripts": asset.get("hasScripts")}
    except RuntimeError:
        pass          # names are nice to have; ids and pictures still work
    return info


def _thumbs(ids, size=150):
    size = size if size in (150, 250, 420) else 150
    url = ("https://thumbnails.roblox.com/v1/assets?returnPolicy=PlaceHolder&format=Png&size=%dx%d&assetIds=%s"
           % (size, size, ",".join(map(str, ids))))
    by_id = {}
    for item in (_get(url).get("data") or []):
        if item.get("imageUrl") and item.get("state") == "Completed":
            by_id[item.get("targetId")] = item["imageUrl"]
    images = []
    for i in ids:
        u = by_id.get(i)
        if not u:
            continue
        try:
            raw = _get(u, raw=True)
        except RuntimeError:
            continue
        if len(raw) <= MAX_IMG_BYTES:
            images.append({"data": base64.b64encode(raw).decode("ascii"), "mimeType": "image/png", "id": i})
    return images


def call(name, args, timeout=30):
    args = args or {}
    if name == "catalog_images":
        ids = [int(x) for x in (args.get("ids") or []) if str(x).isdigit()][:8]
        if not ids:
            raise RuntimeError("ids is required: a list of asset ids")
        imgs = _thumbs(ids, int(args.get("size") or 150))
        got = [i["id"] for i in imgs]
        return {"text": f"Thumbnails attached for ids: {got}" + (f" (no picture for {[i for i in ids if i not in got]})" if len(got) < len(ids) else ""),
                "images": [{"data": i["data"], "mimeType": i["mimeType"]} for i in imgs]}
    # catalog_search
    query = str(args.get("query") or "").strip()
    if not query:
        raise RuntimeError("query is required")
    kind = str(args.get("type") or "model").lower()
    if kind not in CATEGORY:
        raise RuntimeError(f"type must be one of: {', '.join(sorted(CATEGORY))}")
    limit = max(1, min(12, int(args.get("limit") or 8)))
    url = ("https://apis.roblox.com/toolbox-service/v1/marketplace/%d?keyword=%s&num=%d&limit=%d&pageNumber=0"
           % (CATEGORY[kind], urllib.parse.quote(query), limit, limit))
    ids = _ids_from_search(_get(url))[:limit]
    if not ids:
        return {"text": f"No {kind} found for '{query}'. Try other or fewer words.", "images": []}
    info = _details(ids)
    lines = []
    for n, i in enumerate(ids, 1):
        d = info.get(i, {})
        votes = f" | +{d['up']}/-{d['down']}" if d.get("up") is not None else ""
        scr = " | HAS SCRIPTS" if d.get("scripts") else ""
        lines.append(f"{n}. id={i} | {d.get('name', '?')} | by {d.get('creator', '?')}{votes}{scr}")
    images = []
    if args.get("images", True):
        try:
            images = _thumbs(ids[:6])
        except RuntimeError as exc:
            lines.append(f"(thumbnails unavailable: {exc})")
    shown = [i["id"] for i in images]
    lines.append(f"\nThumbnails attached for ids (in this order): {shown}" if images else "")
    lines.append("To use one: insert_from_creator_store with its id. Check results marked HAS SCRIPTS before inserting.")
    return {"text": "\n".join(lines).strip(), "images": [{"data": i["data"], "mimeType": i["mimeType"]} for i in images]}
