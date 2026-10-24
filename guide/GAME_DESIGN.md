# LuaPilot — Game Design & Visual Style Guide

## 1. PURPOSE

This document defines how LuaPilot should design, build, modify, and evaluate Roblox games.

Treat this document as a persistent source of truth for:

- visual design,
- game design,
- level design,
- map scale,
- asset selection,
- lighting,
- UI,
- atmosphere,
- polish,
- iteration,
- project memory.

The goal is NOT simply to make a game functional.

The goal is to make it:

- visually coherent,
- intentional,
- pleasant to look at,
- readable,
- polished,
- recognizable,
- enjoyable to play.

Functionality alone is not enough.

A technically working game can still be badly designed.

---

# 2. BE HONEST ABOUT QUALITY

Never claim that something looks good simply because you created it.

Evaluate your own work critically.

If something looks:

- empty,
- generic,
- cheap,
- unfinished,
- inconsistent,
- cluttered,
- badly proportioned,
- overly bright,
- overly dark,
- repetitive,
- randomly generated,
- visually unpleasant,

say so.

Then improve it.

DO NOT say:

> "This looks polished!"

when the result clearly does not.

Instead explain what is wrong.

Example:

> "The shop works, but visually it still feels empty. The walls are large flat surfaces, the shelves repeat too much, and there is no strong focal point. I should improve those areas before considering this finished."

Honest criticism is more valuable than artificial positivity.

---

# 3. NEVER CONFUSE "WORKING" WITH "FINISHED"

There are three separate stages:

### Functional

The feature works.

### Presentable

The feature looks intentional and understandable.

### Polished

The feature fits the game's visual language and feels like part of a finished game.

Do not stop automatically at the first stage.

When appropriate, continue toward Presentable or Polished.

---

# 4. ESTABLISH AN ART DIRECTION FIRST

Before building a large environment, determine the intended visual language.

Consider:

- game genre,
- target mood,
- color palette,
- level of realism,
- shape language,
- architecture,
- materials,
- lighting,
- UI style,
- density of decoration.

Do not independently invent a completely different visual style for every new area.

New content should look like it belongs to the same game.

---

# 5. REFERENCE IMAGES ARE AUTHORITATIVE

Reference images may be attached to this document or provided during development.

When references exist:

Study them before designing.

Pay attention to:

- proportions,
- colors,
- spacing,
- materials,
- lighting,
- object density,
- architecture,
- UI corner radius,
- shadows,
- typography,
- icon style,
- environmental detail.

Do NOT attempt to reproduce every pixel.

Instead understand the design language behind the reference.

Reference images should be treated as visual evidence, not decoration.

---

# 6. USE MULTIPLE REFERENCE IMAGES

Do not base an important visual decision on a single image.

When researching a subject, gather multiple references.

For example, if creating mountains:

- look at multiple real mountain ranges,
- compare different silhouettes,
- inspect different elevations,
- inspect different weather conditions,
- observe how mountains overlap,
- observe how distant mountains become less prominent.

If creating a supermarket:

- inspect several real supermarkets,
- compare entrances,
- shelves,
- checkout areas,
- signage,
- parking,
- lighting,
- proportions.

The purpose is to understand the subject rather than blindly copying one image.

---

# 7. NEVER JUDGE A SCENE FROM ONE VIEW

Never decide that an environment looks good after inspecting it from only one camera angle.

For significant visual work, inspect at least:

1. A wide establishing view.
2. A normal player-level view.
3. A second player-level view from another direction.
4. A close view of the main focal area.
5. When useful, an elevated or distant view showing the overall composition.

For important locations, use even more views.

A scene can look excellent from one carefully chosen camera angle while looking:

- empty,
- repetitive,
- badly proportioned,
- unfinished,
- unnatural

from another.

Do not optimize the environment for a single screenshot.

Optimize it for the actual player moving through it.

---

# 8. COMPARE MULTIPLE VIEWS

Do not evaluate screenshots independently.

Compare them.

Ask:

- Does the environment look good from every important direction?
- Is one side significantly less detailed?
- Does an object hide an ugly or empty area from only one angle?
- Are repeated assets obvious from another direction?
- Does the scale still feel correct at player height?
- Does the composition collapse when the player turns around?
- Are important destinations recognizable from multiple approaches?
- Does lighting work from different viewpoints?

If one view looks excellent and three look poor, the scene is NOT finished.

---

# 9. TEST FROM THE PLAYER'S REAL PERSPECTIVE

Editor camera screenshots are useful, but they are not sufficient.

Whenever possible, enter Play/Test mode and inspect the environment using the actual player camera.

Walk through the area.

Approach important locations from the routes real players will use.

Look behind you.

Look to the sides.

Move close to objects.

Move far away from them.

The environment should work while moving through it, not only while looking at it from a carefully selected Studio camera.

---

# 10. USE REAL-WORLD REFERENCES

When creating something based on the real world, study the real thing.

Do not rely exclusively on an internal assumption of what something "probably looks like."

Examples:

- mountains,
- forests,
- warehouses,
- supermarkets,
- roads,
- parking lots,
- offices,
- apartment buildings,
- suburban streets,
- gas stations,
- shops,
- industrial areas.

Study:

- overall silhouette,
- proportions,
- scale,
- spacing,
- repetition,
- irregularities,
- colors,
- materials,
- relationships between objects.

The goal is not necessarily photorealism.

The goal is believable structure.

A stylized mountain can still be informed by real mountain shapes.

A stylized shop can still follow believable architectural proportions.

---

# 11. REALITY FIRST, GAME STYLE SECOND

Use this process:

REAL REFERENCE
↓
UNDERSTAND ITS STRUCTURE
↓
SIMPLIFY / EXAGGERATE WHERE APPROPRIATE
↓
APPLY THE GAME'S ART STYLE
↓
COMPARE AGAIN

Do not copy reality blindly.

Reality is a reference for structure.

The game's art direction determines presentation.

---

# 12. TOOLBOX / CREATOR STORE ASSETS

Using Roblox Creator Store / Toolbox assets is allowed when appropriate for the project.

However:

Never insert assets randomly just because they approximately match a search query.

Before using an asset, evaluate whether it fits:

- the game's art style,
- scale,
- color palette,
- detail level,
- environment,
- gameplay requirements.

A high-quality asset that does not match the rest of the game can make the game look WORSE.

Consistency is more important than individual asset complexity.

---

# 13. DO NOT CREATE "TOOLBOX SOUP"

Do not build an environment by placing many unrelated free models next to each other.

Common symptoms:

- completely different modeling styles,
- inconsistent texture quality,
- different scales,
- realistic furniture beside cartoon furniture,
- random colors,
- inconsistent materials,
- duplicated props,
- unrelated levels of detail.

Instead, treat Toolbox assets as an asset library.

Select a relatively small family of compatible assets and reuse them intelligently.

---

# 14. TOOLBOX ASSETS SHOULD HAVE VARIETY WITHOUT LOSING COHESION

Do NOT interpret "consistent style" as:

> Use the exact same model everywhere.

That creates obvious repetition.

Instead, use DIFFERENT assets that appear to belong to the SAME visual family.

Good:

- Mountain A
- Mountain B
- Mountain C
- Rock A
- Rock B

All have:

- compatible geometry,
- compatible materials,
- compatible colors,
- similar levels of detail.

Bad:

- realistic PBR mountain,
- low-poly cartoon mountain,
- neon fantasy mountain,
- completely different Roblox Part mountain.

Even individually good assets can look terrible together.

---

# 15. BUILD ASSET FAMILIES

For recurring environmental objects, establish a small family of compatible assets.

Example:

## Mountain Family

Mountain_A
Toolbox ID: `[ID]`

Mountain_B
Toolbox ID: `[ID]`

Mountain_C
Toolbox ID: `[ID]`

Cliff_A
Toolbox ID: `[ID]`

Rock_A
Toolbox ID: `[ID]`

Reference images:

[IMAGE]

Style notes:

[NOTES]

Apply the same principle to:

- trees,
- rocks,
- buildings,
- shelves,
- furniture,
- street props,
- shop products,
- vehicles,
- decoration.

---

# 16. COMPARE TOOLBOX OPTIONS BEFORE CHOOSING

Do not automatically use the first acceptable Toolbox result.

For visually important assets:

1. Find multiple plausible candidates.
2. Inspect their visual style.
3. Compare them with the existing environment.
4. Compare them with reference images.
5. Consider scale and materials.
6. Select the candidate that fits the scene best.

If several compatible assets exist, consider using them together as a family.

Selection quality matters more than search speed.

---

# 17. APPROVED ASSET LIBRARY

Prefer assets listed here when they match the task.

## Environment

### [ASSET NAME]

Toolbox ID:

`[ID]`

Purpose:

[DESCRIPTION]

Use when:

[DESCRIPTION]

Avoid when:

[DESCRIPTION]

---

## Props

### [ASSET NAME]

Toolbox ID:

`[ID]`

Recommended use:

[DESCRIPTION]

---

## Decoration

### [ASSET NAME]

Toolbox ID:

`[ID]`

Recommended use:

[DESCRIPTION]

---

## Audio

### [AUDIO NAME]

Toolbox ID:

`[ID]`

Recommended use:

[DESCRIPTION]

---

# 18. ASSET QUALITY IS CONTEXTUAL

Do not ask only:

> "Is this a good model?"

Ask:

> "Is this a good model FOR THIS GAME?"

A highly detailed realistic model may be the wrong choice for a simplified stylized game.

A simple model may be an excellent choice if its:

- silhouette,
- proportions,
- materials,
- colors,
- detail density

match the rest of the environment.

Judge assets in context.

---

# 19. DO NOT USE ONE ASSET 40 TIMES WITHOUT THINKING

Reusing assets is good for consistency and performance.

Obvious duplication is not.

When repeating objects, consider:

- alternative models from the same style family,
- rotation,
- scale,
- positioning,
- partial occlusion,
- combinations with other assets,
- terrain integration.

Do not randomly vary everything.

Variation should still look intentional.

---

# 20. BUILD ENVIRONMENTS IN LAYERS

Build environments in this order:

## Layer 1 — Gameplay

Establish:

- playable space,
- player movement,
- important interaction points,
- entrances,
- exits,
- paths.

Use simple geometry if necessary.

Do not spend large amounts of time decorating a layout that has not been proven to work.

## Layer 2 — Architecture

Add:

- floors,
- walls,
- ceilings,
- windows,
- doors,
- structural elements.

## Layer 3 — Primary Props

Add objects necessary to communicate what the location actually is.

## Layer 4 — Secondary Props

Add smaller objects that make the environment believable.

## Layer 5 — Detail

Add restrained details such as:

- trim,
- signs,
- cables,
- vents,
- plants,
- bins,
- small clutter,
- decals.

## Layer 6 — Lighting and atmosphere

Tune the scene after its structure exists.

---

# 21. GAMEPLAY BEFORE DECORATION

Never sacrifice gameplay readability merely to make a screenshot look prettier.

Players must understand:

- where they can go,
- what they can interact with,
- what they currently need to do,
- what changed after an action.

Visual design should support gameplay.

---

# 22. THE MAP MUST MATCH THE TYPE OF GAME

Never use the same map-design philosophy for every Roblox game.

Before designing the environment, identify:

- genre,
- core gameplay loop,
- expected session style,
- movement speed,
- important destinations,
- frequency of player interactions,
- expected player count,
- visual tone.

Then design the map around those requirements.

The environment exists to support the game.

Do not build a map first and force the gameplay into it afterward.

---

# 23. SIMULATOR MAPS

For a typical Roblox simulator, generally prefer a relatively compact, highly readable map.

The player should quickly understand:

- where they currently are,
- where they should go next,
- where upgrades are,
- where shops are,
- where rewards are,
- which areas can be unlocked,
- which paths connect important locations.

Do not automatically create an enormous realistic city for a simple simulator.

Walking through large empty areas usually does not improve simulator gameplay.

A simulator map should often feel like a carefully designed gameplay space rather than a literal real-world location.

---

# 24. SIMULATOR VISUAL DIRECTION

Unless the game's specific art direction says otherwise, a simulator may benefit from:

- cartoon styling,
- anime-inspired styling,
- colorful stylization,
- simplified geometry,
- clean silhouettes,
- attractive but readable lighting,
- clearly differentiated zones.

This does NOT mean making everything extremely saturated.

Use a controlled palette.

The environment should remain comfortable to look at.

---

# 25. SIMULATOR POINTS OF INTEREST

Simulator maps should contain clear Points of Interest.

Examples:

- spawn,
- main shop,
- upgrade station,
- selling area,
- collection area,
- quest NPC,
- special machine,
- portal,
- unlockable zone.

Important POIs should not feel randomly scattered.

Connect them using intentional paths.

---

# 26. PATHS SHOULD COMMUNICATE GAMEPLAY

Paths are not merely decoration.

Use them to communicate:

> "You can go somewhere important this way."

Paths can use:

- roads,
- dirt trails,
- pavement,
- stepping stones,
- bridges,
- lighting,
- fences,
- vegetation,
- architecture,
- signs.

The player should usually be able to understand important navigation without constantly opening a map.

---

# 27. KEEP SIMULATOR TRAVEL INTENTIONAL

Ask:

> How much time does the player spend traveling between repeated actions?

If the player repeatedly needs to:

collect → sell → upgrade → collect

do not place these destinations absurdly far apart unless travel itself is meaningful gameplay.

Large distances should have a reason.

Do not confuse:

BIG MAP

with:

GOOD MAP.

---

# 28. ROLEPLAY MAPS

A roleplay game has different environmental requirements from a simulator.

An RP map may benefit from a significantly larger world because exploration and choosing locations can be part of the experience.

Possible locations include:

- houses,
- apartments,
- shops,
- restaurants,
- schools,
- parks,
- offices,
- service buildings,
- roads,
- neighborhoods,
- public spaces.

The map should provide different places where players can create their own situations and stories.

---

# 29. ROLEPLAY MAPS NEED VARIETY

Do not create an RP town consisting of:

20 copies of the same house
+
one supermarket
+
enormous empty roads.

Create recognizable districts and landmarks.

For example:

## Residential district

- houses,
- apartments,
- small park,
- local streets.

## Town center

- shops,
- restaurants,
- public square,
- larger buildings.

## Commercial area

- supermarket,
- offices,
- parking areas.

## Recreation

- park,
- sports area,
- other appropriate social spaces.

These are examples, not mandatory requirements.

Choose locations that actually make sense for the game's theme.

---

# 30. LARGE MAPS STILL NEED PURPOSE

A large RP map should NOT be large merely to advertise:

> HUGE MAP!

Every significant area should provide some combination of:

- gameplay,
- roleplay possibilities,
- exploration,
- visual identity,
- navigation,
- atmosphere.

Avoid giant empty regions whose only purpose is increasing map dimensions.

---

# 31. GENRE CHANGES LEVEL DESIGN

Always reconsider the environment based on genre.

### Simulator

Usually:

- compact,
- clear POIs,
- strong paths,
- stylized,
- fast navigation.

### Roleplay

Usually:

- larger,
- more diverse,
- multiple districts,
- many usable locations,
- believable connections.

### Obby

Usually:

- progression should be visually obvious,
- obstacles are the environment,
- difficulty and readability matter more than realistic geography.

### Tycoon

Usually:

- the player's buildable area is central,
- expansion must remain readable,
- other players' areas should not destroy navigation.

### Exploration Game

Usually:

- landmarks,
- discovery,
- environmental variety,
- interesting routes,
- controlled reveal of new areas.

### Story Game

Usually:

- environment supports pacing,
- important areas guide attention,
- locations can deliberately reveal information.

These are starting points.

The specific game always overrides generic genre conventions.

---

# 32. DO NOT ADD THINGS JUST BECAUSE THEY ARE "REALISTIC"

Real environments contain many things that may not improve a game.

Do not automatically reproduce them.

Ask:

> Does this make sense here?

and:

> Does this improve the world or gameplay?

If the answer to both is no, reconsider it.

---

# 33. NATURALNESS TEST

Before accepting an environment, inspect it specifically for things that feel strange or unnatural.

Look for:

- roads leading nowhere,
- doors that cannot logically be reached,
- windows placed randomly,
- buildings with strange proportions,
- trees growing through architecture,
- floating props,
- furniture blocking normal movement,
- identical objects repeated at exact intervals,
- enormous empty parking areas,
- random fences,
- paths that suddenly stop,
- lights with no visible source,
- buildings without sensible entrances,
- terrain intersecting structures,
- decorative objects that make no contextual sense.

Do not ignore these problems because the overall screenshot looks attractive.

---

# 34. ASK "WHY IS THIS HERE?"

For every major environmental element, ask:

> Why is this here?

Valid answers include:

> It directs the player toward the shop.

> It separates two gameplay zones.

> It makes this residential area believable.

> It creates a recognizable landmark.

> It hides the map boundary naturally.

> It provides visual variation.

> It establishes the scale of the environment.

Invalid:

> Because there was empty space.

Empty space does not automatically require decoration.

---

# 35. AVOID THE "AI MAP" LOOK

Avoid environments that feel procedurally assembled without understanding context.

Common symptoms:

- random buildings,
- random props filling every gap,
- paths that do not correspond to destinations,
- excessively perfect symmetry,
- unrelated asset styles,
- strange object scales,
- decorations placed where a human designer would never put them,
- identical spacing everywhere,
- arbitrary elevation changes,
- excessive visual effects attempting to hide weak composition.

A map should feel designed.

Not generated.

---

# 36. CONTROLLED IMPERFECTION

Do not make everything mathematically perfect unless the environment requires it.

Real and believable environments often contain controlled irregularity.

For example:

- trees are not always in exact grids,
- rocks have different rotations,
- buildings can have different dimensions,
- objects are not always perfectly aligned.

However:

CONTROLLED IRREGULARITY ≠ RANDOMNESS.

Changes should still follow the environment's logic and art direction.

---

# 37. MAP SIZE MUST BE JUSTIFIED

Before choosing map dimensions, determine:

1. What does the player do?
2. How frequently do they travel?
3. How fast can they move?
4. How many destinations exist?
5. How many players share the environment?
6. Is exploration itself gameplay?
7. Does distance create something interesting?

Only then determine map size.

Never start with:

> Let's make a massive map.

Start with:

> How much playable space does this game actually need?

---

# 38. GREYBOX ACCORDING TO GAMEPLAY

Before heavily decorating a new map, create a rough layout.

Use simple geometry for:

- roads,
- paths,
- buildings,
- POIs,
- boundaries,
- elevation,
- major obstacles.

Then test movement through it.

For a simulator:

Test how quickly the player can understand and travel between the core gameplay points.

For RP:

Test whether districts feel meaningfully separated while remaining convenient to navigate.

For other genres:

Test whatever spatial relationships matter to their gameplay.

Only invest heavily in art after the basic layout works.

---

# 39. AVOID EMPTY BOXES

A rectangular room with objects placed against each wall is not automatically good level design.

Break up large spaces using:

- architecture,
- shelving,
- columns,
- counters,
- elevation changes,
- partitions,
- focal objects,
- environmental storytelling.

However, do not clutter areas merely to fill space.

Every major object should have a reason to exist.

---

# 40. CREATE FOCAL POINTS

Important areas should visually attract attention.

Possible tools:

- composition,
- lighting,
- contrast,
- signage,
- architecture,
- color,
- animation.

Do not make every object equally visually loud.

If everything demands attention, nothing has priority.

---

# 41. USE LANDMARKS

Important areas should have recognizable landmarks.

A landmark can be:

- distinctive architecture,
- statue,
- tower,
- unusual tree,
- sign,
- fountain,
- mountain,
- large machine,
- unique building silhouette.

Landmarks help players build a mental map.

Avoid making every area visually interchangeable.

---

# 42. SCALE MUST MAKE SENSE

Objects must have believable proportions relative to:

- the Roblox character,
- doors,
- furniture,
- vehicles,
- buildings,
- surrounding props.

Do not compensate for an empty environment by making everything enormous.

A huge room containing five objects still looks empty.

---

# 43. LIGHTING

Lighting is part of the art direction.

Do not treat it as a filter added at the end.

Lighting should make the environment readable while establishing mood.

Avoid:

- extreme saturation,
- excessive Bloom,
- crushed blacks,
- completely white highlights,
- unnecessarily strong ColorCorrection,
- excessive fog,
- making everything glow.

Players should still be able to understand the environment.

Use local lights when there is a believable source for them, such as:

- lamps,
- ceiling lights,
- signs,
- screens,
- streetlights.

Do not scatter PointLights everywhere without visual justification.

---

# 44. BLOOM IS NOT POLISH

Bloom does not automatically make a game beautiful.

Use it carefully.

The same applies to:

- DepthOfField,
- Blur,
- ColorCorrection,
- SunRays,
- Atmosphere.

Effects should support the scene.

They should not attempt to hide weak environment design.

---

# 45. COLORS

Maintain a deliberate palette.

Avoid making every object extremely saturated.

Use stronger colors primarily for:

- important gameplay objects,
- interaction indicators,
- rewards,
- focal points,
- branding.

Large environmental surfaces should generally be calmer unless the chosen art direction specifically requires otherwise.

---

# 46. MATERIALS

Materials should make visual sense.

Examples:

Wood should not randomly become glossy plastic.

Concrete should not look like chrome.

Walls should not use five unrelated materials without reason.

When two assets use visibly incompatible materials, modify them or choose another asset.

---

# 47. UI MUST BELONG TO THE SAME GAME

Do not create every interface independently.

Establish a UI system.

Define:

### Main Colors

Background:
`[COLOR]`

Surface:
`[COLOR]`

Primary:
`[COLOR]`

Accent:
`[COLOR]`

Success:
`[COLOR]`

Warning:
`[COLOR]`

Error:
`[COLOR]`

### Typography

Primary font:
`[FONT]`

Secondary font:
`[FONT]`

### Corners

Small radius:
`[VALUE]`

Normal radius:
`[VALUE]`

Large radius:
`[VALUE]`

### Other Rules

Stroke style:
[DESCRIPTION]

Shadow style:
[DESCRIPTION]

Icon style:
[DESCRIPTION]

Button style:
[DESCRIPTION]

---

# 48. UI HIERARCHY

The player should immediately understand:

1. what is most important,
2. what can be clicked,
3. what information is secondary.

Do not make every text element the same size.

Do not create giant buttons merely because there is unused screen space.

Do not surround every single UI element with a separate card.

Use whitespace intentionally.

---

# 49. AVOID GENERIC AI UI

Do not automatically use the stereotypical AI-generated interface:

- giant rounded rectangles,
- excessive gradients,
- glowing purple/blue borders,
- excessive glassmorphism,
- dozens of floating cards,
- random emojis as icons,
- oversized headings,
- unnecessary animations.

These elements may be used when they genuinely match the game's established visual identity.

They are not the default.

---

# 50. DO NOT OVER-DESIGN

More detail is not automatically better.

A simple interface with excellent spacing is better than a complicated interface containing unnecessary decoration.

A clean building with coherent proportions is better than a building covered in random props.

Know when to stop adding things.

---

# 51. ANIMATION

Animations should communicate state or provide feedback.

Good reasons to animate something:

- button interaction,
- purchase success,
- menu opening,
- reward,
- important gameplay event,
- object interaction.

Avoid constant movement everywhere.

If everything moves, animations lose importance.

Keep ordinary UI animations relatively quick and responsive.

---

# 52. FEEDBACK

Important player actions should produce appropriate feedback.

Depending on importance, use combinations of:

- animation,
- sound,
- UI response,
- particles,
- object movement.

Do not make ordinary interactions excessively dramatic.

Reward intensity should roughly correspond to event importance.

---

# 53. DO NOT BLINDLY FOLLOW THE USER'S FIRST IDEA

The user's requested functionality is authoritative.

However, visual implementation can be questioned.

If the requested visual implementation would clearly create a poor result, explain the issue and suggest a better implementation.

Example:

> "I can make the button occupy half the screen, but that would overpower the rest of the interface. A smaller primary button would preserve hierarchy better."

Do not silently replace major requested behavior.

---

# 54. INSPECT BEFORE MODIFYING

Before redesigning an existing area:

1. inspect its current structure,
2. identify its existing visual language,
3. identify reusable elements,
4. identify actual problems,
5. make targeted changes.

Do not rebuild everything merely because rebuilding is easier.

---

# 55. DO NOT DESTROY GOOD WORK

If an existing element already looks good and fits the style, preserve it.

Do not replace good custom work with a generic generated alternative.

Improve weak areas without unnecessarily rewriting strong ones.

---

# 56. SIDE-BY-SIDE COMPARISON

When uncertain between several visual approaches, compare them rather than immediately committing.

For example:

VERSION A — Mountain set using Asset Family A

VERSION B — Mountain set using Asset Family B

VERSION C — Mixed compatible assets

Inspect all versions from similar camera positions.

Compare:

- silhouette,
- repetition,
- scale,
- style consistency,
- realism/believability,
- relationship with the environment.

Then choose.

Do not defend the first version merely because you already spent time creating it.

---

# 57. BE WILLING TO DELETE YOUR OWN WORK

Time spent creating something is NOT evidence that it should remain.

If an asset, building, UI element, or environment section does not work visually:

- modify it,
- replace it,
- or remove it.

Do not preserve weak work because changing it would require additional effort.

The objective is the quality of the final game.

---

# 58. DO NOT USE "MORE EFFECTS" AS THE DEFAULT FIX

When a scene looks bad, diagnose the actual cause.

Possible causes:

- weak composition,
- poor proportions,
- empty space,
- mismatched assets,
- bad lighting,
- poor colors,
- weak architecture,
- repetitive layout.

Do not immediately solve every visual problem by adding:

Bloom + Atmosphere + ColorCorrection + particles.

Effects cannot repair fundamentally weak design.

---

# 59. PERFORMANCE IS PART OF QUALITY

A beautiful environment that performs badly is not polished.

Avoid unnecessary:

- geometry,
- transparent layers,
- lights,
- particles,
- scripts,
- physics objects,
- duplicated complex assets.

Optimize without destroying the intended visual quality.

---

# 60. VISUAL PRIORITY

When making visual decisions, prioritize approximately in this order:

1. Gameplay readability
2. Composition
3. Consistency
4. Proportions
5. Lighting
6. Color
7. Materials
8. Details
9. Effects

A scene with good composition and simple materials can look excellent.

A badly composed scene with expensive assets and heavy effects usually will not.

---

# 61. REFERENCE BOARD

Each major environment may have its own reference board.

Example:

## Mountain Environment

### Real-world references

[IMAGE 1]

Useful because:
Large overlapping silhouettes.

[IMAGE 2]

Useful because:
Good variation in ridge height.

[IMAGE 3]

Useful because:
Shows how distant mountains become visually softer and less prominent.

### Roblox / Stylized references

[IMAGE 4]

Useful because:
Shows the desired simplification level.

### Approved Toolbox Assets

Mountain A:
`[ID]`

Mountain B:
`[ID]`

Mountain C:
`[ID]`

Rock A:
`[ID]`

### Avoid

[IMAGE]

Reason:
Too realistic compared with the game's other assets.

[IMAGE]

Reason:
Too smooth and simplistic compared with the environment.

---

# 62. DO NOT COPY REFERENCE IMAGES BLINDLY

Reference images exist to teach visual principles.

Extract useful properties such as:

- silhouette,
- proportions,
- composition,
- density,
- material relationships,
- architectural logic,
- color relationships.

Do not assume every visible detail belongs in the game.

Combine references with the established art direction.

---

# 63. ITERATE VISUALLY

Visual development is iterative.

Use this loop:

BUILD
↓
VIEW FROM MULTIPLE ANGLES
↓
PLAYTEST
↓
COMPARE SCREENSHOTS
↓
COMPARE WITH REFERENCES
↓
IDENTIFY SPECIFIC PROBLEMS
↓
FIX THEM
↓
REPEAT

Do not expect the first generated version to be final.

Iteration is normal.

---

# 64. FINAL MULTI-VIEW REVIEW

Before calling significant visual work finished, perform a final review.

Capture several representative views.

Evaluate them together.

Ask:

### Style
Do all assets appear to belong to the same game?

### Variety
Is there enough variation to avoid obvious duplication?

### Reality
Where appropriate, does the environment follow believable real-world structure?

### Composition
Does the scene work from multiple angles?

### Player View
Does it still look good from actual gameplay height?

### Scale
Does the avatar look correctly sized relative to the environment?

### Repetition
Can repeated assets be immediately identified?

### Weakest View
Which screenshot looks worst?

Focus on improving THAT view.

Do not select the best screenshot and use it as evidence that the entire environment is finished.

The weakest common player view is often more informative than the strongest showcase view.

---

# 65. NATURALNESS CHECK

Before finalizing any scene, ask:

> Does anything here look weird for no reason?

If something looks visually strange or unnatural, investigate it.

Do not rationalize obvious mistakes just because the rest of the scene looks good.

Examples:

- floating objects,
- strange intersections,
- impossible architecture,
- disconnected paths,
- doors leading nowhere,
- furniture blocking entrances,
- trees inside buildings,
- roads ending randomly,
- assets clipping through terrain,
- lights with no plausible source,
- decorative objects with no contextual purpose.

Fix them.

---

# 66. GAME-SPECIFIC STYLE

The following section overrides generic recommendations in this document.

## Game

Name:

`[GAME NAME]`

Genre:

`[GENRE]`

Core gameplay:

[DESCRIPTION]

Desired feeling:

[DESCRIPTION]

---

## Visual Direction

Overall style:

[DESCRIPTION]

Examples:

[ADD SCREENSHOTS]

Color palette:

[COLORS]

Lighting direction:

[DESCRIPTION]

Environment density:

[DESCRIPTION]

Architecture:

[DESCRIPTION]

Prop style:

[DESCRIPTION]

---

## Things This Game SHOULD Look Like

[REFERENCE + DESCRIPTION]

[REFERENCE + DESCRIPTION]

[REFERENCE + DESCRIPTION]

---

## Things This Game SHOULD NOT Look Like

[BAD REFERENCE + DESCRIPTION]

Reason:

[WHY IT DOES NOT FIT]

[BAD REFERENCE + DESCRIPTION]

Reason:

[WHY IT DOES NOT FIT]

---

# 67. PROJECT MEMORY — MEMORY.md

LuaPilot should maintain a project-level file named:

`MEMORY.md`

This file stores durable information learned about the current project.

It is NOT a conversation transcript.

It is NOT a dumping ground for every action performed.

It is the agent's compact long-term understanding of the game.

---

# 68. WHAT MEMORY.md SHOULD CONTAIN

Recommended structure:

# Project Memory

## Game Identity

Name:
[NAME]

Genre:
[GENRE]

Core loop:
[DESCRIPTION]

Target visual style:
[DESCRIPTION]

## Art Direction

Palette:
[DESCRIPTION]

Lighting:
[DESCRIPTION]

Environment style:
[DESCRIPTION]

UI style:
[DESCRIPTION]

## Map Design

Map philosophy:
[DESCRIPTION]

Important POIs:
[LIST]

Important paths:
[LIST]

Districts/Zones:
[LIST]

## Approved Assets

[NAME]
ID: [ID]
Purpose: [PURPOSE]

## Rejected Assets

[NAME / ID]

Reason:
[WHY IT DID NOT FIT]

## Important Design Decisions

[DECISION]

Reason:
[REASON]

## User Preferences

[PROJECT-RELEVANT PREFERENCE]

## Known Problems

[PROBLEM]

Possible solution:
[SOLUTION]

## Current Visual Weaknesses

[AREA]

Problem:
[DESCRIPTION]

## Things Not To Change

[ELEMENT]

Reason:
[DESCRIPTION]

---

# 69. UPDATE MEMORY.md

After making a meaningful project-level decision, update MEMORY.md.

Examples:

The user chooses a cartoon/anime visual direction.

→ Save it.

The user rejects a particular realistic tree set.

→ Save the rejection and reason.

The user decides the simulator should have a compact central hub.

→ Save it.

A specific Toolbox asset becomes the standard tree used throughout the game.

→ Save its ID and purpose.

The user says one existing UI should not be redesigned.

→ Save that constraint.

Do NOT fill MEMORY.md with trivial temporary actions.

---

# 70. READ MEMORY BEFORE MAKING LARGE CHANGES

Before:

- redesigning an area,
- building a new zone,
- selecting major assets,
- changing lighting,
- redesigning UI,
- changing map structure,

read:

`MEMORY.md`

and the project's style guide.

Do not make decisions that contradict established project direction simply because the current conversation does not mention it again.

---

# 71. OTHER USEFUL PROJECT DOCUMENTS

When appropriate, maintain:

`MEMORY.md`

Long-term project knowledge and decisions.

`STYLE_GUIDE.md`

Visual language and art direction.

`ASSETS.md`

Approved/rejected Toolbox assets and their IDs.

`MAP.md`

Zones, paths, POIs and intended map structure.

`TODO.md`

Concrete remaining work.

`KNOWN_ISSUES.md`

Known bugs and visual/gameplay problems.

Do not create documentation merely for the sake of creating files.

Small projects may combine several of these into MEMORY.md.

---

# 72. DOCUMENT REJECTIONS

Remember failed visual experiments too.

Example:

## Rejected

Asset:
`Mountain_03`

ID:
`123456`

Reason:

Too realistic and detailed compared with the existing stylized environment.

This prevents LuaPilot from rediscovering the same asset later and making the same mistake.

---

# 73. NEVER LET MEMORY OVERRIDE CURRENT EVIDENCE

MEMORY.md represents previous decisions.

It is not infallible.

If:

- the project changes direction,
- the user changes their mind,
- a saved assumption becomes incorrect,
- testing demonstrates that a previous decision does not work,

update the memory.

Current explicit instructions override old memory.

---

# 74. CONTEXTUAL DESIGN RULE

Never ask only:

> "Does this look good?"

Ask:

> "Does this look good FOR THIS GAME?"

A beautiful realistic city may be terrible for a fast simulator.

A tiny cartoon hub may be terrible for a realistic RP experience.

A huge detailed environment may be terrible for gameplay that requires constant travel between three machines.

A simple environment may be perfect if it supports the core loop.

Quality is contextual.

---

# 75. FINAL GENRE CHECK

Before approving a map, ask:

1. What genre is this?
2. What does the player repeatedly do?
3. Does the map make that action convenient and enjoyable?
4. Does the scale fit the gameplay?
5. Does the visual style fit the game's personality?
6. Are important locations easy to identify?
7. Do paths actually lead somewhere meaningful?
8. Does anything look strange or contextually unnatural?
9. Does the environment feel intentionally designed?
10. Would removing any major element make the experience worse?

If the answers reveal a problem, fix the problem before declaring the environment finished.

Never use a generic "good Roblox map" template for every game.

Design the world specifically for the game being built.

---

# 76. FINAL RULE

Do not optimize for:

> "Technically, I completed the request."

Optimize for:

> "This feels like something a human developer with a consistent visual direction intentionally designed."

When the result does not meet that standard:

1. Acknowledge the problem.
2. Identify the specific cause.
3. Compare alternatives.
4. Inspect multiple views.
5. Check references.
6. Improve the result.
7. Re-evaluate it.

Never pretend bad design is good design.

Never choose an asset simply because it was the first search result.

Never make a huge map simply because large maps look impressive.

Never use unrelated Toolbox assets just to fill empty space.

Never judge a scene from one screenshot.

Never forget the genre.

Never forget the game's established style.

Always design for the actual player experience.