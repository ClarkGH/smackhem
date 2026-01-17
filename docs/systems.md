# Systems

## Table of Contents

- [Instance System](#instance-system)
  - [Instance System Architecture](#instance-system-architecture)
  - [Instance Transition](#instance-transition)
  - [Instance Character Management](#instance-character-management)
  - [Separation of Concerns](#separation-of-concerns)
- [World System](#world-system)
  - [World Structure](#world-structure)
  - [Chunk Definition](#chunk-definition)
  - [Chunk Streaming](#chunk-streaming)
- [Geometry Rules (Intentional Constraints)](#geometry-rules-intentional-constraints)
- [Geometric Mesh Generation](#geometric-mesh-generation)
  - [Cube Mesh](#cube-mesh)
  - [Pyramid Mesh](#pyramid-mesh)
  - [Sphere Mesh (UV Sphere)](#sphere-mesh-uv-sphere)
  - [Plane Mesh](#plane-mesh)
  - [Prism Mesh](#prism-mesh)
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

## Geometric Mesh Generation

The renderer provides methods to generate geometric meshes procedurally. All meshes are created through the `Renderer` interface, ensuring platform-agnostic mesh creation.

### Cube Mesh

For a cube of size `s`, centered at origin:

```typescript
half = s / 2
vertices = [
    // 6 faces × 2 triangles × 3 vertices = 36 vertices
    // Each face: two triangles forming a square
    // Front face: (-h,-h,h), (h,-h,h), (h,h,h), (-h,-h,h), (h,h,h), (-h,h,h)
    // Back face: (-h,-h,-h), (-h,h,-h), (h,h,-h), (-h,-h,-h), (h,h,-h), (h,-h,-h)
    // Left, Right, Top, Bottom faces follow similar pattern
]
```

The cube is generated with proper vertex normals for lighting calculations. Normals are calculated automatically from vertex winding order.

### Pyramid Mesh

For a pyramid of base size `s` and height `h`:

```typescript
half = s / 2
apex = h
// Base: square (2 triangles)
//   (-h,0,-h), (h,0,-h), (h,0,h), (-h,0,-h), (h,0,h), (-h,0,h)
// 4 faces: triangles from base corners to apex
//   Front: (-h,0,h), (h,0,h), (0,apex,0)
//   Back: (h,0,-h), (-h,0,-h), (0,apex,0)
//   Left: (-h,0,-h), (-h,0,h), (0,apex,0)
//   Right: (h,0,h), (h,0,-h), (0,apex,0)
```

### Sphere Mesh (UV Sphere)

**Note:** Performance consideration - sphere generation may be optimized in the future.

For a sphere of radius `r` with `segments` divisions:

```typescript
for lat = 0 to segments:
    theta = (lat * π) / segments
    for lon = 0 to segments:
        phi = (lon * 2π) / segments
        x = r * cos(phi) * sin(theta)
        y = r * cos(theta)
        z = r * sin(phi) * sin(theta)
```

The sphere is generated using UV mapping (latitude/longitude), creating a grid of vertices that form triangles. Higher segment counts produce smoother spheres but require more vertices.

**Note:** Sphere normals are negated after calculation to fix lighting direction (normals point inward by default, need to point outward).

### Plane Mesh

For a plane mesh of size `s` on the XZ plane (Y = 0, typically used for floors):

```typescript
half = s / 2
// Two triangles forming a square on XZ plane
vertices = [
    -h, 0, -h,  // Triangle 1
    h, 0, -h,
    h, 0, h,
    -h, 0, -h,  // Triangle 2
    h, 0, h,
    -h, 0, h,
]
```

**Important:** Plane mesh normals must be negated after calculation. The automatic normal calculation from vertex winding order produces normals pointing DOWN (0, -1, 0), but for floor/ground planes we need normals pointing UP (0, 1, 0) for correct lighting. All normals are negated before mesh creation.

### Prism Mesh

For a rectangular prism of width `w`, height `h`, depth `d`:

```typescript
halfW = w / 2
halfH = h / 2
halfD = d / 2
// 6 rectangular faces, each as 2 triangles
// Front: (-w,-h,d), (w,-h,d), (w,h,d), (-w,-h,d), (w,h,d), (-w,h,d)
// Back, Left, Right, Top, Bottom follow similar pattern with appropriate coordinate signs
```

The prism allows for non-uniform scaling, creating rectangular boxes of any dimensions.

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

## Instance System

The instance system manages the 2D mode where party members, NPCs, and enemies are displayed as 2D sprites in either a frozen 3D scene, or a 2D instance.

### Instance System Architecture

```typescript
interface Instance {
    isActive: boolean;
    isTransitioning: boolean;
    transitionProgress: number; // 0.0 to 1.0 (fixed timestep accumulated)
    transitionDirection: number; // 1.0 for forward (entering), -1.0 for reverse (exiting)
}

interface InstanceCharacter {
    position: Vec3; // 3D world position (on floor plane)
    // Future: sprite/texture reference
    // Future: collision bounds (AABB for 2D)
    // Future: type (party member, NPC, enemy)
}
```

### Instance Transition

- **Pause/Unpause**: Triggered by space key, freezes the 3D world (timer, sun/moon, game simulation)
- **Camera Pitch**: Transitions to 0 degrees (horizontal) when entering instance mode
- **Character Transition**: Circle character transitions from camera position forward along the XZ plane into frozen 3D scene
  - Start: Camera's X/Z position at floor level
  - End: Position 5 units forward from camera along forward direction, at floor level
  - Duration: 1.0 second (fixed timestep)
  - Interpolation: Linear interpolation (lerp) with smoothstep easing for smooth animation
- **Position Calculation**: Starts at camera position, slides forward along camera's forward vector in XZ plane
- **Transition State**: Managed by instance system, tracks progress and direction

#### Linear Interpolation (Lerp)

**Lerp** (linear interpolation) smoothly transitions between two values by blending them based on a parameter `t` (typically 0.0 to 1.0).

For scalars:

```typescript
lerp(a, b, t) = a + (b - a) * t
```

- When `t = 0.0`: result = `a` (start value)
- When `t = 1.0`: result = `b` (end value)
- When `t = 0.5`: result = midpoint between `a` and `b`

For vectors (e.g., 3D positions):

```typescript
lerpVec3(a, b, t, out) {
    out.x = a.x + (b.x - a.x) * t;
    out.y = a.y + (b.y - a.y) * t;
    out.z = a.z + (b.z - a.z) * t;
}
```

**Usage in Instance Transitions:**

- Character position smoothly transitions from start position to end position
- `t` is derived from `transitionProgress` (0.0 to 1.0) using smoothstep for easing
- Progress accumulates over fixed timestep: `progress += dt * direction / duration`
- For reverse transition: `direction = -1.0`, so progress decreases from 1.0 → 0.0

**Zero-Allocation Design:**

- `lerpVec3` writes result into existing `out` object (no memory allocation)
- Compliant with RULE M-1: No allocation in hot loops

### Instance Character Management

- Each character in an instance (party member, NPC, enemy) is represented by an `InstanceCharacter`
- Characters share the same state structure and rendering pipeline
- Position is in 3D world space (allows proper depth testing and collision with 3D environment)
- Future: Each character will have sprite/texture reference, collision bounds, and type identifier

### Separation of Concerns

**`core/instance.ts`**: Instance system (manages 2D mode state and transitions)
**`core/instanceCharacter.ts`**: Individual character/entity state (shared by party, NPCs, enemies)
**`core/party.ts`**: Party-specific logic (party formation, relationships, leader selection)
**`core/math/mathHelpers.ts`**: General utilities (`smoothstep`, `lerpVec3`)

This separation allows:

- Scalability: Can add NPCs/enemies by creating `InstanceCharacter` entities
- Reusability: Transition and math logic is shared across entity types
- Clear boundaries: Instance system ≠ party logic ≠ math utilities

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

**Implementation Note**: The instance system manages all 2D characters (party members, NPCs, enemies) uniformly via `InstanceCharacter`. Party-specific logic (formation, relationships) is handled separately in the party system.

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
