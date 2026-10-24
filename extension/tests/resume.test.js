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
  const CALL = '<pre>@@LPCALL@@\\n{"name":"get_studio_state","args":{}}\\n@@LPEND@@</pre>';
  if (process.argv[2] === "nudge") {
    w.eval(`add("user", "⟦LP-SYS⟧ prompt"); add("assistant", ${JSON.stringify(CALL)}); add("user", "⟦LP⟧ result · get_studio_state\\nok");`);
    await w.LP.loadSettings(); w.LP.ui.init(); await w.LP.agent.init();
    await sleep(6000);
    check("nudge sent once after reload", w.__sent.length === 1 && /reloaded/.test(w.__sent[0]) && sentToBridge.length === 0, { s: w.__sent, b: sentToBridge });
  } else {
    if (process.argv[2] !== "nosys") w.eval(`add("user", "⟦LP-SYS⟧ prompt");`); else w.eval(`add("user", "hello");`);
    w.eval(`add("assistant", ${JSON.stringify(CALL)});`);
    await w.LP.loadSettings(); w.LP.ui.init(); await w.LP.agent.init();
    await sleep(6000);
    check("unrun last command runs after reload, once", sentToBridge.length === 1 && w.__sent.length === 1, { s: w.__sent, b: sentToBridge });
  }
  done(); process.exit(0);
})();
