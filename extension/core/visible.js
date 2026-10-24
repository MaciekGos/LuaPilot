// LuaPilot - runs in the PAGE's own world. Makes the chat site believe its tab is always
// visible, so streaming and rendering do not pause when you switch to Roblox Studio.
(() => {
  try {
    const def = (proto, key, val) => { try { Object.defineProperty(proto, key, { configurable: true, get: () => val }); } catch { /* ignore */ } };
    def(Document.prototype, "hidden", false);
    def(Document.prototype, "webkitHidden", false);
    def(Document.prototype, "visibilityState", "visible");
    def(Document.prototype, "webkitVisibilityState", "visible");
    const stop = (e) => e.stopImmediatePropagation();
    document.addEventListener("visibilitychange", stop, true);
    window.addEventListener("visibilitychange", stop, true);
    window.addEventListener("pagehide", stop, true);
    try { Document.prototype.hasFocus = () => true; } catch { /* ignore */ }
  } catch { /* never break the page */ }
})();
