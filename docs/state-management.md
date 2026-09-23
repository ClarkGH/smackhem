# Events

## Table of Contents

- [Introduction](#introduction)
- [The Event Bus](#the-event-bus)
    - [Synchronous Events](#synchronous-events)
    - [Async and Multi-threaded Events](#async-and-multi-threaded-events)
- [Architectural Design](#architectural-design)
- [Navigation](#navigation)

## Introduction

State is changing information saved in a blob of information that the engine utilizes to make determinations. We currently have state, while it's not explicitly set as such. Our pub / sub event service and state tie directly into one and another.

We'll need a form of state and a state buffer. True state will live in the buffer, cache will be computed from state, but never be stored or lerped independently.

The collision grid and world chunks will be excluded, purposefully. Since it's content and non-reliant on the ticks, there's no benefit.

## Navigation

- **[Index](INDEX.md)** - Project overview and documentation index
- **[Portability Rules](portability-rules.md)** - All portability enforcement rules and constraints
- **[Architecture](architecture.md)** - High-level architecture, design principles, and platform strategy
- **[Rendering](rendering.md)** - Rendering system, lighting, and day/night cycle
- **[Event Bus](events.md)** - Event bus pub/sub constraints and considerations
- **[Camera](camera.md)** - Camera system and mathematical formulas
- **[Systems](systems.md)** - World, party, input, collision, and geometry systems
- **[Data Formats](data-formats.md)** - Data format specifications
- **[Project Structure](project-structure.md)** - Code organization and project structure
- **[Porting Strategy](porting-strategy.md)** - Porting approach, FFI constraints, and learning path
