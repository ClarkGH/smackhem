# Portability Enforcement Rules

## Table of Contents

- [Purpose](#purpose)
- [The Prime Directive](#the-prime-directive)
- [Layer Boundaries (Hard Rule)](#layer-boundaries-hard-rule)
  - [Core (Portable Forever)](#core-portable-forever)
  - [Services (Abstract Interfaces)](#services-abstract-interfaces)
  - [Backends (Replaceable)](#backends-replaceable)
- [Rendering Enforcement Rules](#rendering-enforcement-rules)
- [Input Enforcement Rules](#input-enforcement-rules)
- [Time & Simulation Rules](#time--simulation-rules)
- [World & Data Rules](#world--data-rules)
- [Memory & Performance Rules (Console-Safe)](#memory--performance-rules-console-safe)
- [Asset Loading Rules](#asset-loading-rules)
- [Debugging Rules](#debugging-rules)
- [Fake Port Validation Rule](#fake-port-validation-rule)
- [The Final Sanity Check](#the-final-sanity-check)
- [Closing Statement](#closing-statement)
- [Navigation](#navigation)

## Purpose

These rules exist to protect future portability (desktop, console, native) while allowing fast learning and iteration today.
They are not style preferences. They are constraints. Breaking them knowingly is a design decision, not an accident.

## The Prime Directive

The engine core is platform-agnostic.
Platforms are backends. Backends may change; core logic and data must not.
If a feature cannot be described without referencing a specific platform, it must be isolated or redesigned.

## Layer Boundaries (Hard Rule)

The project is divided into three layers. Code may only depend downward.

CORE  →  SERVICES  →  BACKENDS

### Core (Portable Forever)

Allowed:

- Math
- World logic
- Chunking
- Camera
- Party logic
- Time Logic
- Event Logic
- Deterministic simulation

Forbidden:

- WebGL / GPU APIs
- DOM / browser APIs
- Input devices (keyboard, mouse, gamepad)
- Asset paths or fetch calls

If code in `core/` references a platform concept, it is a violation.

### Services (Abstract Interfaces)

Services define what the engine needs, never how it is done.

Examples:

- Renderer
- Input
- Clock
- AssetLoader

Services:

- Contain no platform code
- Contain no logic beyond type definitions

### Backends (Replaceable)

Backends implement services for a specific platform.

Examples:

- WebGL renderer
- Web input
- Native renderer (future)

Backends:

- May depend on platform APIs
- May change freely
- Must not leak upward

## Rendering Enforcement Rules

### RULE R-1: No GPU Calls Outside the Renderer

Allowed:

```typescript
renderer.drawMesh(mesh, transform);
```

Forbidden:

```typescript
gl.bindBuffer(...);
```

If a non-render file mentions a GPU concept, the boundary is broken.

### RULE R-2: Rendering Is Declarative

Game code declares intent:

- What mesh
- Where it is

The renderer decides:

- How it is drawn
- How lighting is applied

Game logic must never adjust lighting values directly.

### RULE R-3: Lighting Lives in the Renderer

Lighting:

- Is grayscale only
- Is derived from mesh data
- Is applied in shaders

Lighting must never be:

- A gameplay mechanic
- A world system
- A camera concern

**Exception: Deterministic Time-Based Lighting**
Lighting parameters (direction, color, ambient intensity) may be computed deterministically in core as pure functions of simulation time. These calculations must:

- Be based solely on accumulated simulation time (fixed timestep)
- Not depend on platform-specific timing
- Not affect game simulation logic
- Be passed to the renderer via service interface methods

This allows for deterministic day/night cycles while keeping rendering implementation details in the renderer layer.

## Input Enforcement Rules

### RULE I-1: Input Is Intent, Not Hardware

Core systems consume intent, never devices.

Allowed:

```typescript
intent.move
intent.look
```

Forbidden:

```typescript
keydown
mouseDelta
```

### RULE I-2: Controller-First Assumption

Every gameplay feature must be usable with:

- Two sticks
- Buttons

If it requires a mouse or keyboard, it is invalid by default.

## Time & Simulation Rules

### RULE T-1: Fixed Timestep Only

Simulation must run at a fixed rate.

Forbidden:

- Frame-dependent movement
- Browser timing assumptions

Rendering may interpolate, simulation may not.

### RULE T-2: No Hidden Time Sources

The only valid time source is the engine clock service.

No:

- `Date.now()`
- `performance.now()`
- Implicit timing

### RULE T-3: Time-Based Effects Must Be Deterministic

Any effect that varies over time (lighting cycles, animations, etc.) must:

- Use accumulated simulation time (from fixed timesteps)
- Produce identical results given the same simulation time
- Be reproducible across platforms
- Not depend on real-world time or frame rate

Simulation time is the single source of truth for time-based effects.

## World & Data Rules

### RULE W-1: Data Is Pure

World data:

- Is serializable
- Contains no logic
- Contains no platform assumptions

JSON today, binary later — same structure.

### RULE W-2: Chunk Ownership Is Explicit

Chunks:

- Own their meshes
- Own their bounds
- Are loaded/unloaded deliberately

No global hidden state.

## Memory & Performance Rules (Console-Safe)

### RULE M-1: No Allocation in Hot Loops

Gameplay update loops must not:

- Allocate memory
- Create arrays
- Spawn objects

Chunk loading is the only allowed allocation boundary.

### RULE M-2: Predictable Lifetime

All runtime objects must have:

- A clear creation point
- A clear destruction point

Garbage collection should never be relied upon for correctness.

### RULE M-3: No Iterator/Generator Syntax

Forbidden:

- `for...of` loops (requires regenerator-runtime)
- Generator functions (`function*`, `yield`)
- Iterator protocols

Allowed:

- `Array.forEach()`
- `Map.forEach()`
- `Set.forEach()`
- Traditional `for` loops with indices
- `while` loops

Reason: Iterator/generator syntax requires regenerator-runtime polyfill, which adds overhead and complexity. Console ports may not support this runtime, and it violates the "no hidden dependencies" principle.

## Asset Loading Rules

### RULE A-1: Assets Are Requested by ID

Allowed:

```typescript
AssetLoader.loadMap("overworld_01")
```

Forbidden:

```typescript
fetch("./maps/overworld_01.json")
```

Paths are backend details.

## Debugging Rules

### RULE D-1: Debug Is Optional

Debug features:

- Must be toggleable
- Must not affect core logic
- Must not be required for gameplay

## Fake Port Validation Rule

### RULE P-1: Deletion Test

At any time, it must be possible to:

1. Delete all backend code
2. Replace it with stubs
3. Compile the core

If this fails, portability has already been broken.

## The Final Sanity Check

Before we add any feature, we ask:
Could this exist unchanged on a console with no browser, no mouse, and no JIT?

If the answer is:

- Yes → proceed
- No → redesign or isolate

## Closing Statement

These rules are not about restriction — they are about freedom later.

If followed consistently:

- Web is fast
- Desktop is easy
- Console is realistic

Break them knowingly, not accidentally.

## Navigation

- **[Index](INDEX.md)** - Project overview and documentation index
- **[Architecture](architecture.md)** - High-level architecture, design principles, and platform strategy
- **[Rendering](rendering.md)** - Rendering system, lighting, and day/night cycle
- **[Camera](camera.md)** - Camera system and mathematical formulas
- **[Systems](systems.md)** - World, party, input, collision, and geometry systems
- **[Data Formats](data-formats.md)** - Data format specifications
- **[Project Structure](project-structure.md)** - Code organization and project structure
- **[Porting Strategy](porting-strategy.md)** - Porting approach, FFI constraints, and learning path
