// LuaPilot - shared DOM helpers used by the core and by every provider.
// Loaded first; everything hangs off the global `LP` object.
(() => {
  "use strict";
  const LP = (window.LP = window.LP || {});

  // Long waits go through the background worker: timers of a hidden tab are throttled hard
// (down to one wake-up per minute), the worker's are not. LP.kit.slow is set by core/link.js.
const sleep = (ms) => (ms >= 250 && LP.kit && LP.kit.slow ? LP.kit.slow(ms) : new Promise((r) => setTimeout(r, ms)));

  // Resolves true as soon as pred() is truthy, false after `ms`.
  async function waitFor(pred, ms = 5000, step = 100) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      try { if (pred()) return true; } catch { /* keep waiting */ }
      await sleep(step);
    }
    try { return !!pred(); } catch { return false; }
  }

  const q = (sel, root = document) => { try { return root.querySelector(sel); } catch { return null; } };
  const qa = (sel, root = document) => { try { return Array.from(root.querySelectorAll(sel)); } catch { return []; } };

  function visible(el) {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none";
  }

  // Short non-cryptographic hash, for building turn keys.
  function hash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  // Everything LuaPilot injects into a page carries data-lp-own so text readers skip it.
  const OWN = "[data-lp-own]";

  const BLOCK = new Set(["P", "DIV", "LI", "UL", "OL", "PRE", "BLOCKQUOTE", "H1", "H2", "H3", "H4",
    "H5", "H6", "TABLE", "TR", "SECTION", "ARTICLE", "HR"]);

  // Faithful text of a message, as a person would copy it.
  //  - <br> and block boundaries become newlines
  //  - code editors that render one element per line (CodeMirror .cm-line, Monaco
  //    .view-line, "line" spans) are joined with newlines - textContent would
  //    glue the whole script onto one line
  //  - nodes matching opts.skip (selector string or function) and our own nodes
  //    are ignored
  //  - an element with data-lp-text holds the true text (set by a MAIN-world tap)
  function readText(root, opts = {}) {
    if (!root) return "";
    const skipSel = typeof opts.skip === "string" ? opts.skip : "";
    const skipFn = typeof opts.skip === "function" ? opts.skip : null;
    const lineSel = opts.lines || ".cm-line, .view-line";
    let out = "";
    const walk = (node) => {
      if (node.nodeType === 3) { out += node.nodeValue; return; }
      if (node.nodeType !== 1) return;
      if (node.matches && (node.matches(OWN) || (skipSel && node.matches(skipSel)) || (skipFn && skipFn(node)))) return;
      const tag = node.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "SVG" || tag === "BUTTON") return;
      if (node.hasAttribute && node.hasAttribute("data-lp-text")) {
        out += node.getAttribute("data-lp-text");
        return;
      }
      if (tag === "BR") { out += "\n"; return; }
      const lines = node.querySelectorAll ? node.querySelectorAll(lineSel) : [];
      if (lines.length && !node.matches(lineSel)) {
        // a code surface: emit one line per line element
        const seen = [];
        lines.forEach((ln) => { if (!seen.some((s) => s.contains(ln))) seen.push(ln); });
        if (seen.length) {
          const joined = seen.map((ln) => ln.textContent.replace(/​/g, "")).join("\n");
          if (out && !out.endsWith("\n")) out += "\n";
          out += joined + "\n";
          return;
        }
      }
      const isBlock = BLOCK.has(tag);
      if (isBlock && out && !out.endsWith("\n")) out += "\n";
      for (const c of node.childNodes) walk(c);
      if (isBlock && !out.endsWith("\n")) out += "\n";
    };
    walk(root);
    return out.replace(/ /g, " ").replace(/\n{3,}/g, "\n\n").trim();
  }

  // ── input helpers ───────────────────────────────────────────────────────
  function fire(el, type, init = {}) {
    el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true, ...init }));
  }

  // Sets a <textarea>/<input> value in a way React/Vue controlled inputs notice.
  function setNativeValue(el, text) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    el.focus();
    setter.call(el, text);
    el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // Replaces the content of a contenteditable (ProseMirror, Lexical, Quill, Slate...).
  // Strategy: select all, then insertText; fall back to a synthetic paste; finally
  // write the text directly. Returns true if the element ended up holding the text.
  function setEditableText(el, text) {
    el.focus();
    const want = text.replace(/\s+/g, " ").trim();
    const has = () => (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
    const selectAll = () => {
      const sel = getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
    };
    selectAll();
    try { document.execCommand("delete"); } catch { /* ignore */ }
    let ok = false;
    try {
      selectAll();
      ok = document.execCommand("insertText", false, text);
    } catch { ok = false; }
    if (ok && has() === want) return true;
    try {
      selectAll();
      const dt = new DataTransfer();
      dt.setData("text/plain", text);
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
      if (has() === want) return true;
    } catch { /* ignore */ }
    el.textContent = text;
    el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    return has() === want;
  }

  function clearEditable(el) {
    el.focus();
    const sel = getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
    try { document.execCommand("delete"); } catch { /* ignore */ }
    if ((el.textContent || "").trim()) { el.textContent = ""; fire(el, "input"); }
  }

  // A full pointer click; plain el.click() is ignored by some widgets.
  function click(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const base = { bubbles: true, cancelable: true, view: window, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    for (const t of ["pointerdown", "mousedown", "pointerup", "mouseup"]) {
      const C = t.startsWith("pointer") && window.PointerEvent ? PointerEvent : MouseEvent;
      el.dispatchEvent(new C(t, base));
    }
    el.click();
    return true;
  }

  function pressKey(el, key, init = {}) {
    const code = key === "Enter" ? 13 : 0;
    const opts = { key, code: key, keyCode: code, which: code, bubbles: true, cancelable: true, ...init };
    el.dispatchEvent(new KeyboardEvent("keydown", opts));
    el.dispatchEvent(new KeyboardEvent("keypress", opts));
    el.dispatchEvent(new KeyboardEvent("keyup", opts));
  }

  // ── images ──────────────────────────────────────────────────────────────
  function toFile(img, i = 0) {
    const mime = img.mimeType || "image/jpeg";
    const bin = atob(img.data);
    const bytes = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
    const ext = (mime.split("/")[1] || "jpg").replace("jpeg", "jpg");
    return new File([bytes], `capture-${Date.now()}-${i}.${ext}`, { type: mime });
  }

  // Hands files to a page through a file <input>.
  function attachViaInput(input, files) {
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));
    input.files = dt.files;
    fire(input, "change");
    fire(input, "input");
  }

  // Hands files to a page as if pasted into `target` (works on most chat composers).
  function attachViaPaste(target, files) {
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));
    target.focus();
    target.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }

  // Hands files to a page as if dropped on `target`.
  function attachViaDrop(target, files) {
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));
    for (const t of ["dragenter", "dragover", "drop"]) {
      target.dispatchEvent(new DragEvent(t, { dataTransfer: dt, bubbles: true, cancelable: true }));
    }
  }

  LP.kit = {
    sleep, waitFor, q, qa, visible, hash, OWN, readText, fire, setNativeValue, setEditableText,
    clearEditable, click, pressKey, toFile, attachViaInput, attachViaPaste, attachViaDrop,
  };
})();
