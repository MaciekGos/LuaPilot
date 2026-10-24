// LuaPilot - the agent loop.
//
// Design goals (these are the fixes for the "Messages too frequent" problem):
//  * One watcher decides when a reply is finished; history is never executed.
//  * Every assistant turn is answered at most once (`answered`), and executed commands
//    are remembered across reloads (`lpExec`), so a reload can never repeat a command.
//  * Every message LuaPilot injects goes through ONE governor: serialized, spaced,
//    capped per minute, and slowed down further after a rate-limit hit.
//  * Loops (same command again and again, endless broken replies) are stopped.
//  * If the site still says "too frequent": reload -> longer wait + reload ->
//    fresh chat, then back -> stop with a visible countdown.
(() => {
  "use strict";
  const LP = window.LP, K = LP.kit, C = LP.cfg, PR = LP.parser;
  const P = LP.provider;
  const ST = () => LP.store;
  const UI = () => LP.ui;
  const T = Object.assign({ idleMs: 1500, stableMs: 2500, warmupMs: 45000, timeoutMs: 300000 }, P.timings || {});
  const RATE = Object.assign({ minGapMs: 2500, perMinute: 10 }, P.rate || {});

  const TICK = 250;
  const MAX_SAME = 4, MAX_ERR = 3, MAX_CONT = 4, MAX_OUT = 60000;
  const HIT_WINDOW = 10 * 60e3;
  const BLOCK_MS = 5 * 60e3;

  const S = {
    enabled: true, paused: false, halt: "",
    conv: null, baselinePending: true, seenAt: 0, lastCount: -1, countAt: 0,
    answered: new Set(), exec: new Set(), active: false,
    lastText: "", textAt: 0, genAt: 0,
    sending: false, awaiting: null, lastInjected: null, sentAt: 0,
    sameKey: "", sameN: 0, errN: 0, contN: 0, okCalls: 0, sinceSys: 0,
    userSeen: 0, tools: null, toolsAt: 0, catalog: true, blender: false,
    pace: { mult: 1 }, rate: { hits: 0, lastHitAt: 0, phase: "", blockedUntil: 0 },
    rateKey: "", rateBusyUntil: 0, clean: 0, busyRetries: 0, replayTried: false,
    pendingReplay: null, sess: {}, newChatSince: 0, ticking: false, calls: 0, cool: 0, log: [], curCall: "", lastAnalysis: "",
  };

  const now = () => Date.now();
  const turnsOf = () => { try { return P.turns() || []; } catch { return []; } };
  const isInj = (el) => PR.isInjected(safeText(el));
  function safeText(el) { try { return P.text(el) || ""; } catch { return ""; } }

  // Stable key of a turn: the site's id, else its position among turns of that role.
  function keyOf(turns, i) {
    const t = turns[i];
    const id = t && P.turnId ? P.turnId(t.el) : null;
    if (id) return `${t.role[0]}:${id}`;
    let n = 0;
    for (let k = 0; k < i; k++) if (turns[k].role === t.role) n++;
    return `${t.role[0]}#${n}`;
  }

  // ── persistence ─────────────────────────────────────────────────────────
  // stored per-chat notes: drop entries older than 4 days counted from the newest one
  function pruneMap(m) {
    const v = Object.values(m).map(Number).filter((x) => x > 0);
    if (!v.length) return m;
    const cut = Math.max(...v) - 4 * 86400000;
    for (const k of Object.keys(m)) if (Number(m[k]) < cut) delete m[k];
    return m;
  }
  const chatPath = () => { try { return location.pathname || "/"; } catch { return "/"; } };
  // remember per chat that Blender is required, so coming back to the chat checks the connection again
  function rememberBlender() {
    const m = S.blenderChats || (S.blenderChats = {});
    const p = chatPath();
    if (p === "/" || p === "") return;
    if (S.blender && S.active) { if (!m[p]) { m[p] = Date.now(); ST().set({ lpBlenderChats: pruneMap(m) }); } }
    else if (!S.blender && m[p]) { delete m[p]; ST().set({ lpBlenderChats: pruneMap(m) }); }
  }
  // Blender is "required" in this chat: make sure the bridge really has it. Returns true when connected.
  async function ensureBlender() {
    if (!S.blender) return true;
    let st = null;
    try { st = await LP.link.status(); } catch { /* ignore */ }
    if (st && st.blender) { S.blenderDown = false; return true; }
    let r = null;
    try { r = await LP.link.blender("enable"); } catch { /* ignore */ }
    if (r && r.ok && r.on) { S.blenderDown = false; S.toolsAt = 0; UI().toast("Blender reconnected", "info"); return true; }
    S.blenderDown = true;
    S.blenderWhy = (r && r.problem) || "no_bridge";
    return false;
  }
  const BLENDER_DOWN = "Blender is required in this session but is not connected. Start Blender (add-on server running, N panel > MCP for Blender) and the LuaPilot app, then send any message here to continue.";

  async function loadState() {
    const v = await ST().get(["lpEnabled", "lpPace", "lpRate", "lpExec", "lpCool", "lpCatalog", "lpBlenderChats", "lpSessions"]);
    S.sess = v.lpSessions && typeof v.lpSessions === "object" ? v.lpSessions : {};
    S.catalog = v.lpCatalog !== false;
    S.blenderChats = v.lpBlenderChats && typeof v.lpBlenderChats === "object" ? v.lpBlenderChats : {};
    delete S.blenderChats["/"];          // an unsaved new chat has no identity yet: never remember it
    S.blender = !!S.blenderChats[chatPath()];
    S.cool = Number(v.lpCool) > now() ? Number(v.lpCool) : 0;
    S.enabled = v.lpEnabled !== false;
    if (v.lpPace && v.lpPace.mult) S.pace = v.lpPace;
    if (v.lpRate) Object.assign(S.rate, v.lpRate);
    (v.lpExec || []).forEach((k) => S.exec.add(k));
  }
  const saveRate = () => ST().set({ lpRate: S.rate });
  const savePace = () => ST().set({ lpPace: S.pace });
  function rememberExec(k) {
    S.exec.add(k);
    ST().set({ lpExec: [...S.exec].slice(-80) });
  }

  // ── governor ────────────────────────────────────────────────────────────
  const gov = { q: Promise.resolve(), log: [], lastAt: 0 };

  async function govern() {
    const mult = S.pace.mult || 1;
    for (let guard = 0; guard < 600; guard++) {
      const t = now();
      gov.log = gov.log.filter((x) => t - x < 60000);
      const cap = Math.max(1, Math.floor(RATE.perMinute / mult));
      const byGap = gov.lastAt + RATE.minGapMs * mult + Math.random() * 500 - t;
      const byCap = gov.log.length >= cap ? gov.log[0] + 60000 - t : 0;
      const wait = Math.max(byGap, byCap, 0);
      if (wait <= 0) return;
      await K.sleep(Math.min(wait, 800));
    }
  }

  const enqueue = (job) => { const p = gov.q.then(job, job); gov.q = p.catch(() => {}); return p; };
  const userCount = () => turnsOf().filter((t) => t.role === "user").length;

  // ── back-off: a message is never hammered ───────────────────────────────
  // After a failed send or a rate-limit hit nothing at all is sent until `S.cool`; every
  // further failure of the same text doubles the wait (15 s, 30 s, 60 s ... up to 5 min).
  const coolFor = (n) => Math.min(300000, 15000 * Math.pow(2, Math.max(0, n - 1)));
  const attempts = new Map();   // hash(text) -> { n, at }
  function setCool(ms) {
    S.cool = Math.max(S.cool || 0, now() + ms);
    ST().set({ lpCool: S.cool });
  }
  async function waitCool() {
    while (S.cool > now() && S.enabled && !S.halt) {
      UI().status("waiting", `${Math.ceil((S.cool - now()) / 1000)}s`);
      await K.sleep(Math.min(1000, S.cool - now()));
    }
  }
  const noteLog = (m) => { S.log.push(`${new Date().toLocaleTimeString()} ${m}`); if (S.log.length > 40) S.log.shift(); };

  // Sends one message. Resolves true when the site accepted it. At most three attempts, each
  // after a longer pause, and never while a rate-limit notice is on the page.
  function deliver(text, images, why) {
    return enqueue(async () => {
      if (!S.enabled || S.halt) return false;
      let imgs = images || null;
      S.lastInjected = { text, images: imgs, why: why || "" };
      const h = K.hash(text);
      for (let attempt = 0; attempt < 3; attempt++) {
        UI().status("sending");
        await K.waitFor(() => !P.generating(), 60000, 300);   // never type over a running reply
        if (S.rate.blockedUntil > now()) return false;
        const rec = attempts.get(h);
        if (rec) setCool(Math.max(0, rec.at + coolFor(rec.n) - now()));
        await waitCool();
        if (!S.enabled || S.halt) return false;
        await govern();
        const before = userCount();
        S.sending = true;
        let ok = false;
        try { ok = await P.send(text, imgs || []); } catch { ok = false; }
        gov.lastAt = now(); gov.log.push(gov.lastAt);
        if (!ok) { await K.sleep(3500); ok = userCount() > before || P.generating(); }
        S.sending = false;
        S.sentAt = now();
        if (ok) {
          attempts.delete(h);
          noteLog(`sent (${why || "msg"}, ${text.length} chars${imgs ? ", with image" : ""})`);
          S.awaiting = { since: now(), users: userCount() };
          return true;
        }
        const n = (rec ? rec.n : 0) + 1;
        attempts.set(h, { n, at: now() });
        noteLog(`send NOT accepted (attempt ${attempt + 1})`);
        if (rateVisible()) { setCool(coolFor(n)); return false; }   // the rate ladder takes over
        setCool(coolFor(n));
        if (imgs) { imgs = null; text += "\n\n(LuaPilot: the screenshot could not be attached to this chat.)"; }
      }
      UI().toast("Could not send the message. Use Retry in the bar.", "error");
      return false;
    });
  }

  function rateVisible() { try { const n = P.notice && P.notice(); return !!(n && n.kind === "rate"); } catch { return false; } }

  // ── tools ───────────────────────────────────────────────────────────────
  // Commands the user switched off for this session are hidden from the model and refused.
  const CATALOG_TOOLS = /^(catalog_search|catalog_images|search_creator_store|insert_from_creator_store)$/;
  const allowed = (t) => !(!S.catalog && CATALOG_TOOLS.test(t.name)) && !(!S.blender && /^(blender_|models_)/.test(t.name));
  async function getTools(force) {
    if (!force && S.tools && now() - S.toolsAt < 30000) return S.tools.filter(allowed);
    const r = await LP.link.tools();
    if (r && r.length) { S.tools = r; S.toolsAt = now(); }
    return (S.tools || []).filter(allowed);
  }

  // DSML values are strings; use the command's schema to turn them into numbers, booleans, arrays.
  function coerce(call, tools) {
    if (!call.dsml) return;
    const t = tools.find((x) => x.name === call.name);
    const props = (t && t.inputSchema && t.inputSchema.properties) || {};
    for (const [k, v] of Object.entries(call.args)) {
      if (typeof v !== "string") continue;
      const ty = [].concat((props[k] || {}).type || []);
      if (ty.includes("integer") || ty.includes("number")) { const n = Number(v); if (v !== "" && !Number.isNaN(n)) call.args[k] = n; }
      else if (ty.includes("boolean")) call.args[k] = /^true$/i.test(v);
      else if (ty.includes("array") || ty.includes("object")) { try { call.args[k] = JSON.parse(v); } catch { /* keep the string */ } }
    }
  }

  function listCommandsText(tools) {
    const lines = tools.map((t) => {
      const sch = t.inputSchema || {};
      const req = new Set(sch.required || []);
      const props = Object.entries(sch.properties || {}).map(([k, v]) => {
        const ty = Array.isArray(v.type) ? v.type.join("|") : v.type || "any";
        const en = v.enum ? ` {${v.enum.join("|")}}` : "";
        return `    - ${k}${req.has(k) ? " (required)" : ""}: ${ty}${en}${v.description ? " - " + String(v.description).split("\n")[0] : ""}`;
      }).join("\n");
      const note = C.TOOL_NOTES[t.name] ? `\n    NOTE: ${C.TOOL_NOTES[t.name]}` : "";
      return `* ${t.name} - ${String(t.description || "").trim()}\n${props}${note}`;
    });
    return `Available commands (${tools.length}). Luau code goes in an @@LPLUA@@ block (execute_luau).\n\n${lines.join("\n\n")}`;
  }

  const stripStack = (s) => String(s).replace(/\b(ExecuteLuauTool|CommandExecution):\d+:\s*/g, "");

  function shapeResult(name, res) {
    if (!res || !res.ok) {
      const e = String((res && res.error) || "unknown error");
      if (res && res.kind === "stale") return C.FIX.staleTab;
      if (res && res.kind === "offline") return C.FIX.bridgeOffline;
      if (/Unable to find an active Studio/i.test(e)) return C.FIX.studioOffline;
      return C.wrap.error(name, stripStack(e));
    }
    let text = stripStack(res.text || "(no output)");
    if (/Unable to find an active Studio/i.test(text)) return C.FIX.studioOffline;
    if (text.length < 400 && /\bis required\b|not available|invalid (parameter|argument|value)/i.test(text)) return C.wrap.error(name, text);
    let big = 0;
    if (text.length > MAX_OUT) {
      big = text.length;
      text = text.slice(0, 30000) + "\n...[cut]...\n" + text.slice(-20000);
    }
    return C.wrap.result(name, text) + (big ? "\n\n" + C.FIX.tooBig(big) : "");
  }

  function prepare(name, args) {
    const a = Object.assign({}, args);
    if (name === "execute_luau" && !a.datamodel_type) a.datamodel_type = "Edit";
    if ((name === "user_keyboard_input" || name === "user_mouse_input") && !a.datamodel_type) a.datamodel_type = "Client";
    return { args: a, timeout: name === "execute_luau" ? 20000 : name === "models_import" ? 300000 : 120000 };
  }

  // ── feedback ────────────────────────────────────────────────────────────
  async function feedback(text, images, why) {
    if (P.resendEvery > 0 && S.sinceSys >= P.resendEvery) {
      text = C.buildSystemPrompt({ notes: P.notes, custom: LP.settings.custom, resend: true, blender: !!S.blender, catalog: S.catalog }) + "\n\n" + text;
      S.sinceSys = 0;
    }
    return deliver(text, images, why);
  }

  // ── reply handling ──────────────────────────────────────────────────────
  async function handle(turns, i) {
    const t = turns[i];
    const key = keyOf(turns, i);
    const text = safeText(t.el);
    S.answered.add(key);
    S.sinceSys++;
    S.clean++;
    if (S.rate.hits > 0 && S.clean >= 3) { S.rate.hits = 0; saveRate(); }
    if (S.clean % 5 === 0 && S.pace.mult > 1) { S.pace.mult = Math.max(1, +(S.pace.mult * 0.8).toFixed(2)); savePace(); }

    const tools = await getTools();
    const known = tools.map((x) => x.name).concat("list_commands");
    const r = PR.analyze(text, known);
    S.lastAnalysis = `${r.kind}${r.name ? " " + r.name : ""}${r.reason ? " (" + r.reason + ")" : ""}`;
    noteLog(`reply read: ${S.lastAnalysis}`);

    if (r.kind === "none") {
      S.errN = 0; S.sameN = 0; S.sameKey = "";
      const cont = P.continueButton && P.continueButton();
      if (cont && S.contN < MAX_CONT) { S.contN++; K.click(cont); S.answered.delete(key); S.genAt = now(); return; }
      S.contN = 0;
      UI().status("idle");
      return;
    }
    S.contN = 0;

    if (r.kind === "error" || r.kind === "many") {
      UI().chip(key, { state: "err", name: r.name || "command" });
      if (++S.errN > MAX_ERR) return halt("The model keeps sending commands LuaPilot cannot read. Stopped after 3 tries.");
      const msg = r.kind === "many" ? C.FIX.many(r.names) : C.FIX.unreadable(r.reason, r.name);
      return void (await feedback(msg, null, "fix"));
    }

    const call = r.calls[0];
    coerce(call, tools);
    const ck = call.name + "|" + JSON.stringify(call.args);
    S.sameN = ck === S.sameKey ? S.sameN + 1 : 1;
    S.sameKey = ck;
    if (S.sameN >= MAX_SAME) {
      UI().chip(key, { state: "err", name: call.name });
      return halt(`The model repeated the same command ${MAX_SAME} times in a row. Stopped so it does not loop.`);
    }

    const ek = `${S.conv}|${key}|${K.hash(text)}`;
    if (S.exec.has(ek)) return; // already ran (we reloaded) - never run twice
    rememberExec(ek);

    UI().chip(key, { state: "run", name: call.name, args: call.args });
    UI().status("running", call.name);
    S.curCall = call.name;
    S.calls++;
    const out = await runCall(call);
    S.curCall = "";
    noteLog(`${call.name} -> ${out.ok ? "ok" : "error"}`);
    UI().chip(key, { state: out.ok ? "ok" : "err", name: call.name, args: call.args, text: out.preview });
    if (!out.ok) { if (++S.errN > MAX_ERR) return halt("Too many failed commands in a row. Stopped."); }
    else S.errN = 0;
    if (out.ok && ++S.okCalls % 20 === 0) out.text += C.reminder(await getTools());
    if (!S.enabled) return;
    await feedback(out.text, out.images, "result");
  }

  async function runCall(call) {
    const name = call.name;
    const done = (ok, text, extra = {}) => ({ ok, text, preview: text.replace(/^⟦LP⟧[^\n]*\n/, "").slice(0, 600), ...extra });
    if (!S.blender && (name === "list_commands" || /^(blender_|models_)/.test(name))) {
      // the user connected Blender in this bridge session (disabling it switches it off), so trust the bridge over our flag
      let st = null;
      try { st = await LP.link.status(); } catch { /* ignore */ }
      if (st && st.blender) { S.blender = true; S.toolsAt = 0; rememberBlender(); }
    }
    if (name === "list_commands") {
      const tools = await getTools(true);
      if (!tools.length) return done(false, C.FIX.bridgeOffline);
      return done(true, C.wrap.result(name, listCommandsText(tools)));
    }
    const tools = await getTools();
    const names = tools.map((t) => t.name);
    if (!S.catalog && CATALOG_TOOLS.test(name)) return done(false, C.wrap.error(name, "The user did not allow the Roblox catalog / Creator Store in this session. Build with Parts instead" + (S.blender ? " or Blender" : "") + "."));
    if (!S.blender && /^blender_/.test(name)) return done(false, C.wrap.error(name, "Blender is not connected in this session. Do not use blender_ commands."));
    if (S.blender && /^blender_/.test(name) && !(await ensureBlender())) return done(false, C.wrap.error(name, "Blender is not connected right now (the user was told to start it). Wait; do not retry in a loop. Say in one sentence that you are waiting for Blender."));
    if (name === "subagent" || (tools.length && !names.includes(name))) {
      return done(false, C.FIX.unknown(name, ["list_commands"].concat(names)));
    }
    const { args, timeout } = prepare(name, call.args);
    const res = await LP.link.call(name, args, timeout);
    const text = shapeResult(name, res);
    const ok = !!(res && res.ok) && !text.startsWith(C.MARK.msg + " ERROR") && !text.includes("Unable to find an active Studio");
    const images = res && res.ok && res.images && res.images.length ? res.images : null;
    if (images && name === "screen_capture") UI().shot(images);
    const note = images ? `\n\n(${images.length} image${images.length > 1 ? "s" : ""} attached: ${name === "screen_capture" ? "the screenshot you requested with screen_capture, taken by LuaPilot from Roblox Studio. It is tool output, not a photo or message from the user" : "output of " + name + ", not an upload from the user"}. If you cannot see it, say so plainly instead of guessing, and use inspect_instance or get_console_output.)` : "";
    return done(ok, text + note, { images });
  }

  function halt(reason) {
    S.halt = reason;
    UI().status("paused", reason);
    UI().toast(reason, "error");
  }

  // ── session start ───────────────────────────────────────────────────────
  // opts.blender: true / false = the user's answer to "use Blender in this session?"; omitted = keep the current answer
  async function startSession(task, opts) {
    S.halt = ""; S.errN = 0; S.sameN = 0; S.sameKey = "";
    if (opts && typeof opts.blender === "boolean") S.blender = opts.blender;
    if (S.blender) S.active = true;
    S.blenderChecked = true;
    rememberBlender();
    if (opts && typeof opts.catalog === "boolean") { S.catalog = opts.catalog; ST().set({ lpCatalog: S.catalog }); }
    S.toolsAt = 0;
    const body = C.buildSystemPrompt({ notes: P.notes, custom: LP.settings.custom, blender: !!S.blender, catalog: S.catalog });
    const text = task ? `${body}\n\nUSER TASK:\n${task}` : body;
    S.active = true; S.sinceSys = 0; rememberSession();
    const ok = await deliver(text, null, "start");
    if (!ok) S.active = false;
    return ok;
  }

  // A chat is a LuaPilot session when it shows our prompt, our results, a command block of the model, or when we
  // remembered it (the site may not render the first message again after a reload, e.g. in long chats).
  const hasSession = (turns) => {
    const found = turns.some((t) => {
      const x = safeText(t.el);
      return t.role === "user" ? /^\s*(⟦LP-SYS⟧|⟦LP-RE⟧|⟦LP⟧)/.test(x) : /^\s*\[LuaPilot\]|@@LP(CALL|LUA)/.test(x);
    });
    if (found) { rememberSession(); return true; }
    return !!(S.conv && S.sess[S.conv]);
  };
  function rememberSession() {
    if (!S.conv || S.sess[S.conv]) return;
    S.sess[S.conv] = Date.now();
    const keys = Object.keys(S.sess);
    if (keys.length > 40) keys.sort((a, b) => S.sess[a] - S.sess[b]).slice(0, keys.length - 40).forEach((k) => delete S.sess[k]);
    ST().set({ lpSessions: pruneMap(S.sess) });
  }

  // ── rate-limit ladder ───────────────────────────────────────────────────
  async function onRate(n) {
    const key = (n && n.key) || "rate";
    if (key === S.rateKey && now() < S.rateBusyUntil) return;
    if (now() < S.rateBusyUntil) return;
    S.rateKey = key; S.rateBusyUntil = now() + 20000;

    const r = S.rate;
    r.hits = now() - r.lastHitAt > HIT_WINDOW ? 1 : r.hits + 1;
    r.lastHitAt = now();
    S.clean = 0;
    S.pace.mult = Math.min(4, +((S.pace.mult || 1) * 1.6).toFixed(2));
    savePace();
    setCool(Math.min(300000, 20000 * Math.pow(2, r.hits - 1)));
    noteLog(`RATE LIMIT hit #${r.hits}`);

    const replay = S.lastInjected ? { text: S.lastInjected.text, why: S.lastInjected.why } : null;
    const origKey = r.phase === "newrun" ? r.origKey : P.conversationKey();
    S.awaiting = null;

    // a hit while we are in the fresh chat, or the 4th hit: stop and tell the user
    if (r.phase === "newrun" || r.hits >= 4) return block(replay, origKey);

    if (r.hits === 1) return waitAndReload("reload", 8000, replay, origKey, "DeepSeek says messages are too frequent. Pausing a few seconds, then reloading this chat...");
    if (r.hits === 2) return waitAndReload("reload", 40000, replay, origKey, "Still too frequent. Waiting about 40 s, then reloading...");
    // hit 3: fresh chat
    const back = origKey && P.conversationUrl ? P.conversationUrl(origKey) : null;
    if (!back) return block(replay, origKey);
    return waitAndReload("new", 4000, replay, origKey, "Still limited. Starting the agent in a new chat, then coming back here...");
  }

  async function waitAndReload(phase, ms, replay, origKey, text) {
    S.paused = true;
    UI().status("waiting");
    UI().banner("rate", { text, until: now() + ms, tone: "warn" });
    S.rate.phase = phase; S.rate.replay = replay; S.rate.origKey = origKey; S.rate.at = now();
    await saveRate();
    try { LP.link.hold(true); } catch { /* ignore */ }
    await K.sleep(ms);
    if (phase === "new") location.href = P.url;
    else location.reload();
  }

  function block(replay, origKey) {
    S.paused = true;
    const until = now() + BLOCK_MS;
    S.rate.phase = ""; S.rate.blockedUntil = until; S.rate.replay = replay; S.rate.origKey = origKey;
    saveRate();
    showBlock();
  }

  function showBlock() {
    S.paused = true;
    UI().status("paused", "limited");
    UI().banner("rate", {
      text: `${P.name} is limiting messages right now. LuaPilot stopped on purpose - wait a few minutes.`,
      until: S.rate.blockedUntil, tone: "error", doneText: "You can try again now.",
      actions: [{ label: "Try again now", fn: () => resumeFromBlock() }],
    });
  }

  function resumeFromBlock() {
    S.rate.blockedUntil = 0; S.rate.hits = 2; S.rate.phase = "";
    saveRate();
    UI().bannerClear("rate");
    S.paused = false; S.halt = "";
    const rp = S.rate.replay;
    S.rate.replay = null; saveRate();
    if (rp && rp.text) replayLast(rp);
    else UI().status("idle");
  }

  // Runs once after a page load: continues whatever step of the ladder was running.
  async function resumeLadder() {
    const r = S.rate;
    if (r.blockedUntil > now()) { showBlock(); return; }
    if (!r.phase) return;
    if (now() - (r.at || 0) > 10 * 60e3) { r.phase = ""; saveRate(); return; }
    S.paused = false;
    if (r.phase === "reload" || r.phase === "back") {
      const rp = r.replay; r.phase = ""; r.replay = null; saveRate();
      UI().bannerClear("rate");
      await K.sleep(1500);
      if (rp && rp.text) S.pendingReplay = rp;
      try { LP.link.hold(false); } catch { /* ignore */ }
      return;
    }
    if (r.phase === "new") {
      UI().banner("rate", { text: "Starting the agent in a new chat to get past the limit...", tone: "warn" });
      const ok = await K.waitFor(() => P.isFresh(), 20000, 300);
      if (!ok) return block(r.replay, r.origKey);
      r.phase = "newrun"; r.at = now(); await saveRate();
      S.newChatSince = now();
      try { LP.link.hold(false); } catch { /* ignore */ }
      await startSession("");
    }
  }

  // After the new chat produced a reply (and some time passed), go back.
  function checkNewRun(turns) {
    const r = S.rate;
    if (r.phase !== "newrun") return;
    const waited = now() - S.newChatSince;
    const haveReply = turns.some((t) => t.role === "assistant") && !P.generating();
    if (waited > 90000 && !haveReply) return block(r.replay, r.origKey);
    if (haveReply && waited > 25000 && !S.sending) {
      const back = P.conversationUrl && P.conversationUrl(r.origKey);
      r.phase = "back"; r.at = now(); saveRate();
      UI().banner("rate", { text: "New chat works. Returning to your chat...", tone: "ok" });
      S.paused = true;
      setTimeout(() => { if (back) location.href = back; else { r.phase = ""; saveRate(); location.reload(); } }, 1200);
    }
  }

  async function replayLast(rp) {
    const turns = turnsOf();
    const last = turns[turns.length - 1];
    // already there (the site accepted it before showing the limit)? then do nothing
    if (last && last.role === "user" && safeText(last.el).trim() === rp.text.trim()) { UI().status("thinking"); return; }
    await deliver(rp.text, null, rp.why || "replay");
  }

  // ── site notices ────────────────────────────────────────────────────────
  let lastNoticeKind = "";
  function handleNotice(n) {
    const kind = n ? n.kind : "";
    if (kind === "rate") { if (!S.paused || S.rate.phase === "newrun") onRate(n); return true; }
    if (kind !== lastNoticeKind) {
      lastNoticeKind = kind;
      UI().bannerClear("site");
      if (kind === "toolong") {
        UI().banner("site", { text: `${P.name}: this chat is full. Open a new chat and start LuaPilot there.`, tone: "error", actions: [{ label: "New chat", fn: () => { location.href = P.url; } }] });
        S.paused = true;
      } else if (kind === "captcha" || kind === "paused") {
        UI().banner("site", { text: `${P.name} is asking for a check (${n.text || kind}). Solve it in the page, then LuaPilot continues.`, tone: "warn" });
      } else if (kind === "busy" && S.lastInjected && S.busyRetries < 2 && S.awaiting) {
        S.busyRetries++;
        UI().toast(`${P.name} is busy. Trying again shortly...`, "warn");
        const rp = S.lastInjected;
        S.awaiting = null;
        setTimeout(() => replayLast(rp), 15000);
      }
    }
    return kind === "toolong";
  }

  // ── main tick ───────────────────────────────────────────────────────────
  async function tick() {
    if (S.ticking) return;
    S.ticking = true;
    try { await step(); } catch (e) { console.debug("[LuaPilot] tick", e); } finally { S.ticking = false; }
  }

  async function step() {
    if (!S.enabled) return;
    const turns = turnsOf();
    const conv = P.conversationKey();

    // conversation changed -> forget the old one (unless it is just our new chat getting an id)
    if (S.conv === null || (conv !== S.conv && !(S.conv === "" && conv && now() - S.sentAt < 90000))) {
      S.conv = conv; S.baselinePending = true; S.seenAt = now(); S.lastCount = -1;
      S.answered.clear(); S.sameN = 0; S.errN = 0; S.awaiting = null; S.active = false;
    } else if (conv !== S.conv) S.conv = conv;

    // baseline: everything already on the page is history
    if (S.baselinePending) {
      if (turns.length !== S.lastCount) { S.lastCount = turns.length; S.countAt = now(); return; }
      if (now() - S.countAt < 1200 && turns.length) return;
      const li = turns.length - 1;
      let keep = -1; // the last reply is not history when it is still being written or was never run
      if (li >= 0 && turns[li].role === "assistant" && hasSession(turns)) {
        let gen0 = false;
        try { gen0 = !!P.generating(); } catch { /* ignore */ }
        if (gen0) keep = li;
        else {
          try {
            const tx = safeText(turns[li].el);
            const r0 = PR.analyze(tx, (await getTools()).map((x) => x.name).concat("list_commands"));
            if ((r0.kind === "call" || r0.kind === "many") && !S.exec.has(`${S.conv}|${keyOf(turns, li)}|${K.hash(tx)}`)) keep = li;
          } catch { /* ignore */ }
        }
      }
      turns.forEach((t, i) => { if (t.role === "assistant" && i !== keep) S.answered.add(keyOf(turns, i)); });
      S.baselinePending = false;
      S.userSeen = turns.filter((t) => t.role === "user" && !isInj(t.el)).length;
      S.active = hasSession(turns);
      if (keep >= 0) noteLog("resumed: the last reply was unfinished or not run yet");
      // the page was reloaded while the model was thinking about a result of ours: nudge it once
      else if (S.active && li >= 0 && turns[li].role === "user" && isInj(turns[li].el) && !S.nudged) {
        S.nudged = true;
        setTimeout(async () => {
          let g = false;
          try { g = !!P.generating(); } catch { /* ignore */ }
          if (g || S.halt || S.paused) return;
          const cur = turnsOf();
          if (!cur.length || cur[cur.length - 1].role !== "user") return;
          noteLog("resumed: sent a continue note after reload");
          await feedback(`${C.MARK.msg} note\nThe page was reloaded and your last reply did not arrive. Continue the task from where you stopped. If your last command has no result yet, send it again.`, null, "resume");
        }, 2500);
      }
      UI().status(S.active ? "idle" : "ready");
      UI().session(!S.active && P.isFresh());
      if (S.pendingReplay) { const rp = S.pendingReplay; S.pendingReplay = null; replayLast(rp); }
    }

    UI().session(!S.active && P.isFresh());

    // site notices
    let n = null;
    try { n = P.notice && P.notice(); } catch { n = null; }
    const blocking = handleNotice(n);
    if (!n) { lastNoticeKind = ""; UI().bannerClear("site"); }

    if (S.rate.phase === "newrun") checkNewRun(turns);
    if (S.paused || S.sending || blocking) return;

    // the user wrote something themselves -> fresh start for the guards
    const users = turns.filter((t) => t.role === "user" && !isInj(t.el)).length;
    if (users !== S.userSeen) { S.userSeen = users; S.halt = ""; S.errN = 0; S.sameN = 0; S.sameKey = ""; S.contN = 0; S.stopNudges = 0; S.blenderRecheck = true; if (users > 0) S.active = S.active || hasSession(turns); }
    if (S.blender && S.active && !(S.blenderChats || {})[chatPath()]) rememberBlender();
    if (S.blender && S.active && !S.blenderChecked) {
      S.blenderChecked = true;
      ensureBlender().then((ok) => { if (!ok) { UI().status("paused", BLENDER_DOWN); UI().toast(BLENDER_DOWN, "error"); } });
    }
    if (S.blender && S.active && S.blenderDown && S.blenderRecheck && !S.blenderChecking) { S.blenderRecheck = false; S.blenderChecking = true; ensureBlender().then((ok) => { S.blenderChecking = false; if (!ok) { UI().status("paused", BLENDER_DOWN); UI().toast(BLENDER_DOWN, "error"); } }); }
    if (S.halt) return;

    if (hasSession(turns)) S.active = true;
    if (!S.active) return;

    const gen = P.generating();
    if (gen) { S.genAt = now(); S.awaiting = null; UI().status("thinking"); }

    const last = turns[turns.length - 1];

    // waiting for a reply that never starts: report, never resend by ourselves
    if (S.awaiting && !gen) {
      if (turns.length > 0 && last.role === "assistant" && userCount() >= S.awaiting.users) S.awaiting = null;
      else if (now() - S.awaiting.since > T.warmupMs) {
        S.awaiting = null;
        UI().status("paused", "no reply");
        UI().toast(`${P.name} did not answer. Use Retry in the bar if the message is not there.`, "warn");
        return;
      }
    }

    if (!last || last.role !== "assistant") return;
    const key = keyOf(turns, turns.length - 1);
    if (S.answered.has(key)) { if (!gen && !S.awaiting) UI().status("idle"); return; }

    const text = safeText(last.el);
    if (text !== S.lastText || S.lastKey !== key) { S.lastText = text; S.lastKey = key; S.textAt = now(); }
    if (gen) {
      // only cut a generation that is really stuck: no new text for a long time, or an absurdly long run
      const stuck = now() - S.textAt > 240000 && now() - S.genStart > 240000;
      if (stuck || now() - S.genStart > Math.max(T.timeoutMs, 900000)) { noteLog("stopped a stuck generation"); try { P.stop(); } catch { /* ignore */ }
        if ((S.stopNudges = (S.stopNudges || 0) + 1) <= 2) {
          S.answered.add(key);
          setTimeout(async () => {
            let g = false;
            try { g = !!P.generating(); } catch { /* ignore */ }
            if (g || S.halt || S.paused || !S.active) return;
            await feedback(`${C.MARK.msg} note\nYour last reply was cut off because it stalled. Continue from where you stopped. If you were writing a command, send the complete command again.`, null, "resume");
          }, 4000);
        }
      }
      return;
    }
    if (now() - S.genAt < T.idleMs || now() - S.textAt < T.stableMs) return;
    if (!text.trim()) return;
    await handle(turns, turns.length - 1);
  }

  // The first moment of a generation is the start for the timeout.
  const origGenerating = P.generating.bind(P);
  P.generating = function () { const g = origGenerating(); if (g && !S.wasGen) S.genStart = now(); S.wasGen = g; return g; };

  // ── public bits for the UI ──────────────────────────────────────────────
  function setEnabled(on) {
    S.enabled = !!on;
    ST().set({ lpEnabled: S.enabled });
    if (S.enabled) { S.baselinePending = true; S.seenAt = now(); S.lastCount = -1; S.halt = ""; UI().status("idle"); }
    else { S.awaiting = null; UI().status("off"); }
  }

  function retry() {
    if (S.halt) { S.halt = ""; S.errN = 0; S.sameN = 0; S.sameKey = ""; UI().status("idle"); }
    S.paused = false;
    const rp = S.lastInjected;
    if (rp) replayLast(rp);
  }

  // ── diagnostics (shown in the bar menu, easy to copy into a bug report) ──
  function diag() {
    const turns = turnsOf();
    const last = turns[turns.length - 1];
    let gen = "?";
    try { gen = String(P.generating()); } catch { /* ignore */ }
    const lines = [
      `provider=${P.id} enabled=${S.enabled} session=${S.active} baseline=${!S.baselinePending}`,
      `conv="${S.conv}" turns=${turns.length} last=${last ? last.role : "-"} generating=${gen}`,
      `halt=${S.halt || "-"} paused=${S.paused} cool=${Math.max(0, Math.ceil((S.cool - now()) / 1000))}s pace=x${S.pace.mult || 1}`,
      `rate hits=${S.rate.hits} phase=${S.rate.phase || "-"} blocked=${S.rate.blockedUntil > now()}`,
      `last reply: ${S.lastAnalysis || "-"} | bridge=${LP.ui.bridgeText ? LP.ui.bridgeText() : "?"}`,
      "--- recent ---", ...S.log.slice(-14),
    ];
    return lines.join("\n");
  }

  // ── mini chat (the little always-on-top window of the desktop app) ──────
  const stripBlocks = (t) => String(t || "")
    .replace(/^\s*\[LuaPilot\]\s*/, "")
    .replace(/```[a-z]*\s*@@LPCALL@@[\s\S]*?@@LPEND@@\s*```/gi, "[command]")
    .replace(/```[a-z]*\s*@@LPLUA[\s\S]*?@@LPEND@@\s*```/gi, "[Luau code]")
    .replace(/@@LPCALL@@[\s\S]*?@@LPEND@@/g, "[command]")
    .replace(/@@LPLUA[^@]*@@[\s\S]*?@@LPEND@@/g, "[Luau code]").trim();
  let lastPush = "";
  function pushChat() {
    if (!LP.link.alive()) return;
    const turns = turnsOf();
    let text = "";
    for (let i = turns.length - 1; i >= 0; i--) if (turns[i].role === "assistant") { text = stripBlocks(safeText(turns[i].el)); break; }
    let gen = false;
    try { gen = P.generating(); } catch { /* ignore */ }
    const status = !S.enabled ? "off" : S.halt ? "paused" : S.rate.blockedUntil > now() ? "limited"
      : S.cool > now() ? "waiting" : S.curCall ? "running" : gen || S.sending || S.awaiting ? "thinking" : "idle";
    const obj = { status, detail: S.curCall || S.halt || "", text: text.slice(-8000), active: S.active, calls: S.calls };
    const j = JSON.stringify(obj);
    if (j === lastPush) return;
    lastPush = j;
    LP.link.chatState(obj);
  }
  async function chatSend(text) {
    text = String(text || "").trim();
    if (!text || !S.enabled) return;
    S.halt = ""; S.errN = 0; S.sameN = 0; S.sameKey = ""; S.paused = S.rate.blockedUntil > now();
    if (!S.active) await startSession(text); else await deliver(text, null, "user");
  }
  function chatStop() {
    try { if (P.generating()) P.stop(); } catch { /* ignore */ }
    S.awaiting = null;
    halt("Stopped by you. Send a new message to continue.");
  }

  async function init() {
    await loadState();
    UI().setEnabled(S.enabled);
    UI().status(S.enabled ? "idle" : "off");
    S.timer = setInterval(tick, TICK);
    setInterval(pushChat, 800);
    LP.link.onChat((m) => { if (m.op === "send") chatSend(m.text); else if (m.op === "stop") chatStop(); });
    let moT = 0;
    new MutationObserver(() => { if (!moT) moT = setTimeout(() => { moT = 0; tick(); }, 150); }).observe(document.body, { childList: true, subtree: true, characterData: true });
    await resumeLadder();
  }

  LP.agent = { stop: () => chatStop(), init, poke: () => tick(), diag, chatSend, chatStop, keyOf, setEnabled, startSession, retry, state: S, isEnabled: () => S.enabled, resume: () => { S.halt = ""; S.paused = false; UI().status("idle"); } };
})();
