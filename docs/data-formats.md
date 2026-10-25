# Data Formats

## Table of Contents

- [Map Data (JSON)](#map-data-json)
- [Settings (JSON)](#settings-json)
- [Save Data (planned)](#save-data-planned)
- [Navigation](#navigation)

## Map Data (JSON)

### Chunk JSON Format

Each chunk is stored in a separate JSON file: `chunks/{fileX}_{fileZ}.json` where `fileX = chunkX + 10000` and `fileZ = chunkZ + 10000`.

**Offset-Based Naming:**
Chunk coordinates are offset by 10000 to ensure all filenames are non-negative. This prevents issues with negative coordinates in filenames (e.g., chunk `-1,0` becomes file `9999_10000.json`, chunk `0,0` becomes file `10000_10000.json`).

**CRITICAL RULE: JSON is purely declarative**

- JSON describes **what exists**, not **what happens**
- No conditionals, randomization flags, or implicit behavior
- No special semantics (e.g., "rot: 0 means something special")
- If something "happens," it belongs in TypeScript/native code
- All mesh data is static geometry definition only

#### Version 2: Inline Chunk Format (Current)

The loader expects version 2 (`EXPECTED_SCHEMA_VERSION` in `src/services/chunkLoader.ts`). A file with another version still loads, but logs a "version mismatch" warning, so an out-of-date file shows up in the console rather than failing silently.

**Version history:**

- **1:** chunk files carried their own `bounds`.
- **2 (current):** no `bounds`. Chunk bounds are worked out in code from the chunk's coordinates. Meshes are inline, as below.
- **The bump to 2 (October 2026):** the loader had been left expecting version 1 after the format moved on, so every version-2 file logged a warning on load. The loader now expects 2. The five remaining version-1 files around spawn had already dropped `bounds`, so only their `version` number changed.

When the format changes again: bump `EXPECTED_SCHEMA_VERSION`, update or migrate the files, add a line here, and extend `chunkLoader.spec.ts`'s version tests.

```json
{
  "version": 2,
  "id": "0,0",
  "meshes": [
    { 
      "type": "plane", 
      "pos": [0, 0, 0], 
      "scale": [10, 1, 10], 
      "color": [0.4, 0.4, 0.4] 
    },
    { 
      "type": "cube", 
      "pos": [2, 0.5, 2], 
      "scale": [1, 1, 1], 
      "color": [0.6, 0.6, 0.6] 
    }
  ]
}
```

#### Schema Definition

**Required Fields:**

- `version` (number): Schema version number. Required for schema evolution tracking. E.G. Version 1 had bounds set in the file, that is now determined in-code. We may have non-traversable chunk-pieces in the future, but the initial establishing hard coded ones was a naive plan.
- `id` (string): Chunk identifier in format `"{chunkX},{chunkZ}"` (e.g., `"0,0"`, `"-1,2"`)
- `meshes` (array): Array of mesh definitions

**Deprecated Fields**

- `bounds` (number[6]): Axis-aligned bounding box `[minX, minY, minZ, maxX, maxY, maxZ]`

**Mesh Object Fields:**

- `type` (string): Mesh type - one of: `"plane"`, `"cube"`, `"pyramid"`, `"sphere"`, `"prism"`
- `pos` (number[3]): Position `[x, y, z]` **relative to chunk center** (not absolute world space). For chunk at (chunkX, chunkZ), mesh position is calculated as: `worldX = chunkCenterX + pos[0]`, `worldZ = chunkCenterZ + pos[2]`, `worldY = pos[1]`
- `scale` (number[3]): Scale `[x, y, z]` (or single number for uniform scaling)
- `color` (number[3]): Grayscale RGB color `[r, g, b]` (values typically 0.0-1.0)

**Mesh Type-Specific Parameters:**

- `plane`: Uses `scale[0]` for plane size. Y position is not adjusted (plane sits at `pos[1]`).
- `cube`: One size, `scale[0]`, for every axis (drawing and collision). An uneven scale logs a warning and uses `scale[0]`; use a `prism` for uneven boxes. Y position: `yPos = pos[1] + scale[0]/2`, since the mesh is centered on its origin.
- `pyramid`: Uses `scale[0]` for base size and height. The mesh's base is at its origin, so `yPos = pos[1]` (no lift).
- `sphere`: Uses `scale[0]` for **diameter** (radius = `scale[0]/2`). Y position is automatically adjusted: `yPos = pos[1] + radius` to center sphere on Y axis. Optional `segments` (number) for sphere subdivision (default: 12).
- `prism`: Uses `scale[0]` for width, `scale[1]` for height, `scale[2]` for depth. Y position is automatically adjusted: `yPos = pos[1] + scale[1]/2` to center prism on Y axis.

**Position Adjustment Notes:**

`pos[1]` is always the height of the mesh's **base**: 0 sits on the floor, higher values float. The loader lifts meshes that are centered on their origin (cubes, spheres, prisms) by half their height; pyramids and planes already have their base at their origin and use `pos[1]` as is. Each mesh's collision box spans exactly what's drawn, from `pos[1]` to `pos[1]` + its height (`chunkLoader.spec.ts` checks every shape).

**Optional Fields (Future):**

- `template` (string): Template reference ID (Phase 2 - template system)
- `transform` (object): Transform data for template instances (Phase 2)

#### Example: Full Chunk File

```json
{
  "version": 1,
  "id": "0,0",
  "meshes": [
    {
      "type": "plane",
      "pos": [0, 0, 0],
      "scale": [10, 1, 10],
      "color": [0.4, 0.4, 0.4]
    },
    {
      "type": "cube",
      "pos": [2, 0.5, 2],
      "scale": [1, 1, 1],
      "color": [0.6, 0.6, 0.6]
    },
    {
      "type": "pyramid",
      "pos": [5, 0.75, 3],
      "scale": [1.5, 1.5, 1.5],
      "color": [0.5, 0.5, 0.5]
    },
    {
      "type": "sphere",
      "pos": [7, 0.5, 7],
      "scale": [0.8, 0.8, 0.8],
      "color": [0.7, 0.7, 0.7]
    }
  ]
}
```

#### Phase 2: Template References (Future)

Template-based chunks reference reusable chunk templates:

```json
{
  "version": 1,
  "id": "5,3",
  "template": "canyon_blocker_01",
  "transform": { "pos": [50, 0, 30], "rot": 0 }
}
```

Pure data. No logic. Portable forever.

### Chunk Loading Behavior

**File Loading:**

- Chunks are loaded asynchronously via `fetch()` requests
- Multiple chunks load in parallel using `Promise.all` for performance
- Loaded chunks are cached in memory to avoid re-fetching/re-parsing

**Error Handling:**

- Missing chunk files: System creates an empty fallback chunk (floor plane only) instead of failing
- Invalid JSON: Logs error and creates empty fallback chunk
- Invalid mesh types: Falls back to creating a cube mesh

**Empty Chunk Fallback:**
When a chunk file is missing or fails to load, the system automatically creates an empty chunk containing only a floor plane at the chunk's world coordinates. This ensures the game continues to function even if chunk files haven't been created yet.

## Settings (JSON)

Player settings are stored as JSON under the key `smackhem.settings`: localStorage on the web, and a file later on native platforms. They're written whenever a setting changes.

```json
{
    "volume": { "master": 1, "music": 1, "ambient": 0.8, "sfx": 1, "ui": 1 },
    "mouseSensitivity": 1.2,
    "invertMouseY": false,
    "controllerSensitivity": 1,
    "invertControllerY": true,
    "reducedMotion": false,
    "menuTextScale": 1,
    "renderScale": 1,
    "windowResolution": null
}
```

**Loading never trusts the file.** `parseSettings` starts from the defaults and only takes values that pass:
- **Volumes** are clamped to 0–1, and **sensitivities** to 0.2–2.
- **`menuTextScale`** must be 1, 1.5 or 2, **`renderScale`** must be 0.5, 0.75 or 1, and **`windowResolution`** must be `null` or one of the presets.
- **Anything** missing, mistyped or unknown keeps its default, and corrupt JSON gives the full defaults.
- **`fullscreen`** is never saved or restored, because browsers can't enter fullscreen without a user gesture.

## Save Data (planned)

Only the seam exists (`src/services/save.ts`); the save system isn't built yet.

- **When:** save points and autosave only, taken in `world_3d` with nothing transitioning. A save is a snapshot of a stable moment and never stores transition state.
- **Shape:**

```typescript
interface SaveData {
    version: 1;
    slot: 'auto' | 'save_point';
    world: { cameraPosition: Vec3; cameraYaw: number; simulationTime: number };
    flags: Record<string, boolean>; // event/quest flags, empty until that system exists
}
```

- **Timestamps:** `savedAt` is stamped by the platform, so core never reads the clock (T-2).
- **At rest:** saves will be stored encrypted and obfuscated, not as readable JSON. The platform's `SaveService` does this, and core always sees plain `SaveData`. A save that fails to decrypt or validate is treated as corrupt or missing, never a crash.

## Navigation

- **[Index](INDEX.md)** - Project overview and documentation index
- **[Portability Rules](portability-rules.md)** - All portability enforcement rules and constraints
- **[Architecture](architecture.md)** - High-level architecture, design principles, and platform strategy
- **[Rendering](rendering.md)** - Rendering system, lighting, day/night cycle, and display size
- **[Events, State, and Audio Systems](events.md)** - Eventing, global state, audio, and settings events
- **[Camera](camera.md)** - Camera system and mathematical formulas
- **[Systems](systems.md)** - World, party, input, collision, geometry, and menu systems
- **[Controls](controls.md)** - Keyboard, mouse and controller bindings
- **[Project Structure](project-structure.md)** - Code organization and project structure
- **[Porting Strategy](porting-strategy.md)** - Porting approach, learning path, and publishing
