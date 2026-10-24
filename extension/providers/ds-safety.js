// LuaPilot: DeepSeek "<ds_safety>" notices.
//
// DeepSeek sometimes wraps a warning in <ds_safety>...</ds_safety>. The site shows the tags
// as plain text; this script turns them into a framed amber "Safety notice" box, also while
// the reply is still streaming (tag opened, not closed yet).
//
// Separate content script: runs after the provider and the core, needs nothing from them
// (LP.kit is not even required). It never removes or edits site nodes - the original blocks
// are hidden with a data attribute and our own CSS, so React can keep re-rendering them.
// Our nodes carry data-lp-own. Text inside the reasoning area is never touched.
(() => {
  "use strict";
  const LP = (window.LP = window.LP || {});
  if (LP.dsSafety) return;

  const THINK = ".ds-think-content";
  const REPLY = ".ds-markdown";
  const CODE = "pre, .md-code-block";
  const TAG = /<(\/?)ds_safety\s*>/gi;
  const TITLE = "Safety notice";
  const SRC = "data-lp-ds-src";   // marks a hidden original block / element
  const SIG = "data-lp-ds-sig";   // what the current rendering was built from

  // ---- own stylesheet (amber works on light and dark pages: translucent fills, inherited text)
  function ensureStyle() {
    if (document.getElementById("lp-ds-safety-style")) return;
    const st = document.createElement("style");
    st.id = "lp-ds-safety-style";
    st.setAttribute("data-lp-own", "");
    st.textContent = `
[${SRC}] { display: none !important; }
.lp-ds-wrap { margin: 10px 0; }
.lp-ds-plain { margin: 6px 0; white-space: pre-wrap; }
.lp-ds-box { display: block; box-sizing: border-box; margin: 8px 0; padding: 0; overflow: hidden;
  border: 1px solid rgba(217,119,6,.55); border-left: 4px solid #d97706; border-radius: 10px;
  background: rgba(245,158,11,.10); color: inherit; font-size: .95em; line-height: 1.5; }
.lp-ds-head { display: flex; align-items: center; gap: 6px; padding: 6px 12px; color: inherit;
  background: rgba(245,158,11,.22); font-weight: 600; font-size: .85em; letter-spacing: .02em; }
.lp-ds-head::before { content: "\\26A0"; color: #d97706; font-size: 1.1em; }
.lp-ds-body { padding: 8px 12px 9px; overflow-wrap: anywhere; }
.lp-ds-body p { margin: 0 0 .6em; white-space: pre-wrap; }
.lp-ds-body p:last-child { margin-bottom: 0; }
.lp-ds-box[data-open="1"] .lp-ds-body p:last-child::after { content: "\\25AE"; opacity: .6;
  margin-left: 2px; animation: lp-ds-blink 1s steps(2) infinite; }
@keyframes lp-ds-blink { 50% { opacity: 0; } }
`;
    (document.head || document.documentElement).appendChild(st);
  }

  const textOf = (el) => (el.textContent || "").replace(/ /g, " ");
  const inThink = (el) => !!el.closest(THINK);
  const isOwn = (el) => !!el.closest("[data-lp-own]");

  // Splits chunk text into trimmed paragraphs.
  const paragraphs = (s) => s.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

  // Reads the child blocks of one reply and finds the spans covered by notices.
  // Returns [{ from, to, segs }] where segs = [{ safety: bool, paras: string[], open: bool }].
  function plan(blocks) {
    const runs = [];
    let run = null, seg = null, inside = false;
    const put = (safety, chunk, open) => {
      const paras = paragraphs(chunk);
      if (!seg || seg.safety !== safety || (safety && seg.closed)) {
        if (!paras.length && !safety) return;
        seg = { safety, paras: [], open: !!open, closed: false };
        run.segs.push(seg);
      }
      seg.paras.push(...paras);
    };
    blocks.forEach((b, i) => {
      const text = textOf(b);
      TAG.lastIndex = 0;
      const hasTag = TAG.test(text);
      if (!inside && (!hasTag || b.matches(CODE) || b.querySelector(CODE))) { run = null; seg = null; return; }
      if (!run) { run = { from: i, to: i, segs: [] }; runs.push(run); seg = null; }
      run.to = i;
      let pos = 0, m;
      TAG.lastIndex = 0;
      while ((m = TAG.exec(text))) {
        const chunk = text.slice(pos, m.index);
        pos = m.index + m[0].length;
        if (inside) {
          if (chunk.trim()) put(true, chunk, true);
          if (m[1]) { if (seg) { seg.open = false; seg.closed = true; } inside = false; }
          // a second opening tag inside an open notice is ignored
        } else {
          if (chunk.trim()) put(false, chunk);
          if (!m[1]) { inside = true; seg = { safety: true, paras: [], open: true, closed: false }; run.segs.push(seg); }
        }
      }
      const tail = text.slice(pos);
      if (tail.trim()) put(inside, tail, true);
      else if (inside && pos < text.length) { /* whitespace only */ }
      if (inside) {
        // keep paragraph separation between blocks of one notice
        if (seg) seg.paras.push("");
      } else { run = null; seg = null; }
    });
    runs.forEach((r) => r.segs.forEach((s) => {
      s.paras = s.paras.filter((p) => p !== "");
      s.open = !!s.open && !s.closed;
    }));
    return runs.filter((r) => r.segs.some((s) => s.safety));
  }

  function makeBox(paras, open) {
    const box = document.createElement("div");
    box.className = "lp-ds-box";
    box.setAttribute("role", "note");
    if (open) box.setAttribute("data-open", "1");
    const head = document.createElement("div");
    head.className = "lp-ds-head";
    head.textContent = TITLE;
    const body = document.createElement("div");
    body.className = "lp-ds-body";
    (paras.length ? paras : [""]).forEach((p) => {
      const el = document.createElement("p");
      el.textContent = p;
      body.appendChild(el);
    });
    box.append(head, body);
    return box;
  }

  function makeWrap(run) {
    const wrap = document.createElement("div");
    wrap.className = "lp-ds-wrap";
    wrap.setAttribute("data-lp-own", "");
    for (const s of run.segs) {
      if (s.safety) wrap.appendChild(makeBox(s.paras, s.open));
      else s.paras.forEach((p) => {
        const el = document.createElement("p");
        el.className = "lp-ds-plain";
        el.textContent = p;
        wrap.appendChild(el);
      });
    }
    return wrap;
  }

  function teardown(md) {
    Array.from(md.children).forEach((c) => { if (c.classList.contains("lp-ds-wrap") && c.hasAttribute("data-lp-own")) c.remove(); });
    md.querySelectorAll(":scope > [" + SRC + "]").forEach((n) => n.removeAttribute(SRC));
    md.removeAttribute(SIG);
  }

  function renderReply(md) {
    if (inThink(md) || isOwn(md)) return;
    const blocks = Array.from(md.children).filter((c) => !c.hasAttribute("data-lp-own") && !c.matches(THINK));
    const runs = plan(blocks);
    if (!runs.length) { if (md.hasAttribute(SIG)) teardown(md); return; }
    const sig = JSON.stringify(runs.map((r) => [r.from, r.to, r.segs]));
    const wraps = md.querySelectorAll(":scope > .lp-ds-wrap[data-lp-own]").length;
    if (md.getAttribute(SIG) === sig && wraps === runs.length) return;
    teardown(md);
    for (const r of runs) {
      blocks[r.from].before(makeWrap(r));
      for (let k = r.from; k <= r.to; k++) blocks[k].setAttribute(SRC, "1");
    }
    md.setAttribute(SIG, sig);
  }

  // A genuine <ds_safety> element (when the site lets the unknown tag through).
  function renderElement(el) {
    if (inThink(el) || isOwn(el)) return;
    const paras = paragraphs(textOf(el));
    const sig = paras.join("\u0001");
    const prev = el.previousElementSibling;
    if (el.getAttribute(SIG) === sig && prev && prev.hasAttribute("data-lp-own") && prev.classList.contains("lp-ds-box")) return;
    if (prev && prev.hasAttribute("data-lp-own") && prev.classList.contains("lp-ds-box")) prev.remove();
    const box = makeBox(paras, false);
    box.setAttribute("data-lp-own", "");
    el.before(box);
    el.setAttribute(SRC, "1");
    el.setAttribute(SIG, sig);
  }

  function sweep() {
    try {
      ensureStyle();
      document.querySelectorAll("ds_safety").forEach(renderElement);
      document.querySelectorAll(REPLY).forEach(renderReply);
    } catch { /* never let a rendering hiccup reach the page */ }
  }

  let timer = 0;
  function schedule() {
    if (timer) return;
    timer = setTimeout(() => { timer = 0; sweep(); }, 120);
  }

  LP.dsSafety = { sweep };
  try {
    new MutationObserver((muts) => {
      // ignore changes we made ourselves
      if (muts.every((m) => m.target.nodeType === 1 && m.target.closest && m.target.closest("[data-lp-own]"))) return;
      schedule();
    }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  } catch { /* no observer: the interval below still works */ }
  setInterval(sweep, 2000);
  sweep();
})();
