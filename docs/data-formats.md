# Data Formats

## Table of Contents

- [Map Data (JSON)](#map-data-json)
- [Navigation](#navigation)

## Map Data (JSON)

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

## Navigation

- **[Index](INDEX.md)** - Project overview and documentation index
- **[Portability Rules](portability-rules.md)** - All portability enforcement rules and constraints
- **[Architecture](architecture.md)** - High-level architecture, design principles, and platform strategy
- **[Rendering](rendering.md)** - Rendering system, lighting, and day/night cycle
- **[Camera](camera.md)** - Camera system and mathematical formulas
- **[Systems](systems.md)** - World, party, input, collision, and geometry systems
- **[Project Structure](project-structure.md)** - Code organization and project structure
- **[Porting Strategy](porting-strategy.md)** - Porting approach, FFI constraints, and learning path
