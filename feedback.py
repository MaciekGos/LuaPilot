# SPDX-License-Identifier: MIT
"""One-time "did everything work?" question after about an hour of real use.

The state lives in a small JSON file next to the app's settings (%APPDATA%/LuaPilot/feedback.json), so
the bridge, the browser extension (through the bridge) and the desktop app all see the same answer:
whoever the user answers in, the question disappears everywhere.

Not intrusive by design
  - nothing is asked before 1 hour of ACTIVE use (the bridge counts only time with a connected extension
    and a recent command or running chat, not time the window is merely open);
  - one question per round; "Later" pushes the next round 3 more hours of use away;
  - at most 2 rounds in total, after that never again;
  - an answer ends it for good; "settings.json" -> {"feedback_prompt": false} turns it off completely.
"""
import json
import os
import time

ISSUES_URL = "https://github.com/MaciekGos/LuaPilot/issues"
FIRST_AFTER_S = 3600          # first question after this much active use
LATER_AFTER_S = 3 * 3600      # "Later": next question after this much more active use
MAX_ASKS = 2

DIR = os.path.join(os.environ.get("APPDATA") or os.path.expanduser("~"), "LuaPilot")
STATE_FILE = os.path.join(DIR, "feedback.json")
SETTINGS_FILE = os.path.join(DIR, "settings.json")

DEFAULT = {
    "usage_s": 0.0,        # active use so far
    "next_at_s": FIRST_AFTER_S,
    "asks": 0,             # rounds shown so far
    "open": False,         # a question is waiting for an answer right now
    "toast_sent": False,   # the Windows notification of the current round was already shown
    "done": False,         # answered / refused for good
    "outcome": "",         # ok | problem | never
}


def _read(path):
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def enabled():
    return _read(SETTINGS_FILE).get("feedback_prompt", True) is not False


def load():
    st = dict(DEFAULT)
    st.update({k: v for k, v in _read(STATE_FILE).items() if k in DEFAULT})
    return st


def save(st):
    try:
        os.makedirs(DIR, exist_ok=True)
        tmp = STATE_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(st, f, indent=2)
        os.replace(tmp, STATE_FILE)
    except Exception:
        pass


def is_open(st=None):
    st = st or load()
    return bool(st["open"] and not st["done"] and enabled())


def add_usage(seconds):
    """Adds active-use time. Returns True when a question has just become due."""
    st = load()
    if st["done"] or st["open"] or not enabled():
        return False
    st["usage_s"] = float(st["usage_s"]) + float(seconds)
    due = st["usage_s"] >= st["next_at_s"] and st["asks"] < MAX_ASKS
    if due:
        st.update(open=True, toast_sent=False, asks=st["asks"] + 1)
    save(st)
    return due


def answer(action):
    """action: ok | problem | later | never. Returns the new state."""
    st = load()
    if action in ("ok", "problem", "never"):
        st.update(open=False, done=True, outcome=action)
    elif action == "later":
        st.update(open=False, next_at_s=float(st["usage_s"]) + LATER_AFTER_S)
        if st["asks"] >= MAX_ASKS:
            st.update(done=True, outcome="never")
    save(st)
    return st


def mark_toast_sent():
    st = load()
    st["toast_sent"] = True
    save(st)
