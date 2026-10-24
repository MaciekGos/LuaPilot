# Provider contract

A provider adapts an AI chat site to the LuaPilot core (today only DeepSeek ships). The core never touches the
site's DOM; it only calls the object a provider assigns to `LP.provider`.

Each provider file is a content script (see `manifest.json`). Load order inside one
content-script entry:

```
core/kit.js  core/config.js  core/parser.js  core/link.js  providers/<site>.js  core/ui.js  core/agent.js  core/main.js
```

Providers may use `LP.kit` (see `core/kit.js`) and nothing else from the core.
Scripts that must run in the page's own JS world (network taps, CodeMirror readers) are
separate files declared with `"world": "MAIN"` and talk to the provider through DOM
attributes / `CustomEvent`s on `document`.

## Naming rules

* Global: `LP`. DOM attributes we set: `data-lp-*`. CSS classes: `lp-*`.
* Anything LuaPilot injects into the page carries `data-lp-own`; `LP.kit.readText` skips it.
* Hidden elements get the class `lp-hide` (the core stylesheet makes it `display:none!important`).

## Shape

```js
LP.provider = {
  id: "deepseek",                // short slug
  name: "DeepSeek",               // display name
  url: "https://chat.deepseek.com/",   // "new chat" address (used by rate-limit recovery)
  vision: false,                 // boolean or getter: can the model see attached images?
  notes: "",                     // extra prompt rules specific to this site (may be "")
  resendEvery: 0,                // >0: re-state the system prompt after this many assistant turns
  timings: { idleMs, stableMs, warmupMs, timeoutMs },   // optional overrides (see below)
  thinkingSel: "",               // optional selector of the reasoning area (never parsed for commands)

  // ---- reading the conversation ----
  turns(),            // -> [{ el, role: "user" | "assistant" }] in DOM order, one per message
  turnId(el),         // -> string|null  the site's own message id when it has one
  text(el),           // -> string       faithful raw text of the turn (see below)
  codeBlocks(el),     // -> Element[]    outermost wrapper of every code block in the turn
  body(el),           // -> Element      node holding the visible message content
  conversationKey(),  // -> string       stable id of the open chat; "" for a new, unsaved chat

  // ---- state ----
  generating(),       // -> boolean      true from the moment the reply starts until it is fully
                      //                 finished, INCLUDING any reasoning/"thinking" phase
  stop(),             // press the site's own stop control

  // ---- composer ----
  editor(),           // -> Element|null the text input
  editorText(),       // -> string       what is currently typed in it
  isFresh(),          // -> boolean      brand-new empty chat with a ready composer
  async send(text, images),  // type `text`, attach `images` ([{data: base64, mimeType}]) LAST,
                      //   press send. Resolve true when the site accepted it (composer cleared
                      //   or a new user turn appeared), false otherwise. Must not throw.
  lockInput(on),      // optional: make the composer read-only for the user while the agent works
  barSlot(),          // -> {parent, before} | null  where the LuaPilot bar is inserted
                      //   (parent.insertBefore(bar, before)); null = the core floats it above the editor

  // ---- optional ----
  notice(),           // -> null | { kind: "rate"|"toolong"|"busy"|"paused"|"captcha", text }
                      //   a site-level problem currently visible on the page
  continueButton(),   // -> Element|null  site's "Continue generating" control
  rate: { minGapMs: 2500, perMinute: 10 },  // send pacing the core enforces for this site (see below)
  conversationUrl(key),  // -> string|null  address that reopens the chat with that key (for rate-limit recovery)
  recoverRate: false, // true: when notice() reports kind "rate" the core saves its state, reloads
                      //   the page, reconnects and resumes (for sites whose rate-limit notice only
                      //   clears on reload)
};
```

### `text(el)`

Must return what the model wrote, with **real newlines inside code blocks**, because the
parser reads Luau out of it. Use `LP.kit.readText(el, { skip })`. It must:

* skip our own nodes (`data-lp-own`) - `readText` does this,
* skip the reasoning/thinking area (the model quotes commands there; they must not run),
* skip UI chrome inside code blocks (the "Copy" button caption, language labels),
* survive sites that render code as one element per line (CodeMirror, Monaco).

### `generating()`

The most important signal. Prefer a hard one (a stop button that exists only while
streaming, an `aria-busy`, a streaming class). If the site only gives soft signals
(text still growing, a spinner), combine them - the core still requires the text to
be stable before it reads a command.

### `timings` (all milliseconds, all optional)

| key | default | meaning |
|---|---|---|
| `idleMs` | 1500 | how long `generating()` must stay false before a reply counts as finished |
| `stableMs` | 2500 | how long the turn text must stay unchanged |
| `warmupMs` | 45000 | how long after sending we wait for a reply to start |
| `timeoutMs` | 300000 | give up on a reply after this |

Sites that pause for long reasoning without any DOM change need a larger `idleMs`.

### `send(text, images)`

* Never leave half-typed text behind: on failure clear the composer.
* Attach images after the text is in place and immediately before pressing send
  (re-writing the editor after an upload breaks some sites).
* If the send button is disabled, wait briefly for it to enable; fall back to Enter
  only where Enter sends.
* Verify acceptance: composer empty again, or the user-turn count grew.

### Layout resilience

Sites redesign often. Selectors should be listed as fallbacks (most specific first),
prefer stable attributes (`role`, `aria-label`, `data-testid`, `contenteditable`) over
generated class names, and should never throw when nothing matches.

## Testing

`extension/tests/<site>.test.js` runs under plain Node with `jsdom`
(`node tests/<site>.test.js`). Build a small stub DOM that mimics the site's markup and
assert `turns/text/codeBlocks/generating/editor/barSlot` behave. Print `PASS`/`FAIL` per
case and exit non-zero on a failure. A tiny harness is in `tests/harness.js`.


## Send pacing (`rate`)

The core funnels every message it injects through one governor. It waits at least
`minGapMs` (plus a little jitter) between two sends and never sends more than
`perMinute` messages in any 60 s window; it does not drop messages, it delays them.
Pick values from what you know of the site's anti-spam behaviour (a site that answers
"Messages too frequent" needs a bigger gap). The governor also learns: after a rate-limit
notice it multiplies the gap. `conversationUrl(key)` lets the core leave a chat and come
back to it (rate-limit recovery opens a fresh chat first, then returns).
