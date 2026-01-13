# Porting Strategy

## Table of Contents

- [What "Snap-On Porting" Actually Means (Honest)](#what-snap-on-porting-actually-means-honest)
- [What We Are Building First (Learning Path)](#what-we-are-building-first-learning-path)
- [Final Ground Rule (Most Important)](#final-ground-rule-most-important)
- [Navigation](#navigation)

## What "Snap-On Porting" Actually Means (Honest)

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

## What We Are Building First (Learning Path)

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

## Final Ground Rule (Most Important)

If something feels convenient but makes the engine aware it's running in a browser — we don't do it.
Web is the current backend, not the identity of the engine.

## Navigation

- **[Index](INDEX.md)** - Project overview and documentation index
- **[Portability Rules](portability-rules.md)** - All portability enforcement rules and constraints
- **[Architecture](architecture.md)** - High-level architecture, design principles, and platform strategy
- **[Rendering](rendering.md)** - Rendering system, lighting, and day/night cycle
- **[Camera](camera.md)** - Camera system and mathematical formulas
- **[Systems](systems.md)** - World, party, input, collision, and geometry systems
- **[Data Formats](data-formats.md)** - Data format specifications
- **[Project Structure](project-structure.md)** - Code organization and project structure
