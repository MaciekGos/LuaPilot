// Minimal test harness: loads the extension files into a jsdom window.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require(process.env.JSDOM_PATH || "/home/claude/tools/node_modules/jsdom");

const ROOT = path.join(__dirname, "..");

function load(html, files, url = "https://example.test/") {
  const dom = new JSDOM(html, { url, runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;
  // jsdom has no layout: give elements a non-zero box so visibility checks pass.
  window.Element.prototype.getBoundingClientRect = function () {
    return { x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 20, width: 100, height: 20 };
  };
  for (const f of files) window.eval(fs.readFileSync(path.join(ROOT, f), "utf8"));
  return window;
}

let failed = 0;
function check(name, cond, extra) {
  if (cond) console.log("PASS", name);
  else { failed++; console.log("FAIL", name, extra === undefined ? "" : JSON.stringify(extra)); }
}
function done() { if (failed) { console.log(failed + " failed"); process.exit(1); } console.log("all passed"); }

module.exports = { load, check, done, ROOT };
