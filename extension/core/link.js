// LuaPilot - storage, settings and the line to the background worker (and so to the bridge).
(() => {
  "use strict";
  const LP = (window.LP = window.LP || {});

  const alive = () => { try { return !!(chrome && chrome.runtime && chrome.runtime.id); } catch { return false; } };
  const mem = {};

  LP.store = {
    get(keys) {
      return new Promise((res) => {
        if (!alive()) return res({});
        try { chrome.storage.local.get(keys, (v) => res(v || {})); } catch { res({}); }
      });
    },
    set(obj) {
      Object.assign(mem, obj);
      return new Promise((res) => {
        if (!alive()) return res();
        try { chrome.storage.local.set(obj, () => res()); } catch { res(); }
      });
    },
  };

  LP.settings = { custom: "", shot: "show" };
  LP.loadSettings = async () => {
    const v = await LP.store.get(["lpCustom", "lpShot"]);
    LP.settings.custom = typeof v.lpCustom === "string" ? v.lpCustom : "";
    LP.settings.shot = v.lpShot === "hide" ? "hide" : "show";
  };
  LP.saveSettings = () => LP.store.set({ lpCustom: LP.settings.custom, lpShot: LP.settings.shot });

  function send(msg, timeoutMs = 130000) {
    return new Promise((resolve) => {
      if (!alive()) return resolve({ stale: true });
      let done = false;
      const timer = setTimeout(() => { if (!done) { done = true; resolve({ timeout: true }); } }, timeoutMs);
      try {
        chrome.runtime.sendMessage(msg, (r) => {
          if (done) return;
          done = true; clearTimeout(timer);
          if (chrome.runtime.lastError) return resolve({ stale: !alive(), lost: true });
          resolve(r || {});
        });
      } catch { done = true; clearTimeout(timer); resolve({ stale: true }); }
    });
  }

  // A sleep the background worker keeps time for (see kit.js). Falls back to a local timer.
  LP.kit.slow = (ms) => new Promise((resolve) => {
    let done = false;
    const fin = () => { if (!done) { done = true; resolve(); } };
    setTimeout(fin, ms + 3000);
    if (!alive()) return setTimeout(fin, ms);
    try { chrome.runtime.sendMessage({ t: "sleep", ms }, () => { void chrome.runtime.lastError; fin(); }); } catch { setTimeout(fin, ms); }
  });

  LP.link = {
    alive,
    async call(name, args, timeoutMs) {
      const r = await send({ t: "call", name, args, timeout: timeoutMs }, (timeoutMs || 120000) + 8000);
      if (r.stale) return { ok: false, kind: "stale", error: "extension reloaded" };
      if (r.timeout || r.lost) return { ok: false, kind: "offline", error: "no answer from the background worker" };
      return r;
    },
    async tools() { const r = await send({ t: "tools" }, 30000); return Array.isArray(r.tools) ? r.tools : []; },
    status() { return send({ t: "status" }, 5000); },
    // optional Blender connection: action = status | enable | disable
    async blender(action) {
      const r = await send({ t: "blender", action }, 75000);
      if (r.stale || r.timeout || r.lost) return { ok: false, problem: "no_bridge", error: "no answer from the background worker" };
      return r;
    },
    hold(on) { return send({ t: "hold", on: !!on }, 5000); },
    chatState(obj) { try { chrome.runtime.sendMessage(Object.assign({ t: "chat_state" }, obj), () => void chrome.runtime.lastError); } catch { /* ignore */ } },
    onChat(cb) {
      if (!alive()) return;
      try { chrome.runtime.onMessage.addListener((m) => { if (m && m.t === "chat") cb(m); }); } catch { /* ignore */ }
    },
    onPulse(cb) {
      if (!alive()) return;
      try { chrome.runtime.onMessage.addListener((m) => { if (m && m.t === "pulse") cb(); }); } catch { /* ignore */ }
    },
    onState(cb) {
      if (!alive()) return;
      try { chrome.runtime.onMessage.addListener((m) => { if (m && m.t === "state") cb(m); }); } catch { /* ignore */ }
    },
  };
})();
