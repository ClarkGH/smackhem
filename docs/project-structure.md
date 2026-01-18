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
│  ├─ camera.ts              # 3D camera math and logic
│  ├─ collision.ts           # Collision logic
│  ├─ gameLoop.ts            # Game loop logic
│  ├─ input.ts               # Player input logic
│  ├─ instance.ts            # Instance system (pause mode state)
│  ├─ instanceCharacter.ts  # Instance character state
│  ├─ party.ts               # Party logic
│  ├─ world.ts               # World and chunking logic
│  └─ math/                  # Shared engine math logic
│     ├─ aabb.ts             # Axis aligned bounding box
│     └─ mathHelpers.ts      # Matrix/vector/etc math helper methods
├─ services/
│  ├─ renderer.ts            # Abstract Renderer interface
│  ├─ input.ts               # Abstract Input service
│  ├─ clock.ts               # Time service
│  ├─ assetLoader.ts         # Asset loading service
│  ├─ chunkLoader.ts         # Chunk JSON parsing and mesh creation
│  └─ platform.ts           # Platform services interface
├─ platforms/
│  ├─ web/
│  │  ├─ webBootstrap.ts     # Bootstraps the webGL game engine
│  │  ├─ webClock.ts         # Web platform clock implementation
│  │  ├─ webGLRenderer.ts    # Renderer specifically for webGL
│  │  ├─ webInput.ts         # Web input state management
│  │  ├─ webInputService.ts  # Web input service implementation
│  │  ├─ webAssetLoader.ts   # Web asset loader (chunks, textures)
│  │  └─ debugHUD.ts         # Debug HUD overlay
│  ├─ stub/
│  │  ├─ nullRenderer.ts     # Stub renderer for testing/validation
│  │  ├─ nullRenderer.spec.ts # Tests for stub renderer
│  │  ├─ stubBootstrap.ts     # Stub platform bootstrap
│  │  ├─ stubClock.ts         # Stub clock implementation
│  │  └─ stubInput.ts         # Stub input implementation
│  └─ cpu/                    # CPU platform (future)
├─ types/
│  └─ common.d.ts            # Common type definitions
├─ index.html                 # HTML entry point for web platform
└─ main.ts                    # Entry point
```

## Public Directory Structure

```text
public/
└─ chunks/              # Chunk JSON files
   └─ {fileX}_{fileZ}.json  # Offset-based naming (fileX = chunkX + 10000)
```

Chunk files use offset-based naming to prevent negative coordinates in filenames. See [Data Formats](data-formats.md) for details.

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
- **[Rendering](rendering.md)** - Rendering system, lighting, and day/night cycle
- **[Camera](camera.md)** - Camera system and mathematical formulas
- **[Systems](systems.md)** - World, party, input, collision, and geometry systems
- **[Data Formats](data-formats.md)** - Data format specifications
- **[Porting Strategy](porting-strategy.md)** - Porting approach, FFI constraints, and learning path
