# LuaPilot Project Style Guide

This guide keeps everything you build in this place consistent: same look, same structure, same feel. Read it at the start of a session. When you are unsure about a visual, audio or structural choice, ask for it again with the command style_guide (optionally with a section name). The user may edit this file; what is written under "Approved list" overrides everything else.

## rules
- Consistency beats novelty. Before adding something new, look at what already exists (inspect_instance, script_read) and match it: size, color, naming, spacing, sounds.
- Pick ONE visual style per project and keep it: low-poly, stylized-smooth or realistic. Never mix them in one scene.
- Reuse before you create. Same object = same asset, same scale, same material. Put repeated things in ReplicatedStorage.Assets and clone them.
- Use the colour palette below. At most 5 main colours per project plus white and near-black.
- Sizes: one stud = about 0.28 m. A door is about 4 x 7 studs, a chair seat about 2 studs high, a character is about 5 studs tall. Keep proportions believable relative to the character.
- Every Part that is not meant to move: Anchored = true. Every Part: sensible Name, no "Part", "Part1" or "Model" left behind.
- Never delete or overwrite something that was not created by you in this task without asking. Prefer adding a new object next to the old one.
- Test after building: look at the result (get_console_output, inspect_instance, or screen_capture when images work) before saying it is done.
- When the user asks for something vague, choose the simplest version that fits the style and say what you chose in one sentence.

## structure
- Workspace: only the playable world. Group related parts in Models and Folders, e.g. Workspace.Map.Buildings.House1. Set a PrimaryPart on every Model.
- ReplicatedStorage: Assets (models to clone), Modules (shared ModuleScripts), Remotes (RemoteEvents / RemoteFunctions).
- ServerScriptService: server logic, one Script per system (Combat, Inventory, Shop). StarterPlayerScripts / StarterGui: client logic and UI.
- ServerStorage.LuaPilot.Memory: the project notes (see the system prompt).
- Naming: PascalCase for instances, scripts and modules (HealthBar, ShopService). camelCase for local variables and functions. UPPER_SNAKE_CASE for constants. Remotes end with "Event" or "Function".
- One ModuleScript per responsibility. A script longer than about 300 lines should be split.
- Comment the why, not the what. Keep the top of each script a one-line purpose comment.

## colors
- Default palette "Dusk" (calm, works for most games): background #1B1F2A, panel #272D3C, text #E8ECF4, accent #7C9CFF, success #34D399, warning #FBBF24, danger #F87171.
- Alternative "Meadow" (bright, friendly): grass #6BBF59, sky #8EC9FF, wood #A9744F, stone #8C8F94, accent #FFC94A, danger #E4572E.
- Alternative "Neon" (arcade, sci-fi): base #0B0B14, magenta #FF3EA5, cyan #25F4EE, violet #7A5CFF, text #FFFFFF.
- Use Color3.fromHex or Color3.fromRGB with the exact values. Do not invent near-duplicates (#7B9BFF vs #7C9CFF).
- Lighting: choose one mood and keep it. Day: ClockTime 14, Brightness 2, Ambient (70,70,80), EnvironmentDiffuseScale 0.6. Dusk: ClockTime 18.3, Brightness 1.2, warm ColorShift_Top. Night: ClockTime 0, Brightness 0.4, add a subtle blue Atmosphere. Add one Atmosphere and, if the mood needs it, Bloom (Intensity 0.3) and ColorCorrection (Saturation 0.1). Do not stack more than three post-effects.

## ui
- Build UI with scale-based sizing (UDim2 scale) plus UIAspectRatioConstraint / UISizeConstraint so it works on phone and PC. Never rely on pixel offsets for layout.
- Spacing on an 8-pixel grid: padding 8 or 16, corner radius 8 (UICorner), stroke 1-2.
- Text: one font family (GothamMedium for body, GothamBold for titles). Sizes: title 24, heading 18, body 14, caption 12. Text contrast must be clearly readable on its background.
- Buttons: minimum 44 x 44 pixels touch size, a hover and a pressed state (tween over 0.12 s), a click sound.
- Put every ScreenGui in StarterGui with ResetOnSpawn = false when it holds state. One ScreenGui per feature, ZIndexBehavior = Sibling.
- Animations: TweenService, 0.15-0.3 s, Quad or Sine easing. Nothing should bounce for longer than 0.5 s.

## assets
- Search the Creator Store with catalog_search (type model, decal, mesh, ...). Look at the thumbnails, choose items that match the project style, and say why you chose them.
- Prefer assets that: have a clear, clean silhouette, match the chosen style, have no scripts (or scripts you have read and understood), and are from creators with many positive votes.
- Reject: assets with unknown scripts, assets that clash with the style, extremely high-poly models for small props, anything with a require() of an unknown ModuleScript (a common way to hide backdoors).
- After insert_from_creator_store: inspect the result, delete unwanted scripts only if you are sure, rename and group the model, anchor the parts, resize to the correct scale.
- Prefer making simple props from Parts yourself when the style is low-poly; it is faster and always consistent.
- Keep a short list of used asset ids in the project memory so later sessions reuse them.

## sounds
- Sound rules: every Sound goes into a SoundGroup (Music, Sfx, Ui, Ambient) so the user can control volumes. Never autoplay loud audio.
- Suggested volumes: UI clicks 0.3-0.5, pickups and rewards 0.5, impacts 0.6-0.8, ambient loops 0.2-0.4, music 0.25-0.4. Normal loudness: nothing should be louder than the voice of the player.
- 3D sounds: put the Sound inside the Part that makes it, RollOffMode = InverseTapered, RollOffMinDistance 8-12, RollOffMaxDistance 60-100.
- Vary repeated sounds: PlaybackSpeed random in 0.95-1.05 so footsteps and hits do not feel robotic.
- Kinds you will usually need: UI hover (soft tick), UI click (short pop), success (rising two-note chime), error (low short buzz), pickup/coin (bright sparkle), door (creak + thud), footsteps per material (grass, wood, stone, metal), impact/hit (thud + crunch), explosion (boom + debris), ambient (wind, birds, crowd, room tone), music (calm loop for menus, driving loop for action).
- Roblox only lets experiences use audio that is free for everyone, or that the creator owns. Find sounds with catalog_search type "audio", then test them in a Sound (check IsLoaded and TimeLength) before committing. If a sound fails to load, pick another; do not keep retrying the same id.
- Do not use copyrighted music or songs by well-known artists.
- Use an id from the "Approved list" below first when one exists for the need.

## images
- The guide comes with reference pictures: palette.png (colour palettes), ui-layout.png (grid, safe zones, button sizes), folder-structure.png (project layout), lighting.png (mood presets), asset-consistency.png (what matching and clashing assets look like).
- Ask for them with style_guide {"section": "images", "images": true}. The text always describes each picture, so you can still use them if you cannot see images.

## approved
- (Empty on purpose. The user can list here the exact asset ids, sound ids, colours and rules that must be used in this project. Example lines:)
- Sound UI click: rbxassetid://0000000 (replace with a real id)
- Main character model style: low-poly, flat colours
- Never use neon colours in this project
