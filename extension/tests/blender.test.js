// Prompt text for the style guide / Blender, and the "Use Blender in this session?" dialog flow.
const fs = require("fs"), path = require("path");
const { load, check, done, ROOT } = require("./harness");
const w = load('<body><textarea id="ed"></textarea></body>', []);
w.chrome = { runtime: { id: "x", getURL: (p) => p, getManifest: () => ({ version: "2" }), lastError: null, onMessage: { addListener() {} }, sendMessage(m, cb) { setTimeout(() => cb && cb({}), 1); } },
  storage: { onChanged: { addListener() {} }, local: { get(k, cb) { cb({}); }, set(o, cb) { cb && cb(); } } } };
const ev = (f) => w.eval(fs.readFileSync(path.join(ROOT, f), "utf8"));
["core/kit.js", "core/config.js", "core/parser.js", "core/link.js"].forEach(ev);
const C = w.LP.cfg;

const off = C.buildSystemPrompt({});
const on = C.buildSystemPrompt({ blender: true });
check("catalog flag in prompt", /ASSETS\n/.test(C.buildSystemPrompt({})) && /NOT allowed/.test(C.buildSystemPrompt({ catalog: false })) && /Never fake/.test(on) && /BLENDER-ONLY/.test(C.buildSystemPrompt({ blender: true, catalog: false })) && /models_folder/.test(on));
check("prompt asks for style_guide", /style_guide/.test(off) && /list_commands/.test(off));
check("blender off by default", /NOT connected/.test(off) && !/BLENDER \(connected/.test(off));
check("blender part when on", /BLENDER \(connected/.test(on) && !/NOT connected/.test(on) && /Import 3D/.test(on));
check("categories", C.toolCategory("style_guide") === "read" && C.toolCategory("blender_execute_blender_code") === "generate" && C.toolCategory("blender_get_scene_info") === "read");

w.eval(`
 LP.provider = { id: "stub", name: "Stub", url: "https://x/", vision: false, notes: "", resendEvery: 0, timings: {}, rate: {},
  turns: () => [], conversationKey: () => "c", generating: () => false, stop() {}, editor: () => document.getElementById("ed"),
  editorText: () => "build a car", isFresh: () => true, send: async () => true, barSlot: () => null, notice: () => null, continueButton: () => null };
 window.__started = null; window.__bl = [];
 LP.agent = { startSession: async (t, o) => { window.__started = { t, o }; return true; }, isEnabled: () => true, poke() {}, state: {} };
`);
["core/icons.js", "core/ui.js"].forEach(ev);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  await w.LP.loadSettings(); w.LP.ui.init(); w.LP.ui.setEnabled(true);

  // 1. no add-on at first, then it works after "Try again"
  let n = 0;
  w.LP.link.blender = async (a) => { w.__bl.push(a); if (a === "enable") return ++n === 1 ? { ok: true, on: false, problem: "no_addon" } : { ok: true, on: true }; return { ok: true, on: false }; };
  w.LP.ui.session(true);
  w.document.querySelector(".lp-card .lp-primary").click();
  await sleep(60);
  check("question shown", !!w.document.querySelector(".lp-ask") && /this session/.test(w.document.querySelector(".lp-ask").textContent));
  check("catalog + blender asked", /Allow the Roblox catalog/.test(w.document.querySelector(".lp-ask").textContent) && /Use Blender/.test(w.document.querySelector(".lp-ask").textContent));
  const rows = [...w.document.querySelectorAll(".lp-ask-opt")];
  [...rows[1].querySelectorAll("button")].find((b) => b.textContent === "Yes").click();
  [...w.document.querySelectorAll(".lp-ask .lp-btn")].find((b) => /^Start$/.test(b.textContent)).click();
  await sleep(60);
  const t1 = w.document.querySelector(".lp-ask").textContent;
  check("setup help shown", /Blender is not answering/.test(t1) && /install-addon/.test(t1) && /Try again/.test(t1) && /Continue without Blender/.test(t1), t1);
  [...w.document.querySelectorAll(".lp-ask .lp-btn")].find((b) => /Try again/.test(b.textContent)).click();
  await sleep(80);
  check("started with blender", w.__started && w.__started.o.blender === true && w.__started.o.catalog === true && w.__started.t === "build a car", w.__started);
  await sleep(300);
  check("dialog removed", !w.document.querySelector(".lp-ask"));

  // 2. continue without Blender
  w.__started = null; w.__bl.length = 0;
  w.document.querySelector(".lp-card .lp-primary").click();
  await sleep(60);
  [...w.document.querySelectorAll(".lp-ask-opt")][0].querySelectorAll("button")[1].click(); // catalog: No
  [...w.document.querySelectorAll(".lp-ask .lp-btn")].find((b) => /^Start$/.test(b.textContent)).click();
  await sleep(80);
  check("started without blender, catalog off", w.__started && w.__started.o.blender === false && w.__started.o.catalog === false, { s: w.__started, b: w.__bl });

  // 3. Escape cancels the start
  w.__started = null;
  await sleep(300);
  w.document.querySelector(".lp-card .lp-primary").click();
  await sleep(60);
  w.document.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await sleep(80);
  check("escape cancels", w.__started === null && !!w.document.querySelector(".lp-card .lp-primary") && !w.document.querySelector(".lp-card .lp-primary").disabled);
  done(); process.exit(0);
})();
