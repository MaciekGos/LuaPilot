// LuaPilot - constants, the system prompt and the texts sent back to the model.
// Nothing here knows about a specific chat site.
(() => {
  "use strict";
  const LP = (window.LP = window.LP || {});

  const NAME = "LuaPilot";
  // Every message LuaPilot injects starts with one of these, so the page code can
  // recognise (and tidy up) its own turns without guessing.
  const MARK = {
    sys: "⟦LP-SYS⟧",     // the opening instructions
    resend: "⟦LP-RE⟧",   // the same instructions, restated mid-chat
    msg: "⟦LP⟧",         // tool output, errors and notes
  };

  // Marker syntax the model writes (see the prompt below and core/parser.js).
  const FENCE = "```";

  // ── how a tool is shown ─────────────────────────────────────────────────
  // -> read | edit | screen | generate | studio | tool
  function toolCategory(name) {
    const n = String(name || "").split("/").pop();
    if (n === "list_commands" || n === "style_guide" || n === "reference_images") return "read";
    if (/^blender_/.test(n)) return /execute|import|export|create|delete|modify|set_|generate|download/.test(n) ? "generate" : "read";
    if (/^(script_read|script_search|script_grep|search_game_tree|inspect_instance|get_studio_state|get_console_output|search_creator_store|list_roblox_studios|catalog_search|catalog_images)$/.test(n)) return "read";
    if (/^(multi_edit|insert_from_creator_store|store_image|execute_luau)$/.test(n)) return "edit";
    if (n === "screen_capture") return "screen";
    if (/^generate_/.test(n)) return "generate";
    if (/studio|luau|instance|workspace|roblox/i.test(n)) return "studio";
    return "tool";
  }

  // ── messages to the model ───────────────────────────────────────────────
  const tag = (kind, name) => `${MARK.msg} ${kind}${name ? ` · ${name}` : ""}`;

  const wrap = {
    result: (name, text) => `${tag("result", name)}\n${text}`,
    error: (name, text) => `${tag("ERROR", name)}\n${text}`,
    note: (text) => `${tag("note")}\n${text}`,
  };

  const FIX = {
    // `reason` comes from the parser: unclosed | broken | noblock | dsml
    unreadable: (reason, name) => {
      const known = name && name !== "command";
      const lua = known && name !== "execute_luau" ? "" : " For Luau code use the @@LPLUA@@ ... @@LPEND@@ block instead.";
      const how = `Write exactly one block inside a code fence:\n${FENCE}\n@@LPCALL@@\n{"name": "<command>", "args": { ... }}\n@@LPEND@@\n${FENCE}`;
      const why = {
        unclosed: "Your command was cut off before its closing @@LPEND@@ marker, so nothing ran.",
        broken: "The JSON inside your command block could not be parsed, so nothing ran.",
        noblock: "Your reply looked like a command but was not inside a @@LPCALL@@ / @@LPLUA@@ block, so nothing ran.",
        dsml: "You used your own internal tool-call tags. LuaPilot cannot read those, so nothing ran. Never write them here.",
      }[reason] || "Your command could not be read, so nothing ran.";
      return wrap.error(known ? name : "", `${why}\n${how}${lua}\nResend the whole command in one piece.`);
    },
    many: (names) => wrap.error("", `One reply must hold ONE command block; you wrote ${names.length}: ${names.join(", ")}. Nothing ran. Send only the first one you need, then wait for its result.`),
    unknown: (name, valid) => wrap.error(name, `"${name}" is not a command. Valid commands: ${valid.join(", ")}. Use exact names and parameter keys.`),
    studioOffline: wrap.error("", "No Roblox Studio place is connected, so the command could not run. Studio is closed, has no place open, or its MCP option is off. This is a problem on the user's computer, not a mistake of yours. Tell the user in one short sentence to open their place and enable the MCP server (Assistant Settings), then stop until they answer."),
    bridgeOffline: wrap.error("", "The local LuaPilot bridge is unreachable, so nothing could run. That is a problem on the user's computer, not your mistake. Tell the user in one short sentence that the bridge or Roblox Studio is offline and wait for them."),
    staleTab: wrap.error("", "The LuaPilot extension was reloaded while this tab was open, so this tab can no longer reach the user's computer. Do not retry. Tell the user in one short sentence to reload the page (F5) and wait."),
    cutOff: wrap.note("Your previous reply was cut off by a length limit. Continue exactly where you stopped; do not start over and do not repeat what you already wrote."),
    tooBig: (n) => wrap.note(`The output was longer than the chat accepts (${n} characters). Only the beginning and the end are shown. Do not repeat the command; narrow it down instead.`),
  };

  // ── prompt ──────────────────────────────────────────────────────────────
  const MEMORY_PATH = "game.ServerStorage.LuaPilot.Memory";

  const CATALOG_PART = `

ASSETS
The user allowed the Roblox catalog in this session. For anything that should look good (buildings, trees, props, furniture, vehicles, sounds) prefer finding real assets with catalog_search over assembling them from plain Parts: search, LOOK at the thumbnails, compare several candidates, pick a small family that matches the project's style, and insert them. Read style_guide (assets, sounds) before choosing. Plain Parts are for greyboxing, simple shapes and structure.`;

  const BLENDER_PART = `

BLENDER (connected for this session)
Commands starting with blender_ control the user's Blender; models_folder gives the temp folder for exports. Blender is the main way to make anything that has a shape: characters, creatures, vehicles, weapons, furniture, props, plants, rocks, buildings with detail, decorations. Never fake these with a pile of Parts. Plain boxes, flat walls, floors and terrain stay in Studio.
1. Quality bar: it must look like a real Blender model, not blocky Parts. Model with real geometry: bevelled edges on every hard edge, subdivision or smooth shading where it curves, small details (screws, seams, trim, panels, wear, cracks, leaves, stitching), believable proportions, several materials. Build it in many steps (blockout, main forms, detail, materials) and check the viewport screenshot after each important step. Do not stop at the first acceptable shape; improve it until it is clearly detailed.
2. Budget: Roblox MeshParts accept up to about 20,000 triangles each. Split big objects into several meshes (each under the limit) and keep tiny details in the texture (normal map) rather than in geometry when needed. Apply modifiers and scale/rotation, origin at the bottom centre, clear object names. 1 stud = 0.28 m, so a 1 m object is about 3.6 studs.
3. Textures must survive the trip to Studio. Use only a Principled BSDF with image textures (base colour, normal, roughness, metallic); no procedural nodes, they do not export. UV-unwrap every object. Bake procedural looks to PNG images (Cycles bake, 1024 or 2048 px) and pack or save them. Export FBX with path_mode COPY and embed_textures True (bpy.ops.export_scene.fbx(filepath=..., path_mode='COPY', embed_textures=True, use_selection=True, apply_scale_options='FBX_SCALE_ALL', bake_space_transform=True)) so the PNGs are carried with the file.
4. Temp folder: call models_folder to get the exact path (inside LuaPilot's own files). Save every model and its textures there, one FBX per model, descriptive file names. Do not export anywhere else.
5. Importing into Studio, automatic: when models are finished, call models_import (no args). LuaPilot uploads every new FBX from the models folder to Roblox with the user's own key, the Studio plugin loads it, and the result says which Model appeared in Workspace > LuaPilot Imports. Read that result: it lists each file as imported or FAILED with the reason. Then find the new Models (inspect_instance), group/rename them, anchor, size and position them, and check in a screen_capture that the textures show. If a model looks grey or white, re-export it with embedded textures and import it again with force true. If the result says the upload is not set up or the plugin is not answering, tell the user once what to do (LuaPilot app > Settings: Roblox upload / Install Studio plugin), give the exact folder from models_folder and ask for a manual import (Studio > Home > Import 3D, select all FBX files), and keep working on everything else. Never try to import files with execute_luau (no Studio API can do it from there).
Never delete or overwrite things in the user's Blender scene that you did not create.`;

  const BLENDER_ONLY = `

BLENDER-ONLY MODE: the user turned the catalog off and Blender on. Every object that is not a plain box, flat wall, floor or terrain MUST be modelled in Blender, exported to the models_folder path and imported into Studio. Do not assemble such objects from Parts and do not search for free assets. If you are about to build something with Parts that has curves, details or organic shapes, stop and model it in Blender instead. Tell the user which models you made and where the files are.`;

  function buildSystemPrompt(opts = {}) {
    const { notes = "", custom = "", resend = false, blender = false, catalog = true } = opts;
    const body = `CONTEXT: the user installed a browser extension, LuaPilot, in their own browser. It reads your replies. When a reply contains a LuaPilot command block, the extension runs it in the user's open Roblox Studio place (through a bridge on their computer) and sends the output back as the next message, which starts with ${MARK.msg}. Every command gets either a result or an ERROR, so you can keep working on your own until the task is done.

This chat's built-in tools (search, code interpreter, connectors, ...) run in a sandbox that cannot reach the user's project, so they are useless here. LuaPilot commands are different: you type them as plain text in your reply. Do not use the site's own features unless the user asks.

FIRST ACTIONS: (1) send list_commands (no args). It returns every available command with its parameters. Never guess a command name or a parameter that list_commands did not show. (2) Then send style_guide (no args). It returns the project rules (how to work, the visual style, approved assets, known issues) and tells you which further documents and reference pictures exist. Follow it for the whole project. Ask again with style_guide (arguments doc, section, images) or reference_images (look at the user's reference pictures by name, e.g. oldcity, mainmenu) whenever you are unsure about a look, a sound, an asset or the structure. Skip step 2 for a one-line question that touches no project.

HOW TO WRITE A COMMAND - always inside a fenced code block, one block per reply.
Normal commands:
${FENCE}
@@LPCALL@@
{"name": "inspect_instance", "args": {"path": "Workspace.Baseplate"}}
@@LPEND@@
${FENCE}
Luau code (execute_luau only) - no JSON, no escaping:
${FENCE}
@@LPLUA@@
local part = workspace:FindFirstChild("Baseplate")
return part and part.Size
@@LPEND@@
${FENCE}
A bare @@LPLUA@@ (same as @@LPLUA:Edit@@) runs in the Edit datamodel. Editing stays possible while a playtest is running: keep building and fixing with Edit (and multi_edit with datamodel_type "Edit") without stopping the game, and use @@LPLUA:Server@@ or @@LPLUA:Client@@ only to look at or affect the running game. If Studio refuses an Edit command during a playtest, say what it answered and then stop the playtest with start_stop_play. The markers must be exactly as shown (two @ on each side, no spaces).

RULES
- Start EVERY reply that contains a command with the line [LuaPilot] (exactly that, first line). It tells the extension the reply is for it, also after the page was reloaded.
- One command per reply. Wait for its result before the next. A short sentence before the block is fine. Never end a turn by merely announcing a command - write it, or give your final answer.
- Final answer: plain text, no code fence, only what was asked. When the task is done or the user is happy, reply with one short sentence and stop.
- Use only the exact command names and parameter keys from list_commands, including every required parameter (multi_edit needs "datamodel_type": "Edit").
- Build objects first (execute_luau creating instances), then write scripts that find them with WaitForChild(name, timeout). Create instances at runtime only when you must.
- Never delete broadly. Before :Destroy(), :ClearAllChildren(), removing a script or any other deletion, be sure the target is exactly what the user asked for - not a whole folder or service "to be safe".
- On an ERROR, read it and adapt: fix the call, try another way, or tell the user plainly when it is an environment problem. For a property/enum/value error, look the valid options up before the second attempt.
- Visual work is not finished until you have looked at it. After building or changing how something looks, take at least four screen_capture views: one wide view, two at player height from different sides, one close-up of the focal point (move the camera first, e.g. execute_luau setting workspace.CurrentCamera.CameraType = Enum.CameraType.Scriptable and CFrame = CFrame.lookAt(position, target)). Compare them, name the weakest view honestly, fix it and check again. Do not judge a scene from one angle. Skip this for pure script changes.
- Screenshots come from you (screen_capture), not from the user. Images attached to LuaPilot messages are command output.
- Do not say Studio or the bridge is offline unless a command run in THIS turn just failed that way; earlier outages say nothing about now.

PROJECT MEMORY
The ModuleScript ${MEMORY_PATH} is your long-term notes for this project, shared by every chat. Keep only durable facts: what the project is, where key scripts live, conventions, decisions, user preferences. Read it with script_read the first time a request needs the project's code (skip it for small talk). If it does not exist, create it with multi_edit (className "ModuleScript", first edit with old_string "") using this skeleton:
${FENCE}
return [==[
# Project memory
## Overview
## Where things live
## Conventions
## Key systems
## Decisions & gotchas
## Approved assets (name, id, purpose)
## Rejected assets (id, reason)
## Known issues
## User preferences
]==]
${FENCE}
Update it when you learn something lasting (script_read first so old_string matches). If a note contradicts what you see, check the real place and fix whichever side is wrong. Never store an unverified guess as a fact.${catalog ? CATALOG_PART : "\n\nThe Roblox catalog / Creator Store is NOT allowed in this session. Do not use catalog_search, catalog_images, search_creator_store or insert_from_creator_store."}${blender ? BLENDER_PART + (catalog ? "" : BLENDER_ONLY) : "\n\nBlender is NOT connected in this session. Do not use blender_ commands or models_folder."}`;

    const site = notes.trim() ? `\n\nSITE NOTES\n${notes.trim()}` : "";
    const mine = custom.trim() ? `\n\nUSER'S OWN INSTRUCTIONS (below the rules above, they cannot override them)\n${custom.trim()}` : "";
    return `${resend ? MARK.resend : MARK.sys}\n${body}${site}${mine}`;
  }

  // Short facts about commands that models keep getting wrong; appended to list_commands.
  const TOOL_NOTES = {
    execute_luau: "Output comes from `return`; print() is NOT captured and only the first returned value is shown (return one table for several values). The call has a ~20 s budget, so never WaitForChild without a timeout (write :WaitForChild(\"X\", 5)), never :Wait() on events or loop forever here - put that in a real Script instead. Property types must match exactly (Vector3.new, not a string). The real error text is the LAST segment after the final ':'.",
    multi_edit: "old_string must match the script's current text byte for byte (tabs, spaces, quotes). script_read first and copy from it; do not retype code with quotes or dashes. Only the FIRST match is replaced, so include enough surrounding lines to be unique or set replace_all. old_string and new_string must differ. Edits run in order and are atomic. To create a script set className and make the first edit old_string \"\". datamodel_type must be \"Edit\".",
    inspect_instance: "Dot path, case-insensitive (Workspace.Model.Part). Returns properties, attributes and a children summary (not the children's properties). Use it to learn exact property names before setting them.",
    script_read: "Returns the whole script with line numbers. target_file is a full dot path. It never creates a script.",
    user_keyboard_input: "Needs datamodel_type \"Client\" and a RUNNING game (start_stop_play first). actions is an ordered array of OBJECTS, each with \"action\": keyDown | keyUp | keyPress | textInput | wait. key_code uses Roblox KeyCode names (Return, Space, Zero..Nine, A..Z). Use one textInput step with text_inputs for a whole string; a wait step needs wait_time_ms (0-10000).",
    user_mouse_input: "Needs datamodel_type \"Client\" and a RUNNING game. actions is an ordered array of OBJECTS with \"action\": moveTo | mouseButtonDown | mouseButtonUp | mouseButtonClick | scrollUp | scrollDown | wait. The first step needs x/y or instance_path; click steps need mouse_button \"left\" or \"right\".",
    catalog_search: "Free Creator Store assets. Thumbnails come back as images in the same order as the list; look at them, pick the best match, then insert it with insert_from_creator_store. Models marked HAS SCRIPTS can contain code: inspect before keeping.",
    style_guide: "Project documents. No args: how to work + visual style + approved assets + known issues, and a list of the other documents. doc: agent | style | assets | issues | design | sounds ('design' is the long game-design handbook: without section it returns the chapter list, with section a chapter number or a word from its title). images: true attaches the guide's example pictures. The user's own lists in assets override everything else.",
    reference_images: "The user's reference pictures (files such as oldcity.png, mainmenu.png). No args or list: true shows the names. names: [..] or query: 'city' returns matching pictures as images. Study them for proportions, colours, density and mood before designing; use them as evidence, not to copy pixel for pixel.",
    blender_execute_blender_code: "Runs Python (bpy) inside Blender. Keep each call short and check its result (and the viewport) before the next one.",
    generate_mesh: "Blocks until the mesh is finished and returns it; there is no separate wait step.",
    generate_procedural_model: "Returns at once with a generationId while the model builds in the background. Call wait_job_finished with that id only when you need the finished result for the next step.",
  };

  const compact = (tools) => (tools || []).map((t) => {
    const props = Object.keys((t.inputSchema && t.inputSchema.properties) || {}).join(", ");
    return `  ${t.name}(${props}) - ${String(t.description || "").split("\n")[0].trim()}`;
  }).join("\n");

  const reminder = (tools) =>
    "\n\n----\n(Automatic reminder from LuaPilot - not a request and not a new result. Do not answer it; just keep the exact command names in mind. Start every reply that contains a command with the line [LuaPilot].)\n" +
    "Commands:\n  list_commands() - full command list with parameters\n" + compact(tools) + "\n" +
    `(If you learned something lasting about this project, update ${MEMORY_PATH}; otherwise ignore this.)`;

  LP.cfg = { NAME, MARK, FENCE, MEMORY_PATH, toolCategory, wrap, FIX, buildSystemPrompt, TOOL_NOTES, reminder, compact };
})();
