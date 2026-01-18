# Data Formats

## Table of Contents

- [Map Data (JSON)](#map-data-json)
- [Navigation](#navigation)

## Map Data (JSON)

### Chunk JSON Format

Each chunk is stored in a separate JSON file: `chunks/{fileX}_{fileZ}.json` where `fileX = chunkX + 10000` and `fileZ = chunkZ + 10000`.

**Offset-Based Naming:**
Chunk coordinates are offset by 10000 to ensure all filenames are non-negative. This prevents issues with negative coordinates in filenames (e.g., chunk `-1,0` becomes file `9999_10000.json`, chunk `0,0` becomes file `10000_10000.json`).

**Current Implementation Note (Temporary):**
For development/testing, all chunks currently load from `10000_10000.json` (same file reused for all chunk coordinates). Chunks are positioned at their correct world coordinates based on `chunkX` and `chunkZ`, even though they use the same mesh data. This will be extended to support per-chunk files in the future.
**CRITICAL RULE: JSON is purely declarative**

- JSON describes **what exists**, not **what happens**
- No conditionals, randomization flags, or implicit behavior
- No special semantics (e.g., "rot: 0 means something special")
- If something "happens," it belongs in TypeScript/native code
- All mesh data is static geometry definition only

#### Phase 1: Inline Chunk Format (Current)

```json
{
  "version": 1,
  "id": "0,0",
  "bounds": [0, 0, 0, 10, 5, 10],
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

- `version` (number): Schema version number (currently `1`). Required for schema evolution tracking.
- `id` (string): Chunk identifier in format `"{chunkX},{chunkZ}"` (e.g., `"0,0"`, `"-1,2"`)
- `bounds` (number[6]): Axis-aligned bounding box `[minX, minY, minZ, maxX, maxY, maxZ]`
- `meshes` (array): Array of mesh definitions

**Mesh Object Fields:**

- `type` (string): Mesh type - one of: `"plane"`, `"cube"`, `"pyramid"`, `"sphere"`, `"prism"`
- `pos` (number[3]): Position `[x, y, z]` **relative to chunk center** (not absolute world space). For chunk at (chunkX, chunkZ), mesh position is calculated as: `worldX = chunkCenterX + pos[0]`, `worldZ = chunkCenterZ + pos[2]`, `worldY = pos[1]`
- `scale` (number[3]): Scale `[x, y, z]` (or single number for uniform scaling)
- `color` (number[3]): Grayscale RGB color `[r, g, b]` (values typically 0.0-1.0)

**Mesh Type-Specific Parameters:**

- `plane`: Uses `scale[0]` for plane size. Y position is not adjusted (plane sits at `pos[1]`).
- `cube`: Uses `scale[0]` for cube size. Y position is automatically adjusted: `yPos = pos[1] + scale[1]/2` to center cube on Y axis.
- `pyramid`: Uses `scale[0]` for base size. Y position is automatically adjusted: `yPos = pos[1] + scale[1] * 0.6` for proper pyramid centering.
- `sphere`: Uses `scale[0]` for **diameter** (radius = `scale[0]/2`). Y position is automatically adjusted: `yPos = pos[1] + radius` to center sphere on Y axis. Optional `segments` (number) for sphere subdivision (default: 12).
- `prism`: Uses `scale[0]` for width, `scale[1]` for height, `scale[2]` for depth. Y position is automatically adjusted: `yPos = pos[1] + scale[1]/2` to center prism on Y axis.

**Position Adjustment Notes:**

Mesh Y positions are automatically adjusted based on mesh type to ensure proper centering and alignment. The `pos[1]` value represents the base/floor position, and the loader adjusts it upward for meshes that need to be centered (cubes, spheres, prisms, pyramids). Planes use `pos[1]` directly without adjustment.

**Optional Fields (Future):**

- `template` (string): Template reference ID (Phase 2 - template system)
- `transform` (object): Transform data for template instances (Phase 2)

#### Example: Full Chunk File

```json
{
  "version": 1,
  "id": "0,0",
  "bounds": [0, 0, 0, 10, 5, 10],
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

## Navigation

- **[Index](INDEX.md)** - Project overview and documentation index
- **[Portability Rules](portability-rules.md)** - All portability enforcement rules and constraints
- **[Architecture](architecture.md)** - High-level architecture, design principles, and platform strategy
- **[Rendering](rendering.md)** - Rendering system, lighting, and day/night cycle
- **[Camera](camera.md)** - Camera system and mathematical formulas
- **[Systems](systems.md)** - World, party, input, collision, and geometry systems
- **[Project Structure](project-structure.md)** - Code organization and project structure
- **[Porting Strategy](porting-strategy.md)** - Porting approach, FFI constraints, and learning path
