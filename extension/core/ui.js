// LuaPilot - everything the user sees on the chat page: the bar, menu, banners,
// toasts, the screenshot preview and the "camouflage" that turns protocol turns into chips.
(() => {
  "use strict";
  const LP = window.LP, K = LP.kit, C = LP.cfg, PR = LP.parser;
  const P = LP.provider;

  // ── tiny DOM builder ────────────────────────────────────────────────────
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    el.setAttribute("data-lp-own", "");
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid != null) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  }
  const asset = (p) => { try { return chrome.runtime.getURL(p); } catch { return ""; } };
  const ICON = { read: "eye", edit: "pencil-simple", screen: "camera", generate: "sparkle", studio: "cube", tool: "wrench", sys: "airplane-tilt", catalog: "storefront", guide: "book-open-text", blender: "shapes" };
  const svg = (name) => LP.icon(name);

  // ── state ───────────────────────────────────────────────────────────────
  const U = { bar: null, parts: {}, menu: null, banners: null, toasts: null, shotEl: null, card: null,
    calls: new Map(), status: "idle", statusText: "", enabled: true, bridge: { connected: false, mcp: false, studio: {} },
    coverDismissed: false, shotImg: null };

  // ── status ──────────────────────────────────────────────────────────────
  const LABEL = {
    off: "Off", ready: "Ready", idle: "Ready", thinking: "Model is working", sending: "Sending",
    running: "Running", waiting: "Waiting", paused: "Paused",
  };
  function status(state, text) {
    U.status = state; U.statusText = text || "";
    U.coverDismissed = state === "idle" || state === "ready" ? false : U.coverDismissed;
    paintStatus();
  }
  // one short phrase for the bar; the full text is in the tooltip
  function shortReason(t) {
    t = String(t || "").trim();
    if (/^Stopped by you/i.test(t)) return "stopped";
    if (/Blender is required/i.test(t)) return "Blender not connected";
    const first = t.split(/(?<=[.!?])\s/)[0].replace(/[.!?]$/, "");
    return first.length > 38 ? first.slice(0, 36).trimEnd() + "…" : first;
  }
  function paintStatus() {
    const b = U.parts;
    if (!b.dot) return;
    const s = U.enabled ? U.status : "off";
    b.root.dataset.state = s;
    let label = LABEL[s] || s;
    if (s === "running" && U.statusText) label = `Running ${U.statusText}`;
    if (s === "paused" && U.statusText) label = `Paused · ${shortReason(U.statusText)}`;
    if (s !== "off" && !U.bridge.connected && s !== "waiting") label += " · bridge offline";
    b.label.textContent = label;
    b.label.title = U.statusText || "";
    b.retry.hidden = !(U.enabled && (s === "paused"));
    b.stop.hidden = !(U.enabled && ["thinking", "sending", "running", "waiting"].includes(s) && LP.agent && LP.agent.state.active);
  }

  // ── bar ─────────────────────────────────────────────────────────────────
  function buildBar() {
    const p = U.parts;
    p.dot = h("span", { class: "lp-dot" });
    p.label = h("span", { class: "lp-label" }, "Ready");
    p.retry = h("button", { class: "lp-btn", type: "button", hidden: true, onclick: () => LP.agent.retry() }, svg("arrow-counter-clockwise"), " Retry");
    p.stop = h("button", { class: "lp-btn lp-stop", type: "button", hidden: true, title: "Stop LuaPilot", onclick: () => LP.agent.stop() }, svg("stop"), " Stop");
    p.gear = h("button", { class: "lp-icon-btn", type: "button", title: "LuaPilot settings", "aria-label": "Settings", onclick: (e) => { e.stopPropagation(); toggleMenu(); } });
    p.gear.append(svg("gear-six"));
    p.root = h("div", { class: "lp-bar", "data-state": "idle" },
      h("img", { class: "lp-logo", src: asset("icons/logo-mark.png"), alt: "" }),
      h("span", { class: "lp-name" }, "LuaPilot"),
      p.dot, p.label, h("span", { class: "lp-grow" }), p.stop, p.retry, p.gear);
    U.bar = p.root;
  }

  function mountBar() {
    if (!U.bar) buildBar();
    let slot = null;
    try { slot = P.barSlot && P.barSlot(); } catch { slot = null; }
    if (slot && slot.parent) {
      U.bar.classList.remove("lp-float");
      if (U.bar.parentNode !== slot.parent || (slot.before && U.bar.nextSibling !== slot.before && U.bar.nextElementSibling !== slot.before)) {
        slot.parent.insertBefore(U.bar, slot.before || null);
      }
    } else if (!U.bar.isConnected || !U.bar.classList.contains("lp-float")) {
      U.bar.classList.add("lp-float");
      document.body.append(U.bar);
    }
  }

  // ── menu ────────────────────────────────────────────────────────────────
  function buildMenu() {
    const custom = h("textarea", { class: "lp-text", rows: "5", placeholder: "Extra instructions for the model (optional). They are added after LuaPilot's own rules.", spellcheck: "false" });
    custom.value = LP.settings.custom || "";
    let t = 0;
    custom.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { LP.settings.custom = custom.value; LP.saveSettings(); }, 400); });

    const seg = (val, text) => {
      const b = h("button", { type: "button", class: "lp-seg-b", "data-v": val, onclick: () => { LP.settings.shot = val; LP.saveSettings(); paintSeg(); if (val === "hide") hideShot(); else if (U.shotImg) renderShot(); } }, text);
      return b;
    };
    const segs = h("div", { class: "lp-seg" }, seg("show", "Show"), seg("hide", "Hide"));
    const paintSeg = () => segs.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.v === LP.settings.shot));
    paintSeg();

    U.parts.bridgeLine = h("div", { class: "lp-line" });
    U.menu = h("div", { class: "lp-menu", hidden: true },
      h("div", { class: "lp-menu-h" }, h("img", { src: asset("icons/logo-mark.png"), alt: "" }), h("b", {}, "LuaPilot"), h("span", { class: "lp-ver" }, "v" + (chrome.runtime.getManifest ? chrome.runtime.getManifest().version : ""))),
      U.parts.bridgeLine,
      h("div", { class: "lp-row" }, h("div", {}, h("b", {}, "Screenshot preview"), h("small", {}, "Small picture on the left after screen_capture. Click it to enlarge.")), segs),
      h("label", { class: "lp-lab" }, "Custom instructions"), custom,
      h("details", { class: "lp-diag" }, h("summary", {}, "Diagnostics"),
        (U.parts.diag = h("pre", { class: "lp-diag-pre" })),
        h("button", { class: "lp-btn", type: "button", onclick: () => { try { navigator.clipboard.writeText(U.parts.diag.textContent); toast("Copied", "info"); } catch { /* ignore */ } } }, "Copy")),
      h("div", { class: "lp-foot" }, "Not affiliated with DeepSeek, Roblox or any AI provider. Use at your own risk."));
    U.menu.addEventListener("click", (e) => e.stopPropagation());
    document.addEventListener("click", () => { if (U.menu) U.menu.hidden = true; });
    document.body.append(U.menu);
  }
  function toggleMenu() {
    if (!U.menu) buildMenu();
    U.menu.hidden = !U.menu.hidden;
    if (!U.menu.hidden) {
      const r = U.parts.gear.getBoundingClientRect();
      U.menu.style.left = Math.max(8, Math.min(innerWidth - 340, r.right - 330)) + "px";
      U.menu.style.bottom = Math.max(8, innerHeight - r.top + 8) + "px";
      paintBridge();
      if (U.parts.diag) U.parts.diag.textContent = LP.agent.diag();
    }
  }
  function paintBridge() {
    const l = U.parts.bridgeLine;
    if (!l) return;
    const b = U.bridge;
    const studio = b.studio && b.studio.place ? "Studio place open" : b.studio && b.studio.app ? "Studio open, no place" : "Studio not found";
    l.dataset.ok = b.connected && b.mcp ? "1" : "0";
    l.textContent = b.connected ? `Bridge connected · ${studio}` : "Bridge offline - start the LuaPilot app";
  }

  // ── toasts and banners ──────────────────────────────────────────────────
  function layer(cls) { const d = h("div", { class: cls }); document.body.append(d); return d; }
  function toast(text, kind) {
    if (!U.toasts) U.toasts = layer("lp-toasts");
    const t = h("div", { class: "lp-toast", "data-kind": kind || "info" }, text);
    U.toasts.append(t);
    requestAnimationFrame(() => t.classList.add("in"));
    setTimeout(() => { t.classList.remove("in"); setTimeout(() => t.remove(), 300); }, 6000);
  }

  const bannerState = new Map();
  function banner(id, o) {
    if (!U.banners) U.banners = layer("lp-banners");
    bannerClear(id);
    const cd = h("span", { class: "lp-cd" });
    const acts = (o.actions || []).map((a) => h("button", { class: "lp-btn", type: "button", onclick: a.fn }, a.label));
    const msg = h("span", { class: "lp-bmsg" }, o.text);
    const el = h("div", { class: "lp-banner", "data-tone": o.tone || "warn" }, msg, cd, ...acts);
    U.banners.append(el);
    requestAnimationFrame(() => el.classList.add("in"));
    let timer = 0;
    if (o.until) {
      const tick = () => {
        const left = Math.max(0, Math.ceil((o.until - Date.now()) / 1000));
        if (left > 0) cd.textContent = left >= 60 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : `${left}s`;
        else { cd.textContent = ""; if (o.doneText) msg.textContent = o.doneText; clearInterval(timer); }
      };
      tick(); timer = setInterval(tick, 500);
    }
    bannerState.set(id, { el, timer });
  }
  function bannerClear(id) {
    const b = bannerState.get(id);
    if (!b) return;
    clearInterval(b.timer); b.el.classList.remove("in");
    setTimeout(() => b.el.remove(), 250);
    bannerState.delete(id);
  }


  // ── "Use Blender in this session?" ──────────────────────────────────────
  const OS_WIN = /Win/i.test(navigator.platform || "");
  const SETUP = {
    no_bridge: { title: "The LuaPilot app is not running", steps: ["Start the LuaPilot desktop app (or start.bat) and wait until it says it is connected.", "Then press Try again."] },
    no_uv: { title: "The tool \"uv\" is missing", steps: [
      "Install uv (a small tool that runs the Blender link). In a terminal:",
      { code: OS_WIN ? 'powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"' : "curl -LsSf https://astral.sh/uv/install.sh | sh" },
      "Close and reopen the LuaPilot app so it finds uv, then press Try again."] },
    no_addon: { title: "Blender is not answering yet", steps: [
      "Install the Blender add-on once. In a terminal run:",
      { code: "uvx mcp-for-blender install-addon" },
      "Start Blender. In Edit > Preferences > Add-ons make sure \"MCP for Blender\" is enabled.",
      "In the 3D viewport press N and open the \"MCP for Blender\" tab. If the server is not running, start it there (default port 9876).",
      "Press Try again."] },
    start_failed: { title: "The Blender link could not start", steps: [
      "Check that uv works: run  uvx mcp-for-blender --help  in a terminal. The first run downloads the package, so it needs internet.",
      "Press Try again. If it keeps failing, continue without Blender and report it on GitHub Issues."] },
    no_tools: { title: "The Blender link started but gave no tools", steps: [
      "Make sure Blender is open with the add-on enabled and its server running (N panel > \"MCP for Blender\").",
      "Press Try again."] },
  };

  function askSession() {
    return new Promise((resolve) => {
      const box = h("div", { class: "lp-ask-box" });
      const wrap = h("div", { class: "lp-ask" }, box);
      let done = false;
      const finish = (v) => {
        if (done) return; done = true;
        document.removeEventListener("keydown", onKey, true);
        wrap.classList.remove("in"); setTimeout(() => wrap.remove(), 220);
        resolve(v);
      };
      const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); finish(null); } };
      document.addEventListener("keydown", onKey, true);
      const without = async () => {
        try { await LP.link.blender("disable"); } catch { /* ignore */ }
        finish(false);
      };
      const pick = { catalog: true, blender: false };
      const toggle = (key, icon, title, text) => {
        const yes = h("button", { type: "button", class: "lp-seg-b", onclick: () => { pick[key] = true; paint(); } }, "Yes");
        const no = h("button", { type: "button", class: "lp-seg-b", onclick: () => { pick[key] = false; paint(); } }, "No");
        const paint = () => { yes.classList.toggle("on", pick[key]); no.classList.toggle("on", !pick[key]); };
        paint();
        return h("div", { class: "lp-ask-opt" }, h("div", {}, h("b", {}, svg(icon), " ", title), h("small", {}, text)), h("div", { class: "lp-seg" }, yes, no));
      };
      const question = () => {
        box.replaceChildren(
          h("h3", {}, svg("rocket-launch"), "Start LuaPilot - this session"),
          toggle("catalog", "storefront", "Allow the Roblox catalog?", "The AI may search free Creator Store assets, look at their thumbnails and insert the best ones."),
          toggle("blender", "shapes", "Use Blender?", "For detailed 3D models instead of plain Parts. Models are exported to a temp folder and imported into Studio, with textures. Needs Blender with the add-on."),
          h("div", { class: "lp-ask-row" },
            h("button", { class: "lp-btn", type: "button", onclick: () => finish(null) }, "Cancel"),
            h("button", { class: "lp-btn lp-primary", type: "button", onclick: () => (pick.blender ? connect() : finish({ catalog: pick.catalog, blender: false })) }, "Start")));
      };
      const connect = async () => {
        box.replaceChildren(h("h3", { class: "lp-ask-spin" }, svg("plugs"), "Connecting to Blender..."), h("p", {}, "This can take a few seconds the first time."));
        let r;
        try { r = await LP.link.blender("enable"); } catch (e) { r = { ok: false, problem: "no_bridge" }; }
        if (r && r.ok && r.on) { toast("Blender connected", "info"); return finish({ catalog: pick.catalog, blender: true }); }
        help(r && r.problem || "no_bridge", r && (r.detail || r.error) || "");
      };
      const help = (problem, detail) => {
        const s = SETUP[problem] || SETUP.start_failed;
        const steps = h("ol", { class: "lp-ask-steps" });
        for (const st of s.steps) {
          if (typeof st === "string") { steps.append(h("li", {}, st)); continue; }
          const code = h("div", { class: "lp-ask-code" }, h("span", {}, st.code),
            h("button", { class: "lp-btn", type: "button", title: "Copy", onclick: async () => { try { await navigator.clipboard.writeText(st.code); toast("Copied", "info"); } catch { /* ignore */ } } }, svg("copy")));
          steps.append(h("li", { class: "lp-ask-li-code" }, code));
        }
        box.replaceChildren(
          h("h3", {}, svg("warning"), s.title),
          detail ? h("div", { class: "lp-ask-err" }, String(detail).slice(0, 240)) : null,
          steps,
          h("div", { class: "lp-ask-row" },
            h("button", { class: "lp-btn", type: "button", onclick: without }, "Continue without Blender"),
            h("button", { class: "lp-btn lp-primary", type: "button", onclick: connect }, "Try again")));
      };
      question();
      document.body.append(wrap);
      requestAnimationFrame(() => wrap.classList.add("in"));
    });
  }

  // ── start card (fresh chat) ─────────────────────────────────────────────
  function session(show) {
    if (!show || !U.enabled) { if (U.card) U.card.classList.remove("in"); return; }
    if (!U.card) {
      const go = h("button", { class: "lp-btn lp-primary", type: "button", onclick: async () => {
        go.disabled = true;
        const task = (P.editorText && P.editorText() || "").trim();
        const opts = await askSession();
        if (opts === null) { go.disabled = false; return; }
        const ok = await LP.agent.startSession(task, opts);
        go.disabled = false;
        if (!ok) toast("Could not start. Try again.", "error");
      } }, svg("rocket-launch"), " Start LuaPilot here");
      U.card = h("div", { class: "lp-card" },
        h("img", { src: asset("icons/logo-mark.png"), alt: "" }),
        h("div", {}, h("b", {}, "Let the AI work in your Roblox Studio"),
          h("small", {}, "Type your task below (optional), then start. LuaPilot sends the instructions and runs the commands for you.")),
        go);
      document.body.append(U.card);
    }
    U.card.classList.add("in");
  }

  // ── screenshot preview + gallery (last 10) ──────────────────────────────
  const MAX_SHOTS = 10;
  const src = (im) => `data:${im.mimeType || "image/png"};base64,${im.data}`;
  function shot(images) {
    if (!images || !images.length) return;
    U.shots = U.shots || [];
    for (const im of images) U.shots.push({ src: src(im), at: Date.now() });
    while (U.shots.length > MAX_SHOTS) U.shots.shift();
    U.shotImg = U.shots[U.shots.length - 1].src;
    if (LP.settings.shot === "hide") return;
    renderShot();
  }
  function renderShot() {
    if (!U.shotEl) {
      const img = h("img", { alt: "screen_capture" });
      const close = h("button", { class: "lp-x", type: "button", title: "Hide", onclick: (e) => { e.stopPropagation(); hideShot(); } }, "×");
      U.shotCount = h("span", { class: "lp-shot-n" });
      U.shotEl = h("div", { class: "lp-shot", title: "Click to enlarge", onclick: () => openLightbox() }, img, h("span", { class: "lp-shot-cap" }, "screen_capture"), U.shotCount, close);
      U.shotEl._img = img;
      document.body.append(U.shotEl);
    }
    U.shotEl._img.src = U.shotImg;
    U.shotCount.textContent = U.shots && U.shots.length > 1 ? `${U.shots.length} ▸` : "";
    requestAnimationFrame(() => U.shotEl.classList.add("in"));
  }
  function hideShot() { if (U.shotEl) U.shotEl.classList.remove("in"); }
  function openLightbox() {
    const shots = U.shots || [];
    if (!shots.length) return;
    let idx = shots.length - 1;
    const big = h("img", { alt: "" });
    const info = h("span", { class: "lp-lb-info" });
    const strip = h("div", { class: "lp-lb-strip" });
    const box = h("div", { class: "lp-lightbox" }, big, info, strip);
    const show = (i) => {
      idx = (i + shots.length) % shots.length;
      big.src = shots[idx].src;
      info.textContent = `${idx + 1} / ${shots.length}  ·  ← → to browse, Esc to close`;
      [...strip.children].forEach((c, k) => c.classList.toggle("on", k === idx));
    };
    shots.forEach((sh, k) => strip.append(h("img", { src: sh.src, alt: "", onclick: (e) => { e.stopPropagation(); show(k); } })));
    const close = () => { box.classList.remove("in"); document.removeEventListener("keydown", onKey, true); setTimeout(() => box.remove(), 220); };
    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); close(); }
      else if (e.key === "ArrowLeft") { e.stopPropagation(); show(idx - 1); }
      else if (e.key === "ArrowRight") { e.stopPropagation(); show(idx + 1); }
    };
    box.addEventListener("click", (e) => { if (e.target === box || e.target === big) close(); });
    document.addEventListener("keydown", onKey, true);
    document.body.append(box);
    show(idx);
    requestAnimationFrame(() => box.classList.add("in"));
  }

  // ── chips (camouflage) ──────────────────────────────────────────────────
  function chip(key, info) { U.calls.set(key, Object.assign(U.calls.get(key) || {}, info)); sweepSoon(); }

  function makeChip(kind, label, state, detail) {
    const cat = kind === "sys" ? "sys" : /^catalog_/.test(label) ? "catalog" : (label === "style_guide" || label === "reference_images") ? "guide" : /^(blender_|models_)/.test(label) ? "blender" : C.toolCategory(label);
    const head = h("button", { class: "lp-chip-h", type: "button" }, svg(ICON[cat] || ICON.tool),
      h("span", { class: "lp-chip-t" }, label || "LuaPilot"), h("span", { class: "lp-chip-s" }), h("span", { class: "lp-chev" }));
    const body = h("pre", { class: "lp-chip-b", hidden: true });
    const el = h("div", { class: "lp-chip", "data-chip": "", "data-state": state, "data-kind": kind, "data-cat": cat }, head, body);
    head.addEventListener("click", () => { body.hidden = !body.hidden; el.classList.toggle("open", !body.hidden); if (!body.hidden) body.textContent = el._detail || ""; });
    el._detail = detail || "";
    el._head = head; el._body = body;
    return el;
  }
  function paintChip(el, kind, label, state, detail) {
    el.dataset.state = state;
    el._detail = detail || "";
    if (!el._body.hidden) el._body.textContent = el._detail;
    el._head.querySelector(".lp-chip-t").textContent = label;
    el._head.querySelector(".lp-chip-s").textContent = { run: "running", ok: "done", err: "error", pending: "", done: "", result: "result", error: "error", note: "note", sys: "" }[state] || "";
  }

  let sweepQueued = false;
  function sweepSoon() { if (sweepQueued) return; sweepQueued = true; setTimeout(() => { sweepQueued = false; sweep(); }, 60); }

  function sweep() {
    let turns;
    try { turns = P.turns() || []; } catch { return; }
    turns.forEach((t, i) => {
      try { t.role === "user" ? sweepUser(t) : sweepAssistant(turns, i); } catch { /* a bad turn must not stop the others */ }
    });
  }

  function sweepUser(t) {
    const raw = P.text(t.el);
    const k = PR.injectedKind(raw);
    if (!k) return;
    const body = P.body(t.el);
    if (!body) return;
    const label = k.kind === "sys" ? `LuaPilot · ${k.label}` : k.label ? `${k.label}` : "LuaPilot";
    const state = k.kind === "sys" ? "sys" : k.kind;
    const detail = raw.replace(/^⟦LP[^⟧]*⟧[^\n]*\n?/, "").slice(0, 20000);
    let el = t.el.querySelector(":scope [data-chip]") || t.el.querySelector("[data-chip]");
    if (!el) {
      el = makeChip(k.kind, label, state, detail);
      body.parentNode.insertBefore(el, body);
    }
    paintChip(el, k.kind, label, state, detail);
    body.classList.add("lp-hide");
    // LuaPilot's own messages (results, errors, screenshots, instructions) are not part of the conversation
    // the user reads; the call chip on the assistant turn shows what happened.
    t.el.classList.add("lp-hide");
  }

  // The model's own tool-call tags (DSML) are noise for the reader: hide the smallest elements that hold them.
  function hideDsml(root) {
    const body = (P.body && P.body(root)) || root;
    if (!body || !PR.DSML.test(K.readText(body))) return;
    const hit = (e) => PR.DSML.test(e.textContent || "");
    const all = [body, ...body.querySelectorAll("*")].filter(hit);
    for (const e of all) {
      if ([...e.children].some(hit)) continue;
      e.classList.add("lp-hide");
    }
  }

  // the "[LuaPilot]" first line the model writes before a command is for the extension, not for the reader
  function hideTag(root) {
    if (!root) return;
    for (const el of root.querySelectorAll("p, div, span, li, h1, h2, h3")) {
      if (el.children.length > 1 || el.classList.contains("lp-hide")) continue;
      if ((el.textContent || "").trim() === "[LuaPilot]") { el.classList.add("lp-hide"); return; }
    }
  }

  function sweepAssistant(turns, i) {
    const t = turns[i];
    hideTag(t.el);
    const blocks = (P.codeBlocks(t.el) || []).filter((b) => /@@LP(CALL|LUA)/.test(K.readText(b)));
    if (!blocks.length) { hideDsml(t.el); return; }
    const key = LP.agent.keyOf(turns, i);
    const r = PR.analyze(blocks.map((b) => K.readText(b)).join("\n"), []);
    const info = U.calls.get(key) || {};
    const name = info.name || r.name || "command";
    let state = info.state || (LP.agent.state.answered.has(key) ? "done" : "pending");
    if (!info.state && r.kind === "error") state = P.generating() ? "pending" : "err";
    const detail = blocks.map((b) => K.readText(b)).join("\n\n") + (info.text ? "\n\n—— result ——\n" + info.text : "");
    let el = t.el.querySelector("[data-chip]");
    if (!el) {
      el = makeChip("call", name, state, detail);
      blocks[0].parentNode.insertBefore(el, blocks[0]);
    }
    paintChip(el, "call", name, state, detail);
    blocks.forEach((b) => b.classList.add("lp-hide"));
  }

  // ── input cover ─────────────────────────────────────────────────────────
  function paintCover() {
    const busy = U.enabled && LP.agent && LP.agent.state.active && ["thinking", "sending", "running"].includes(U.status);
    let ed = null;
    try { ed = P.editor(); } catch { /* ignore */ }
    if (!busy || U.coverDismissed || !ed) { if (U.cover) U.cover.classList.remove("in"); return; }
    if (!U.cover) {
      U.cover = h("div", { class: "lp-cover", title: "Press Stop to type" },
        h("span", { class: "lp-spin" }), h("span", {}, "LuaPilot is working - press Stop to write"));
      document.body.append(U.cover);
    }
    try { if (ed.contains(document.activeElement) || ed === document.activeElement) document.activeElement.blur(); } catch { /* ignore */ }
    const r = ed.getBoundingClientRect();
    Object.assign(U.cover.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
    U.cover.classList.add("in");
  }

  // ── lifecycle ───────────────────────────────────────────────────────────
  function setEnabled(on) {
    U.enabled = !!on;
    if (U.bar) U.bar.classList.toggle("lp-off", !U.enabled);
    document.documentElement.toggleAttribute("data-lp-off", !U.enabled);
    if (!U.enabled) { session(false); if (U.cover) U.cover.classList.remove("in"); }
    paintStatus();
  }

  const bridgeText = () => (U.bridge.connected ? `connected mcp=${U.bridge.mcp} place=${!!(U.bridge.studio && U.bridge.studio.place)}` : "offline");
  function setBridge(s) {
    U.bridge = { connected: !!s.connected, mcp: !!s.mcp, studio: s.studio || {} };
    paintStatus(); paintBridge();
  }

  function init() {
    buildBar(); mountBar(); setEnabled(U.enabled);
    new MutationObserver(sweepSoon).observe(document.body, { childList: true, subtree: true, characterData: true });
    setInterval(() => { mountBar(); sweep(); paintCover(); }, 700);
    window.addEventListener("resize", paintCover);
    // while the cover is up, nothing may reach the message box (keys, paste, drops)
    const lock = (e) => {
      if (!U.cover || !U.cover.classList.contains("in")) return;
      let ed = null; try { ed = P.editor(); } catch { /* ignore */ }
      if (ed && (ed === e.target || ed.contains(e.target))) { e.preventDefault(); e.stopPropagation(); }
    };
    ["keydown", "keypress", "beforeinput", "paste", "drop"].forEach((n) => document.addEventListener(n, lock, true));
  }

  LP.ui = { bridgeText, init, status, toast, banner, bannerClear, chip, shot, session, setEnabled, setBridge, sweep };
})();
