const fs = require("fs"), path = require("path");
const { load, check, done, ROOT } = require("./harness");
const w = load('<body><div id="chat"></div><textarea id="ed"></textarea></body>', []);
const store = {};
const sentToBridge = [];
w.chrome = {
  runtime: { id: "x", getURL: (p) => p, getManifest: () => ({ version: "2" }), lastError: null,
    onMessage: { addListener() {} },
    sendMessage(m, cb) {
      let r = {};
      if (m.t === "tools") r = { tools: [{ name: "get_studio_state", description: "state", inputSchema: { properties: {} } }] };
      else if (m.t === "call") { sentToBridge.push(m.name); r = { ok: true, text: "state ok" }; }
      else if (m.t === "status") r = { t: "state", connected: true, mcp: true, studio: { place: true } };
      setTimeout(() => cb(r), 5);
    } },
  storage: { onChanged: { addListener() {} }, local: {
    get(k, cb) { const o = {}; [].concat(k).forEach((x) => { if (x in store) o[x] = store[x]; }); cb(o); },
    set(o, cb) { Object.assign(store, o); cb && cb(); } } },
};
const sent = [];
const ev = (f) => w.eval(fs.readFileSync(path.join(ROOT, f), "utf8"));
["core/kit.js", "core/config.js", "core/parser.js", "core/link.js"].forEach(ev);
w.eval(`
 const chat = document.getElementById("chat");
 window.__gen = false; window.__notice = null; window.__sent = [];
 const add = (role, html) => { const d = document.createElement("div"); d.className = "t"; d.dataset.role = role; d.innerHTML = '<div class="b">' + html + '</div>'; chat.append(d); return d; };
 window.add = add;
 LP.provider = { id: "stub", name: "Stub", url: "https://x/", vision: false, notes: "", resendEvery: 0,
  timings: { idleMs: 100, stableMs: 100, warmupMs: 3000, timeoutMs: 20000 }, rate: { minGapMs: 50, perMinute: 100 },
  turns: () => [...chat.querySelectorAll(".t")].map((el) => ({ el, role: el.dataset.role })),
  turnId: () => null, text: (el) => LP.kit.readText(el), codeBlocks: (el) => [...el.querySelectorAll("pre")], body: (el) => el.querySelector(".b"),
  conversationKey: () => "c1", conversationUrl: (k) => "https://x/c/" + k, generating: () => window.__gen, stop() {},
  editor: () => document.getElementById("ed"), editorText: () => document.getElementById("ed").value, isFresh: () => false,
  send: async (t) => { window.__sent.push(t); add("user", t.replace(/</g, "&lt;")); return true; },
  barSlot: () => null, notice: () => window.__notice, continueButton: () => null };
`);
["core/icons.js", "core/ui.js", "core/agent.js"].forEach(ev);
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  w.eval(`
   add("user", "⟦LP-SYS⟧ prompt");
   add("assistant", '<pre>@@LPCALL@@\\n{"name":"get_studio_state","args":{}}\\n@@LPEND@@</pre>');
   add("user", "⟦LP⟧ result · get_studio_state\\nok"); add("assistant", "<p>Done earlier.</p>");
  `);
  await w.LP.loadSettings(); w.LP.ui.init(); await w.LP.agent.init();
  await sleep(3500);
  check("history is not executed", sentToBridge.length === 0 && w.__sent.length === 0, { b: sentToBridge, s: w.__sent });
  w.eval(`add("assistant", '<pre>@@LPCALL@@\\n{"name":"get_studio_state","args":{}}\\n@@LPEND@@</pre>')`);
  await sleep(2500);
  check("new call runs once", sentToBridge.length === 1, sentToBridge);
  check("feedback sent once", w.__sent.length === 1 && w.__sent[0].startsWith("⟦LP⟧ result"), w.__sent);
  await sleep(2000);
  check("no duplicate afterwards", sentToBridge.length === 1 && w.__sent.length === 1);
  check("chip hides code", w.document.querySelectorAll("[data-chip]").length >= 3 && [...w.document.querySelectorAll("pre:not(.lp-chip-b)")].every((p) => p.classList.contains("lp-hide")));
  check("injected user turns are hidden", [...w.document.querySelectorAll('.t[data-role="user"]')].every((d) => d.classList.contains("lp-hide")));
  w.eval(`add("assistant", '<p>[LuaPilot]</p><p>Tagged.</p>')`);
  await sleep(1200);
  { const tt = [...w.document.querySelectorAll(".t")].find((d) => /Tagged/.test(d.textContent)); const ps2 = [...tt.querySelectorAll("p")];
    check("[LuaPilot] tag hidden, text kept", ps2[0].classList.contains("lp-hide") && !ps2[1].classList.contains("lp-hide")); }
  w.eval(`add("assistant", '<p>All done.</p><p>&lt;｜｜DSML｜｜ invoke name="x"&gt;</p>')`);
  await sleep(1200);
  const ps = [...[...w.document.querySelectorAll(".t")].find((d) => /All done/.test(d.textContent)).querySelectorAll("p")];
  check("dsml text hidden, prose kept", ps.length === 2 && !ps[0].classList.contains("lp-hide") && ps[1].classList.contains("lp-hide"), ps.map((p) => p.outerHTML));
  w.LP.ui.shot([{ data: "AAAA", mimeType: "image/png" }]);
  for (let i = 0; i < 12; i++) w.LP.ui.shot([{ data: "BBBB" + i, mimeType: "image/png" }]);
  w.document.querySelector(".lp-shot").click();
  await sleep(100);
  check("gallery keeps the last 10", w.document.querySelectorAll(".lp-lb-strip img").length === 10);
  w.document.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  // rate limit
  w.eval(`window.__notice = { kind: "rate", text: "Messages too frequent", key: "k1" }`);
  await sleep(800);
  check("rate hit starts ladder", store.lpRate && store.lpRate.phase === "reload" && store.lpRate.hits === 1, store.lpRate);
  check("pace slowed", store.lpPace && store.lpPace.mult > 1, store.lpPace);
  check("banner shown", !!w.document.querySelector(".lp-banner"));
  process.exit((check("done", true), 0) || 0);
})();
