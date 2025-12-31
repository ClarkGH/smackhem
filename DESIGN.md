# Project Codename: Smackhem

- First-Person Geometric Exploration Engine
- Web-First, Platform-Agnostic by Design

## Table of Contents

- [Inspired by](#inspired-by)
- [Shared features](#shared-features)
- [The MVP Vision](#the-mvp-vision)
  - [TBD / Next steps](#tbd--next-steps)
- [Smackhem – Portability Enforcement Rules](#smackhem--portability-enforcement-rules)
  - [Purpose](#purpose)
  - [0. The Prime Directive](#0-the-prime-directive)
  - [1. Layer Boundaries (Hard Rule)](#1-layer-boundaries-hard-rule)
  - [2. Rendering Enforcement Rules](#2-rendering-enforcement-rules)
  - [3. Input Enforcement Rules](#3-input-enforcement-rules)
  - [4. Time & Simulation Rules](#4-time--simulation-rules)
  - [5. World & Data Rules](#5-world--data-rules)
  - [6. Memory & Performance Rules (Console-Safe)](#6-memory--performance-rules-console-safe)
  - [7. Asset Loading Rules](#7-asset-loading-rules)
  - [8. Debugging Rules](#8-debugging-rules)
  - [9. Fake Port Validation Rule](#9-fake-port-validation-rule)
  - [10. The Final Sanity Check](#10-the-final-sanity-check)
  - [Closing Statement](#closing-statement)
- ["Smackhem" Design Principles](#smackhem-design-principles)
  - [1. Core Goal (Re-Stated)](#1-core-goal-re-stated)
  - [2. Design Principles (Non-Negotiable)](#2-design-principles-non-negotiable)
  - [3. Platform Strategy (High Level)](#3-platform-strategy-high-level)
  - [4. High-Level Architecture](#4-high-level-architecture)
  - [5. Core Systems](#5-core-systems)
  - [6. Rendering Layer (Portable by Design)](#6-rendering-layer-portable-by-design)
  - [7. World System](#7-world-system)
  - [8. Geometry Rules (Intentional Constraints)](#8-geometry-rules-intentional-constraints)
  - [9. Camera System (First-Person Focus)](#9-camera-system-first-person-focus)
  - [10. Input System (Console-Ready)](#10-input-system-console-ready)
  - [11. Party System (Drakkhen-Style)](#11-party-system-drakkhen-style)
  - [12. Collision System](#12-collision-system)
  - [13. Data Formats](#13-data-formats)
  - [14. Project Structure](#14-project-structure)
  - [15. What "Snap-On Porting" Actually Means (Honest)](#15-what-snap-on-porting-actually-means-honest)
  - [16. What We Are Building First (Learning Path)](#16-what-we-are-building-first-learning-path)
  - [17. Final Ground Rule (Most Important)](#17-final-ground-rule-most-important)

## Inspired by

Cross Code was made with spit, grit, and javascript. It was ported to consoles and it's a great game. Since we're javascript developers, we're going to follow their path and do the same thing. We can use OpenGL like them, and do a 2.5D game, OUR WAY (cool emoji the kid's relate to here, or not).
Remember Drakkhen? On the Amiga? The Super Nintendo? It's one of the most confusing games to pick up! But we think there's something there. We're taking inspiration and trying to see what we can do with the old magic.

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

- Since this is our first venture into 3D game development, we've decided to go with only geometric shapes and black/white shades. We're going to pretend people will enjoy the demo so much that we're prepping the game with a rendering layer for console porting.
- The whole RPG experience, in geometric form!
- No plagiarism, only inspiration.
- The rounds have been cast out of geometromena, the angled ones rule supreme. Will our circles, ovals, spirals, and parabolics be able to end roundism once and for all? Or will the “cycle” continue, as round things tend to do.
- Day/Dusk/Night/Dawn cycle.
- Cheeky but appropriate humor. Dad jokes, math jokes, we’re going to make it weird.
- The game is both 3D and 2D, ala Dragonview and Drakkhen. First person exploration in the main map, until combat or events, then party pops out and fights or has a conversation/investigates.
- NPC/Enemy/Party AI. Different than Drakkhen. Party will follow the hero, follow turn based commands, or follow set tactics in real time. Enemies/NPCs will do their own thing as set by the game logic.
- Enter an instance and be shown a 2D scene. If a dunny or explorable place, we can wobble/roll around. Otherwise only the scene.
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

Before we add any feature, we ask:
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

- Input systems should:
  - Translate hardware → intent
  - Not know about simulation or world state

- OS / Browser events
  - → platform input (web)
  - → core input
  - → simulation / camera update
  - → render
  - → reset transient input

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
- 2D simulated 'Spheres' and weird shapes will be a thing. Don't expect much from the lighting, but we'll do what we can because we must. If we can get a weird parabolic squiggle as a playable character, that looks gorgeous with the lighting, we've done our job.

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
- Camera update =/= render
  - Update simulation via fixed or variable time/steps
  - interpolate the render

##### 9.2.1 Technical Jargon and Formulae

###### 9.2.2 Identity Matrices

Identity matrices represent the default state of an object in 3D space. We use them as the starting point.

When we "clear" an object's rotation or movement, we set its matrix back to Identity.

When we calculate a complex transformation (e.g., Rotate -> Scale -> Move), we start with an Identity matrix and then multiply our transformation matrices onto it one by one. Rotation will be translated with euler angles, gimble lock is a consideration to move towards quaternions when necessary.

If a shader expects a matrix, but we don't want to apply any transformation to the vertices, we pass the identity matrix

- Scale = 1
- Rotation = 0deg
- Position = (0,0,0)

This ties into the w component. By having 1s on the diagonal and 0s elsewhere, our matrix will tell the GPU to keep x as x, y as y, z as z, and w as 1.

###### 9.2.3 Perspective Projection Matrix

Perspective lives inside a 16 element array.

The field of view or (fov) is the vertical angle in radians, that the camera can see. Larger means more is visible but objects are smaller.

`f = scaling factor`
`f = 1.0 / tan(fov / 2)`

The aspect ratio is the viewports width over it's height.

`eg. myAspectRatio = 1920 / 1080`

Near and far are the clipping planes. Anything out of bounds will be invisible.

- normalizationFactor

We want to scale the horizon off of the aspect ratio

`e[0] = x-scale`
`x-scale = f / aspect ratio`

We want to scale y by the focal factor

`e[5] = y-scale`
`y-scale = f`

We want to map the z-coordinates in a non-linear depth-buffer. This gives us more depth precision for objects closer to the camera.

`e[10] = (far + near) * normalizationFactor`
`e[14] = (2 * far * near) * normalizationFactor`

We need a projection trick value. We set it as -1 to move the original z-value into the "w" scaling factor.

`e[11] = projection trick value`

Wherever we are is a silly variable name we're rolling with to do some wonky stuff with right and left handed coordinates. Standby there, brains too tired after learning 3D math.

###### 9.2.4 Direction Vector Formula

`Direction = normalize(B - A)`

Everything we build uses lines

`dx = x_B - x_A`
`dy = y_B - y_A`
`dz = z_B - z_A`

`e.g. Direction = (dx, dy, dz) / sqrt(dx^2 + dy^2 + dz^2)`

###### 9.2.5 Look-At Matrix (View Matrix)

~~For a 3D camera, we need to define Up/Right to create a proper orientation matrices. We will be using a 16 element list or array for the matrices~~

~~`Forward Axis = normalize(Target - EyeLevel)`~~
~~`Right Axis = normalize(forwardAxis x WorldUp)`~~
~~`Up Axis = forwardAxis x rightAxis`~~

**Note:** This section is obsolete. We now use quaternions to compute camera orientation (see section 9.2.8.1). The view matrix structure remains the same (16-element array), but the rotation vectors are computed via quaternion rotation rather than cross products from a target point.

###### 9.2.7 Orientation Vectors

3D orientation requires three vectors within a 16 element list to define an xyz coordinate system

`e = element list`

**Matrix Layout:**

- `Right = e[0] to e[2]` (column 0)
- `Up = e[4] to e[6]` (column 1)
- `Forward = e[8] to e[10]` (column 2)

~~Right is perpendicular to Forward. We calculate it by taking the cross product of the World-Up and Forward vectors. This results in a horizontal vector that points to the right of the camera's perspective.~~

~~Up is the cross product of the Forward and Right vectors. It points up from the top of the camera's eye level.~~

~~Forward is the cross product of the forward and right axes. It's the exact direction the camera is pointing at.~~

~~`x component = (cosYaw * cosPitch)`~~
~~`y component = (sinPitch)`~~
~~`z component = (sinYaw * cosPitch)`~~

**Note:** The Euler angle formulas above are obsolete. We now compute these vectors using quaternion rotation (see section 9.2.8.1). The basis vectors are obtained by applying the camera's quaternion rotation to the initial basis vectors `(1,0,0)`, `(0,1,0)`, and `(0,0,-1)`.

###### 9.2.8 Translation and Final Matrix

We want to store the inverted position of the camera. View matrices move the world in the opposite direction vs moving the camera. We will always be at "the center".

- e[12] to e[14] store the inverted position of the camera.

We'll also want a "w" for the 4x4 matrix mathy stuff (homogenous coordinates)

- e[15] = 1

###### 9.2.8.1 Quaternion Rotation System

We use quaternions to represent 3D rotations, avoiding gimbal lock and providing smooth interpolation. A quaternion is a 4-component vector: `{x, y, z, w}` where `(x, y, z)` is the imaginary part and `w` is the real part.

**Quaternion Identity**
The identity quaternion (no rotation) is:

```text
q_identity = {x: 0, y: 0, z: 0, w: 1}
```

**Quaternion Normalization**
Quaternions must be unit quaternions (length = 1) for rotation:

```text
length = sqrt(x² + y² + z² + w²)
q_normalized = {x/length, y/length, z/length, w/length}
```

**Quaternion Multiplication**
Composing two rotations: `q_result = q_a * q_b`

```text
x = a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y
y = a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x
z = a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w
w = a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z
```

**Quaternion from Axis-Angle**
Create a rotation quaternion from an axis vector and angle:

```text
halfAngle = angle / 2
s = sin(halfAngle)
q = normalize({
    x: axis.x * s,
    y: axis.y * s,
    z: axis.z * s,
    w: cos(halfAngle)
})
```

**Quaternion Apply to Vector**
Rotate a 3D vector by a quaternion: `v_rotated = q * v * q^-1`
For unit quaternions, `q^-1` is the conjugate `{-x, -y, -z, w}`.

The formula expands to:

```text
// First multiply: q * v (treating v as quaternion with w=0)
tx = qw * vx + qy * vz - qz * vy
ty = qw * vy + qz * vx - qx * vz
tz = qw * vz + qx * vy - qy * vx
tw = -qx * vx - qy * vy - qz * vz

// Then multiply by conjugate q^-1
result.x = tx * qw + tw * (-qx) + ty * (-qz) - tz * (-qy)
result.y = ty * qw + tw * (-qy) + tz * (-qx) - tx * (-qz)
result.z = tz * qw + tw * (-qz) + tx * (-qy) - ty * (-qx)
```

**FPS Camera: Yaw and Pitch**
For first-person camera control:

- Yaw rotates around world Y-axis (up): `yawQuat = axisAngle({0, 1, 0}, -yaw)`
- Pitch rotates around local X-axis (right): `pitchQuat = axisAngle({1, 0, 0}, pitch)`
- Combined rotation: `rotation = normalize(yawQuat * pitchQuat)`

The multiplication order `yawQuat * pitchQuat` applies pitch first (in local space), then yaw (in world space), ensuring pitch always rotates up/down relative to the camera's current orientation.

**Camera Basis Vectors**
The camera's orientation vectors are computed by rotating the initial basis:

- Initial right: `(1, 0, 0)`
- Initial up: `(0, 1, 0)`
- Initial forward: `(0, 0, -1)` (WebGL looks down -Z)

After quaternion rotation:

```text
right = quaternionApplyToVector(rotation, {1, 0, 0})
up = quaternionApplyToVector(rotation, {0, 1, 0})
forward = quaternionApplyToVector(rotation, {0, 0, -1})
```

These form the rotation part of the view matrix (transposed for column-major storage).

Camera is a system, not math in input code.

###### 9.2.9 Matrix Multiplication

In order to change position, we'll need to combine two matrices for their product. We'll do so via matrix multiplication.
<https://en.wikipedia.org/wiki/Matrix_multiplication>

`AB = C`
`ViewMatrix = RotationMatrix * TranslationMatrix`
`CameraMatrix = ProjectionMatrix x ViewMatrix`

Row major order is more human readable and easier to manipulate for CPUs. WebGL wants column major order, but it comes with a built in transposition method that doesn't actually work.

- We're forced to use column major order for WebGL
- Console SDKs, Godot, and GLSL all use Column Major
- As needed we transpose the matrices, which will swap from Row / Column major

```text
Given a 3D array, A[i][j][k]
  With dimensions, L x M x N
Given a base memory address, B
Given a weight, W
Given a row index, i
Given a column index, j
Given the total rows, M
Given the total columns, N
Given the lower bound of rows, L_r
Given the lower bound of columns, L_c

Row major skips full row of size N to reach the correct row, then adds the column offest

- Row Major = B + W * [(i - L_r) * N + (j - L_c)]

Column major skips full columns of size M to reach the correct column then adds the row offset

- Column Major = B + W * [(j - L_c) * M + (j - L_r)]
```

### 10. Input System (Console-Ready)

#### 10.1 Input Intent

```typescript
interface PlayerIntent {
  move: Vec2;     // forward/back, strafe
  look: Vec2;     // yaw/pitch
  toggleCamera: boolean;
}
```

#### 10.2 Bare Web Input Backend

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
interface Party {
  leaderTransform: Transform;
  members: PartyMember[4];
}

interface PartyMember {
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
  - Collisions and interaction mechanAABBics will still be governed by the same 3D world logic but applied in the 2D instance (i.e., no physical simulation in the 3D world when in instances, but standard 2D interaction applies).
- Offsets are relative, not simulated
- NPCs and enemies will be 2D models with simple AI patterns that follow set behaviors, including spawning, patrolling, attacking, and reacting to player presence.
- Enemy movement will be constrained to the 2D plane, and they will collide with some 3D environmental features.

This is cheap, readable, and portable.

### 12. Collision System

- Manual (Axis-Aligned Bounding Box) checks.
- 3D camera vs world collision.
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

- TS files use camel case
- Every TS file will have a unique name. Vite has some issues with files that share names.
- Core files get "dibs on" generic naming

```text
src/
├─ core/
│  ├─ camera.ts           # 3D camera math and logic
│  ├─ gameLoop.ts         # Game loop logic
│  ├─ input.ts            # Player input logic
│  ├─ party.ts            # Party Logic
│  ├─ world.ts            # World and chunking logic
│  └─ math/               # Shared engine math logic
│     ├─ aabb.ts          # axis aligned bounding box
│     └─ mathHelpers.ts   # matrix/vector/etc math helper methods
├─ services/
│  ├─ renderer.ts         # Abstract Renderer interface
│  ├─ input.ts            # Abstract Input service
│  ├─ clock.ts            # Time service
│  └─ assetLoader.ts      # Asset loading service
├─ platforms/
│  ├─ web/
│  │  ├─ webBootstrap.ts    # Bootstraps the webGL game engine
│  │  ├─ webClock.ts        # Web platform clock implementation
│  │  ├─ webGLRenderer.ts   # Renderer specifically for webGL
│  │  └─ webInput.ts        # Input as it relates specifically to webGL
│  └─ stub/
│     ├─ nullRenderer.ts    # Stub renderer for testing/validation
│     └─ nullRenderer.spec.ts # Tests for stub renderer
│
├─ types/
│  └─ common.d.ts           # Common type definitions
├─ index.html               # HTML entry point for web platform
└─ main.ts                  # Entry point
```

Root level configuration:

- `package.json` - Project dependencies and scripts
- `pnpm-lock.yaml` - Dependency lock file
- `tsconfig.json` - TypeScript configuration
- `vite.config.mts` - Vite build configuration
- `LICENSE` - Project license
- `README.md` - Project documentation

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

### 16. What We Are Building First (Learning Path)

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

If something feels convenient but makes the engine aware it's running in a browser — we don't do it.
Web is the current backend, not the identity of the engine.
