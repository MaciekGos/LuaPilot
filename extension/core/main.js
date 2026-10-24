// LuaPilot - entry point of the chat-page content script.
(async () => {
  "use strict";
  const LP = window.LP;
  if (!LP || !LP.provider || window.__lpStarted) return;
  window.__lpStarted = true;
  try {
    await LP.loadSettings();
    LP.ui.init();
    LP.link.onState((s) => LP.ui.setBridge(s));
    LP.link.onPulse(() => LP.agent.poke());
    LP.link.status().then((s) => { if (s && s.t === "state") LP.ui.setBridge(s); });
    try {
      chrome.storage.onChanged.addListener((ch) => {
        if (ch.lpEnabled && LP.agent) { const on = ch.lpEnabled.newValue !== false; if (on !== LP.agent.isEnabled()) LP.agent.setEnabled(on); }
        if (ch.lpShot) LP.settings.shot = ch.lpShot.newValue === "hide" ? "hide" : "show";
      });
    } catch { /* extension reloaded */ }
    await LP.agent.init();
  } catch (e) { console.warn("[LuaPilot] failed to start", e); }
})();
