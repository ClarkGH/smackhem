# Project Structure

## Table of Contents

- [Naming Conventions](#naming-conventions)
- [Code Organization Principles](#code-organization-principles)
- [Project Directory Structure](#project-directory-structure)
- [Public Directory Structure](#public-directory-structure)
- [Root Level Configuration](#root-level-configuration)
- [Testing](#testing)
- [Future Structure](#future-structure)
- [Navigation](#navigation)

## Naming Conventions

- TS files use camel case
- Every TS file will have a unique name. Vite has some issues with files that share names.
- Core files get "dibs on" generic naming

## Code Organization Principles

**When to Use Classes:**

- Stateful systems with lifecycle (World, GameLoop, Renderer, Input, Clock)
- Complex state with multiple methods
- Platform implementations that implement service interfaces

**When to Use Factory Functions:**

- Simple data structures (Camera, CollisionContext, InputState)
- Objects that are primarily data with minimal behavior
- Configuration objects

**When to Use Pure Functions:**

- Math utilities (matrix operations, quaternions, vectors)
- Stateless transformations
- Helper functions

**Data Structure Pattern:**
Simple data structures should be plain objects created via factory functions:

- `createCamera()` → `Camera`
- `createAABB()` → `AABB`
- `createCollisionContext()` → `CollisionContext`

Methods on data structures should be pure functions:

- `aabbContains(aabb, point)` instead of `aabb.contains(point)`
- `getCameraMatrix(camera, aspect)` instead of `camera.getMatrix(aspect)`

This pattern:

- Keeps data serializable
- Makes functions testable in isolation
- Avoids class overhead for simple data
- Maintains consistency with portability goals

## Project Directory Structure

```text
src/
├─ core/
│  ├─ camera.ts               # 3D camera math and logic
│  ├─ camera.spec.ts          # Flat move directions and the camera matrix, filled in place
│  ├─ chunkLoader.ts          # Chunk JSON parsing and mesh creation
│  ├─ chunkLoader.spec.ts     # Mesh placement and collision per shape, schema version, NPCs
│  ├─ collision.ts            # Collision logic
│  ├─ combat.ts               # Combat rules: HP, attacks, battle outcome (pure)
│  ├─ combat.spec.ts          # Sheets, HP clamping, damage and battle outcomes
│  ├─ combatSheets.ts         # Player and enemy sheets and attacks, fixed templates
│  ├─ events.ts               # Eventing pub/sub systems
│  ├─ gameLoop.ts             # Game loop logic
│  ├─ gameState.ts            # Game State logic
│  ├─ input.ts                # Player input logic
│  ├─ instance.ts             # Instance systems
│  ├─ interaction.ts          # What Interact reaches (nearest in range and in front), opens NPC speech
│  ├─ overheadOverlays.ts     # Places the speech bubble and interact prompt over NPCs' heads
│  ├─ party.ts                # Party logic
│  ├─ scene.ts                # Scene system
│  ├─ world.ts                # World and chunking logic
│  ├─ world.spec.ts           # Boundary walls between chunks, cached mesh/NPC/collision lists
│  ├─ audio/
│  │  ├─ audioSystem.ts       # Owns sound handles, turns audio events into AudioService calls
│  │  ├─ audioSystem.spec.ts  # Tests for audio event handling (stub audio)
│  │  ├─ modeAudio.ts         # Game mode changes -> audio requests (ambience, mode sound)
│  │  └─ modeAudio.spec.ts    # Scenario tests for mode-driven audio (stub platform)
│  ├─ lighting/
│  │  ├─ clouds.ts            # Cloud cycle timing, shared with the sky shader
│  │  ├─ clouds.spec.ts       # Cloud time wraps with no jump, whole noise periods per cycle
│  │  ├─ environment.ts       # Day/night cycle: sun, moon, ambient, and which body casts shadows
│  │  ├─ environment.spec.ts  # Shadow caster choice and its dawn/dusk crossfade
│  │  ├─ renderSystem.ts      # Declares the frame to the renderer: camera, lighting, draws
│  │  ├─ skyPalette.ts        # TimeOfDayPalette keys: sky, light colors, ambient, stars (holds, wrap), pure
│  │  ├─ skyPalette.spec.ts   # Holds, wrap, continuity, dawn/sunset on the sun's horizon crossings
│  │  ├─ stars.ts             # Star twinkle timing, shared with the sky shader
│  │  └─ stars.spec.ts        # Star time wraps with no jump, whole twinkle slots per cycle
│  ├─ menu/
│  │  ├─ menu.ts              # Menu screen type
│  │  ├─ menuSystem.ts        # Start-up, pause and Debug menus: screens, navigation, values
│  │  └─ menuSystem.spec.ts   # Menu tests, direct and through GameLoop (stub platform)
│  ├─ settings/
│  │  ├─ settings.ts          # Player settings, defaults, and validated load/save as JSON
│  │  ├─ settings.spec.ts     # Settings parsing, clamping and storage round-trip
│  │  ├─ displaySettings.ts   # Applies display settings, mirrors the platform's fullscreen state
│  │  ├─ displaySettings.spec.ts # Fullscreen requests, refusals and outside changes (stub display)
│  │  └─ debugSettings.ts     # Debug screen values (wireframe, shadows, bias, time), never saved
│  ├─ scenarios/              # Scenario specs that cross systems (stub platform)
│  │  ├─ debugMenu.spec.ts    # Debug screen: wireframe, shadows, bias and time reach the renderer
│  │  ├─ frameCap.spec.ts     # Catch-up after a stall is capped at a quarter second
│  │  ├─ interaction.spec.ts  # NPC speech: facing, reach, opening, closing, the world waiting
│  │  ├─ look.spec.ts         # Look timing: mouse once per frame, stick per tick
│  │  ├─ modeChange.spec.ts   # Game mode changes
│  │  ├─ npc.spec.ts          # NPC collision, and its billboard's texture and placement
│  │  ├─ pause.spec.ts        # Pause, resume and quit-to-menu
│  │  ├─ scene.spec.ts        # 2D scene movement, the whole grid walkable
│  │  └─ timeOfDay.spec.ts    # Day clock: advances per tick, wraps, stands still when frozen
│  └─ math/                   # Shared engine math logic
│     ├─ aabb.ts              # Axis aligned bounding box
│     ├─ mathHelpers.ts       # Matrix/vector/etc math helper methods
│     └─ mathHelpers.spec.ts  # fitLogicalOrtho at 4:3, 16:9, 16:10 and tall viewports
├─ services/
│  ├─ renderer.ts             # Abstract Renderer interface
│  ├─ input.ts                # Abstract Input service
│  ├─ clock.ts                # Time service
│  ├─ assetLoader.ts          # Asset loading service
│  ├─ audio.ts                # Abstract Audio service interface
│  ├─ display.ts              # Display service: render scale, window size, fullscreen
│  ├─ menuOverlay.ts          # Menu overlay interface and the MenuView it draws
│  ├─ promptOverlay.ts        # Interact prompt interface and the PromptView it draws
│  ├─ speechOverlay.ts        # Speech bubble interface and the SpeechView it draws
│  ├─ save.ts                 # Save data and save service (seam only, not implemented)
│  ├─ storage.ts              # Key-value storage service (settings, later saves)
│  └─ platform.ts             # Platform services interface
├─ platforms/
│  ├─ web/
│  │  ├─ webBootstrap.ts      # Bootstraps the webGL game engine
│  │  ├─ webBootstrap.spec.ts # Chunk streaming when loads finish out of order
│  │  ├─ webClock.ts          # Web platform clock implementation
│  │  ├─ webAssetLoader.ts    # Web asset loader (chunks)
│  │  ├─ webDisplay.ts        # Canvas fills its container, render scale, fullscreen on the container
│  │  ├─ webDisplay.spec.ts   # Canvas sizing, render scale, fullscreen and refusals (fake DOM)
│  │  ├─ localStorageStore.ts # Key-value storage on localStorage, never throws
│  │  ├─ localStorageStore.spec.ts # Blocked storage, and the KeyValueStore contract
│  │  ├─ debugHUD.ts          # Debug HUD overlay
│  │  ├─ rendering/
│  │  │  ├─ webGLRenderer.ts  # WebGL2 renderer: shaders, shadow map, depth and lit passes
│  │  │  ├─ drawList.ts       # A frame's draws, copied in and replayed in endFrame
│  │  │  ├─ drawList.spec.ts  # Copies scratch matrices, keeps call order, pool reuse
│  │  │  ├─ shadowMath.ts     # Light view-projection for the shadow map, texel-snapped
│  │  │  └─ shadowMath.spec.ts # Centring, overhead light, no shimmer as the focus moves
│  │  ├─ input/
│  │  │  ├─ webInput.ts       # Web input state management
│  │  │  ├─ webInput.spec.ts  # Gamepad mapping tests (faked navigator.getGamepads)
│  │  │  ├─ webInputService.ts # Web input service implementation
│  │  │  └─ webInputService.spec.ts # Keys, menu pointer priority, losing the cursor (fake DOM)
│  │  ├─ menu/
│  │  │  ├─ webMenuOverlay.ts # Menu drawn as text on a 2D canvas overlay, hit-tests the mouse
│  │  │  ├─ webMenuOverlay.spec.ts # Drawing, mouse hit areas against drawn text, scrolling (fake DOM)
│  │  │  ├─ menuHitTest.ts    # Mouse position to menu item, and menu scrolling (pure math)
│  │  │  └─ menuHitTest.spec.ts # Hit-test, CSS-scaling and scrolling tests
│  │  ├─ overlays/
│  │  │  ├─ webPromptOverlay.ts # Interact key hint over the target, label follows the last device
│  │  │  └─ webSpeechOverlay.ts # Speech bubble, a placed div over the canvas
│  │  └─ audio/
│  │     ├─ webAudioService.ts # Web audio playback and mixing service
│  │     └─ webAudioService.spec.ts # Playback, loading, autoplay retry, and the AudioService contract
│  ├─ stub/
│  │  ├─ nullRenderer.ts      # Stub renderer for testing/validation
│  │  ├─ nullRenderer.spec.ts # Tests for stub renderer
│  │  ├─ nullMenuOverlay.ts   # Stub menu overlay, keeps the last view for tests
│  │  ├─ nullPromptOverlay.ts # Stub interact prompt, keeps a copy of the last view
│  │  ├─ nullSpeechOverlay.ts # Stub speech bubble, keeps a copy of the last view and counts renders
│  │  ├─ memoryStore.ts       # Stub key-value storage, in memory
│  │  ├─ stubDisplay.ts       # Stub display, records requests, tests play the platform's side
│  │  ├─ stubBootstrap.ts     # Stub platform bootstrap
│  │  ├─ stubClock.ts         # Stub clock implementation
│  │  ├─ stubInput.ts         # Stub input implementation
│  │  └─ stubAudioService.ts  # Stub audio service implementation
│  └─ cpu/                    # CPU platform (future)
├─ testing/                   # Test-only helpers, never imported by the game
│  ├─ scenario.ts             # Scenario harness: real GameLoop on the stub platform
│  ├─ fakeDom.ts              # Minimal document/window/canvas fakes for web platform tests
│  └─ fakeWebAudio.ts         # Minimal AudioContext/Audio/fetch fakes for web audio tests
├─ types/
│  └─ common.d.ts             # Common type definitions
├─ index.html                 # HTML entry point for web platform
├─ game.ts                    # createGame(platform): wires settings, display, audio, chunks, GameLoop
├─ game.spec.ts               # Boot smoke test: createGame on the stub platform, a whole session
├─ projectStructure.spec.ts   # Fails when this tree and src/ disagree (see Testing)
└─ main.ts                    # Entry point: picks the platform, runs game.frame() every animation frame
```

## Public Directory Structure

```text
public/
├─ chunks/                    # Chunk JSON files
│  └─ {fileX}_{fileZ}.json    # Offset-based naming (fileX = chunkX + 10000)
└─ assets/
   ├─ images/                 # Textures, asset ID naming (e.g. circle-sleep00.png)
   └─ audio/                  # Audio files, file name is the sound ID
      ├─ ambient_night.ogg    # snake_case, led by purpose. All placeholders for now
      ├─ sfx_mode_change.ogg  # Played on every game mode change
      └─ ui_menu_select.ogg   # Played when a menu item is chosen
```

Chunk files use offset-based naming to prevent negative coordinates in filenames. See [Data Formats](data-formats.md) for details.

## Scripts Directory Structure

```text
scripts/
├─ audio-aliases.sh           # FFMPEG trim and compression scripts
└─ mutate.sh                  # Mutation check: break a line on purpose, see if a spec notices
```

## Root Level Configuration

Root level configuration:

- `package.json` - Project dependencies and scripts
- `pnpm-lock.yaml` - Dependency lock file
- `pnpm-workspace.yaml` - pnpm settings: which dependencies may run install scripts
- `tsconfig.json` - TypeScript configuration
- `vite.config.mts` - Vite build configuration
- `vitest.config.ts` - Test configuration: mocks and stubbed globals restored after every test
- `.eslintrc.json` - Lint rules: airbnb-base with TS-aware overrides
- `.claude/` - Claude Code settings: hooks run the gates (typecheck after edits, tests and lint before stopping), docs edits ask first
- `LICENSE` - Project license
- `README.md` - Project documentation
- `CLAUDE.md` - Rules for Claude working in this repo
- `DESIGN.md` - Entry point to the design docs
- `docs/` - Project documentation directory

## Testing

Specs sit next to the code they test (`*.spec.ts`). `pnpm test` runs them all, `pnpm test:coverage` adds a coverage report.

- **Scenario tests** (`src/testing/scenario.ts`): `createScenario()` runs the real `GameLoop` on the stub platform, one fixed tick per frame, and gives `press`, `tick`, `frame` and `click`. Use it for anything that crosses systems (modes, menus, look, audio rules) instead of building a loop by hand.
  - **Timing rule:** events flush at the end of each frame, so a request published while handling an event (e.g. audio reacting to a mode change) is handled on the next frame.
- **The stub platform behaves like the real one.** `StubInput` clears one-shot actions once read, like `WebInputService`, so a `press` is seen by exactly one frame.
- **Contract tests:** the same suite runs against a stub and its web implementation (`AudioService`, `KeyValueStore`), so passing on the stub means the same thing as passing on the real backend. Add one when adding a service.
- **Web platform tests:** browser APIs are replaced by small fakes (`fakeDom.ts`, `fakeWebAudio.ts`) that only implement what our code calls. No DOM library.
- **Boot smoke test** (`src/game.spec.ts`): the same wiring `main.ts` runs, on the stub platform, through a whole session.
- **Clean state:** `vitest.config.ts` restores spies, mocks and stubbed globals after every test.
- **This doc is a gate** (`src/projectStructure.spec.ts`): every file in `src/` must appear in the tree above, and every file in the tree must exist. Adding, moving or deleting a file turns `pnpm test` red until the tree matches. It checks names only, so keep the descriptions honest by hand. The private platform folders are skipped.

## Future Structure

Future:

- `platforms/native/`
- `platforms/console/`

No rewrites. Just additions.

## Navigation

- **[Index](INDEX.md)** - Project overview and documentation index
- **[Portability Rules](portability-rules.md)** - All portability enforcement rules and constraints
- **[Architecture](architecture.md)** - High-level architecture, design principles, and platform strategy
- **[Rendering](rendering.md)** - Rendering system, lighting, day/night cycle, and display size
- **[Events, State, and Audio Systems](events.md)** - Eventing, global state, audio, and settings events
- **[Camera](camera.md)** - Camera system and mathematical formulas
- **[Systems](systems.md)** - World, party, input, collision, geometry, and menu systems
- **[Controls](controls.md)** - Keyboard, mouse and controller bindings
- **[Data Formats](data-formats.md)** - Chunk, settings, and save data formats
- **[Porting Strategy](porting-strategy.md)** - Porting approach, learning path, and publishing
