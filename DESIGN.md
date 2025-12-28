# Project Codename: Smackhem

- First-Person Geometric Exploration Engine
- Web-First, Platform-Agnostic by Design

## Inspired by

Cross Code was made with spit, grit, and javascript. It was ported to consoles and it’s a great game. Since the lead dev is a javascript dude, he’s going to follow their path and do the same thing. We can use OpenGL like them, and do a 2.5D game, OUR WAY (cool emoji the kid’s relate to here, or not).
Remember Drakkhen? On the Amiga? The Super Nintendo? It’s one of the most confusing games to pick up! But the lead dev thinks there’s something there. We’re taking inspiration and trying to see what we can do with the old magic.

## Shared features

- Dungeons and dragons-esque stat blocks
- Gear
- The open 3D map exploration
- The time of day
- Monster Fights
- Conversation(s)
- Random Encounter(s)
- Explorable instance(s)
- Shop(s) / Inn(s) / Shrine(s)
- Quests
- No bodies of water, disco dragon summons, or tombstone dogs allowed!
- No Illegible Spells!

## The MVP Vision

- Since this is the lead (and only) dev’s first venture into 3D game development We’ve decided to go with only geometric shapes and black/white shades. Lead dev’s going to pretend people will enjoy the demo so much that he’s prepping the game with a rendering layer for console porting.
- The whole RPG experience, in geometric form!
- No plagiarism, only inspiration.
- The rounds have been cast out of geometromena, the angled ones rule supreme. Will our circles, ovals, spirals, and parabolics be able to end roundism once and for all? Or will the “cycle” continue, as round things tend to do.
- Day/Dusk/Night/Dawn cycle.
- Cheeky but appropriate humor. Dad jokes, math jokes, we’re going to make it weird.
- The game is both 3D and 2D, ala Dragonview and Drakkhen. First person exploration in the main map, until combat or events, then party pops out and fights or has a conversation/investigates.
- NPC/Enemy/Party AI. Different than Drakkhen. Party will follow the hero, follow turn based commands, or follow set tactics in real time. Enemies/NPCs will do their own thing as set by the game logic.
- Enter an instance and be shown a 2D scene. If a dunny or explorable place, you can wobble/roll around. Otherwise only the scene.
- EASIER TO UNDERSTAND UI THAN DRAKKHEN. That game has a terrible UI and we aren’t plagiarizing.
- Modern, and more intuitive controls.
- Party character specific loot/gear/equipment.
- Group loot/money.
- Keep the demo’s code into the open source wild, put up on itch.io, and try to get funding for a full game, or get hired by a small team of indie game devs?

### TBD / Next steps

 We might transition into doing something more akin to Dragonview? Not sure, that's more complicated and having party AI do their own thing while following the leader seem's like a fine enough plan.

- Character creation.
- A plot.
- Spells: Unlock, fire, ice, light, lightning, invisibility, poison cloud, acid spray, buff, debuff, shield, etc.. If we have time and the spell's not broken, we'll have a good amount!
- Strengthen/upgrade system involving math formulae (Algebraic! Geometric!).
- Accessibility options.
- Add some color for... reasons.
- Port demo code to Godot, because "why not?". We're building for fun.

## Smackhem – Portability Enforcement Rules

### Purpose

These rules exist to protect future portability (desktop, console, native) while allowing fast learning and iteration today.
They are not style preferences. They are constraints. Breaking them knowingly is a design decision, not an accident.

### 0. The Prime Directive

The engine core is platform-agnostic.
Platforms are backends. Backends may change; core logic and data must not.
If a feature cannot be described without referencing a specific platform, it must be isolated or redesigned.

### 1. Layer Boundaries (Hard Rule)

The project is divided into three layers. Code may only depend downward.

CORE  →  SERVICES  →  BACKENDS

#### 1.1 Core (Portable Forever)

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

#### 1.2 Services (Abstract Interfaces)

Services define what the engine needs, never how it is done.

Examples:

- Renderer
- Input
- Clock
- AssetLoader

Services:

- Contain no platform code
- Contain no logic beyond type definitions

#### 1.3 Backends (Replaceable)

Backends implement services for a specific platform.

Examples:

- WebGL renderer
- Web input
- Native renderer (future)

Backends:

- May depend on platform APIs
- May change freely
- Must not leak upward

### 2. Rendering Enforcement Rules

#### RULE R-1: No GPU Calls Outside the Renderer

Allowed:

```typescript
renderer.drawMesh(mesh, transform);
```

Forbidden:

```typescript
gl.bindBuffer(...);
```

If a non-render file mentions a GPU concept, the boundary is broken.

#### RULE R-2: Rendering Is Declarative

Game code declares intent:

- What mesh
- Where it is

The renderer decides:

- How it is drawn
- How lighting is applied

Game logic must never adjust lighting values directly.

#### RULE R-3: Lighting Lives in the Renderer

Lighting:

- Is grayscale only
- Is derived from mesh data
- Is applied in shaders

Lighting must never be:

- A gameplay mechanic
- A world system
- A camera concern

### 3. Input Enforcement Rules

#### RULE I-1: Input Is Intent, Not Hardware
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

#### RULE I-2: Controller-First Assumption

Every gameplay feature must be usable with:

- Two sticks
- Buttons

If it requires a mouse or keyboard, it is invalid by default.

### 4. Time & Simulation Rules

#### RULE T-1: Fixed Timestep Only

Simulation must run at a fixed rate.

Forbidden:

- Frame-dependent movement
- Browser timing assumptions

Rendering may interpolate, simulation may not.

#### RULE T-2: No Hidden Time Sources

The only valid time source is the engine clock service.

No:

- `Date.now()`
- `performance.now()`
- Implicit timing

### 5. World & Data Rules

#### RULE W-1: Data Is Pure

World data:

- Is serializable
- Contains no logic
- Contains no platform assumptions

JSON today, binary later — same structure.

#### RULE W-2: Chunk Ownership Is Explicit

Chunks:

- Own their meshes
- Own their bounds
- Are loaded/unloaded deliberately

No global hidden state.

### 6. Memory & Performance Rules (Console-Safe)

#### RULE M-1: No Allocation in Hot Loops

Gameplay update loops must not:

- Allocate memory
- Create arrays
- Spawn objects

Chunk loading is the only allowed allocation boundary.

#### RULE M-2: Predictable Lifetime

All runtime objects must have:

- A clear creation point
- A clear destruction point

Garbage collection should never be relied upon for correctness.

### 7. Asset Loading Rules

#### RULE A-1: Assets Are Requested by ID

Allowed:

```typescript
AssetLoader.loadMap("overworld_01")
```

Forbidden:

```typescript
fetch("./maps/overworld_01.json")
```

Paths are backend details.

### 8. Debugging Rules

#### RULE D-1: Debug Is Optional

Debug features:

- Must be toggleable
- Must not affect core logic
- Must not be required for gameplay

### 9. Fake Port Validation Rule

#### RULE P-1: Deletion Test

At any time, it must be possible to:

1. Delete all backend code
2. Replace it with stubs
3. Compile the core
If this fails, portability has already been broken.

### 10. The Final Sanity Check

Before adding any feature, ask:
Could this exist unchanged on a console with no browser, no mouse, and no JIT?

If the answer is:

- Yes → proceed
- No → redesign or isolate

### Closing Statement

These rules are not about restriction — they are about freedom later.

If followed consistently:

- Web is fast
- Desktop is easy
- Console is realistic

Break them knowingly, not accidentally.

## “Smackhem” Design Principles

### 1. Core Goal (Re-Stated)

Build a small, deterministic 3D exploration engine that:

- Runs in the browser using WebGL + TypeScript
- Feels good to move around in first-person
- Supports a visible party of 4
- Streams a simple geometric world in chunks
- Can later "snap" onto other platforms by swapping backends

This is engine scaffolding, not content.

### 2. Design Principles (Non-Negotiable)

These principles exist only to protect portability:

1. Rendering is a service, not a dependency
2. Input is intent, not hardware
3. Simulation is deterministic
4. World data is pure data
5. WebGL is one backend, not the engine
If something violates these, it doesn't go in.

### 3. Platform Strategy (High Level)

Today:

- WebGL2
- TypeScript
- Browser-hosted

Tomorrow (Optional):

- Desktop wrapper
- Native renderer
- Console renderer

Rule:
The game should not know or care what GPU or input device exists.

### 4. High-Level Architecture

```text
┌──────────────────────────┐
│        Game Loop         │
├──────────────────────────┤
│  World / Party / Camera  │
├──────────────────────────┤
│   Systems (Logic Only)   │
├──────────────────────────┤
│  Render / Input / Audio  │  ← swappable
├──────────────────────────┤
│   Platform Backends      │
└──────────────────────────┘
```

### 5. Core Systems

#### 5.1 Game Loop (Fixed Step)

Console-safe, deterministic.

```typescript
while (accumulator >= FIXED_DT) {
  input.update();
  world.update(FIXED_DT);
  party.update(FIXED_DT);
  camera.update(FIXED_DT);
  accumulator -= FIXED_DT;
}

renderer.render(world, party, camera);
```

- Fixed timestep (e.g. 60Hz)
- Rendering interpolates
- No logic in render

### 6. Rendering Layer (Portable by Design)

#### 6.1 Renderer Interface

```typescript
interface Renderer {
  beginFrame(): void;
  drawMesh(
    mesh: MeshHandle,
    transform: Mat4,
    color: Vec3
  ): void;
  endFrame(): void;
}
```

#### 6.2 WebGL Implementation

- Uses WebGL2
- One shader pair
- No textures
- No lighting
- Depth test only

#### 6.3 Future Native Renderer

- Same interface
- Different implementation
- Game code unchanged

#### Key Rule: gl.* never leaks upward

### 7. World System

#### 7.1 World Structure

```typescript
World {
    activeChunks: Map<ChunkID, Chunk>
}
```

Each chunk is:

- Static geometry
- Collision bounds
- No logic

#### 7.2 Chunk Definition

```typescript
Chunk {
  id: string;
  bounds: AABB;
  meshes: StaticMesh[];
}

StaticMesh {
  mesh: MeshHandle;
  transform: Mat4;
  color: Vec3;
}
```

#### 7.3 Chunk Streaming

- Player position determines active radius
- Load:
  - Current chunk
  - Adjacent chunks
- Unload far chunks

This works identically on:

- Web
- Desktop
- Console

### 8. Geometry Rules (Intentional Constraints)

- No Curves or Smooth Surfaces: The game will strictly use geometric shapes such as cubes, pyramids, prisms, and planes. This constraint is intentional to simplify the design and rendering pipeline, making it easier to batch objects and optimize performance.
- No Textures: The game will only use solid colors or shaders for visual effects, making it more minimalist and geometric in appearance.
- 3D Spheres/Organic Shapes: While we've added spheres, they'll be used sparingly for specific objects (e.g., environmental details like orbs), and they won't dominate the design language.
- 2D simulated 'Spheres' and weird shapes will be a thing. Don't expect much from the lighting, but we'll do what we can because we must. If we can get a weird parabolic squiggle as a playable character, that looks gorgeous with the lighting, I've done my job.

Why:

- Easy to batch
- Easy to serialize
- Easy to port
- Easy to debug

### 9. Camera System (First-Person Focus)

#### 9.1 Camera Modes

- First-person (default)
- Optional slightly elevated free camera (toggleable)

#### 9.2 Camera Rules

- Yaw + pitch only
- No roll
- Clamped pitch
- Explicit smoothing (no browser magic)

Camera is a system, not math in input code.

### 10. Input System (Console-Ready)

#### 10.1 Input Intent

```typescript
interface PlayerIntent {
  move: Vec2;     // forward/back, strafe
  look: Vec2;     // yaw/pitch
  toggleCamera: boolean;
}
```

#### 10.2 Web Input Backend

- Keyboard → move
- Mouse → look
- Gamepad → move/look

#### 10.3 Console Input Backend (Future)

- Controller only
- Same intent output

Game logic never sees devices.

### 11. Party System (Drakkhen-Style)

#### 11.1 Party Structure

```typescript
Party {
  leaderTransform: Transform;
  members: PartyMember[4];
}

PartyMember {
  class: ClassType;
  offset: Vec3;
  mesh: MeshHandle;
}
```

#### 11.2 Party/Enemy Behavior

- camera moves in 3D sections.
- Party "pops out" from the center and splays out in a line on input or event.
- Party and Instance Transitions:
  - When entering an instance (such as a dungeon or explorable area), the game will switch to a 2D view where the party remains in the scene. The player will not be able to return to first-person exploration during this time.
  - The party will always be displayed as 2D characters when in combat or exploration mode inside an instance.
  - The 3D landscape and any buildings are part of the geometry, but party models and enemies will always remain 2D.
  - Collisions and interaction mechanics will still be governed by the same 3D world logic but applied in the 2D instance (i.e., no physical simulation in the 3D world when in instances, but standard 2D interaction applies).
- Offsets are relative, not simulated
- NPCs and enemies will be 2D models with simple AI patterns that follow set behaviors, including spawning, patrolling, attacking, and reacting to player presence.
- Enemy movement will be constrained to the 2D plane, and they will collide with some 3D environmental features.

This is cheap, readable, and portable.

### 12. Collision System

- Manual AABB checks.
- Player vs world.
- No physics engine.
- Deterministic.

This is console-friendly and debuggable.

### 13. Data Formats

#### 13.1 Map Data (JSON)

```json
{
  "id": "overworld_01",
  "chunks": [
    {
      "id": "chunk_0_0",
      "bounds": [0,0,0, 16,16,16],
      "meshes": [
        { "type": "cube", "pos": [2,0,2], "scale": [1,1,1] }
      ]
    }
  ]
}
```

Pure data. No logic. Portable forever.

### 14. Project Structure

```text
src/
├─ core/
│  ├─ gameLoop.ts
│  ├─ world.ts
│  ├─ party.ts
│  ├─ camera.ts
│  └─ input.ts
├─ services/
│  ├─ renderer.ts      # Abstract Renderer interface
│  ├─ input.ts         # Abstract Input service
│  ├─ clock.ts         # Time service
│  └─ assetLoader.ts   # Asset loading service
├─ platforms/
│  ├─ web/
│  │  ├─ webBootstrap.ts
│  │  ├─ webGLRenderer.ts
│  │  └─ webInput.ts
│  └─ console/
│     └─ console.md
├─ types/
│  └─ common.d.ts       # Common type definitions
└─ main.ts              # Entry point
```

Future:

- `platforms/native/`
- `platforms/console/`

No rewrites. Just additions.

### 15. What “Snap-On Porting” Actually Means (Honest)

Porting later means:

- Replace renderer backend
- Replace input backend
- Possibly replace audio backend

It does not mean:

- Rewriting world logic
- Rewriting party logic
- Rewriting camera
- Rewriting chunking

That's the win.

### 16. What You Should Build First (Learning Path)

1. WebGL renderer (single cube)
   - Uses WebGL2
   - One shader pair
   - No textures
   - Depth test only
2. Camera movement
3. Chunked world loading
4. Party pop-out rendering
5. Input abstraction
6. Clean separation audit

If it feels clean, it will port.

### 17. Final Ground Rule (Most Important)

If something feels convenient but makes the engine aware it’s running in a browser — don’t do it.
Web is the current backend, not the identity of the engine.
