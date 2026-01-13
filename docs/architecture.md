# Architecture

## "Smackhem" Design Principles

### 1. Core Goal (Re-Stated)

Build a small, deterministic 3D exploration engine that:

- Runs in the browser using WebGL + TypeScript
- Feels good to move around in first-person
- Supports a visible party of 4
- Streams a simple geometric world in chunks
- Can later "snap" onto other platforms by swapping backends

This is engine scaffolding, not content.

### 2. Design Principles (Non-Negotiable)

These principles exist only to protect portability:

1. Rendering is a service, not a dependency
2. Input is intent, not hardware
3. Simulation is deterministic
4. World data is pure data
5. WebGL is one backend, not the engine
If something violates these, it doesn't go in.

### 3. Platform Strategy (High Level)

Today:

- WebGL2
- TypeScript
- Browser-hosted

Tomorrow (Optional):

- Desktop wrapper
- Native renderer
- Console renderer

Rule:
The game should not know or care what GPU or input device exists.

### 3.1 Desktop & Console Porting Strategy

**Approach: TypeScript Game Logic DSL + Native Renderer**
We will port to desktop and console using a hybrid approach:

- **Game logic stays in TypeScript** — all code in `core/` remains unchanged
- **Renderer becomes native** — `platforms/native/` will implement the `Renderer` interface in C++
- **Services bridge the gap** — clean interfaces allow TS ↔ C++ communication

This strategy balances performance (native rendering) with development speed (TypeScript logic).

#### Porting Constraints

**CONSTRAINT P-1: Renderer Interface Must Be FFI-Friendly**
The `Renderer` interface must be designed for foreign function interface (FFI) calls:

- Methods accept only primitive types or simple structs (numbers, arrays, objects with known structure)
- No callbacks or complex closures in the interface
- Return values are simple (void, primitives, or handles)
- Mesh handles are opaque identifiers, not objects with methods

If a renderer method cannot be called from C++ via FFI, the interface must be redesigned.

**CONSTRAINT P-2: Data Structures Must Be Serializable**
All data passed between TypeScript and native code must be serializable:

- Matrices are arrays of 16 numbers (never objects with methods)
- Vectors are objects with `x`, `y`, `z` properties (or arrays)
- Colors are objects with `x`, `y`, `z` properties (grayscale RGB)
- No functions, closures, or class instances cross the boundary

This ensures data can be marshalled between languages without complex conversion logic.

**CONSTRAINT P-3: Core Must Never Know About Native Code**
The `core/` directory must remain completely unaware of native implementations:

- No `#ifdef` or platform-specific conditionals in core
- No imports from `platforms/native/` in core files
- Core code should work identically whether renderer is WebGL or native

If core needs to know about native code, the design is wrong.

**CONSTRAINT P-4: Mesh Creation Is Backend-Responsibility**
Mesh generation (cube, sphere, pyramid, etc.) happens in the renderer backend:

- Core requests meshes via `renderer.createCubeMesh(size)`
- Renderer creates and caches the mesh, returns an opaque handle
- Core never sees vertex data or GPU buffers

This allows native renderer to use native mesh generation while keeping core clean.

**CONSTRAINT P-5: No Direct Memory Access Assumptions**
Core code must not assume:

- Memory layout of arrays
- Pointer arithmetic
- Direct buffer manipulation
- Shared memory between TS and native code

All data transfer is explicit and copy-based (or handled by the FFI layer).

**CONSTRAINT P-6: Renderer State Is Encapsulated**
The renderer manages its own state:

- Shader compilation
- Buffer management
- GPU resource lifetime
- Mesh caching

Core never directly manages renderer state. If core needs to affect renderer state, it uses interface methods.

#### CONSTRAINT P-7: FFI Is an Implementation Detail, Not a Requirement

The TypeScript ↔ Native boundary must be designed so that:

1. **FFI is preferred but not required**
   - Desktop: Use FFI (TypeScript calls C++ via FFI)
   - Console with JS runtime: Use FFI (same as desktop, if JS runtime is embedded)
   - Console without JS runtime: Port core to C++, call interfaces directly (no FFI needed)

2. **Interfaces are language-agnostic**
   - Renderer interface can be called from TypeScript OR C++
   - Same interface signature works in both languages
   - No TypeScript-specific features in service interfaces
   - Interfaces use only primitives, arrays, and simple structs

3. **Core logic is portable**
   - Core logic in TypeScript today
   - Core logic can be ported to C++ if needed
   - Porting is feasible because interfaces are clean and data structures are serializable
   - No architectural changes required for porting

**The Test:**

If a console doesn't support JavaScript or FFI, can we:

1. Port `core/` logic to C++ (straightforward port, no architectural changes)
2. Call the same `Renderer` interface from C++ core (direct C++ calls, no FFI)
3. Keep all the same interfaces and data structures

If the answer is "no", the design has a dependency on FFI that must be removed.

**Why This Matters:**

- **Desktop**: Use FFI (fastest development path, keep all TS code)
- **Console with JS**: Use FFI (same as desktop, if JS runtime is available/embedded)
- **Console without JS**: Port core to C++ (fallback path, more work but architecturally sound)
- All three paths use the same interfaces and data structures
- Modern consoles (PS5, Xbox Series X/S, Nintendo Switch) do not natively support FFI or JavaScript runtimes
- Console ports will likely require porting core logic to C++ and calling interfaces directly

#### Development & Porting Timeline

##### Learning-First Approach: Gradual Transition to C++

Since this is a learning project, we will transition gradually into native code:

1. **Phase 1: TypeScript Core + WebGL (Current)**
   - Develop and validate architecture in TypeScript
   - Fast iteration and learning
   - Web-first development

2. **Phase 2: FFI Bridge + Native Renderer (Desktop)**
   - Implement FFI bridge for desktop
   - Native C++ renderer with TypeScript core
   - Learn FFI patterns and native rendering
   - Validate that interfaces work across language boundary

3. **Phase 3: Console Porting (Future)**
   - Console porting is a future consideration, not immediate priority
   - Will convert core to C++ when console porting becomes necessary
   - By this point, architecture is validated and interfaces are proven
   - Porting should be straightforward due to clean interfaces and constraints

4. **Phase 4: Full C++ Conversion (Long-term)**
   - Eventually convert to 100% C++ codebase
   - Single codebase for all platforms (desktop + console)
   - Eliminates FFI overhead and JS runtime dependency
   - Happens after learning and validation phases are complete

**Why This Timeline:**

- **Learning**: Gradual transition allows learning each piece (TS → FFI → C++) incrementally
- **Validation**: FFI bridge validates that interfaces work correctly before committing to C++ port
- **Risk Mitigation**: Architecture is proven before investing in full C++ conversion
- **Flexibility**: Can ship desktop with FFI while console port is still future work

**The Key Point:**
Console porting is explicitly a **future consideration**, not a requirement for the FFI bridge phase. The FFI bridge is for desktop learning and validation. Full C++ conversion happens later, after the architecture is proven and console porting becomes a priority.

**Why These Constraints Matter:**

- **FFI-Friendly Interfaces**: Makes it possible to call C++ from TypeScript without complex bindings
- **Serializable Data**: Ensures data can cross language boundaries safely
- **Core Isolation**: Protects portability — core works on any platform
- **Backend Mesh Creation**: Allows native optimizations (e.g., instancing, batching) without core changes
- **No Memory Assumptions**: Works with garbage-collected TypeScript and manual C++ memory
- **Encapsulated State**: Prevents core from depending on renderer implementation details

**Native Renderer Structure:**
*TBD*

```text
platforms/native/
├─ nativeRenderer.cpp      # C++ OpenGL/Vulkan renderer
├─ nativeRenderer.h        # Renderer interface (C-compatible)
├─ nativeBootstrap.cpp     # Platform initialization
├─ ffiBridge.ts            # TypeScript ↔ C++ bridge
└─ nativeInput.cpp         # Native input handling (future)
```

The native renderer implements the same `Renderer` interface as WebGL, but using native OpenGL or Vulkan calls. Game logic in `core/` remains unchanged.

### 3.2 Performance & Authority Constraints

**The Real Risk: Scripting Layer Becoming the Engine**
The greatest danger with the TypeScript + Native hybrid approach is letting the scripting layer quietly become the engine again. This happens when TypeScript starts doing work that should be native.

#### Common Failure Modes

These patterns indicate the boundary has been violated:

- **TS starts doing collision checks** — collision should be native
- **TS starts iterating entity arrays every frame** — entity management should be native
- **TS starts managing transforms directly** — transform updates should be native
- **TS owns too much temporal logic** — animation/physics should be native

If TypeScript is doing these things, performance will suffer and the architecture has regressed.

#### Authority Model: TS Requests, Native Decides, TS Reacts

**The Rule:**

- **TypeScript requests** — "Move this entity", "Play this animation", "Check this collision"
- **Native decides** — Native code performs the work, manages state, handles optimization
- **TypeScript reacts** — TS receives results/events and makes gameplay decisions

TypeScript is the decision-maker, not the executor. Native is the executor, not the decision-maker.

#### Boundary Call Costs & Mitigations

**The Problem:**
Every call across the TypeScript ↔ Native boundary has a cost:

- `player.move(vec)` crossing into native code incurs marshalling overhead
- Chatty APIs (many small calls) are expensive
- Per-frame allocations at the boundary cause GC pressure

**Mitigations:**

1. **Batch Calls**
   - Group multiple operations into single boundary calls
   - Pass arrays of commands, not individual operations
   - Example: `renderer.drawMeshes(meshArray)` not `meshArray.forEach(m => renderer.drawMesh(m))`

2. **Pass Structs, Not Scalars**
   - Bundle related data into objects/structs
   - Single boundary call with structured data is cheaper than many calls with primitives
   - Example: `renderer.setLighting({direction, color, ambient})` not three separate calls

3. **Avoid Chatty APIs**
   - Design interfaces for bulk operations
   - Minimize back-and-forth communication
   - Prefer "set state, then execute" over "query, decide, execute, query again"

#### Update Rate Separation

**The Problem:**

Calling TypeScript every frame for everything is unnecessary and expensive. Different systems have different update rate requirements.

##### Separate Update Rates

- **Rendering**: 60–120 Hz (native, no TS calls per frame)
- **Gameplay logic**: 30–60 Hz (TS decision-making)
- **AI / systems**: 10–20 Hz (TS high-level decisions)
- **Event-driven scripting**: On-demand (TS reacts to events)

**Implementation:**

- Native renderer runs at display refresh rate independently
- TypeScript game loop runs at fixed timestep (30–60 Hz)
- AI systems tick at lower rates (10–20 Hz)
- Events trigger TS callbacks as needed, not every frame

#### Allocation Pressure

**The Problem:**
JavaScript engines are fast, but garbage collection still exists. Per-frame allocations cause GC pauses and frame drops.

**Mitigations:**

1. **Avoid Per-Frame Allocations**
   - Reuse objects and arrays across frames
   - Pre-allocate buffers for boundary data
   - No `new` or object literals in hot paths

2. **Pool Objects**
   - Maintain object pools for frequently created/destroyed objects
   - Reuse vectors, matrices, and command structures
   - Return objects to pool instead of discarding

3. **Prefer Numeric IDs Over Object Graphs**
   - Entities referenced by ID, not object references
   - Reduces GC pressure from object relationships
   - Easier to serialize and pass across boundaries

4. **Keep Hot Paths Allocation-Free**
   - Game loop update functions must not allocate
   - Rendering paths must not allocate
   - Only chunk loading and initialization may allocate

#### Responsibility Division

**TypeScript Responsibilities (Safe):**

- State machines
- AI decisions
- Quest logic
- Combat rules
- Animation state selection (which animation, not how to play it)
- Input interpretation (hardware → intent)
- Event orchestration

**Native Responsibilities (Must):**

- Rendering (all GPU work)
- Physics (if added)
- Collision detection and resolution
- Pathfinding (if added)
- Animation evaluation (bone transforms, interpolation)
- Audio mixing
- Asset streaming

**The Test:**
If a TypeScript function is called thousands of times per second, it probably belongs in native code. If it makes high-level decisions occasionally, it can stay in TypeScript.

#### Boundary Design Rules

**RULE B-1: Batch Operations**
Interfaces must support bulk operations. If you find yourself calling a native function in a loop, the interface is wrong.

**RULE B-2: Event-Driven Over Polling**
TypeScript should react to events, not poll native state every frame. Native pushes events/state changes to TS.

**RULE B-3: Native Owns Hot Data**
Frequently accessed data (transforms, velocities, collision shapes) lives in native memory. TypeScript accesses via handles/IDs, not direct references.

**RULE B-4: TS Owns Cold Data**
Infrequently accessed data (quest state, dialogue trees, AI behavior trees) can live in TypeScript. This data is accessed occasionally, not every frame.

**RULE B-5: Authority Is Explicit**
Every system must have a clear owner. If ownership is ambiguous, the boundary has been violated.

## 4. High-Level Architecture

```text
┌──────────────────────────┐
│        Game Loop         │
├──────────────────────────┤
│  World / Party / Camera  │
├──────────────────────────┤
│   Systems (Logic Only)   │
├──────────────────────────┤
│  Render / Input / Audio  │  ← swappable
├──────────────────────────┤
│   Platform Backends      │
└──────────────────────────┘
```

- Input systems should:
  - Translate hardware → intent
  - Not know about simulation or world state

- OS / Browser events
  - → platform input (web)
  - → core input
  - → simulation / camera update
  - → render
  - → reset transient input

## 5. Core Systems

### 5.1 Game Loop (Fixed Step)

Console-safe, deterministic.

```typescript
while (accumulator >= FIXED_DT) {
  input.update();
  world.update(FIXED_DT);
  party.update(FIXED_DT);
  camera.update(FIXED_DT);
  accumulator -= FIXED_DT;
}

renderer.render(world, party, camera);
```

- Fixed timestep (e.g. 60Hz)
- Rendering interpolates
- No logic in render
