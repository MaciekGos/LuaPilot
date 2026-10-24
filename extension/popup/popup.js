"use strict";
const $ = (id) => document.getElementById(id);
const app = $("app");
let s = { power: true, link: true, connected: false, mcp: false, studio: {}, port: 17613 };

function paint() {
  const live = s.power && s.link && s.connected;
  app.dataset.state = !s.power ? "off" : live ? "live" : "wait";
  $("headline").textContent = !s.power ? "LuaPilot is off" : !s.link ? "Disconnected" : s.connected ? "Connected" : "Looking for the bridge...";
  $("sub").textContent = !s.power ? "The AI chat is left untouched"
    : !s.link ? "Press Connect to use the bridge again"
    : !s.connected ? "Start the LuaPilot app on your computer"
    : s.studio && s.studio.place ? "Ready to work in Roblox Studio" : "Open a place in Roblox Studio";
  $("power").setAttribute("aria-checked", String(s.power));
  $("link").replaceChildren(LP.icon(s.link ? "plugs" : "plugs-connected", 14), " ", s.link ? "Disconnect" : "Connect");
  document.querySelector("[data-i=plugs-connected]").style.color = s.link ? "var(--ok)" : "var(--dim)";
  $("link").disabled = !s.power;
  $("bridgeTxt").textContent = `ws://127.0.0.1:${s.port || 17613}`;
  $("cBridge").classList.toggle("on", live);
  $("cMcp").classList.toggle("on", live && s.mcp);
  $("cPlace").classList.toggle("on", live && !!(s.studio && s.studio.place));
}

const ask = (m) => new Promise((r) => chrome.runtime.sendMessage(m, (x) => r(x || {})));
async function refresh() { const r = await ask({ t: "status" }); if (r.t === "state") { s = r; paint(); } }

$("power").onclick = async () => { const r = await ask({ t: "power", on: !s.power }); if (r.t === "state") { s = r; paint(); } };
$("link").onclick = async () => { const r = await ask({ t: "link", on: !s.link }); if (r.t === "state") { s = r; paint(); } };
chrome.runtime.onMessage.addListener((m) => { if (m && m.t === "state") { s = m; paint(); } });
document.querySelectorAll("[data-i]").forEach((e) => e.append(LP.icon(e.dataset.i, 18)));
refresh(); paint();
