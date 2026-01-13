# Systems

## Table of Contents

- [World System](#world-system)
  - [World Structure](#world-structure)
  - [Chunk Definition](#chunk-definition)
  - [Chunk Streaming](#chunk-streaming)
- [Geometry Rules (Intentional Constraints)](#geometry-rules-intentional-constraints)
- [Input System (Console-Ready)](#input-system-console-ready)
  - [Input Intent](#input-intent)
  - [Bare Web Input Backend](#bare-web-input-backend)
  - [Console Input Backend (Future)](#console-input-backend-future)
- [Party System (Drakkhen-Style)](#party-system-drakkhen-style)
  - [Party Structure](#party-structure)
  - [Party/Enemy Behavior](#partyenemy-behavior)
- [Collision System](#collision-system)
- [Navigation](#navigation)

## World System

### World Structure

```typescript
World {
    activeChunks: Map<ChunkID, Chunk>
}
```

Each chunk is:

- Static geometry
- Collision bounds
- No logic

### Chunk Definition

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

### Chunk Streaming

- Player position determines active radius
- Load:
  - Current chunk
  - Adjacent chunks
- Unload far chunks

This works identically on:

- Web
- Desktop
- Console

## Geometry Rules (Intentional Constraints)

- No Curves or Smooth Surfaces: The game will strictly use geometric shapes such as cubes, pyramids, prisms, and planes. This constraint is intentional to simplify the design and rendering pipeline, making it easier to batch objects and optimize performance.
- No Textures: The game will only use solid colors or shaders for visual effects, making it more minimalist and geometric in appearance.
- 3D Spheres/Organic Shapes: While we've added spheres, they'll be used sparingly for specific objects (e.g., environmental details like orbs), and they won't dominate the design language.
- 2D simulated 'Spheres' and weird shapes will be a thing. Don't expect much from the lighting, but we'll do what we can because we must. If we can get a weird parabolic squiggle as a playable character, that looks gorgeous with the lighting, we've done our job.

Why:

- Easy to batch
- Easy to serialize
- Easy to port
- Easy to debug

## Input System (Console-Ready)

### Input Intent

```typescript
interface PlayerIntent {
  move: Vec2;     // forward/back, strafe
  look: Vec2;     // yaw/pitch
  toggleCamera: boolean;
}
```

### Bare Web Input Backend

- Keyboard → move
- Mouse → look
- Gamepad → move/look

### Console Input Backend (Future)

- Controller only
- Same intent output

Game logic never sees devices.

## Party System (Drakkhen-Style)

### Party Structure

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

### Party/Enemy Behavior

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

## Collision System

- Manual (Axis-Aligned Bounding Box) checks.
- 3D camera vs world collision.
- Player vs world.
- No physics engine.
- Deterministic.

This is console-friendly and debuggable.

## Navigation

- **[Index](INDEX.md)** - Project overview and documentation index
- **[Portability Rules](portability-rules.md)** - All portability enforcement rules and constraints
- **[Architecture](architecture.md)** - High-level architecture, design principles, and platform strategy
- **[Rendering](rendering.md)** - Rendering system, lighting, and day/night cycle
- **[Camera](camera.md)** - Camera system and mathematical formulas
- **[Data Formats](data-formats.md)** - Data format specifications
- **[Project Structure](project-structure.md)** - Code organization and project structure
- **[Porting Strategy](porting-strategy.md)** - Porting approach, FFI constraints, and learning path
