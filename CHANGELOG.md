# Changelog

## 2.0.3
- Mini chat: the built-in Tk window stays the default. An experimental HTML version (pywebview / WebView2, enable with "mini_kind": "web" in settings.json) exists in the style of the chat box of the AI site, with the Tk window as automatic fallback when WebView2 or pywebview is missing. Plugin link moved to port 17615 (17614 belongs to the mini chat API).
- Mini chat (Tk version) restyled like the chat box of the AI site: big rounded input card with a placeholder, round buttons (open site, stop, answer, blue send arrow), focus glow, fade-in, smooth expand, pulsing status dot. Enter sends, Shift+Enter adds a line.
- Animations: smooth button colour transitions and window fade-in in the app; pages slide in and the current step pulses in the installer.
- Housekeeping: logs, exported models and stored chat notes older than 4 days (counted from the newest entry, not from today) are deleted automatically at start and every 6 hours. Your Guide folder is never touched.
- Blender mode: the AI must model anything with shape in Blender (real geometry, bevels, details, several materials), not from Parts; with the catalog off it is Blender-only. Models and their textures (baked PNG, FBX with embedded textures) go to a temp folder inside LuaPilot's own files (new command models_folder). New command models_import uploads them to Roblox with your own Open Cloud API key (app Settings > Roblox upload) and a small LuaPilot Studio plugin (Settings > Install Studio plugin) loads them into Workspace > LuaPilot Imports. Studio has no public API to import a local FBX, hence the upload. Without a key the AI asks for a manual Import 3D. Bridge log: Blender's own verbose lines are no longer stored.
- Coming back to a chat that needed Blender: the extension remembers it per chat, re-checks the connection, reconnects, and pauses with instructions if Blender is not running.
- Installer is now LuaPilot's own dark setup (windows.exe) with Uninstall/Reinstall; the app checks GitHub releases by publication date and updates itself.
- LuaPilot's own messages (results, errors, instructions, screenshots) are hidden from the chat; the command chip on the assistant turn shows what ran.
- Stop button in the chat bar while LuaPilot works. The on/off switch left the bar (it stays in the extension popup). The message box is locked while LuaPilot works; press Stop to write.
- The model's own tool-call tags (DSML) are now read as a command and run; any leftover text is hidden.
- Editing during a playtest: the AI is told to keep using the Edit datamodel while the game runs.
- Screenshots are labelled as tool output (not the user's photo) and are not shown in the chat. The preview keeps the last 10; the full-screen view browses them with arrows and a strip.
- Starting a session asks: allow the Roblox catalog? use Blender? The AI is told to prefer catalog assets or Blender over plain Parts when allowed, and cannot use them when not.
- Optional Blender connection (per session, off by default) through the same MCP mechanism as Studio (mcp-for-blender via uv, telemetry disabled), with an in-page setup guide when it does not connect.
- New project documents the AI reads at the start of a session and on request: AGENT_INSTRUCTIONS, STYLE_GUIDE, GAME_DESIGN (long handbook in chapters), ASSETS, KNOWN_ISSUES and a REFERENCES folder of example pictures (oldcity.png, mainmenu.png, ...). New commands style_guide and reference_images. Files live in an editable folder (Guide button in the app).
- After visual work the AI must check at least four views (wide, two at player height, close-up) and name the weakest one.
- Installer shows the full terms on a page that must be accepted (generated from TERMS.md by make_terms.py).
- Desktop app: two-row button layout, mini chat redesigned (rounded, no system title bar, pin, drag, resize), "Open DeepSeek" button and queued sending when the page is not open, new multi-size icon (taskbar uses the 128 and 48 px versions).

## 2.0.2
- Phosphor Icons in the extension (chips, bar, popup) and in the desktop app buttons.

## 2.0.1
- Fixed the white circle logo (the white wordmark was built from transparency only).
- DeepSeek: a refused message is never re-sent in a burst; every failed send backs off (15 s, 30 s, 60 s ... 5 min), survives page reloads, and send() no longer re-clicks after a "Messages too frequent" notice.
- Works while the browser tab is in the background: the page is told it is visible, timers are driven from the background worker, and a pulse keeps the agent loop running.
- Parser accepts command markers anywhere in the text (one-line blocks too).
- Images: screen_capture is no longer refused; the screenshot is attached when the chat accepts images, otherwise the AI is told it could not be attached.
- New commands answered by the bridge: catalog_search and catalog_images (Roblox Creator Store search with thumbnails).
- Running commands have animations; bar menu has a Diagnostics panel.
- Desktop app: Mini chat (always-on-top box with Send/Stop and the AI's answer). The bridge only accepts connections from the extension (web pages are refused).

## 2.0.0
- New project: LuaPilot. Bridge, browser extension and desktop app were written from scratch.
- DeepSeek is the only supported chat site; Roblox Studio is the only MCP connection.
- New agent loop: history is never executed, every reply is answered at most once, executed commands are remembered across reloads.
- New send governor (spacing, per-minute cap, adaptive slow-down) and a recovery ladder for "Messages too frequent": reload, longer wait, fresh chat, then a visible stop with countdown.
- Loop guards: the same command 4 times in a row, or repeated unreadable replies, stop the agent.
- Screenshot preview can be shown or hidden; clicking it opens a full-screen lightbox.
- LuaPilot ON/OFF switch in the chat bar; redesigned toolbar popup with a power switch and bridge connect/disconnect.
- Desktop app: settings for auto-opening the AI agent and Roblox Studio at startup; the Extension button copies the folder path and explains how to load it.
