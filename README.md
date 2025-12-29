# Smackhem

Hobby Drakkhen-like game engine running off of a WebGL wrapper.

## Paradigms and Intent

Inspired by crosscode's use of web technologies. Since that's what I'm comfortable with, I figure it's the best first-step into putting a game I'm proud of up for other people to play. Working with 2D/3D paradigms mainly for fun and learning.

- Using Github issues as tasks
- I did and am using AI
  - I've used up my cursor free trial for skeleton and some minor typing without putting in my payment info (I have a family to feed, sorry).
  - I did use ChatGPT. Used for conversations around planning the design principles and constraints, and debugging while tying all of the general 3D components together.
  - Gemini. While over-opinionated and bullishly wrong at times, it's been amazing with breaking down what the formulae did and how to implement them.

As this is hosted publicly, it's a hobby project.

It's been years of studying 3D. I still haven't pinned down what a quaternion is.

## Project layout

```text
/smackhem
├─ /dist             # build output
├─ /node_modules
├─ /src
│  ├─ main.ts        # entrypoint
│  ├─ core/          # engine core systems
│  ├─ platforms/     # platform specific code
│  ├─ services/      # services
│  └─ types/         # common types
├─ package.json
├─ tsconfig.json
└─ vite.config.ts
```

## Tech Stack

Minimalism is key, following YAGNI principles.

1. WebGL 2.0/HTML5 - Web-based engine for 3D model rendering.
2. Typescript - Language of choice.
3. Vite - Building/Bundling.
4. Vitest - Unit testing
5. ESLint/Prettier - Formatting.
6. Node.js/pnpm - Package management.
7. JSON - Map/Chunk/Asset metadata.
8. Math - Custom Vec2/Vec3/Mat4
9. Target Platforms - Web -> Desktop -> Console(future).
