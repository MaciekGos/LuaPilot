// LuaPilot - finds command blocks in a model reply.
// analyze(text, known) -> { kind: "none" | "call" | "many" | "error", calls, reason, name }
(() => {
  "use strict";
  const LP = (window.LP = window.LP || {});
  const MARK = LP.cfg.MARK;

  const START = /@@LP(CALL|LUA)(?::(Server|Client|Edit))?@@/g;
  const END = /@@LPEND@@/;
  const DSML = /<\s*\/?\s*[|｜]+\s*DSML|DSML\s*[|｜]+\s*(tool_calls|invoke|parameter)/i;

  // Escapes raw control characters that models leave inside JSON strings.
  function fixStrings(s) {
    let out = "", inStr = false, esc = false;
    for (const ch of s) {
      if (inStr) {
        if (esc) { out += ch; esc = false; continue; }
        if (ch === "\\") { out += ch; esc = true; continue; }
        if (ch === '"') { inStr = false; out += ch; continue; }
        if (ch === "\n") { out += "\\n"; continue; }
        if (ch === "\r") { out += "\\r"; continue; }
        if (ch === "\t") { out += "\\t"; continue; }
        out += ch;
      } else {
        if (ch === '"') inStr = true;
        out += ch;
      }
    }
    return out;
  }

  // Appends up to two missing closers (string-aware).
  function closers(s) {
    const stack = [];
    let inStr = false, esc = false;
    for (const ch of s) {
      if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
      if (ch === '"') inStr = true;
      else if (ch === "{") stack.push("}");
      else if (ch === "[") stack.push("]");
      else if (ch === "}" || ch === "]") stack.pop();
    }
    return !inStr && stack.length && stack.length <= 2 ? s + stack.reverse().join("") : null;
  }

  function parseJson(raw) {
    let s = String(raw).trim().replace(/^```[a-z]*\s*/i, "").replace(/```\s*$/, "").trim();
    // keep only the outermost object
    const a = s.indexOf("{");
    if (a < 0) return null;
    s = s.slice(a);
    const tries = [s, fixStrings(s)];
    for (const t of tries.slice()) { const c = closers(t); if (c) tries.push(c); }
    for (const t of tries) {
      try { const v = JSON.parse(t); if (v && typeof v === "object") return v; } catch { /* next */ }
    }
    // trailing junk after the object
    const fixed = fixStrings(s);
    for (let i = fixed.lastIndexOf("}"); i > 0; i = fixed.lastIndexOf("}", i - 1)) {
      try { return JSON.parse(fixed.slice(0, i + 1)); } catch { /* shorter */ }
    }
    return null;
  }

  function shape(obj) {
    if (!obj) return null;
    const name = obj.name || obj.tool || obj.command;
    if (typeof name !== "string" || !name) return null;
    let args = obj.args ?? obj.arguments ?? obj.parameters ?? obj.input ?? {};
    if (typeof args === "string") { try { args = JSON.parse(args); } catch { args = {}; } }
    if (!args || typeof args !== "object" || Array.isArray(args)) args = {};
    return { name: name.trim(), args };
  }

  // The model sometimes writes its own tool-call tags (<｜｜DSML｜｜ invoke name="x"> / parameter lines).
  // They are read here as an ordinary command; values arrive as strings and the agent coerces them.
  function parseDsml(text) {
    const D = "<\\s*\\/?\\s*[|｜]+\\s*DSML\\s*[|｜]*\\s*";
    const inv = new RegExp(D + "invoke\\s+name\\s*=\\s*[\"']([^\"']+)[\"'][^>]*>", "gi");
    const par = new RegExp(D + "parameter\\s+name\\s*=\\s*[\"']([^\"']+)[\"'][^>]*>([\\s\\S]*?)(?=" + D + "|$)", "gi");
    const heads = [...text.matchAll(inv)];
    const calls = [];
    heads.forEach((m, i) => {
      const seg = text.slice(m.index + m[0].length, i + 1 < heads.length ? heads[i + 1].index : text.length);
      const args = {};
      for (const p of seg.matchAll(par)) args[p[1]] = p[2].replace(/\s+$/, "").replace(/^\s+/, "");
      calls.push({ name: m[1].trim(), args, dsml: true });
    });
    return calls;
  }

  function analyze(text, known) {
    text = String(text || "");
    if (DSML.test(text)) {
      const dc = parseDsml(text);
      if (dc.length === 1) return { kind: "call", calls: dc, name: dc[0].name };
      if (dc.length > 1) return { kind: "many", calls: dc, names: dc.map((c) => c.name), name: dc[0].name };
      return { kind: "error", reason: "dsml", calls: [], name: "" };
    }
    const calls = [];
    START.lastIndex = 0;
    let m;
    while ((m = START.exec(text))) {
      const from = m.index + m[0].length;
      const rest = text.slice(from);
      const isLua = m[1] === "LUA";
      // A marker mentioned in prose ("use @@LPCALL@@ blocks") is not a command: a call must be
      // followed by a JSON object, Luau by a line break or by its closing marker.
      const head = rest.replace(/^[\s`]*(json|lua|luau)?[\s`]*/i, "");
      const looksReal = isLua ? (/^[ \t]*\r?\n/.test(rest) || END.test(rest)) : head.startsWith("{") || (END.test(rest) && /(^|\n)[ \t>]*$/.test(text.slice(0, m.index)));
      if (!looksReal) continue;
      const e = END.exec(rest);
      if (!e) return { kind: "error", reason: "unclosed", calls, name: isLua ? "execute_luau" : "" };
      const body = rest.slice(0, e.index);
      START.lastIndex = from + e.index + e[0].length;
      if (isLua) {
        const code = body.replace(/^[ \t]*\r?\n/, "").replace(/[\s`]+$/, "");
        calls.push({ name: "execute_luau", args: { code, datamodel_type: m[2] || "Edit" }, lua: true });
      } else {
        const c = shape(parseJson(body));
        if (!c) return { kind: "error", reason: "broken", calls, name: (/"name"\s*:\s*"([\w/.-]+)"/.exec(body) || [])[1] || "command" };
        calls.push(c);
      }
    }
    if (!calls.length && known && known.length) {
      // a bare JSON object naming a known command, without markers
      const set = new Set(known);
      const fences = [...text.matchAll(/```[a-z]*\n([\s\S]*?)```/gi)].map((x) => x[1]);
      for (const f of fences.length ? fences : [text]) {
        const c = shape(parseJson(f));
        if (c && set.has(c.name)) calls.push(c);
      }
    }
    if (!calls.length) return { kind: "none", calls: [], name: "" };
    if (calls.length > 1) return { kind: "many", calls, names: calls.map((c) => c.name), name: calls[0].name };
    return { kind: "call", calls, name: calls[0].name };
  }

  // Is this turn text something LuaPilot itself injected?
  function isInjected(text) {
    const t = String(text || "").trimStart();
    return t.startsWith(MARK.msg) || t.startsWith(MARK.sys) || t.startsWith(MARK.resend);
  }

  // Classifies an injected user turn for the camouflage layer.
  function injectedKind(text) {
    const t = String(text || "").trimStart();
    if (t.startsWith(MARK.sys)) return { kind: "sys", label: "Starting up" };
    if (t.startsWith(MARK.resend)) return { kind: "sys", label: "Reminder" };
    if (!t.startsWith(MARK.msg)) return null;
    const m = /^⟦LP⟧\s+(result|ERROR|note)(?:\s+·\s+([^\n]+))?/.exec(t);
    return m ? { kind: m[1] === "ERROR" ? "error" : m[1], label: m[2] || "" } : { kind: "note", label: "" };
  }

  LP.parser = { analyze, parseDsml, DSML, isInjected, injectedKind, parseJson };
})();
