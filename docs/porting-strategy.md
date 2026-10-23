# Porting Strategy

## Table of Contents

- [What "Snap-On Porting" Actually Means (Honest)](#what-snap-on-porting-actually-means-honest)
- [What We Are Building First (Learning Path)](#what-we-are-building-first-learning-path)
- [Publishing the Web Build (itch.io)](#publishing-the-web-build-itchio)
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

## Publishing the Web Build (itch.io)

The web build is planned for itch.io, which runs HTML5 games inside an iframe. The game fills whatever size the page gives it, and handles fullscreen being allowed or not (see [Rendering](rendering.md#display-size-and-resolution)).

**Suggested upload settings:**

- **Embed in page**, viewport 960×540 (16:9)
- **Fullscreen Button:** on. The in-game Fullscreen option also works when the iframe allows it, and greys itself out when it doesn't.
- **Click to Play:** on
- **Mobile Friendly:** off. There's no touch input yet.

**Before the first upload:**

- [ ] **Fix the asset paths (release blocker).** itch serves the game from a subfolder, not the site root, so everything must load by relative paths:
  - the Vite build has no `base` set, so it defaults to `/`; set `base: './'` in `vite.config.mts`;
  - `webBootstrap.ts` fetches chunks from `/chunks/` and audio from `/assets/audio/`, both absolute; make them relative.

  Textures already use a relative path (`assets/images/`).
- [ ] Zip the contents of `dist/`, with `index.html` at the top level of the zip.
- [ ] Upload as a draft and check fullscreen, pointer lock, keyboard focus and audio inside itch's iframe.

## Final Ground Rule (Most Important)

If something feels convenient but makes the engine aware it's running in a browser — we don't do it.
Web is the current backend, not the identity of the engine.

## Navigation

- **[Index](INDEX.md)** - Project overview and documentation index
- **[Portability Rules](portability-rules.md)** - All portability enforcement rules and constraints
- **[Architecture](architecture.md)** - High-level architecture, design principles, and platform strategy
- **[Rendering](rendering.md)** - Rendering system, lighting, day/night cycle, and display size
- **[Events, State, and Audio Systems](events.md)** - Eventing, global state, audio, and settings events
- **[Camera](camera.md)** - Camera system and mathematical formulas
- **[Systems](systems.md)** - World, party, input, collision, geometry, and menu systems
- **[Controls](controls.md)** - Keyboard, mouse and controller bindings
- **[Data Formats](data-formats.md)** - Chunk, settings, and save data formats
- **[Project Structure](project-structure.md)** - Code organization and project structure
