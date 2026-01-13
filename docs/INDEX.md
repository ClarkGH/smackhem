# Project Codename: Smackhem

- First-Person Geometric Exploration Engine
- Web-First, Platform-Agnostic by Design

## Table of Contents

- [Overview](#overview)
- [Inspired by](#inspired-by)
- [Shared features](#shared-features)
- [The MVP Vision](#the-mvp-vision)
- [TBD / Next steps](#tbd--next-steps)
- [Navigation](#navigation)

## Overview

Smackhem is a first-person geometric exploration engine designed with portability in mind. The engine core is platform-agnostic, allowing for easy porting to desktop, console, and native platforms by swapping backends.

## Inspired by

Cross Code was made with spit, grit, and javascript. It was ported to consoles and it's a great game. Since we're javascript developers, we're going to follow their path and do the same thing. We can use OpenGL like them, and do a 2.5D game, OUR WAY (cool emoji the kid's relate to here, or not).
Remember Drakkhen? On the Amiga? The Super Nintendo? It's one of the most confusing games to pick up! But we think there's something there. We're taking inspiration and trying to see what we can do with the old magic.

## Shared features

- Dungeons and dragons-esque stat blocks
- Gear
- The open 3D map exploration
- The time of day
- Monster Fights
- Conversation(s)
- Random Encounter(s)
- Explorable instance(s)
- Shop(s) / Inn(s) / Shrine(s)
- Quests
- No walking into and drowning in bodies of water, disco dragon summons, or tombstone dogs allowed!
- No Illegible Spells!

## The MVP Vision

- Since this is our first venture into 3D game development, we've decided to go with only geometric shapes and black/white shades. We're going to pretend people will enjoy the demo so much that we're prepping the game with a rendering layer for console porting.
- The whole RPG experience, in geometric form!
- No plagiarism, only inspiration.
- The rounds have been cast out of geometromena, the angled ones rule supreme. Will our circles, ovals, spirals, and parabolics be able to end roundism once and for all? Or will the "cycle" continue, as round things tend to do.
- Day/Dusk/Night/Dawn cycle.
- Cheeky but appropriate humor. Dad jokes, math jokes, we're going to make it weird.
- The game is both 3D and 2D, ala Dragonview and Drakkhen. First person exploration in the main map, until combat or events, then party pops out and fights or has a conversation/investigates.
- NPC/Enemy/Party AI. Different than Drakkhen. Party will follow the hero, follow turn based commands, or follow set tactics in real time. Enemies/NPCs will do their own thing as set by the game logic.
- Enter an instance and be shown a 2D scene. If a dunny or explorable place, we can wobble/roll around. Otherwise only the scene.
- EASIER TO UNDERSTAND UI THAN DRAKKHEN. That game has a terrible UI and we aren't plagiarizing.
- Modern, and more intuitive controls.
- Party character specific loot/gear/equipment.
- Group loot/money.
- Keep the demo's code into the open source wild, put up on itch.io, and try to get funding for a full game, or get hired by a small team of indie game devs?

### TBD / Next steps

 We might transition into doing something more akin to Dragonview? Not sure, that's more complicated and having party AI do their own thing while following the leader seem's like a fine enough plan.

- Character creation.
- A plot.
- Spells: Unlock, fire, ice, light, lightning, invisibility, poison cloud, acid spray, buff, debuff, shield, etc.. If we have time and the spell's not broken, we'll have a good amount!
- Strengthen/upgrade system involving math formulae (Algebraic! Geometric!).
- Accessibility options.
- Add some color for... reasons.
- Port demo code to Godot, because "why not?". We're building for fun.

## Navigation

- **[Portability Rules](portability-rules.md)** - All portability enforcement rules and constraints
- **[Architecture](architecture.md)** - High-level architecture, design principles, and platform strategy
- **[Rendering](rendering.md)** - Rendering system, lighting, and day/night cycle
- **[Camera](camera.md)** - Camera system and mathematical formulas
- **[Systems](systems.md)** - World, party, input, collision, and geometry systems
- **[Data Formats](data-formats.md)** - Data format specifications
- **[Project Structure](project-structure.md)** - Code organization and project structure
- **[Porting Strategy](porting-strategy.md)** - Porting approach, FFI constraints, and learning path
