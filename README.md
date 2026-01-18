# Smackhem

Geometric 3D/2D game engine wrapper

## Paradigms and Intent

3D/2D "game engine" inspired by Drakkhen's exploration and Crosscode's use of web technologies. Since that's what I'm comfortable with, I figure it's the best first-step into putting a game I'm proud of up for other people to play. Working with 2D/3D paradigms mainly for fun and learning.

- Using Github issues as tasks
- I did and am using AI
  - Cursor Pro
  - Gemini
  - ChatGPT
- Design document is the bread and butter of this project. For me, everything becomes easier when I write a design doc and keep it up to date.

As this is hosted publicly, it's a hobby project.

It's been 5 years of studying 3D. I can now say I've "put a pin" on quaternions.

## Project layout

```text
/smackhem
├─ /dist             # build output
├─ /node_modules
├─ /src
│  ├─ main.ts        # entrypoint
│  ├─ core/          # engine core systems (camera, collision, gameLoop, world, etc.)
│  ├─ platforms/     # platform specific code (web, stub, cpu)
│  ├─ services/      # services (renderer, input, clock, assetLoader, chunkLoader)
│  └─ types/         # common types
├─ /public           # static assets
│  └─ /chunks/       # chunk JSON files (offset-based naming: 10000_10000.json)
├─ /docs             # project documentation
├─ package.json
├─ tsconfig.json
└─ vite.config.mts
```

## Tech Stack

Minimalism is key, following YAGNI principles.

1. WebGL 2.0/HTML5 - Web-based engine for 3D model rendering.
2. Typescript - Language of choice.
3. Vite - Building/Bundling.
4. Vitest - Unit testing
5. ESLint/Prettier/AirBnB - Formatting.
6. Node.js/pnpm - Package management.
7. JSON - Map/Chunk/Asset metadata.
8. Math - Custom Vec2/Vec3/Mat4
9. Target Platforms - Web -> Desktop -> Console(future).
10. Aseprite - Sprite creation
11. [Documentation Overview](docs/INDEX.md)

## How to run? (Web)

- Install dependencies (node/pnpm)
- `$ pnpm install && pnpm build && pnpm vite`
- Debug and run via browser
- You'll see an empty plane with the moon/sun
  - I've cut publicly testable pieces after reaching a certain point
  - To add collision/field objects, create chunk JSON files in `public/chunks/`. See [Data Formats](docs/data-formats.md) for chunk file format and naming conventions.
