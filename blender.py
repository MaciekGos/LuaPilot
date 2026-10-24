# SPDX-License-Identifier: MIT
"""Optional Blender connection for LuaPilot (per session, off by default).

Blender is reached the same way as Roblox Studio: the bridge starts an MCP server over stdio.
The server is the community project "mcp-for-blender" (run with uvx); it talks to an add-on
running inside Blender (socket, default localhost:9876). Nothing starts unless the user says
"use Blender in this session". Telemetry of that project is switched off.

Override the command for tests or custom setups with LP_BLENDER_CMD (a full command line).
"""
import os
import shlex
import shutil
import socket

HOST = os.environ.get("BLENDER_HOST", "127.0.0.1")
try:
    PORT = int(os.environ.get("BLENDER_PORT", "9876"))
except ValueError:
    PORT = 9876
PACKAGE = "mcp-for-blender"

ENV = {"DISABLE_TELEMETRY": "1", "BLENDER_MCP_DISABLE_TELEMETRY": "1", "MCP_DISABLE_TELEMETRY": "1",
       "BLENDER_HOST": HOST, "BLENDER_PORT": str(PORT)}


def command():
    """(command, args) for the MCP server, or None when uv is not installed."""
    custom = os.environ.get("LP_BLENDER_CMD", "").strip()
    if custom:
        parts = shlex.split(custom, posix=os.name != "nt")
        return parts[0], parts[1:]
    uvx = shutil.which("uvx")
    return (uvx, [PACKAGE]) if uvx else None


def addon_reachable(timeout=0.6):
    try:
        with socket.create_connection((HOST, PORT), timeout=timeout):
            return True
    except OSError:
        return False


def status():
    cmd = command()
    return {"uv": cmd is not None, "addon": addon_reachable(), "host": HOST, "port": PORT}


def problem(st):
    """Short code for the first thing that is wrong, or None."""
    if not st["uv"]:
        return "no_uv"
    if not st["addon"]:
        return "no_addon"
    return None
