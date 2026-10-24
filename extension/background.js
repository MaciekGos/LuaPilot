// LuaPilot - background worker. Owns the WebSocket to the local bridge.
"use strict";

const BRIDGE_PORT_DEFAULT = 17613;
const PING_MS = 20000;

const st = {
  ws: null, connected: false, linkOn: true, power: true, hold: false, holdTimer: 0,
  port: BRIDGE_PORT_DEFAULT, info: { mcp: false, studio: { app: false, place: false } },
  tools: [], seq: 0, pending: new Map(), retry: 0, retryTimer: 0, pingTimer: 0, booted: null,
};

const store = {
  get: (k) => new Promise((r) => chrome.storage.local.get(k, (v) => r(v || {}))),
  set: (o) => new Promise((r) => chrome.storage.local.set(o, () => r())),
};

function publicState() {
  return {
    t: "state", power: st.power, link: st.linkOn, connected: st.connected, hold: st.hold, port: st.port,
    mcp: !!st.info.mcp, blender: !!st.info.blender, studio: st.info.studio || {}, tools: st.tools.length,
  };
}

function broadcast() {
  const m = publicState();
  chrome.runtime.sendMessage(m).catch(() => {});
  chrome.tabs.query({}, (tabs) => (tabs || []).forEach((t) => { if (t.id != null) chrome.tabs.sendMessage(t.id, m).catch(() => {}); }));
  const on = st.power && st.linkOn && st.connected;
  chrome.action.setBadgeText({ text: !st.power ? "" : on ? "" : "!" }).catch(() => {});
  chrome.action.setBadgeBackgroundColor({ color: "#f59e0b" }).catch(() => {});
}

function failAll(kind, error) {
  for (const [, p] of st.pending) { clearTimeout(p.timer); p.resolve({ ok: false, kind, error }); }
  st.pending.clear();
}

function rpc(msg, timeoutMs) {
  return new Promise((resolve) => {
    if (!st.ws || st.ws.readyState !== 1) return resolve({ ok: false, kind: "offline", error: "bridge not connected" });
    const id = ++st.seq;
    const timer = setTimeout(() => { st.pending.delete(id); resolve({ ok: false, kind: "timeout", error: "no reply from the bridge" }); }, timeoutMs);
    st.pending.set(id, { resolve, timer });
    try { st.ws.send(JSON.stringify({ ...msg, id })); }
    catch { clearTimeout(timer); st.pending.delete(id); resolve({ ok: false, kind: "offline", error: "send failed" }); }
  });
}

function wanted() { return st.power && st.linkOn && !st.hold; }

function disconnect() {
  clearTimeout(st.retryTimer); clearInterval(st.pingTimer);
  const ws = st.ws; st.ws = null;
  if (ws) { try { ws.onclose = null; ws.close(); } catch { /* ignore */ } }
  if (st.connected) { st.connected = false; failAll("offline", "bridge disconnected"); }
  st.tools = [];
  broadcast();
}

function connect() {
  if (!wanted() || st.ws) return;
  let ws;
  try { ws = new WebSocket(`ws://127.0.0.1:${st.port}`); } catch { return schedule(); }
  st.ws = ws;
  ws.onopen = () => {
    st.connected = true; st.retry = 0;
    clearInterval(st.pingTimer);
    st.pingTimer = setInterval(() => rpc({ op: "ping" }, 8000), PING_MS);
    rpc({ op: "tools" }, 30000).then((r) => { if (r.tools) { st.tools = r.tools; st.info = r; broadcast(); } });
    broadcast();
  };
  ws.onmessage = (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    if (m.ev === "state") { st.info = m; broadcast(); return; }
    if (m.ev === "chat") { routeChat(m); return; }
    if (m.re != null) {
      const p = st.pending.get(m.re);
      if (p) { clearTimeout(p.timer); st.pending.delete(m.re); p.resolve(m); }
    }
  };
  ws.onclose = () => {
    clearInterval(st.pingTimer);
    const was = st.connected;
    st.ws = null; st.connected = false; st.tools = [];
    failAll("offline", "bridge disconnected");
    if (was) broadcast();
    schedule();
  };
  ws.onerror = () => { /* onclose follows */ };
}

function schedule() {
  clearTimeout(st.retryTimer);
  if (!wanted()) return;
  const delay = Math.min(10000, 1200 * Math.pow(1.5, st.retry++));
  st.retryTimer = setTimeout(connect, delay);
}

function apply() { if (wanted()) { if (!st.ws) connect(); } else disconnect(); broadcast(); }

async function boot() {
  const v = await store.get(["lpEnabled", "lpLink", "lpPort"]);
  st.power = v.lpEnabled !== false;
  st.linkOn = v.lpLink !== false;
  st.port = Number(v.lpPort) || BRIDGE_PORT_DEFAULT;
  apply();
}
st.booted = boot();

chrome.alarms.create("lp-wake", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(() => { st.booted.then(() => { if (wanted() && !st.ws) connect(); }); });

chrome.storage.onChanged.addListener((ch) => {
  if (ch.lpEnabled) { st.power = ch.lpEnabled.newValue !== false; apply(); }
  if (ch.lpLink) { st.linkOn = ch.lpLink.newValue !== false; apply(); }
});

// Mini chat of the desktop app: commands arrive from the bridge, go to one DeepSeek tab.
function routeChat(m) {
  chrome.tabs.query({ url: "https://chat.deepseek.com/*" }, (tabs) => {
    tabs = tabs || [];
    const pick = tabs.find((t) => t.id === st.chatTab) || tabs.find((t) => t.active) || tabs[0];
    if (!pick) {
      if (st.ws && st.ws.readyState === 1) st.ws.send(JSON.stringify({ op: "chat_state", status: "no_tab", detail: "Open chat.deepseek.com in the browser first.", text: "" }));
      return;
    }
    chrome.tabs.sendMessage(pick.id, { t: "chat", op: m.op, text: m.text }).catch(() => {});
  });
}

chrome.runtime.onMessage.addListener((m, _s, reply) => {
  if (!m || !m.t) return false;
  (async () => {
    await st.booted;
    switch (m.t) {
      case "status": return reply(publicState());
      case "chat_state": {
        if (_s && _s.tab) st.chatTab = _s.tab.id;
        if (st.ws && st.ws.readyState === 1) { const { t, ...rest } = m; st.ws.send(JSON.stringify({ op: "chat_state", ...rest })); }
        return reply({});
      }
      case "sleep": { setTimeout(() => reply({}), Math.min(Number(m.ms) || 0, 60000)); return; }
      case "tools": {
        if (!st.connected) return reply({ tools: [] });
        const r = await rpc({ op: "tools" }, 30000);
        if (r.tools) { st.tools = r.tools; st.info = r; }
        return reply({ tools: st.tools });
      }
      case "call": {
        if (!st.power) return reply({ ok: false, kind: "offline", error: "LuaPilot is switched off" });
        if (!st.linkOn || !st.connected) return reply({ ok: false, kind: "offline", error: "bridge not connected" });
        const t = Number(m.timeout) || 120000;
        const r = await rpc({ op: "call", name: m.name, args: m.args || {}, timeout_ms: t }, t + 5000);
        return reply(r);
      }
      case "power": { st.power = !!m.on; await store.set({ lpEnabled: st.power }); apply(); return reply(publicState()); }
      case "link": { st.linkOn = !!m.on; await store.set({ lpLink: st.linkOn }); st.retry = 0; apply(); return reply(publicState()); }
      case "hold": {
        clearTimeout(st.holdTimer);
        st.hold = !!m.on;
        if (st.hold) st.holdTimer = setTimeout(() => { st.hold = false; apply(); }, 180000);
        st.retry = 0; apply();
        return reply(publicState());
      }
      case "blender": {
        if (!st.connected) return reply({ ok: false, problem: "no_bridge", error: "bridge not connected" });
        const r = await rpc({ op: "blender", action: m.action || "status" }, 70000);
        if (r && r.tools_list) { st.tools = r.tools_list; delete r.tools_list; }
        if (r && r.ok) st.info = Object.assign({}, st.info, { blender: !!r.on });
        broadcast();
        return reply(r || { ok: false, error: "no answer" });
      }
      case "restart-bridge": return reply(await rpc({ op: "restart" }, 60000));
      default: return reply({});
    }
  })();
  return true;
});

// Hidden tabs throttle their own timers; a pulse from here keeps the agent loop running.
setInterval(() => {
  if (!st.power) return;
  chrome.tabs.query({ url: "https://chat.deepseek.com/*" }, (tabs) => {
    (tabs || []).forEach((t) => { if (t.id != null) chrome.tabs.sendMessage(t.id, { t: "pulse" }).catch(() => {}); });
  });
}, 1500);
