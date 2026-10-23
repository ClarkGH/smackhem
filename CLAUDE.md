# Claude's Rules and Regulations for Smackhem

Solo learning project. Clark is the quality bottleneck on purpose: every line must be understood by him, so optimize for reviewability, not speed. When in doubt, ask.

## Where things live

Read the relevant doc before touching a system. Don't restate docs here or in code comments; link to them.

- [docs/INDEX.md](docs/INDEX.md) - overview and doc map
- [docs/portability-rules.md](docs/portability-rules.md) - the hard constraints (summarized below)
- [docs/architecture.md](docs/architecture.md) - conceptual architecture. Snippets there are illustrative, not 1:1 with code
- [docs/systems.md](docs/systems.md), [docs/rendering.md](docs/rendering.md), [docs/camera.md](docs/camera.md), [docs/events.md](docs/events.md) - per-system design
- [docs/data-formats.md](docs/data-formats.md) - chunk/asset JSON formats
- [docs/project-structure.md](docs/project-structure.md) - code layout
- [docs/LEARNING.md](docs/LEARNING.md) - Clark's own log. Read it for context; never edit it

`src/platforms/cpu`, `native`, `console` and `public/` are gitignored/private. Don't assume their contents.

## Hard rules (from portability-rules.md)

Breaking one knowingly is Clark's call, never yours. Flag it instead.

- Layers depend downward only: `core/` -> `services/` -> `platforms/`. Core has no WebGL, DOM, input devices, asset paths, or fetch (P-1: core must compile with backends deleted and stubbed).
- Services are interfaces only: no platform code, no logic.
- No GPU calls outside the renderer. Game code declares intent; lighting lives in the renderer (R-1..R-3).
- Core consumes input intent, never hardware events. Everything must be playable on a controller (I-1, I-2).
- Fixed timestep only. The engine clock service is the only time source: no `Date.now()` / `performance.now()` (T-1..T-3).
- World data is pure and serializable. Chunks own their meshes and bounds (W-1, W-2).
- No allocation in hot update loops. Chunk loading is the allocation boundary (M-1, M-2).
- No `for...of`, generators, or iterator protocols. Use indexed `for`, `while`, or `.forEach` (M-3).
- Assets are requested by ID, never by path (A-1). Debug features are toggleable and never required (D-1).

## Commands

- `pnpm exec tsc --noEmit` - typecheck
- `pnpm test` - vitest, specs are colocated `*.spec.ts`
- `pnpm lint` - eslint (airbnb-base, with TS-aware overrides in `.eslintrc.json`). Clean; keep it that way
- `pnpm dev:stub` / `pnpm dev:web` - dev server per platform

## What "done" means

Typecheck clean and `pnpm test` green. Hooks enforce both (`.claude/settings.json`). If tests are red and you can't fix them in-scope, stop and say why. Don't weaken, skip, or delete a test to get green.

Bugs here tend to be silent, not crashing: unused fields, checks that can never match, values wired into one of two call sites, dead state. The compiler won't catch them. When fixing one, prefer a scenario test on the stub platform (`StubInput` + `NullRenderer` + fixed steps, asserting `GameState`) that reproduces it first.

## How we work

The ladder, from [LEARNING.md](docs/LEARNING.md):

1. **Ask**: default. Explain, brainstorm, surface trade-offs. No edits.
2. **Plan**: when the approach isn't clear yet. Propose and wait for approval.
3. **Agent**: only once the context is all there and Clark has said go.

- Clark writes the seam (interfaces, types), Claude fills in the body.
- One moving part per slice. Tests green before the next slice starts.
- Small diffs. No drive-by refactors, no speculative abstraction (YAGNI).
- After a slice, ask Clark questions about the why instead of supplying it. Don't write his reasoning for him.
- Docs edits: propose them, don't make them silently. No tooling should auto-edit docs.
- No parallel agents or worktrees writing code.
