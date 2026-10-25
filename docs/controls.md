# Controls

## Table of Contents

- [Principles](#principles)
- [Gameplay](#gameplay)
- [Menus](#menus)
- [Debug](#debug)
- [Open Questions](#open-questions)
- [Navigation](#navigation)

## Principles

- **Standard first.** Every player-facing control follows a common PC or console convention, so nothing needs explaining.
- **Controller-first (Rule I-2).** Everything is playable with two sticks and face buttons, and keyboard and mouse cover the same actions.
- **Intent, not hardware (Rule I-1).** The platform turns keys, buttons and the mouse into `PlayerIntent`. Core never sees a key name.
- **Debug keys live on the F-keys**, out of the way of play. Everything else debug lives on the pause menu's Debug screen, so it works on a controller.

Controller buttons use the browser's standard gamepad layout, named by Xbox labels: **A** bottom, **B** right, **X** left, **Y** top. PlayStation is Cross / Circle / Square / Triangle in the same positions. Nintendo controllers swap A/B, and on PC that's left for rebinding (planned).

Status: ✅ works now, 🔜 planned.

**How look works.** The mouse reports a distance moved, and the right stick reports a turn rate, so they're handled separately:
- Mouse movement is added up over a frame and applied once, on the next simulation tick. Look speed is the same at any frame rate, and nothing is lost on a frame that runs no tick.
- The stick turns at up to 2.5 rad/s (about 143°/s) at full tilt, applied every tick.
- Mouse movement made while a menu is open is dropped, so starting a game never jolts the camera.
- On the web, keys held when the page loses focus (another window, a browser dialog) are forgotten, because their release never arrives. Otherwise you'd keep walking when you came back.

Controller buttons act on the press, not while held. The sticks ignore drift below 0.15.

## Gameplay

| Action | Keyboard / mouse | Controller | Status |
|---|---|---|---|
| Move | W A S D, arrow keys | Left stick | ✅ |
| Look | Mouse (click the game to capture the cursor) | Right stick | ✅ (separate sensitivity and invert per device in Settings) |
| Interact / talk (with whatever the prompt is over) | E | A | ✅ |
| Close a conversation | E or Escape/Backspace | A or B | ✅ |
| Instance toggle *(temporary)* | Space | Y | ✅ |
| Pause menu | Escape | Start | ✅ |

**Talking:**
- A small prompt over a character shows that Interact will reach them. Its label follows the device you last touched: **E** on keyboard, **Ⓐ** on a controller.
- A conversation holds everything until you close it, so it waits for however long you take to read. You can't move or look, the day stops, and the instance toggle does nothing. The pause menu still opens.
- **In the world** you talk to the nearest character within 2 units and within 45° of where you're looking. **In the instance** the circle talks to the nearest one within 2 units in any direction.

## Menus

| Action | Keyboard / mouse | Controller | Status |
|---|---|---|---|
| Move the selection | ↑ ↓ or W S | D-pad, left stick push | ✅ |
| Change a value | ← → or A D, or click `<` `>` | D-pad ← →, left stick push | ✅ |
| Choose | Enter or E, or click | A | ✅ |
| Back | Escape or Backspace, or right-click | B | ✅ |
| Select with the mouse | Hover (disabled items highlight but can't be chosen) | — | ✅ |

Back on the main menu does nothing: there's no screen above it.

**In the pause menu:** Escape (or Backspace, B, right-click) steps back one level, and at the Pause screen it resumes. Start closes the pause menu from any screen. On the web, losing the captured cursor during play (pressing Escape, switching windows) also pauses; click the world after resuming to capture it again.

In fullscreen, Escape belongs to the browser and leaves fullscreen, so use Backspace (or B) to go back in menus there.

The cursor stays free while a menu is open, and clicking a menu never captures it. After New Game, clicking the world captures the cursor for mouse look.

## Debug

Toggleable, never needed to play (Rule D-1).

| Action | Key | Status |
|---|---|---|
| Debug HUD | F3 | ✅ |
| Wireframe | Pause menu → Debug (dev server only) | ✅ |
| Time of Day | Pause menu → Debug (dev server only) | ✅ |
| Enter the 2D scene | Pause menu → Debug → Enter 2D Scene (dev server only); Interact leaves it | ✅ |

## Open Questions

- **The mode toggles are temporary.** Eventually world events will start instances and 2D scenes, not buttons:
  - Space/Y (instance) will be freed. Until then Space is fine: it usually means jump, but the game has none.
  - The 2D scene is only reachable from the Debug menu for now. Interact inside it still leaves it.
- **The `pause` intent's name.** It drives the instance toggle, not a pause. Renaming it (e.g. `toggleInstance`) would free "pause" for the real pause menu.

## Navigation

- **[Index](INDEX.md)** - Project overview and documentation index
- **[Portability Rules](portability-rules.md)** - All portability enforcement rules and constraints
- **[Architecture](architecture.md)** - High-level architecture, design principles, and platform strategy
- **[Rendering](rendering.md)** - Rendering system, lighting, day/night cycle, and display size
- **[Events, State, and Audio Systems](events.md)** - Eventing, global state, audio, and settings events
- **[Camera](camera.md)** - Camera system and mathematical formulas
- **[Systems](systems.md)** - World, party, input, collision, geometry, and menu systems
- **[Data Formats](data-formats.md)** - Chunk, settings, and save data formats
- **[Project Structure](project-structure.md)** - Code organization and project structure
- **[Porting Strategy](porting-strategy.md)** - Porting approach, learning path, and publishing
