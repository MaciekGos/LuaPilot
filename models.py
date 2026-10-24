# SPDX-License-Identifier: MIT
"""Temp folder for 3D models made in Blender, answered by the bridge itself.

    models_folder - returns the absolute path of the folder (inside the program's own files),
                    lists what is in it, and can empty it.

Blender runs on the same computer, so the AI exports FBX files (with their textures) into this folder
and then imports them into Roblox Studio from there. LP_MODELS_DIR overrides the location.
"""
import http.server
import json
import os
import threading
import shutil
import sys
import time
import urllib.error
import urllib.request
import uuid

HERE = os.path.dirname(sys.executable) if getattr(sys, "frozen", False) else os.path.dirname(os.path.abspath(__file__))
TOOLS = [{"name": "models_folder",
          "description": "Temp folder (inside LuaPilot's own files) for models exported from Blender. Returns its absolute path "
                         "and the files in it. Export every model and its textures there. clean:true empties the folder.",
          "inputSchema": {"type": "object", "properties": {
              "clean": {"type": "boolean", "description": "delete everything in the folder (only when starting a new, unrelated job)"}}}}]
TOOLS.append({"name": "models_import",
              "description": "Imports the FBX files in the models folder into the open Roblox Studio place through the LuaPilot Studio plugin "
                             "(installed from the LuaPilot app: Settings > Install Studio plugin). Waits for the result. "
                             "Imported models appear in the place; find them with inspect_instance (new MeshParts/Models in Workspace).",
              "inputSchema": {"type": "object", "properties": {
                  "files": {"type": "array", "items": {"type": "string"}, "description": "file names (default: all .fbx not imported yet)"},
                  "force": {"type": "boolean", "description": "import again even if imported before"}}}})
NAMES = {t["name"] for t in TOOLS}


def folder():
    path = os.environ.get("LP_MODELS_DIR") or os.path.join(HERE, "temp", "models")
    os.makedirs(path, exist_ok=True)
    return path


def _files(path):
    out = []
    for root, _d, files in os.walk(path):
        for f in sorted(files):
            full = os.path.join(root, f)
            try:
                out.append((os.path.relpath(full, path), os.path.getsize(full)))
            except OSError:
                pass
    return out


def call(name, args, timeout=30):
    if name == "models_import":
        return _import(args or {})
    path = folder()
    removed = 0
    if (args or {}).get("clean"):
        for entry in os.listdir(path):
            full = os.path.join(path, entry)
            try:
                shutil.rmtree(full) if os.path.isdir(full) and not os.path.islink(full) else os.remove(full)
                removed += 1
            except OSError:
                pass
    files = _files(path)
    lines = [f"Models folder: {path}"]
    if removed:
        lines.append(f"Emptied ({removed} entries removed).")
    lines.append("Files: " + ("none" if not files else ""))
    lines += [f"  {n}  ({s // 1024} KB)" for n, s in files[:80]]
    lines.append("Use forward slashes in Python/Luau strings, e.g. " + path.replace("\\", "/") + "/crate.fbx")
    return {"text": "\n".join(lines), "images": []}


# ── Roblox Open Cloud upload (the only public way to get a local FBX into Roblox) ─────────────────────
BASE = os.environ.get("LP_CLOUD_BASE", "https://apis.roblox.com")
CLOUD_FILE = os.environ.get("LP_CLOUD_FILE") or os.path.join(os.path.expanduser("~"), "LuaPilot", "cloud.json")


def cloud_config():
    """{api_key, user_id, group_id} from LP_ROBLOX_* or the cloud.json the app's Settings writes."""
    cfg = {}
    try:
        with open(CLOUD_FILE, encoding="utf-8") as f:
            cfg = json.load(f)
    except (OSError, ValueError):
        pass
    return {"api_key": str(os.environ.get("LP_ROBLOX_API_KEY") or cfg.get("api_key") or "").strip(),
            "user_id": str(os.environ.get("LP_ROBLOX_USER_ID") or cfg.get("user_id") or "").strip(),
            "group_id": str(cfg.get("group_id") or "").strip()}


def _http(url, key, data=None, headers=None, timeout=60):
    req = urllib.request.Request(url, data=data, headers=dict({"x-api-key": key}, **(headers or {})))
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"Roblox Open Cloud answered {e.code}: {e.read().decode('utf-8', 'replace')[:300]}")
    except urllib.error.URLError as e:
        raise RuntimeError(f"cannot reach Roblox Open Cloud: {e.reason}")


def _upload_one(path, cfg):
    name = os.path.splitext(os.path.basename(path))[0][:50]
    creator = {"groupId": cfg["group_id"]} if cfg["group_id"] else {"userId": cfg["user_id"]}
    meta = {"assetType": "Model", "displayName": name, "description": "Made with LuaPilot", "creationContext": {"creator": creator}}
    b = uuid.uuid4().hex
    with open(path, "rb") as f:
        blob = f.read()
    body = (f"--{b}\r\nContent-Disposition: form-data; name=\"request\"\r\nContent-Type: application/json\r\n\r\n{json.dumps(meta)}\r\n"
            f"--{b}\r\nContent-Disposition: form-data; name=\"fileContent\"; filename=\"{os.path.basename(path)}\"\r\n"
            f"Content-Type: model/fbx\r\n\r\n").encode() + blob + f"\r\n--{b}--\r\n".encode()
    op = _http(f"{BASE}/assets/v1/assets", cfg["api_key"], body, {"Content-Type": f"multipart/form-data; boundary={b}"}, 120)
    opid = str(op.get("path") or "").split("/")[-1]
    for _ in range(60):
        if op.get("done"):
            break
        if not opid:
            raise RuntimeError("Open Cloud gave no operation id")
        time.sleep(1.5)
        op = _http(f"{BASE}/assets/v1/operations/{opid}", cfg["api_key"])
    if not op.get("done"):
        raise RuntimeError("Roblox is still processing this file; call models_import again in a minute")
    if op.get("error"):
        raise RuntimeError(f"Roblox rejected {os.path.basename(path)}: {op['error'].get('message') or op['error']}")
    aid = (op.get("response") or {}).get("assetId")
    if not aid:
        raise RuntimeError("Open Cloud finished without an asset id")
    return str(aid)


# ── Studio plugin link: a tiny HTTP server on localhost, polled by the plugin ─────────────────────────
PLUGIN_PORT = int(os.environ.get("LP_PLUGIN_PORT", "17615"))
LOG = None  # set by the bridge: callable(str)
LISTENING = False
_state = {"queue": [], "results": {}, "assets": {}, "seen": 0.0, "lock": threading.Lock()}


def _touch():
    first = not plugin_alive()
    _state["seen"] = time.time()
    if first and LOG:
        try:
            LOG("Roblox Studio plugin connected")
        except Exception:  # noqa: BLE001
            pass


def plugin_alive():
    return time.time() - _state["seen"] < 15


class _Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, obj):
        data = json.dumps(obj).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _body(self):
        try:
            return json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
        except ValueError:
            return {}

    def do_GET(self):
        with _state["lock"]:
            _touch()
            if self.path.startswith("/pending"):
                files = [{"name": n, "path": os.path.join(folder(), n), "assetId": _state["assets"].get(n)} for n in _state["queue"]]
                _state["queue"] = []
                return self._send({"files": files})
            if self.path.startswith("/list"):
                return self._send(_listing())
        self._send({})

    def do_POST(self):
        body = self._body()
        with _state["lock"]:
            _touch()
            if self.path.startswith("/queue"):
                names = [os.path.basename(str(x)) for x in (body.get("names") or [])] or [n for n, _sz, imp in _all() if not imp]
                threading.Thread(target=_prepare_bg, args=(names,), daemon=True).start()
            if self.path.startswith("/done"):
                _state["results"][str(body.get("name"))] = (bool(body.get("ok")), str(body.get("info") or ""))
                if body.get("ok"):
                    try:
                        full = os.path.join(folder(), os.path.basename(str(body.get("name"))))
                        reg = _registry()
                        reg[os.path.basename(full)] = f"{os.path.getsize(full)}:{int(os.path.getmtime(full))}"
                        with open(os.path.join(folder(), "imported.json"), "w", encoding="utf-8") as f:
                            json.dump(reg, f, indent=1)
                    except OSError:
                        pass
        self._send({"ok": True})


def _prepare_bg(names):
    try:
        _, errors = _prepare(names)
        for e in errors:
            _state["results"][e.split(":", 1)[0]] = (False, e.split(": ", 1)[-1])
    except RuntimeError as exc:
        for n in names:
            _state["results"][n] = (False, str(exc)[:200])


def _registry():
    try:
        with open(os.path.join(folder(), "imported.json"), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def _all():
    reg = _registry()
    out = []
    for n, size in _files(folder()):
        if n.lower().endswith(".fbx"):
            full = os.path.join(folder(), n)
            out.append((n, size, reg.get(n) == f"{size}:{int(os.path.getmtime(full))}"))
    return out


def _listing():
    return {"folder": folder(), "files": [{"name": n, "kb": sz // 1024, "imported": imp} for n, sz, imp in _all()],
            "results": {k: {"ok": v[0], "info": v[1]} for k, v in _state["results"].items()}}


def start_plugin_server():
    global LISTENING
    try:
        srv = http.server.ThreadingHTTPServer(("127.0.0.1", PLUGIN_PORT), _Handler)
    except OSError:
        return False
    LISTENING = True
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:  # "localhost" may resolve to ::1 first on Windows
        import socket

        class _V6(http.server.ThreadingHTTPServer):
            address_family = socket.AF_INET6
        v6 = _V6(("::1", PLUGIN_PORT), _Handler)
        threading.Thread(target=v6.serve_forever, daemon=True).start()
    except Exception:  # noqa: BLE001
        pass
    return True


def _json_file(name):
    try:
        with open(os.path.join(folder(), name), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def _save_json(name, data):
    try:
        with open(os.path.join(folder(), name), "w", encoding="utf-8") as f:
            json.dump(data, f, indent=1)
    except OSError:
        pass


def _stamp(fn):
    full = os.path.join(folder(), fn)
    return f"{os.path.getsize(full)}:{int(os.path.getmtime(full))}"


def _no_cloud():
    return RuntimeError("Roblox upload is not set up, so LuaPilot cannot import models by itself. Tell the user once: open the LuaPilot app > "
                        "Settings > 'Roblox upload', enter an Open Cloud API key (permission Assets: read+write) and their Roblox user ID. "
                        f"Until then ask for a manual import: Studio > Home > Import 3D, folder {folder()}, select all FBX files.")


def _prepare(names, force=False):
    """Upload the files (once per file version) and queue them for the Studio plugin. Returns (queued, errors)."""
    cfg = cloud_config()
    if not cfg["api_key"] or not (cfg["user_id"] or cfg["group_id"]):
        raise _no_cloud()
    up = _json_file("uploaded.json")
    errors, queued = [], []
    for fn in names:
        full = os.path.join(folder(), fn)
        if not os.path.isfile(full):
            errors.append(f"{fn}: no such file in the models folder")
            continue
        old = up.get(fn)
        if old and old.get("stamp") == _stamp(fn) and not force:
            aid = old["assetId"]
        else:
            try:
                aid = _upload_one(full, cfg)
            except RuntimeError as e:
                errors.append(f"{fn}: {e}")
                continue
            up[fn] = {"assetId": aid, "stamp": _stamp(fn)}
            _save_json("uploaded.json", up)
            if LOG:
                LOG(f"uploaded {fn} -> asset {aid}")
        with _state["lock"]:
            _state["assets"][fn] = aid
            _state["results"].pop(fn, None)
            if fn not in _state["queue"]:
                _state["queue"].append(fn)
        queued.append(fn)
    return queued, errors


def _import(args):
    path = folder()
    reg = _json_file("imported.json")
    want = [os.path.basename(x) for x in (args.get("files") or [])] or sorted(f for f in os.listdir(path) if f.lower().endswith(".fbx"))
    todo = [fn for fn in want if os.path.isfile(os.path.join(path, fn)) and (args.get("force") or reg.get(fn) != _stamp(fn))]
    if not todo:
        return {"text": "Nothing to import (no new .fbx files; use force:true to import again).", "images": []}
    cfg = cloud_config()
    if not cfg["api_key"] or not (cfg["user_id"] or cfg["group_id"]):
        raise _no_cloud()
    deadline = time.time() + 6
    while not plugin_alive() and time.time() < deadline:
        time.sleep(0.5)
    if not plugin_alive():
        why = (f"The LuaPilot app listens on 127.0.0.1:{PLUGIN_PORT} but no plugin has called it" if LISTENING
               else f"The LuaPilot app could not open port {PLUGIN_PORT} (another program uses it)")
        raise RuntimeError(why + ". The LuaPilot Studio plugin is not answering. Tell the user: LuaPilot app > Settings > Install Studio plugin, "
                           "restart Studio. Until then ask for a manual import: "
                           f"Studio > Home > Import 3D, folder {path}.")
    queued, errors = _prepare(todo, bool(args.get("force")))
    end = time.time() + min(float(args.get("timeout") or 150), 280)
    while queued and time.time() < end:
        with _state["lock"]:
            if all(fn in _state["results"] for fn in queued):
                break
        time.sleep(0.5)
    lines = []
    for fn in queued:
        with _state["lock"]:
            res = _state["results"].get(fn)
        if res is None:
            lines.append(f"{fn}: uploaded, but Studio has not confirmed yet (it retries while Roblox moderates the upload; ask again in a minute)")
        elif res[0]:
            reg[fn] = _stamp(fn)
            lines.append(f"{fn}: imported - {res[1]}")
        else:
            lines.append(f"{fn}: FAILED - {res[1]}")
        if LOG:
            LOG(f"import {fn}: {lines[-1].split(': ', 1)[1][:200]}")
    _save_json("imported.json", reg)
    lines += [f"{e}" for e in errors]
    return {"text": "Import results:\n" + "\n".join(lines) + "\nThe models are in Workspace > LuaPilot Imports (each file is a Model).", "images": []}
