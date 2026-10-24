// LuaPilot provider: DeepSeek (chat.deepseek.com).
//
// Site facts this file relies on (selectors marked [guess] could not be verified live):
//  * one chat message = one `.ds-message`; its parent wrapper carries
//    `data-virtual-list-item-key` (the list is virtualised, so DOM position is not an identity)
//  * assistant answer = `.ds-markdown` outside the reasoning container `.ds-think-content`
//  * composer is a real <textarea>; the primary footer button is SEND (arrow glyph) and, while
//    streaming, STOP (square glyph) - the same element
//  * during the reasoning phase there is no stop button and no spinner, only growing text
//  * the rate-limit notice is rendered as a bare leaf node next to the user turn it answered,
//    not as a `.ds-message`
(() => {
  "use strict";
  const LP = (window.LP = window.LP || {});
  const kit = LP.kit;

  const SEL = {
    message: ".ds-message",
    userClass: "d29f3d7d",          // hashed modifier on user turns [guess: changes on redeploy]
    userBubble: ".fbb737a4",        // hashed user bubble [guess]
    markdown: ".ds-markdown",
    thinking: ".ds-think-content",
    inlineEdit: ".ds-textarea",     // "edit this message" box, NOT the composer
    primaryBtn: ".ds-button--primary",
    spinner: ".ds-loading",
    tabs: '[role="radiogroup"]',
    tab: '[role="radio"]',
    listItem: "[data-virtual-list-item-key]",
    toast: '.ds-toast, [class*="toast" i], [role="alert"], [class*="modal" i]',
    codeWrap: ".md-code-block",
    // code block chrome: language label, Copy, Download [guess for the class names]
    chrome: ".md-code-block-banner, .md-code-block-banner-wrap, [class*='code-block-banner'], " +
      "[class*='code-block-header'], .ds-icon-button, [role='button']",
  };

  const RE = {
    rate: /messages?\s+too\s+frequent|too\s+many\s+(messages|requests)\s*[.,]?\s*try\s+again\s+later/i,
    tooLong: /conversation .{0,20}(too long|getting too long|trop longue)|message.{0,20}too.{0,10}long|content is too long|this conversation has reached|cette conversation a atteint|(token|context).{0,10}limit|context.{0,20}(exceeded|dépassé)/i,
    busy: /server is busy|serveur est occup|please try again|réessayer plus tard|system is currently busy/i,
    cont: /^(continue|continuer|继续(生成)?|fortfahren|continuar|seguir|続行)$/i,
    stopped: /(arrêté|arrété|stopped|已停止|停止生成|已暂停)/i,
    chromeWord: /^(copy|copied|download|copier|复制|下载|已复制)$/i,
    vision: /vision|视觉|图像|多模态/i,
  };

  const q = (s, r = document) => kit.q(s, r);
  const qa = (s, r = document) => kit.qa(s, r);
  const own = (el) => !!(el && el.closest && el.closest(kit.OWN));

  // DeepSeek refuses to send past 163840 characters (toast "Content is too long");
  // clip a bit below that, keeping head and tail.
  const SEND_MAX = 160000;
  function clip(text) {
    if (!text || text.length <= SEND_MAX) return text;
    const gone = text.length - SEND_MAX;
    const mark = `\n\n[... LuaPilot: output shortened to fit DeepSeek's input limit - ${gone} of ` +
      `${text.length} characters omitted. Do NOT repeat the command; work with the head and tail shown. ...]\n\n`;
    const room = SEND_MAX - mark.length;
    const head = Math.floor(room * 0.85);
    return text.slice(0, head) + mark + text.slice(text.length - (room - head));
  }

  // ---------------------------------------------------------------- turns
  const isUser = (el) => {
    if (el.classList.contains(SEL.userClass) || el.querySelector(SEL.userBubble)) return true;
    if (el.querySelector(SEL.markdown) || el.querySelector(SEL.thinking) || el.querySelector(SEL.spinner)) return false;
    // unknown markup: a turn with plain text and no assistant structure is the user's
    return !!(el.textContent || "").trim();
  };
  const allMessages = () => qa(SEL.message).filter((m) => !own(m));
  const assistants = () => allMessages().filter((m) => !isUser(m));
  const lastAssistant = () => { const a = assistants(); return a.length ? a[a.length - 1] : null; };
  const replyMarkdowns = (el) => qa(SEL.markdown, el).filter((m) => !m.closest(SEL.thinking) && !own(m));
  const turnKey = (el) => {
    const p = el && el.parentElement;
    const k = p && p.getAttribute("data-virtual-list-item-key");
    return k == null ? null : k;
  };

  function skipNode(node) {
    if (node.matches(SEL.thinking) || node.matches(SEL.chrome)) return true;
    // caption-only leaf next to a code block (Copy / Download) when class names drift
    if (node.childElementCount === 0 && RE.chromeWord.test((node.textContent || "").trim()) &&
        !node.closest("pre") && node.closest(SEL.codeWrap)) return true;
    return false;
  }

  function codeBlocks(el) {
    const found = qa(`${SEL.codeWrap}, pre`, el).filter((b) => !b.closest(SEL.thinking) && !own(b));
    return found.filter((b) => !found.some((o) => o !== b && o.contains(b)));
  }

  // ---------------------------------------------------------------- composer
  const editor = () => {
    const all = qa("textarea").filter((t) => !own(t));
    return all.find((t) => !t.closest(SEL.inlineEdit)) || all[0] || null;
  };
  const editorText = () => { const e = editor(); return e ? (e.value != null ? e.value : e.textContent || "") : ""; };

  function composerBox() {
    const ta = editor();
    if (!ta) return null;
    const send = q(SEL.primaryBtn);
    const tabs = q(SEL.tabs);
    let box = ta.parentElement;
    while (box && box !== document.body) {
      if ((!send || box.contains(send)) && !(tabs && box.contains(tabs))) return box;
      box = box.parentElement;
    }
    return ta.parentElement;
  }

  // The footer button doubles as SEND and STOP. Old builds draw stop as a <rect>; V4 draws both
  // as a <path>: the arrow starts mid-glyph ("M8..."), the square near the origin ("M2 ...").
  function primaryButton() {
    const btn = q(SEL.primaryBtn);
    if (btn) return btn;
    const box = composerBox();
    if (!box) return null;   // [guess] fallback: last icon-ish button inside the composer
    const cands = qa("[role='button'], button", box).filter((b) => b.querySelector("svg") && !own(b));
    return cands.length ? cands[cands.length - 1] : null;
  }
  function isStop(btn) {
    if (!btn) return false;
    if (btn.querySelector("rect")) return true;
    const p = btn.querySelector("path");
    return !!p && /^\s*M\s*[0-3][\s.]/.test(p.getAttribute("d") || "");
  }
  const sendReady = () => {
    const b = primaryButton();
    return !!b && !isStop(b) && b.getAttribute("aria-disabled") !== "true" && !b.disabled;
  };

  // ---------------------------------------------------------------- generating
  // Reasoning shows no spinner/stop button: the only liveness signal is growth of the
  // turn's text. Track the maximum length reached and when it last advanced.
  const WINDOW_ANSWER = 800, WINDOW_REASON = 12000;
  let sMax = -1, sAt = 0, sItem = null;

  const reasoningLen = (item) => { const t = q(SEL.thinking, item); return t ? (t.textContent || "").length : 0; };
  const replyLen = (item) => replyMarkdowns(item).reduce((n, m) => n + (m.textContent || "").length, 0);
  function sample() {
    const item = lastAssistant();
    const len = item ? reasoningLen(item) + replyLen(item) : 0;
    const now = Date.now();
    if (item !== sItem || len < sMax - 400) { sItem = item; sMax = len; sAt = now; return; }
    if (len > sMax) { sMax = len; sAt = now; }
  }
  const grew = (ms) => sMax > 1 && Date.now() - sAt < ms;
  function halted(item) {
    const t = q(SEL.thinking, item);
    return RE.stopped.test(item.textContent || "") && !RE.stopped.test(t ? t.textContent || "" : "");
  }
  function reasoningOnly(item) {
    return !!item && reasoningLen(item) > 0 && replyLen(item) === 0 && !halted(item);
  }
  function generating() {
    try {
      if (qa(SEL.spinner).some((s) => !own(s))) return true;
      if (isStop(primaryButton())) return true;
      sample();
      return grew(reasoningOnly(lastAssistant()) ? WINDOW_REASON : WINDOW_ANSWER);
    } catch { return false; }
  }

  // ---------------------------------------------------------------- vision tab
  // Tabs carry data-model-type: "default" (Instant), "expert", "vision". Once a chat is open the
  // tab group disappears, so the last seen selection is latched; the per-chat model badge is the
  // fallback after a reload. No evidence at all => false.
  let vLatch = false, vSet = false, vAt = 0, vCache = false;
  function badgeIsVision() {
    const els = qa("div, span").filter((e) => e.childElementCount === 0 && !own(e) &&
      /^(instant|expert|vision)$/i.test((e.textContent || "").trim()) && e.getBoundingClientRect().width > 0);
    if (!els.length) return null;
    els.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    return /vision/i.test(els[0].textContent || "");
  }
  function visionSelected() {
    const now = Date.now();
    if (now - vAt < 300) return vCache;
    vAt = now;
    const group = q(SEL.tabs);
    if (group) {
      const radios = qa(SEL.tab, group);
      const v = radios.find((r) => r.getAttribute("data-model-type") === "vision") ||
        radios.find((r) => RE.vision.test((r.textContent || "").trim()));
      if (v) { vLatch = v.getAttribute("aria-checked") === "true"; vSet = true; return (vCache = vLatch); }
    }
    const b = badgeIsVision();
    if (b != null) { vLatch = b; vSet = true; return (vCache = b); }
    return (vCache = vSet ? vLatch : false);
  }

  // ---------------------------------------------------------------- notices
  const toastIds = new WeakMap();
  let toastSeq = 0;
  const toastId = (el) => { if (!toastIds.has(el)) toastIds.set(el, ++toastSeq); return toastIds.get(el); };
  const shortText = (el, max) => {
    const t = (el.textContent || "").trim();
    return t && t.length < max ? t : "";
  };

  // Looks for `re` in site chrome only: leaf nodes of the newest list item (outside model
  // output and user bubbles), the newest turn if it is just that short text, then toasts.
  // `key` identifies the element so a notice restored by a reload for an old message differs
  // from a new one. Negative list keys are client-side placeholders (the message was not
  // saved by the server), which is what a fresh throttle notice looks like.
  function findNotice(re) {
    const items = qa(SEL.listItem).filter((i) => !own(i));
    const lastItem = items[items.length - 1];
    if (lastItem) {
      for (const el of qa("span, p, div", lastItem)) {
        if (el.children.length || own(el)) continue;
        if (el.closest(SEL.markdown) || el.closest(SEL.thinking)) continue;
        const um = el.closest(SEL.message);
        if (um && isUser(um)) continue;
        const t = shortText(el, 200);
        if (t && re.test(t)) return { text: t, key: "item:" + lastItem.getAttribute("data-virtual-list-item-key") };
      }
    }
    const msgs = allMessages();
    const last = msgs[msgs.length - 1];
    if (last && !isUser(last)) {
      const t = shortText(last, 200);
      if (t && re.test(t)) {
        const k = turnKey(last);
        return { text: t, key: k != null ? "msg:" + k : "msg#" + msgs.length + ":" + kit.hash(t) };
      }
    }
    for (const el of qa(SEL.toast)) {
      if (own(el) || el.closest(SEL.message)) continue;
      const t = shortText(el, 300);
      if (t && re.test(t) && kit.visible(el)) return { text: t, key: "toast#" + toastId(el) };
    }
    return null;
  }

  function notice() {
    try {
      let n = findNotice(RE.rate);
      if (n) return { kind: "rate", text: n.text, key: n.key, local: /^item:-/.test(n.key) };
      n = findNotice(RE.tooLong);
      if (n) return { kind: "toolong", text: n.text, key: n.key };
      n = findNotice(RE.busy);
      if (n) return { kind: "busy", text: n.text, key: n.key };
    } catch { /* never throw */ }
    return null;
  }

  // ---------------------------------------------------------------- sending
  function removeAttachments() {
    qa(".ds-file-list [class*='delete'], .ds-file-list [class*='close'], .ds-file-list [class*='remove']")
      .forEach((d) => { try { d.click(); } catch { /* ignore */ } });
  }
  const pendingThumbs = () => qa("img").filter((im) => !im.closest(SEL.message) && !own(im) &&
    (/^blob:/.test(im.getAttribute("src") || "") || /^lp_/.test(im.getAttribute("alt") || "")));

  function rateShown() { try { return !!findNotice(RE.rate); } catch { return false; } }

  async function attach(images) {
    if (pendingThumbs().length) return true;
    const files = [];
    images.forEach((im, i) => { try { files.push(kit.toFile(im, i)); } catch { /* skip */ } });
    if (!files.length) return false;
    const ed = editor();
    const input = q('input[type="file"]');
    // The file input starts DeepSeek's real upload; a synthetic paste only makes a local preview.
    if (input) { try { kit.attachViaInput(input, files); } catch { /* ignore */ } }
    else if (ed) kit.attachViaPaste(ed, files);
    return kit.waitFor(() => pendingThumbs().length >= files.length, 15000);
  }

  async function send(text, images) {
    let ed = null;
    try {
      ed = editor();
      if (!ed) return false;
      // the send button is also STOP: never click while a reply is streaming
      if (isStop(primaryButton()) && !(await kit.waitFor(() => !isStop(primaryButton()), 5000))) return false;
      const before = allMessages().filter(isUser).length;
      const accepted = () => editorText().trim() === "" || allMessages().filter(isUser).length > before ||
        isStop(primaryButton());
      kit.setNativeValue(ed, clip(text));
      const withImages = !!(images && images.length);
      if (withImages) { try { await attach(images); } catch { /* send anyway */ } }
      // The upload may still be running (the send is refused until it ends), so poll: click
      // the arrow, check that the composer emptied, retry.
      const deadline = Date.now() + (withImages ? 25000 : 6000);
      let tries = 0, clicks = 0;
      while (Date.now() < deadline) {
        await kit.waitFor(sendReady, 800, 80);
        // A rate-limit notice means the message was REFUSED. Never press send again: that is what
        // turns one refused message into a flood of them.
        if (rateShown()) throw new Error("rate limited");
        if (sendReady() && clicks < 2) { kit.click(primaryButton()); clicks++; }
        else if (!withImages && tries >= 2 && clicks < 2 && !isStop(primaryButton())) { kit.pressKey(ed, "Enter"); clicks++; }
        tries++;
        if (await kit.waitFor(() => accepted() || rateShown(), clicks >= 2 ? 4000 : 2500, 80)) {
          if (accepted() && !rateShown()) return true;
          throw new Error("rate limited");
        }
        if (clicks >= 2) break;
        if (editor() && editorText().trim() !== clip(text).trim() && editorText().trim() !== "") break;
      }
      throw new Error("not accepted");
    } catch {
      try { const e = editor() || ed; if (e) kit.setNativeValue(e, ""); removeAttachments(); } catch { /* ignore */ }
      return false;
    }
  }

  // ---------------------------------------------------------------- conversation
  const ID_RE = /\/(?:a\/chat\/)?s\/([^/?#]+)/;
  const conversationKey = () => { const m = ID_RE.exec(location.pathname); return m ? decodeURIComponent(m[1]) : ""; };

  LP.provider = {
    id: "deepseek",
    name: "DeepSeek",
    url: "https://chat.deepseek.com/",
    get vision() { return visionSelected(); },
    notes: "",
    resendEvery: 0,
    // Expert reasons for a long time without any DOM change: be patient.
    timings: { idleMs: 6000, stableMs: 9000, warmupMs: 45000, timeoutMs: 420000 },
    thinkingSel: SEL.thinking,
    // DeepSeek answers message bursts with "Messages too frequent": 6 s between sends and at
    // most 5 per minute (reasoning replies rarely arrive faster than that anyway, so this
    // costs nothing in normal use but keeps tool-result retries from forming a burst).
    rate: { minGapMs: 6000, perMinute: 5 },
    recoverRate: true,

    turns() {
      return allMessages().map((el) => ({ el, role: isUser(el) ? "user" : "assistant" }));
    },
    turnId: turnKey,
    text(el) {
      return kit.readText(el, { skip: skipNode });
    },
    codeBlocks,
    body(el) {
      if (!el) return el;
      return replyMarkdowns(el)[0] || q(SEL.userBubble, el) || el;
    },
    conversationKey,
    conversationUrl(key) {
      return key ? "https://chat.deepseek.com/a/chat/s/" + encodeURIComponent(key) : null;
    },

    generating,
    stop() { const b = primaryButton(); if (isStop(b)) { try { b.click(); } catch { /* ignore */ } } },

    editor,
    editorText,
    isFresh() { return allMessages().length === 0 && !!editor() && !ID_RE.test(location.pathname); },
    send,
    lockInput(on) {
      const ed = editor();
      if (!ed) return;
      if (on) {
        if (ed.getAttribute("data-lp-ph") == null) ed.setAttribute("data-lp-ph", ed.getAttribute("placeholder") || "");
        ed.setAttribute("readonly", "");
        ed.setAttribute("placeholder", "Agent working... please wait");
      } else {
        ed.removeAttribute("readonly");
        if (ed.getAttribute("data-lp-ph") != null) ed.setAttribute("placeholder", ed.getAttribute("data-lp-ph"));
      }
    },
    // Inside the rounded input box (textarea + pill row; a vertical flow container, without
    // the Instant/Expert/Vision tabs), as its first child.
    barSlot() {
      const box = composerBox();
      if (!box) return null;
      let before = box.firstElementChild;
      while (before && before.matches(kit.OWN)) before = before.nextElementSibling;
      return { parent: box, before };
    },

    notice,
    continueButton() {
      return qa(".ds-button").find((b) => kit.visible(b) && RE.cont.test((b.innerText || b.textContent || "").trim())) || null;
    },
  };
})();
