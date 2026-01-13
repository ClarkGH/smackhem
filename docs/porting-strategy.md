# Porting Strategy

## 15. What "Snap-On Porting" Actually Means (Honest)

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

## 16. What We Are Building First (Learning Path)

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

## 17. Final Ground Rule (Most Important)

If something feels convenient but makes the engine aware it's running in a browser — we don't do it.
Web is the current backend, not the identity of the engine.
