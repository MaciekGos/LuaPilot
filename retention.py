# SPDX-License-Identifier: MIT
"""Keeps LuaPilot's files on disk from piling up: anything older than 4 days, counted from the NEWEST entry
(not from today), is deleted. So a computer that was off for a week keeps its last four days of data.

    prune_log(path)  - log files whose lines start with "YYYY-MM-DD HH:MM:SS"
    prune_dir(path)  - plain files by modification time (empty folders are removed too)
"""
import os
import re
import time

DAYS = 4
STAMP = re.compile(r"^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\b")


def _ts(line):
    m = STAMP.match(line)
    if not m:
        return None
    try:
        return time.mktime(time.strptime(m.group(1), "%Y-%m-%d %H:%M:%S"))
    except (ValueError, OverflowError):
        return None


def prune_log(path, days=DAYS):
    """Drop log lines older than `days` before the newest line. Continuation lines follow their entry."""
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            lines = f.readlines()
    except OSError:
        return 0
    stamps = [t for t in map(_ts, lines) if t is not None]
    if not stamps:
        return 0
    cutoff = max(stamps) - days * 86400
    keep, ok, dropped = [], False, 0
    for line in lines:
        t = _ts(line)
        if t is not None:
            ok = t >= cutoff
        if ok:
            keep.append(line)
        else:
            dropped += 1
    if dropped:
        tmp = path + ".tmp"
        try:
            with open(tmp, "w", encoding="utf-8") as f:
                f.writelines(keep)
            os.replace(tmp, path)
        except OSError:
            return 0
    return dropped


def prune_dir(path, days=DAYS, keep_names=()):
    """Delete files older than `days` before the newest file in the folder. Returns the number deleted."""
    files = []
    for root, _d, names in os.walk(path):
        for n in names:
            full = os.path.join(root, n)
            try:
                files.append((os.path.getmtime(full), full, n))
            except OSError:
                pass
    if not files:
        return 0
    cutoff = max(f[0] for f in files) - days * 86400
    gone = 0
    for mtime, full, n in files:
        if mtime < cutoff and n not in keep_names:
            try:
                os.remove(full)
                gone += 1
            except OSError:
                pass
    for root, dirs, _n in os.walk(path, topdown=False):
        for d in dirs:
            try:
                os.rmdir(os.path.join(root, d))  # only succeeds when empty
            except OSError:
                pass
    return gone


def run(log_dir, models_dir):
    """Everything LuaPilot writes by itself. The user's Guide folder is never touched."""
    n = 0
    try:
        for name in os.listdir(log_dir):
            p = os.path.join(log_dir, name)
            if name.endswith(".log") and os.path.isfile(p):
                n += prune_log(p)
        n += prune_dir(log_dir)
    except OSError:
        pass
    n += prune_dir(models_dir, keep_names=("imported.json",))
    reg = os.path.join(models_dir, "imported.json")
    try:
        import json
        with open(reg, encoding="utf-8") as f:
            data = json.load(f)
        alive = {k: v for k, v in data.items() if os.path.isfile(os.path.join(models_dir, k))}
        if alive != data:
            with open(reg, "w", encoding="utf-8") as f:
                json.dump(alive, f, indent=1)
    except (OSError, ValueError, AttributeError):
        pass
    return n
