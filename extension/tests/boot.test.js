// Loads the real content-script chain on an empty DeepSeek-like page: nothing may throw, the bar must appear.
const fs = require("fs"), path = require("path");
const { load, check, done, ROOT } = require("./harness");
const w = load('<body><div id="app"><textarea placeholder="Message"></textarea></div></body>', [], "https://chat.deepseek.com/");
const store = {};
w.chrome = { runtime: { id: "x", getURL: (p) => p, getManifest: () => ({ version: "2" }), lastError: null, onMessage: { addListener() {} },
  sendMessage(m, cb) { setTimeout(() => cb(m.t === "status" ? { t: "state", connected: false } : {}), 5); } },
  storage: { onChanged: { addListener() {} }, local: { get(k, cb) { cb({}); }, set(o, cb) { Object.assign(store, o); cb && cb(); } } } };
const man = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
let err = null;
try { for (const f of man.content_scripts[1].js) w.eval(fs.readFileSync(path.join(ROOT, f), "utf8")); for (const f of man.content_scripts[2].js) w.eval(fs.readFileSync(path.join(ROOT, f), "utf8")); } catch (e) { err = e; }
check("scripts load", !err, err && err.stack);
setTimeout(() => {
  check("provider is DeepSeek", w.LP.provider && w.LP.provider.id === "deepseek");
  check("bar mounted", !!w.document.querySelector(".lp-bar"));
  check("no on/off switch in the bar, stop button present", !w.document.querySelector(".lp-switch") && !!w.document.querySelector(".lp-stop"));
  check("manifest files exist", man.content_scripts.every((c) => c.js.every((f) => fs.existsSync(path.join(ROOT, f)))) && fs.existsSync(path.join(ROOT, man.action.default_popup)));
  done();
  process.exit(0);
}, 800);
