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

const ev = (f) => w.eval(fs.readFileSync(path.join(ROOT, f), "utf8"));
["core/kit.js", "core/config.js", "core/parser.js", "core/link.js"].forEach(ev);
w.eval(`
 const chat = document.getElementById("chat");
 window.__gen = false; window.__notice = null; window.__attempts = 0;
 window.add = (role, html) => { const d = document.createElement("div"); d.className = "t"; d.dataset.role = role; d.innerHTML = '<div class="b">' + html + '</div>'; chat.append(d); return d; };
 LP.provider = { id: "stub", name: "Stub", url: "https://x/", vision: false, notes: "", resendEvery: 0,
  timings: { idleMs: 100, stableMs: 100, warmupMs: 3000, timeoutMs: 20000 }, rate: { minGapMs: 50, perMinute: 100 },
  turns: () => [...chat.querySelectorAll(".t")].map((el) => ({ el, role: el.dataset.role })),
  turnId: () => null, text: (el) => LP.kit.readText(el), codeBlocks: (el) => [...el.querySelectorAll("pre")], body: (el) => el.querySelector(".b"),
  conversationKey: () => "c1", conversationUrl: (k) => "https://x/c/" + k, generating: () => window.__gen, stop() {},
  editor: () => document.getElementById("ed"), editorText: () => "", isFresh: () => false,
  // the site refuses every message with "Messages too frequent"
  send: async () => { window.__attempts++; window.__notice = { kind: "rate", text: "Messages too frequent", key: "k" + window.__attempts }; return false; },
  barSlot: () => null, notice: () => window.__notice, continueButton: () => null };
`);
["core/icons.js", "core/ui.js", "core/agent.js"].forEach(ev);
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  w.eval(`add("user", "\u27e6LP-SYS\u27e7 prompt")`);
  await w.LP.loadSettings(); w.LP.ui.init(); await w.LP.agent.init();
  await sleep(2500);
  w.eval(`add("assistant", '<pre>@@LPCALL@@\\n{"name":"get_studio_state","args":{}}\\n@@LPEND@@</pre>')`);
  await sleep(9000);
  check("refused message is sent exactly once (no flood)", w.__attempts === 1, w.__attempts);
  check("cool-down is set", store.lpCool > Date.now() + 10000, store.lpCool);
  check("ladder started", store.lpRate && store.lpRate.phase === "reload", store.lpRate);
  done(); process.exit(0);
})();
