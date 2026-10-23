# Project Structure

## Table of Contents

- [Naming Conventions](#naming-conventions)
- [Code Organization Principles](#code-organization-principles)
- [Project Directory Structure](#project-directory-structure)
- [Public Directory Structure](#public-directory-structure)
- [Root Level Configuration](#root-level-configuration)
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
│  ├─ audioSystem.ts          # Owns sound handles, turns audio events into AudioService calls
│  ├─ audioSystem.spec.ts     # Tests for audio event handling (stub audio)
│  ├─ camera.ts               # 3D camera math and logic
│  ├─ collision.ts            # Collision logic
│  ├─ displaySettings.ts      # Applies display settings, mirrors the platform's fullscreen state
│  ├─ displaySettings.spec.ts # Fullscreen requests, refusals and outside changes (stub display)
│  ├─ environment.ts          # Enviroment systems
│  ├─ events.ts               # Eventing pub/sub systems
│  ├─ gameLoop.ts             # Game loop logic
│  ├─ gameState.ts            # Game State logic
│  ├─ input.ts                # Player input logic
│  ├─ instance.ts             # Instance systems
│  ├─ look.spec.ts            # Look timing: mouse once per frame, stick per tick (stub platform)
│  ├─ menu.ts                 # Menu screen type
│  ├─ menuSystem.ts           # Start-up menu: screens, navigation, New Game
│  ├─ menuSystem.spec.ts      # Menu tests, direct and through GameLoop (stub platform)
│  ├─ modeAudio.ts            # Game mode changes -> audio requests (ambience, mode sound)
│  ├─ modeAudio.spec.ts       # Scenario tests for mode-driven audio (stub platform)
│  ├─ modeChange.spec.ts      # Scenario tests for game mode changes (stub platform)
│  ├─ party.ts                # Party logic
│  ├─ renderSystem.ts         # Rendering system
│  ├─ scene.ts                # Scene system
│  ├─ settings.ts             # Player settings, defaults, and validated load/save as JSON
│  ├─ settings.spec.ts        # Settings parsing, clamping and storage round-trip
│  ├─ world.ts                # World and chunking logic
│  └─ math/                   # Shared engine math logic
│     ├─ aabb.ts              # Axis aligned bounding box
│     ├─ mathHelpers.ts       # Matrix/vector/etc math helper methods
│     └─ mathHelpers.spec.ts  # fitLogicalOrtho at 4:3, 16:9, 16:10 and tall viewports
├─ services/
│  ├─ renderer.ts             # Abstract Renderer interface
│  ├─ input.ts                # Abstract Input service
│  ├─ clock.ts                # Time service
│  ├─ assetLoader.ts          # Asset loading service
│  ├─ chunkLoader.ts          # Chunk JSON parsing and mesh creation
│  ├─ audio.ts                # Abstract Audio service interface
│  ├─ display.ts              # Display service: render scale, window size, fullscreen
│  ├─ menuOverlay.ts          # Menu overlay interface and the MenuView it draws
│  ├─ save.ts                 # Save data and save service (seam only, not implemented)
│  ├─ storage.ts              # Key-value storage service (settings, later saves)
│  └─ platform.ts             # Platform services interface
├─ platforms/
│  ├─ web/
│  │  ├─ webBootstrap.ts      # Bootstraps the webGL game engine
│  │  ├─ webClock.ts          # Web platform clock implementation
│  │  ├─ webGLRenderer.ts     # Renderer specifically for webGL
│  │  ├─ webInput.ts          # Web input state management
│  │  ├─ webInput.spec.ts     # Gamepad mapping tests (faked navigator.getGamepads)
│  │  ├─ webInputService.ts   # Web input service implementation
│  │  ├─ webAssetLoader.ts    # Web asset loader (chunks)
│  │  ├─ webAudioService.ts   # Web audio playback and mixing service
│  │  ├─ webMenuOverlay.ts    # Menu drawn as text on a 2D canvas overlay, hit-tests the mouse
│  │  ├─ menuHitTest.ts       # Mouse position to menu item, and menu scrolling (pure math)
│  │  ├─ menuHitTest.spec.ts  # Hit-test, CSS-scaling and scrolling tests
│  │  ├─ localStorageStore.ts # Key-value storage on localStorage, never throws
│  │  ├─ webDisplay.ts        # Canvas fills its container, render scale, fullscreen on the container
│  │  └─ debugHUD.ts          # Debug HUD overlay
│  ├─ stub/
│  │  ├─ nullRenderer.ts      # Stub renderer for testing/validation
│  │  ├─ nullRenderer.spec.ts # Tests for stub renderer
│  │  ├─ nullMenuOverlay.ts   # Stub menu overlay, keeps the last view for tests
│  │  ├─ memoryStore.ts       # Stub key-value storage, in memory
│  │  ├─ stubDisplay.ts       # Stub display, records requests, tests play the platform's side
│  │  ├─ stubBootstrap.ts     # Stub platform bootstrap
│  │  ├─ stubClock.ts         # Stub clock implementation
│  │  ├─ stubInput.ts         # Stub input implementation
│  │  └─ stubAudioService.ts  # Stub audio service implementation
│  └─ cpu/                    # CPU platform (future)
├─ types/
│  └─ common.d.ts             # Common type definitions
├─ index.html                 # HTML entry point for web platform
└─ main.ts                    # Entry point
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
└─ audio-aliases.sh           # FFMPEG trim and compression scripts
```

## Root Level Configuration

Root level configuration:

- `package.json` - Project dependencies and scripts
- `pnpm-lock.yaml` - Dependency lock file
- `tsconfig.json` - TypeScript configuration
- `vite.config.mts` - Vite build configuration
- `LICENSE` - Project license
- `README.md` - Project documentation
- `docs/` - Project documentation directory

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
