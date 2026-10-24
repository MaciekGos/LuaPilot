#!/usr/bin/env python3
"""Starts Roblox's StudioMCP binary and forwards stdio to it.

Roblox ships its own launcher, but it points at a single hard-coded Studio
version folder that disappears after an update. This one looks at every
installed version and picks the newest that still has a real Studio next to it.

Override: set LP_STUDIO_MCP_PATH to a file (or to the folder holding it).
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path
from typing import Optional

ENV_OVERRIDE = "LP_STUDIO_MCP_PATH"
WIN_STUDIO = ("RobloxStudioBeta.exe", "RobloxStudio.exe")
MAC_STUDIO = ("RobloxStudio", "RobloxStudioBeta", "Roblox")
MAC_APPS = ("RobloxStudio.app", "Roblox.app", "RobloxStudioBeta.app")


def _newest(paths) -> Optional[Path]:
    best, best_t = None, -1.0
    for p in paths:
        try:
            t = p.stat().st_mtime
        except OSError:
            continue
        if t > best_t:
            best, best_t = p, t
    return best


def _from_override(value: str) -> Optional[Path]:
    p = Path(value).expanduser()
    if p.is_file():
        return p
    if p.is_dir():
        inner = p / "Contents" / "MacOS" / "StudioMCP" if sys.platform == "darwin" else p / "StudioMCP.exe"
        return inner if inner.is_file() else None
    return None


def _windows() -> Optional[Path]:
    roots = []
    for var, sub in (("LOCALAPPDATA", "Roblox/Versions"),
                     ("ProgramFiles", "Roblox/Versions"),
                     ("ProgramFiles(x86)", "Roblox/Versions")):
        base = os.environ.get(var)
        if base:
            roots.append(Path(base) / sub)
    paired, orphans = [], []
    for root in roots:
        if not root.is_dir():
            continue
        for folder in root.iterdir():
            exe = folder / "StudioMCP.exe"
            if not exe.is_file():
                continue
            # A leftover folder from an old version has the proxy but no Studio.
            has_studio = any((folder / name).is_file() for name in WIN_STUDIO)
            (paired if has_studio else orphans).append(exe)
    return _newest(paired) or _newest(orphans)


def _mac() -> Optional[Path]:
    homes = (Path("/Applications"), Path.home() / "Applications")
    for base in homes:
        for app in MAC_APPS:
            macos = base / app / "Contents" / "MacOS"
            exe = macos / "StudioMCP"
            if exe.is_file() and any((macos / n).is_file() for n in MAC_STUDIO):
                return exe
    return None


def find_studio_mcp() -> Optional[Path]:
    value = os.environ.get(ENV_OVERRIDE)
    if value:
        found = _from_override(value)
        if found:
            return found
        sys.stderr.write(f"launch_studio_mcp: {ENV_OVERRIDE} does not point to StudioMCP: {value}\n")
    return _mac() if sys.platform == "darwin" else _windows()


def main() -> int:
    exe = find_studio_mcp()
    if not exe:
        sys.stderr.write(
            "launch_studio_mcp: StudioMCP not found. Install Roblox Studio and enable "
            "'Studio as MCP server' (Assistant Settings > MCP Servers).\n")
        return 1
    sys.stderr.write(f"launch_studio_mcp: using {exe}\n")
    sys.stderr.flush()
    child = subprocess.Popen([str(exe)] + sys.argv[1:])
    try:
        return child.wait()
    except KeyboardInterrupt:
        child.terminate()
        return child.wait()


if __name__ == "__main__":
    sys.exit(main())
