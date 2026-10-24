#!/usr/bin/env python3
"""LuaPilot bridge.

Local WebSocket server (ws://127.0.0.1:<port>) that sits between the browser
extension and Roblox's StudioMCP server, started as a child process over stdio.

Wire format (JSON, one object per frame)
  extension -> bridge   {"op": "...", "id": 7, ...}
  bridge -> extension   {"re": 7, ...}            reply to request 7
                        {"ev": "state", ...}      unsolicited status push

  ops: ping | state | tools | call | restart
"""
import asyncio
import json
import os
import re
import queue
import subprocess
import sys
import threading
import time

import blender
import catalog
import guide
import models
import retention

try:
    import launch_studio_mcp as _launcher
except Exception:  # only used to notice a Studio update
    _launcher = None

try:
    import websockets
except ImportError:
    print("Missing dependency. Run:  pip install websockets")
    sys.exit(1)

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

VERSION = "2.0.3"
HOST = "127.0.0.1"
PORT = int(os.environ.get("LP_BRIDGE_PORT", "17613"))
HERE = os.path.dirname(os.path.abspath(__file__))
LOG_DIR = os.path.join(HERE, "logs")
PRIMARY = "roblox"
STUDIO_PORT = 13469          # loopback port Roblox Studio uses for its MCP server
RESTART_EXIT_CODE = 75       # tells the desktop app to relaunch us
IS_WIN = sys.platform == "win32"


# ── console + file logging ────────────────────────────────────────────────
def _ansi_ok():
    if not IS_WIN or os.environ.get("LP_FORCE_ANSI") == "1":
        return True
    try:
        import ctypes
        k32 = ctypes.windll.kernel32
        handle = k32.GetStdHandle(-11)
        mode = ctypes.c_uint32()
        if not k32.GetConsoleMode(handle, ctypes.byref(mode)):
            return False
        return bool(k32.SetConsoleMode(handle, mode.value | 0x0004))
    except Exception:
        return False


_COLORS = {"dim": "2", "green": "92", "yellow": "93", "red": "91", "cyan": "96",
           "alert": "1;97;41"}
_USE_COLOR = _ansi_ok()
os.makedirs(LOG_DIR, exist_ok=True)
try:
    _logfile = open(os.path.join(LOG_DIR, "bridge.log"), "a", encoding="utf-8", errors="replace")
except OSError:
    _logfile = None


def _paint(text, color):
    if not (_USE_COLOR and color in _COLORS):
        return text
    return f"\033[{_COLORS[color]}m{text}\033[0m"


def log(msg, color="dim", quiet=False):
    """quiet=True writes to the log file only (noisy details)."""
    stamp = time.strftime("%H:%M:%S")
    if not quiet:
        print(f"{_paint(stamp, 'dim')} {_paint(msg, color)}", flush=True)
    if _logfile:
        try:
            _logfile.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} {msg}\n")
            _logfile.flush()
        except OSError:
            pass


def alert(lines):
    """A step the user has to do by hand: drawn as a solid block."""
    width = max(len(s) for s in lines) + 4
    print()
    for s in lines:
        print(_paint("  " + s.ljust(width), "alert"))
    print(flush=True)
    if _logfile:
        _logfile.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} ACTION: {' | '.join(lines)}\n")
        _logfile.flush()


STUDIO_STEPS = [
    " Open your place in Roblox Studio.",
    " Assistant Settings > MCP Servers > 'Enable Studio as MCP server'.",
    " Takes about 10 s - this window will report the connection.",
]


# Roblox Studio is the only server LuaPilot talks to.
SERVER_SPEC = {PRIMARY: {"command": "launch_studio_mcp.py", "args": []}}


# ── process helpers (Windows only; no-ops elsewhere) ───────────────────────
def _run(cmd, timeout=8):
    try:
        return subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8",
                              errors="replace", timeout=timeout).stdout
    except Exception:
        return ""


def port_owner(port):
    """(pid, image name, path) of whatever listens on `port`, or None."""
    if not IS_WIN:
        return None
    text = _run(["netstat", "-ano", "-p", "TCP"]) + _run(["netstat", "-ano", "-p", "TCPv6"])
    pid = None
    for line in text.splitlines():
        if "LISTENING" in line and f":{port} " in line:
            last = line.split()[-1]
            if last.isdigit():
                pid = last
                break
    if not pid:
        return None
    out = [s.strip() for s in _run(
        ["powershell", "-NoProfile", "-Command",
         f"$p=Get-Process -Id {pid} -ErrorAction SilentlyContinue; if($p){{$p.Name; $p.Path}}"]
    ).splitlines() if s.strip()]
    return pid, (out[0] if out else "?"), (out[1] if len(out) > 1 else "")


def command_line(pid):
    if not IS_WIN:
        return ""
    return _run(["powershell", "-NoProfile", "-Command",
                 f"(Get-CimInstance Win32_Process -Filter \"ProcessId={pid}\").CommandLine"]).strip()


def process_running(image):
    """True/False, or None when it cannot be determined."""
    if not IS_WIN:
        return None
    out = _run(["tasklist", "/FI", f"IMAGENAME eq {image}"])
    return None if not out else image.lower() in out.lower()


def kill_pid(pid):
    _run(["taskkill", "/F", "/T", "/PID", str(pid)])


def free_own_port():
    """Kill a stale copy of this bridge that still owns our port."""
    owner = port_owner(PORT)
    if not owner or int(owner[0]) == os.getpid():
        return False
    if "python" not in owner[1].lower() and "luapilotbridge" not in owner[1].lower():
        return False
    if "bridge.py" not in command_line(owner[0]).lower() and "luapilotbridge" not in owner[1].lower():
        return False
    log(f"closing an older bridge (pid {owner[0]}) that still holds port {PORT}", "yellow")
    kill_pid(owner[0])
    return True


def clean_orphaned_proxy():
    """StudioMCP.exe left behind after Studio crashed keeps Studio's port busy."""
    if process_running("RobloxStudioBeta.exe") is False and process_running("StudioMCP.exe"):
        log("removing a leftover StudioMCP.exe (Studio is not running)", "yellow")
        _run(["taskkill", "/F", "/IM", "StudioMCP.exe"])


def check_studio_port():
    """Ask before closing a non-Roblox program that took Studio's MCP port."""
    owner = port_owner(STUDIO_PORT)
    if not owner:
        return False
    pid, name, path = owner
    if "roblox" in path.lower() or "studiomcp" in name.lower():
        return False
    log(f"port {STUDIO_PORT} (Studio's MCP port) is used by {name} (pid {pid}) {path}", "yellow")
    try:
        answer = input("    Close it so Roblox Studio can use the port? [y/N] ").strip().lower()
    except (EOFError, KeyboardInterrupt):
        answer = ""
    if answer in ("y", "yes", "t", "tak"):
        kill_pid(pid)
        log(f"closed {name}", "cyan")
        alert(STUDIO_STEPS)
        return True
    log("left it running; close it yourself and restart the bridge", "yellow")
    return False


# ── MCP server over stdio ─────────────────────────────────────────────────
_TRANSIENT = ("no roblox studio instance", "no active studio", "studio instance is connect",
              "not connected to", "no studio instance")


def _transient(text):
    low = (text or "").lower()
    return any(m in low for m in _TRANSIENT)


class McpServer:
    def __init__(self, sid, command, args=None, env=None):
        self.id = sid
        self.command = command
        self.args = list(args or [])
        self.env = dict(env or {})
        self.proc = None
        self.tools = []
        self.stderr_tail = []
        self._next = 1
        self._pending = {}
        self._lock = threading.Lock()        # guards _pending and _next
        self._write = threading.Lock()
        self._start = threading.Lock()
        self.call_lock = threading.Lock()    # one tool call at a time per server
        self.deaths = []

    # lifecycle
    @staticmethod
    def _expand(value):
        return os.path.expandvars(os.path.expanduser(str(value)))

    def _argv(self):
        argv = [self._expand(self.command)] + [self._expand(a) for a in self.args]
        if argv[0].lower().endswith(".py"):
            script = argv[0] if os.path.isabs(argv[0]) else os.path.join(HERE, argv[0])
            argv = [sys.executable, script] + argv[1:]
        elif IS_WIN and os.path.basename(argv[0]).lower() in ("npx", "npm", "yarn", "pnpm", "bunx"):
            argv = ["cmd.exe", "/c"] + argv
        return argv

    def alive(self):
        return self.proc is not None and self.proc.poll() is None

    def start(self):
        with self._start:
            if self.alive():
                return
            argv = self._argv()
            env = dict(os.environ)
            env.update({k: self._expand(v) for k, v in self.env.items()})
            log(f"[{self.id}] starting: {' '.join(argv)}", "cyan")
            self.proc = subprocess.Popen(
                argv, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                text=True, bufsize=1, encoding="utf-8", errors="replace", cwd=HERE, env=env)
            with self._lock:
                self._pending.clear()
            threading.Thread(target=self._read_out, args=(self.proc,), daemon=True).start()
            threading.Thread(target=self._read_err, args=(self.proc,), daemon=True).start()
            self._rpc("initialize", {"protocolVersion": "2024-11-05", "capabilities": {},
                                     "clientInfo": {"name": "luapilot-bridge", "version": VERSION}}, 30)
            self._notify("notifications/initialized")
            # StudioMCP lists zero tools until Studio attaches; give it a few seconds.
            for _ in range(10):
                if self.refresh(3) or not self.alive():
                    break
                time.sleep(1)
            log(f"[{self.id}] ready ({len(self.tools)} tools)", "cyan")

    def stop(self):
        with self._lock:
            for q in self._pending.values():
                q.put(None)
            self._pending.clear()
        proc, self.proc = self.proc, None
        if proc is None:
            return
        try:
            if IS_WIN:
                kill_pid(proc.pid)          # /T: the launcher spawns a child
            else:
                proc.terminate()
        except Exception:
            pass

    def restart(self):
        log(f"[{self.id}] restarting", "yellow")
        self.stop()
        time.sleep(0.4)
        self.start()

    # io threads
    def _read_out(self, proc):
        for line in iter(proc.stdout.readline, ""):
            line = line.strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
            except ValueError:
                continue
            if msg.get("id") is None:
                continue
            with self._lock:
                q = self._pending.get(msg["id"])
            if q is not None:
                q.put(msg)
        log(f"[{self.id}] process ended (exit {proc.poll()})", "red")
        with self._lock:
            for q in self._pending.values():
                q.put(None)

    def _read_err(self, proc):
        for line in iter(proc.stderr.readline, ""):
            line = line.rstrip()
            if line:
                self.stderr_tail = (self.stderr_tail + [line])[-8:]
                if self.id == "blender" and re.search(r"Sending command|Command sent|Received|Response parsed|ListToolsRequest|CallToolRequest", line):
                    continue                     # the Blender server logs every code it runs (huge); keep only warnings and errors
                log(f"[{self.id}] {line[:400]}", "yellow", quiet=True)

    # json-rpc
    def _send(self, payload):
        with self._write:
            self.proc.stdin.write(json.dumps(payload) + "\n")
            self.proc.stdin.flush()

    def _notify(self, method):
        self._send({"jsonrpc": "2.0", "method": method, "params": {}})

    def _rpc(self, method, params, timeout):
        if not self.alive():
            raise RuntimeError(f"server '{self.id}' is not running")
        q = queue.Queue(maxsize=1)
        with self._lock:
            rid = self._next
            self._next += 1
            self._pending[rid] = q
        try:
            self._send({"jsonrpc": "2.0", "id": rid, "method": method, "params": params})
            try:
                return q.get(timeout=timeout)
            except queue.Empty:
                return None
        finally:
            with self._lock:
                self._pending.pop(rid, None)

    def refresh(self, timeout=20):
        msg = self._rpc("tools/list", {}, timeout)
        if msg and "result" in msg:
            self.tools = msg["result"].get("tools", [])
        return self.tools

    def call(self, name, arguments, timeout):
        """-> {"text": str, "images": [...]}; raises on failure."""
        with self.call_lock:
            for attempt in (1, 2):
                if not self.alive():
                    self.restart()
                msg = self._rpc("tools/call", {"name": name, "arguments": arguments}, timeout)
                if msg is None:
                    raise TimeoutError(f"no answer from '{self.id}' within {int(timeout)} s")
                if msg.get("error"):
                    text = msg["error"].get("message", json.dumps(msg["error"]))
                    if attempt == 1 and _transient(text):
                        time.sleep(1.5)
                        continue
                    raise RuntimeError(text)
                content = msg.get("result", {}).get("content", [])
                text = "\n".join(c.get("text", "") for c in content if c.get("type") == "text")
                images = [{"data": c["data"], "mimeType": c.get("mimeType", "image/jpeg")}
                          for c in content if c.get("type") == "image" and c.get("data")]
                if not text and not images and content:
                    text = json.dumps(content)[:4000]
                # StudioMCP drops its Studio binding for a second or two now and then.
                if attempt == 1 and _transient(text):
                    time.sleep(1.5)
                    continue
                return {"text": text, "images": images}

    def probe(self, tool, timeout=8):
        """Best-effort call of a harmless tool; None when busy or unavailable."""
        if not self.call_lock.acquire(blocking=False):
            return None
        try:
            if not self.alive() or not any(t.get("name") == tool for t in self.tools):
                return None
            msg = self._rpc("tools/call", {"name": tool, "arguments": {}}, timeout)
            if not msg or msg.get("error"):
                return None
            parts = msg.get("result", {}).get("content", [])
            return "\n".join(c.get("text", "") for c in parts if c.get("type") == "text")
        except Exception:
            return None
        finally:
            self.call_lock.release()


class Hub:
    """All servers plus a flat name -> (server, real name) index."""

    def __init__(self):
        self.servers = {}
        self.index = {}
        self._lock = threading.Lock()

    def load(self):
        self.servers = {sid: McpServer(sid, spec.get("command"), spec.get("args"), spec.get("env"))
                        for sid, spec in SERVER_SPEC.items()}
        log(f"servers: {', '.join(self.servers) or '(none)'}", "cyan")

    def start_all(self):
        def go(srv):
            try:
                srv.start()
            except Exception as exc:
                log(f"[{srv.id}] could not start: {exc}", "red")
        threads = [threading.Thread(target=go, args=(s,), daemon=True) for s in self.servers.values()]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        self.reindex()

    def reindex(self):
        with self._lock:
            self.index = {}
            for srv in self.servers.values():
                for tool in srv.tools:
                    name = tool.get("name")
                    if name:
                        if srv.id == "blender" and not name.startswith("blender"):
                            name_key = "blender_" + name
                        else:
                            name_key = name
                        key = name_key if name_key not in self.index else f"{srv.id}/{name}"
                        self.index[key] = (srv, name)

    def listing(self):
        with self._lock:
            return [dict(t, server="luapilot") for t in catalog.TOOLS + guide.TOOLS + models.TOOLS] + [dict(srv_tool(srv, tool), name=key) for key, (srv, real) in self.index.items()
                    for tool in srv.tools if tool.get("name") == real]

    def call(self, name, args, timeout):
        if name in catalog.NAMES:
            return catalog.call(name, args, timeout)
        if name in guide.NAMES:
            return guide.call(name, args, timeout)
        if name in models.NAMES:
            return models.call(name, args, timeout)
        with self._lock:
            entry = self.index.get(name)
        if entry is None:
            self.reindex()
            with self._lock:
                entry = self.index.get(name)
        if entry is None:
            raise RuntimeError(f"unknown tool '{name}'")
        return entry[0].call(entry[1], args, timeout)

    def health(self):
        return [{"id": s.id, "alive": s.alive(), "tools": len(s.tools)} for s in self.servers.values()]

    def any_alive(self):
        return any(s.alive() for s in self.servers.values())


def srv_tool(server, tool):
    out = dict(tool)
    out["server"] = server.id
    return out


hub = Hub()
sockets = set()

# ── Studio connectivity ───────────────────────────────────────────────────
NO_PLACE = ("doesn't have a place", "no place opened", "place opened",
            "has disconnected", "no active studio")


def probe_studio():
    """{"app": bool|None, "place": bool|None}.

    app   - a Studio instance is attached to the MCP server
    place - a place is actually open in it
    """
    srv = hub.servers.get(PRIMARY)
    if srv is not None and srv.alive() and not srv.tools:
        return {"app": False, "place": False}        # proxy lists tools only once attached
    text = srv.probe("list_roblox_studios") if srv else None
    if text is None:
        return {"app": None, "place": None}
    try:
        studios = json.loads(text).get("studios") or []
    except ValueError:
        return {"app": None, "place": None}
    if not studios:
        return {"app": False, "place": False}
    state = srv.probe("get_studio_state")
    if state is None:
        return {"app": True, "place": None}
    return {"app": True, "place": not any(m in state.lower() for m in NO_PLACE)}


def snapshot():
    studio = probe_studio()
    return {"mcp": hub.any_alive(), "servers": hub.health(), "port": PORT,
            "blender": "blender" in hub.servers,
            "studio": {"app": studio["app"], "place": studio["place"],
                       "proc": process_running("RobloxStudioBeta.exe")}}


async def push_state():
    if not sockets:
        return
    try:
        frame = json.dumps(dict(await asyncio.to_thread(snapshot), ev="state"))
    except Exception:
        return
    for ws in list(sockets):
        try:
            await ws.send(frame)
        except Exception:
            pass



# ── mini chat: a tiny local HTTP API for the desktop app's always-on-top box ──
# The app (not a browser) calls it, with a random token it handed to us in LP_TOKEN. A web page
# cannot: it would have to send an Origin header (refused) and does not know the token.
import http.server
import socketserver

MINI_PORT = int(os.environ.get("LP_MINI_PORT", "17614"))
CHAT = {"seq": 0, "status": "idle", "detail": "", "text": "", "active": False}
chat_cond = threading.Condition()
LOOP = None


def chat_update(msg):
    with chat_cond:
        for key in ("status", "detail", "text", "active"):
            if key in msg:
                CHAT[key] = msg[key]
        CHAT["seq"] += 1
        chat_cond.notify_all()


async def _broadcast(frame):
    for ws in list(sockets):
        try:
            await ws.send(json.dumps(frame))
        except Exception:
            pass


def _make_mini_handler(token):
    class Mini(http.server.BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def _ok(self):
            if self.headers.get("Origin") or self.headers.get("X-LP-Token") != token:
                self.send_error(403)
                return False
            return True

        def _json(self, obj, code=200):
            body = json.dumps(obj).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _view(self):
            with chat_cond:
                return dict(CHAT, connected=bool(sockets))

        def do_GET(self):
            if not self._ok():
                return
            since = 0
            if "since=" in self.path:
                try:
                    since = int(self.path.split("since=")[1].split("&")[0])
                except ValueError:
                    pass
            with chat_cond:
                if CHAT["seq"] <= since:
                    chat_cond.wait(timeout=15)
            self._json(self._view())

        def do_POST(self):
            if not self._ok():
                return
            try:
                n = int(self.headers.get("Content-Length") or 0)
                data = json.loads(self.rfile.read(min(n, 200000)).decode("utf-8") or "{}")
            except Exception:
                return self._json({"ok": False, "error": "bad request"}, 400)
            op = self.path.strip("/")
            if op not in ("send", "stop") or LOOP is None:
                return self._json({"ok": False, "error": "unknown"}, 404)
            if not sockets:
                return self._json({"ok": False, "error": "The browser extension is not connected."})
            asyncio.run_coroutine_threadsafe(_broadcast({"ev": "chat", "op": op, "text": str(data.get("text", ""))}), LOOP)
            self._json({"ok": True})

    return Mini


class _Threaded(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True


def start_mini():
    token = os.environ.get("LP_TOKEN")
    if not token:
        return
    try:
        srv = _Threaded((HOST, MINI_PORT), _make_mini_handler(token))
    except OSError as exc:
        log(f"mini chat port {MINI_PORT} unavailable ({exc})", "yellow")
        return
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    log(f"mini chat API on http://{HOST}:{MINI_PORT}", "dim", quiet=True)


# ── websocket handler ─────────────────────────────────────────────────────
async def run_call(ws, rid, name, args, timeout):
    started = time.monotonic()
    try:
        res = await asyncio.to_thread(hub.call, name, args, timeout)
        reply = {"re": rid, "ok": True, "text": res["text"], "images": res["images"]}
    except TimeoutError as exc:
        reply = {"re": rid, "ok": False, "kind": "timeout", "error": str(exc)}
    except Exception as exc:
        reply = {"re": rid, "ok": False, "kind": type(exc).__name__, "error": str(exc)}
    took = time.monotonic() - started
    log(f"{name} -> {'ok' if reply['ok'] else 'FAILED'} in {took:.1f}s", "green" if reply["ok"] else "red",
        quiet=reply["ok"] and took < 5)
    try:
        await ws.send(json.dumps(reply))
    except Exception:
        pass


def _origin(ws):
    try:
        return ws.request.headers.get("Origin") or ""
    except Exception:
        return getattr(ws, "request_headers", {}).get("Origin", "") if hasattr(ws, "request_headers") else ""


async def handler(ws):
    # Only the LuaPilot extension (or a local tool without an Origin) may talk to us. A web page
    # you happen to visit always sends its own Origin, so it is turned away here.
    origin = _origin(ws)
    if origin and not origin.startswith("chrome-extension://"):
        log(f"refused a connection from {origin}", "yellow")
        await ws.close(1008, "origin not allowed")
        return
    sockets.add(ws)
    log(f"extension connected ({len(sockets)})", "green")
    try:
        await ws.send(json.dumps(dict(await asyncio.to_thread(snapshot), ev="state")))
        async for raw in ws:
            try:
                msg = json.loads(raw)
            except ValueError:
                continue
            op, rid = msg.get("op"), msg.get("id")
            if op == "ping":
                await ws.send(json.dumps({"re": rid, "pong": True}))
            elif op == "state":
                await ws.send(json.dumps(dict(await asyncio.to_thread(snapshot), re=rid)))
            elif op == "tools":
                await asyncio.to_thread(refresh_all)
                await ws.send(json.dumps(dict(await asyncio.to_thread(snapshot), re=rid,
                                              tools=hub.listing())))
            elif op == "call":
                # Own task, so pings keep being answered during a long tool call.
                asyncio.create_task(run_call(ws, rid, msg.get("name", ""), msg.get("args") or {},
                                             float(msg.get("timeout_ms", 120000)) / 1000.0))
            elif op == "chat_state":
                chat_update(msg)
            elif op == "blender":
                try:
                    res = await asyncio.to_thread(blender_control, msg.get("action") or "status")
                    await ws.send(json.dumps(dict(res, re=rid, ok=True, tools_list=hub.listing())))
                except Exception as exc:
                    await ws.send(json.dumps({"re": rid, "ok": False, "error": str(exc)}))
            elif op == "restart":
                err = None
                try:
                    await asyncio.to_thread(restart_servers, msg.get("server"))
                except Exception as exc:
                    err = str(exc)
                await ws.send(json.dumps(dict(await asyncio.to_thread(snapshot), re=rid,
                                              ok=err is None, error=err, tools=hub.listing())))
            else:
                await ws.send(json.dumps({"re": rid, "ok": False, "error": f"unknown op: {op}"}))
    except websockets.ConnectionClosed:
        pass
    except Exception as exc:
        log(f"handler error: {exc}", "red")
    finally:
        sockets.discard(ws)
        log(f"extension disconnected ({len(sockets)})", "yellow")


def blender_control(action):
    """Turn the optional Blender connection on/off for this session. Returns a dict for the extension."""
    st = blender.status()
    if action == "status":
        return dict(st, on="blender" in hub.servers)
    if action == "disable":
        srv = hub.servers.pop("blender", None)
        if srv is not None:
            try:
                srv.stop()
            except Exception:
                pass
        hub.reindex()
        return dict(st, on=False)
    if action != "enable":
        raise RuntimeError(f"unknown blender action: {action}")
    code = blender.problem(st)
    if code:
        return dict(st, on=False, problem=code)
    cmd, args = blender.command()
    srv = hub.servers.get("blender") or McpServer("blender", cmd, args, blender.ENV)
    hub.servers["blender"] = srv
    try:
        srv.start()
    except Exception as exc:
        hub.servers.pop("blender", None)
        try:
            srv.stop()
        except Exception:
            pass
        return dict(st, on=False, problem="start_failed", detail=str(exc)[:300])
    hub.reindex()
    if not srv.tools:
        tail = " | ".join(srv.stderr_tail[-3:])[:300]
        hub.servers.pop("blender", None)
        srv.stop()
        hub.reindex()
        return dict(st, on=False, problem="no_tools", detail=tail)
    return dict(st, on=True, tools=len(srv.tools))


def refresh_all():
    for srv in list(hub.servers.values()):
        try:
            if not srv.alive():
                srv.start()
            else:
                srv.refresh()
        except Exception as exc:
            log(f"[{srv.id}] refresh failed: {exc}", "yellow")
    hub.reindex()


def restart_servers(only=None):
    targets = [hub.servers[only]] if only in hub.servers else list(hub.servers.values())
    for srv in targets:
        srv.restart()
    hub.reindex()


# ── background watchers ───────────────────────────────────────────────────
async def watch_servers():
    """Bring back servers that died; slow down if one keeps dying."""
    while True:
        await asyncio.sleep(5)
        for srv in list(hub.servers.values()):
            if srv.alive():
                continue
            now = time.time()
            srv.deaths = [t for t in srv.deaths if now - t < 60]
            if len(srv.deaths) >= 3 and now - srv.deaths[-1] < 15:
                continue
            if len(srv.deaths) == 3:
                log(f"[{srv.id}] keeps stopping. Last output:", "red")
                for line in srv.stderr_tail:
                    log(f"    {line}", "yellow")
            srv.deaths.append(now)
            try:
                await asyncio.to_thread(srv.start)
                hub.reindex()
                await push_state()
            except Exception as exc:
                log(f"[{srv.id}] restart failed: {exc}", "red")


async def watch_studio(initial):
    """Log connection changes and nudge Studio's proxy when it gets stuck."""
    prev_app, prev_place = initial["app"], initial["place"]
    was_connected = prev_app is True
    down_since = None
    last_fix = 0.0
    exe = await asyncio.to_thread(studio_exe)
    while True:
        await asyncio.sleep(4)
        srv = hub.servers.get(PRIMARY)
        if srv is not None and srv.alive() and not srv.tools:
            if await asyncio.to_thread(srv.refresh, 3):
                hub.reindex()
                log(f"Studio attached ({len(srv.tools)} tools)", "green")
        try:
            st = await asyncio.to_thread(probe_studio)
        except Exception:
            continue
        now = time.time()
        if st["app"] is not None and st["app"] != prev_app:
            prev_app = st["app"]
            if st["app"]:
                was_connected, down_since = True, None
                log("Roblox Studio connected", "green")
            else:
                newer = await asyncio.to_thread(studio_exe)
                if newer and exe and newer != exe:
                    log("Studio was updated; it often switches the MCP option off. "
                        "Enable it again in Assistant Settings > MCP Servers.", "yellow")
                else:
                    log("Roblox Studio disconnected", "yellow")
                    if was_connected and down_since is None:
                        down_since = now
                exe = newer or exe
            await push_state()
        if (st["app"] is False and down_since and now - down_since > 20 and now - last_fix > 90
                and srv is not None):
            last_fix = now
            if await asyncio.to_thread(process_running, "RobloxStudioBeta.exe") is True:
                log("Studio is open but its MCP plugin has not registered. Open "
                    "Assistant Settings > MCP Servers (or toggle the option off and on).", "yellow")
            else:
                log("proxy looks stuck; restarting it", "yellow")
                try:
                    await asyncio.to_thread(restart_servers, PRIMARY)
                    await push_state()
                except Exception as exc:
                    log(f"proxy restart failed: {exc}", "red")
        if st["place"] is not None and st["place"] != prev_place:
            await asyncio.sleep(1.2)               # confirm - the binding flickers
            again = (await asyncio.to_thread(probe_studio))["place"]
            if again == st["place"]:
                prev_place = again
                log("place opened" if again else "place closed", "green" if again else "yellow")
                await push_state()


def studio_exe():
    try:
        return _launcher.find_studio_mcp() if _launcher else None
    except Exception:
        return None


async def guarded(name, factory):
    while True:
        try:
            await factory()
            return
        except Exception as exc:
            log(f"{name} crashed ({exc}); restarting in 5 s", "red")
            await asyncio.sleep(5)


async def boot():
    try:
        await asyncio.to_thread(hub.start_all)
    except Exception as exc:
        log(f"startup error: {exc}", "red")
    st = await asyncio.to_thread(probe_studio)
    if st["app"] is False:
        for _ in range(8):                      # attaching takes a moment
            await asyncio.sleep(1)
            st = await asyncio.to_thread(probe_studio)
            if st["app"] is not False:
                break
    total = len(hub.listing())
    if st["app"] is True:
        log(f"ready - Studio connected, {total} tools", "green")
    else:
        log(f"ready - {total} tools, Studio not connected yet", "yellow")
        alert(STUDIO_STEPS)
    asyncio.create_task(guarded("studio watcher", lambda: watch_studio(st)))
    for wait in (2, 2, 4, 6, 6):                # late joiners get a fresh picture
        await asyncio.sleep(wait)
        await push_state()


async def main():
    global LOOP
    LOOP = asyncio.get_running_loop()
    start_mini()
    log(f"guide folder: {guide.ensure_user_dir()}", "cyan")
    log(f"models temp folder: {models.folder()}", "cyan")
    def _tidy():
        try:
            n = retention.run(LOG_DIR, models.folder())
            if n:
                log(f"removed {n} old entries (older than {retention.DAYS} days)", "dim", quiet=True)
        except Exception as exc:  # noqa: BLE001
            log(f"cleanup failed: {exc}", "dim", quiet=True)

    async def _tidy_loop():
        while True:
            await asyncio.to_thread(_tidy)
            await asyncio.sleep(6 * 3600)
    asyncio.create_task(_tidy_loop())
    models.LOG = lambda m: log(m, "green")
    log("Studio plugin link: " + (f"listening on 127.0.0.1:{models.PLUGIN_PORT}" if models.start_plugin_server() else f"port {models.PLUGIN_PORT} is busy, plugin import unavailable"), "cyan")
    print(f"\n  {_paint(f'LuaPilot bridge v{VERSION}', 'cyan')}  ws://{HOST}:{PORT}\n")
    log(f"=== start v{VERSION} pid={os.getpid()} ===", "cyan", quiet=True)
    await asyncio.to_thread(clean_orphaned_proxy)
    await asyncio.to_thread(check_studio_port)
    hub.load()
    if await asyncio.to_thread(free_own_port):
        await asyncio.sleep(0.6)
    try:
        server = await websockets.serve(handler, HOST, PORT, ping_interval=20, ping_timeout=20,
                                        max_size=32 * 1024 * 1024)
    except OSError as exc:
        log(f"port {PORT} is already in use ({exc}). Close the other bridge or set "
            f"LP_BRIDGE_PORT to another number.", "red")
        return
    async with server:
        log(f"listening on ws://{HOST}:{PORT}", "cyan")
        asyncio.create_task(guarded("server watcher", watch_servers))
        asyncio.create_task(boot())
        await asyncio.Future()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        log("shutting down", "yellow")
        for s in list(hub.servers.values()):
            s.stop()
    finally:
        log("=== stop ===", "cyan", quiet=True)
