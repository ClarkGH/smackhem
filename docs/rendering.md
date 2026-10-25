# Rendering Layer (Portable by Design)

## Table of Contents

- [Renderer Interface](#renderer-interface)
- [WebGL Implementation](#webgl-implementation)
- [Display Size and Resolution](#display-size-and-resolution)
- [Future Native Renderer](#future-native-renderer)
- [Lighting System](#lighting-system)
  - [Directional Light Direction](#directional-light-direction)
  - [Lambertian Diffuse Lighting](#lambertian-diffuse-lighting)
  - [Final Lighting Calculation](#final-lighting-calculation)
  - [Normal Transformation](#normal-transformation)
  - [Normal Calculation from Triangle](#normal-calculation-from-triangle)
- [Day/Night Lighting Cycle](#daynight-lighting-cycle)
  - [Architecture](#architecture)
  - [Physical Sun/Moon Rules](#physical-sunmoon-rules)
  - [Lighting Parameters](#lighting-parameters)
  - [Renderer Interface Extension](#renderer-interface-extension)
  - [Implementation](#implementation)
- [Sky](#sky)
- [Shadows](#shadows)
  - [What Casts and Receives](#what-casts-and-receives)
  - [Choosing the Shadow Caster](#choosing-the-shadow-caster)
  - [Frame Flow](#frame-flow)
  - [Sampling: Acne, Peter-Panning and Soft Edges](#sampling-acne-peter-panning-and-soft-edges)
  - [Billboards](#billboards)
  - [Known Limits](#known-limits)
- [2D Sprite Rendering (Instance Characters)](#2d-sprite-rendering-instance-characters)
  - [Renderer Interface Extension](#renderer-interface-extension-1)
  - [Implementation Details](#implementation-details)
  - [Sprite Lighting](#sprite-lighting)
  - [Sprite Art](#sprite-art)
  - [Architecture](#architecture-1)
- [Key Rule: gl.* never leaks upward](#key-rule-gl-never-leaks-upward)
- [Navigation](#navigation)

## Renderer Interface

The renderer explicitly owns rendering.

```typescript
interface Renderer {
  beginFrame(): void;
  // Once per frame, shared by every world draw
  setViewProjection(viewProj: Mat4): void;
  drawMesh(
    mesh: MeshHandle,
    model: Mat4, // the mesh's own transform, not viewProj * model
    color: Vec3
  ): void;
  endFrame(): void;
}
```

Draws are recorded, not drawn on the spot: `endFrame` replays them in call order. That lets the renderer run more than one pass over the same frame (see [Shadows](#shadows)). Matrices and colors are copied when recorded, because core reuses scratch objects (one wall transform for every wall).

## WebGL Implementation

- Uses WebGL2
- One shader pair for world geometry
- One shader pair for 2D sprites/textures (for instance characters)
- One depth-only shader pair for the shadow map
- World geometry: No textures, directional lighting (ambient + diffuse) with shadows
- 2D sprites: Textures supported (RGBA with alpha blending), lit and shadowed
- Depth test only (world geometry and sprites)
- Draw calls are recorded in a `DrawList` (`platforms/web/rendering/drawList.ts`) and replayed in `endFrame`

## Display Size and Resolution

**On the web, the page decides the game's size, not the game.** On itch.io the game runs in an iframe: either the size chosen at upload ("Embed in page"), or the whole browser window ("Click to launch in fullscreen"). itch can also add its own fullscreen button. So:

- **The canvas fills its container** (`#app`, which fills the page or iframe) and follows every resize. Nothing is hard-coded to 800×600 any more.
- **Render scale** (Settings: 50%, 75%, 100%) sets how many pixels the canvas draws: container size × scale, with the browser stretching it to fit. It trades sharpness for performance. It's the web's version of a resolution setting.
- **Window Size** (native PC only) picks the window's size, defaulting to the display's own resolution. The web hides it, because `DisplayService.capabilities()` reports no window control there.
- **Any aspect ratio works.**
  - The 3D view reads its aspect from the canvas every frame.
  - The 2D scene keeps a fixed logical 800×600 space, and `fitLogicalOrtho` widens its projection so it stays centered and undistorted, with extra space at the sides or above and below.
  - The projection is rebuilt only when the viewport size changes.
- **Fullscreen** goes on the container, so the menu and debug overlays come along. It's a request:
  - The browser can refuse it, for example in an iframe without fullscreen permission. Then the menu item is greyed out and points to the page's own button.
  - Escape exits it natively. `settings.fullscreen` follows what the platform reports (`bindDisplay`), and it's never saved.

## Future Native Renderer

- Same interface
- Different implementation
- Game code unchanged

## Lighting System

The rendering system uses colored directional lighting (sun and moon) with ambient and diffuse components, and colors from the time-of-day palette (see [Sky](#sky)). Mesh colors themselves are grayscale. All lighting calculations are performed in shaders using world-space normals.

### Directional Light Direction

Light direction is a normalized 3D vector pointing from the surface toward the light source (the sun or moon).
For a sun low in the east (+X):

```typescript
lightDirection = normalize({x: 1, y: 0.2, z: 0})
```

### Lambertian Diffuse Lighting

Diffuse lighting calculation (performed in fragment shader):

```typescript
dotProduct = dot(surfaceNormal, lightDirection)
diffuse = max(dotProduct, 0.0)
```

The dot product between the surface normal and the light direction determines how much light hits the surface. Surfaces facing away from the light receive no diffuse lighting.

### Lighting Calculation

Combines ambient and diffuse lighting:

```typescript
lighting = ambientIntensity + diffuse * (1.0 - ambientIntensity)
finalColor = baseColor * lightColor * lighting
```

Where:

- `ambientIntensity` = the palette's `ambient` for the time of day (0.12 at night to 0.5 by day)
- `lightColor` = the palette's `sunLight` / `moonLight`, each faded by its body's visibility (warm and low at sunrise and sunset, near-white at noon, cool moonlight at night)
- `baseColor` = mesh color (grayscale values)

The ambient component ensures surfaces are never completely black, while the diffuse component provides directional shading.

### Normal Transformation

Surface normals must be transformed by the inverse transpose of the model matrix when the model matrix includes non-uniform scaling or rotation:

```typescript
normalMatrix = transpose(inverse(modelMatrix))
transformedNormal = normalize(normalMatrix * normal)
```

**Note:** In our current implementation, model transforms are translation-only, so we use the identity matrix for normal transformation. This optimization is documented in the renderer implementation.

### Normal Calculation from Triangle

For a triangle with vertices v0, v1, v2, the normal is computed as:

```typescript
edge1 = v1 - v0
edge2 = v2 - v0
normal = normalize(cross(edge1, edge2))
```

The cross product of two edges gives the triangle's normal vector, which is then normalized to unit length.

## Day/Night Lighting Cycle

The lighting system supports a deterministic sun/moon cycle that rotates light direction, changes color, and adjusts ambient intensity based on simulation time.

### Architecture

- Lighting parameters are computed in core as pure functions of simulation time
- Core tracks accumulated simulation time (fixed timestep)
- Parameters are passed to renderer via optional service interface methods
- Renderer implementation applies these values in shaders

### Physical Sun/Moon Rules

- **Sun Arc**: from horizon (east) → overhead (noon) → horizon (west) → below horizon (night)
  - Rises in the east (horizon) at dawn (timeOfDay ≈ 0.25)
  - Reaches zenith (overhead) at noon (timeOfDay = 0.5)
  - Sets in the west (horizon) at dusk (timeOfDay ≈ 0.75)
  - Goes below horizon at night (timeOfDay 0.0-0.25, 0.75-1.0)
- **Moon Arc**: opposite phase (visible during night)
  - Visible during night (timeOfDay 0.0-0.25, 0.75-1.0)
  - Follows opposite path across sky
- **Coordinate System**: Y-up world space, normalized vectors
  - Light direction points FROM the surface TOWARD the light source
  - Rotation around Y-axis in XZ plane

### Lighting Parameters

1. **Light Direction**: Rotates around the Y axis (sun/moon arc across sky)
   - Computed from time of day (0-1 cycle)
   - Normalized 3D vector in world space
   - Sun at peak (noon), moon at peak (midnight)

2. **Light Color**: from the time-of-day palette (`sunLight`, `moonLight` in `SKY_KEYS`)
   - The palette sets each body's color: warm at sunrise and sunset, near-white through the day, cool for the moon
   - Each is multiplied by its body's visibility, so the light fades as the body crosses the horizon, in step with shadow strength
   - Both bodies light the scene at once, each weighted by its own visibility

3. **Ambient Intensity**: the palette's `ambient` (0.12 at night, 0.3 at dawn and sunset, 0.5 by day), blended with the rest of the palette

### Renderer Interface Extension

```typescript
interface Renderer {
    // Single Light methods
    setLightDirection?(_direction: Vec3): void;
    setLightColor?(_color: Vec3): void;
    // In-use light setters, utilizing celestial bodies overhead for light
    setAmbientIntensity?(_intensity: number): void;
    setCelestialLighting?(
        _sun: { direction: Vec3; color: Vec3 },
        _moon: { direction: Vec3; color: Vec3 },
    ): void;
}
```

### Implementation

**Time of Day Calculation:**

```typescript
const DAY_LENGTH_SECONDS = 120; // 2 minutes per full cycle (configurable)
const timeOfDay = (simulationTime % DAY_LENGTH_SECONDS) / DAY_LENGTH_SECONDS;
```

**Spherical Coordinate System:**

The implementation uses spherical coordinates (azimuth + elevation) for physically accurate 3D positioning:

- **Azimuth** (compass direction): 0 = north, π/2 = east, π = south, 3π/2 = west
- **Elevation** (height above horizon): -1 (below horizon) to +1 (zenith/overhead)

```typescript
// Compute sun azimuth and elevation
// Phase offset: shift so noon (elevation peak) is at timeOfDay = 0.5
// Standard hours: dawn ~0.25, noon 0.5, dusk ~0.75, midnight 0.0/1.0
const angle = (timeOfDay - 0.25) * Math.PI * 2; // Full rotation with phase offset
const elevation = Math.sin(angle) + DECLINATION_OFFSET; // -1 (midnight) to 1 (noon)
const azimuth = Math.PI / 2 + angle; // Starts at east (π/2), rotates clockwise

// Convert spherical to Cartesian direction vector.
// elevation is already a sine (-1..1), so it's y directly. Taking Math.sin of it again
// treated it as radians and capped the noon sun at sin(1) ~ 57 degrees.
const cosElev = Math.sqrt(1 - elevation * elevation);
out.x = cosElev * Math.sin(azimuth);  // East-west component
out.y = elevation;                    // Up-down component
out.z = cosElev * Math.cos(azimuth);  // North-south component
// Normalize for unit vector
// Note: No horizon clamping - sun can go below horizon for debugging
```

**Moon Calculation:**

Moon position and light direction are computed from sun position (opposite phase):

```typescript
const moonAzimuth = sunAzimuth + Math.PI; // Opposite direction
const moonElevation = -sunElevation; // Opposite elevation
sphericalToDirection(moonAzimuth, moonElevation, moonLightDirection);
```

**Light Direction Selection:**

The system blends sun and moon light directions from the surface, based on their visibility:

```typescript
private computeCelestialVisibility(elevation: number): number {
    const FADE_BAND = 0.15;
    const t = Math.max(0, Math.min(1, (elevation + FADE_BAND) / (2 * FADE_BAND)));
    return t * t * (3 - 2 * t);
}

const sunVisibility = this.computeCelestialVisibility(this.sunElevation.value);
const moonVisibility = this.computeCelestialVisibility(moonElevation.value);
```

**Light Color (Visibility-Based Blending):**

The bodies visibility comes from their own elevation as we utilize a fade band.

The fade band is the distance the fade extends from the horizon:

```typescript
// The palette is evaluated once per update (paletteAt), then:
const { sunLight, moonLight } = this.palette;
this.sunColorWithVisibility.x = sunLight.x * this.sunVisibility;   // ...y, z likewise
this.moonColorWithVisibility.x = moonLight.x * this.moonVisibility; // ...y, z likewise

            // Both bodies light the scene at once (weighted by their own visibility) -
            // no more picking one direction and discarding the other.
            if (this.renderer.setCelestialLighting) {
                this.renderer.setCelestialLighting(
                    { direction: this.lightDirection, color: this.sunColorWithVisibility },
                    { direction: this.moonLightDirection, color: this.moonColorWithVisibility },
                );
            }
```

**Ambient Intensity:**

The palette's `ambient` for the time of day, blended with every other palette value, so the world's brightness changes exactly in step with the sky.

**Visual Celestial Objects:**

The sun and moon are part of the sky: discs drawn **in the sky shader**, after the gradient and stars and **before the clouds**, so clouds pass in front of them. Within one shader the order of the code is the draw order, so no depth tricks are needed. (They used to be sphere meshes drawn after the sky pass, which always landed in front of the clouds.)

- **Where:** the sun at `sunDirection`, the moon at `moonDirection`, both sent in `SkyState`. A disc covers the directions within its angular radius (`SUN_RADIUS` 0.0506, `MOON_RADIUS` 0.0404, the old spheres' size), with an edge about a pixel soft.
- **Colors** (from the palette):
  - Sun: `sunDisc`, a golden orb, never white against the blue sky. Noon Sun `#F7D038` through the day, brightening to Light Sun `#FDE87A` at the 12:00 noon key and deepening again; Sunburst Orange `#FFA333` at dawn, Tropic Sun `#F38B21` at sunset (colorguide.org/sun). It's separate from `sunLight`, so daylight can stay near-neutral while the orb stays golden.
  - Moon: `moonDisc`, the palette's `moonLight` (cool blue).
- **Visibility:** each disc is blended into the sky by its body's visibility (0–1), so a setting sun fades **into** the sky behind it, halo included, instead of darkening into a blot.
  - Sun fades in at dawn, fades out at dusk
  - Moon fades in at dusk, fades out at dawn
- `EnvironmentSystem` still computes `sunPosition` / `moonPosition` (along each direction, just inside the camera's far distance) for the debug HUD.

**Time Mapping:**

- Time 0.0/1.0 = midnight (sun below horizon)
- Time 0.25 = dawn (sun rising in east)
- Time 0.5 = noon (sun overhead at zenith)
- Time 0.75 = dusk (sun setting in west)

**Constraints:**

- All calculations must be deterministic (based on simulation time only)
- No platform-specific timing dependencies
- Lighting computation does not affect simulation logic
- Day length is configurable via constant (currently 120 seconds per cycle)
- Calculations occur in render function (deterministic, no simulation side effects)

**Implementation Details:**

- Simulation time is tracked separately from frame accumulator
- Simulation time accumulates in game loop via fixed timestep (`simulationTime += dt`)
- All functions are pure (no side effects, deterministic)
- **Zero-allocation design**: Pre-allocated Vec3 and Mat4 objects are reused every frame
  - Functions write into existing objects instead of creating new ones (complies with RULE M-1)
  - Celestial objects, transforms, colors, and directions are all pre-allocated
  - Inline normalization avoids calling allocation-heavy helper functions
- All values are computed fresh each frame (no caching needed, pure functions)
- Celestial meshes (sun sphere) are created once and reused
- No horizon clamping - sun can go below horizon for debugging

## Sky

The sky is **sky state**, not lighting (R-3): core works out what it should be, the renderer draws it. Each frame core sends four colors (horizon, upper, zenith, and a glow for the sun's side) and the sun's direction.

- **Sky pass** (renderer): one triangle larger than the screen, drawn first in the lit replay with no depth test or write, so everything draws over it. Each pixel's exact view direction comes from un-projecting the near and far planes with `inverse(viewProj)`.
- **`skyColor(viewDir)`** (`SKY_COLOR_GLSL`, shared so fog can reuse it): horizon → upper by `HORIZON_BAND` (view height 0.25), upper → zenith above that, horizon color below the horizon. The glow has two parts: a **halo** centered on the sun (`HALO_POWER`), so it rises and sets with it, and a wide **band** along the horizon on the sun's compass side (`BAND_POWER`, `BAND_HEIGHT`, `BAND_STRENGTH`). It's **screen**-blended (`color + glow × amount × (1 − color)`), so it tints toward the glow color without clipping to white, and black glow still adds nothing. (A first version weighted the whole glow toward the horizon: since the sun rises straight up, the bright spot stayed pinned to the horizon as the sun climbed, and adding it clipped to a flat white patch.)
- `beginFrame` still clears to `horizon` as a fallback.

### Clouds

Procedural, like the rest of the sky: no textures. Drawn in the sky pass's `main` over the gradient, stars, sun and moon (so they hide all of them), **not** in `skyColor()`, so fog never paints clouds onto distant objects.

- **A flat layer** `CLOUD_HEIGHT` (60) above the floor. Each upward view ray meets it at `eye.xz + viewDir.xz × (60 − eye.y) / viewDir.y`, and the noise is evaluated there. Perspective makes clouds large overhead and small and bunched toward the horizon. They fade out over the lowest `CLOUD_HORIZON_FADE` (0.2) of view height.
- **Shape:** value noise (random values at grid corners, smoothly blended) in four octaves, weighted 0.6 / 0.25 / 0.1 / 0.05 toward the big shapes, at `CLOUD_SCALE` 0.014 cells per unit. Coverage starts at `CLOUD_COVERAGE` 0.63 (higher means fewer, separate clouds with sky between), with an edge about **one pixel** soft: `fwidth(density)`, at least `CLOUD_EDGE_MIN`. Edges are crisp at any distance, not misty and not jagged. Far away (`CLOUD_DETAIL_NEAR` 250 to `_FAR` 800 units along the ray) the two fine octaves fade to their average, or they'd shimmer into streaks near the horizon.
- **Hash** (32-bit unsigned, wrapping), on a cell wrapped to the 256-cell period first: `h = (x * 0x8DA6B343) ^ (z * 0xD8163841)`, then `h ^= h >> 16; h *= 0x7FEB352D; h ^= h >> 15; h *= 0x846CA68B; h ^= h >> 16`. The value is the top 24 bits as 0..1.
- **Shading in 2D:** compare the density here with the density 8 units toward the sun. Thinner toward the sun means this edge faces it, so it's lighter; thick middles are darker. The shade is then cut into **three flat tones** (shadow, mid, light, at 0.3 and 0.55, favoring light tops), each step a pixel soft. That's a graphic look that suits the 2D sprites rather than realistic soft clouds. The three tones map to the palette's `cloudShadow`, `cloudMid` and `cloudLight` for the time of day: white over blue-grey by day, peach, pink and violet at dawn, gold, coral and purple-blue at sunset, lilac to deep violet at dusk, and dark silhouettes at night. They blend with the rest of the palette, so cloud colors change in step with the sky. The high streak layer takes `cloudLight`.
- **Derivatives:** everything `fwidth` needs is computed on every pixel before any early return, because derivatives are undefined once neighbouring pixels take different paths. Rays near flat use a clamped height and are faded out instead of skipped.
- **Two layers:** the puffy layer above, plus a **high layer** at `CLOUD_HIGH_HEIGHT` (150), drawn first so the puffy clouds pass in front of it. It's two octaves on stretched cells (`CLOUD_HIGH_SCALE` (0.01, 0.03)), which makes streaks rather than puffs, with a different `CLOUD_HIGH_SEED` offset into the noise so it doesn't copy the low layer. It's sparse (`CLOUD_HIGH_COVERAGE` 0.68, crisp edges like the puffy layer) and partly see-through (`CLOUD_HIGH_OPACITY` 0.4): an accent, not a second ceiling. It drifts slower and crosswise (`CLOUD_HIGH_OCTAVE_LAPS` (0,1), (1,2)), so the layers slide past each other and shift against each other as you walk.
- **Motion** (`core/lighting/clouds.ts`, shared with the shader): core sends `cloudTime`, sim time wrapped to `CLOUD_CYCLE_SECONDS` (12000), through `SkyState`. Each octave travels a whole number of its 256-cell periods per cycle (`CLOUD_OCTAVE_LAPS`: (1,0), (3,1), (5,−2), (−4,9)), so the big shapes drift about 1.5 units/s while finer octaves slide across them in other directions. The high layer has its own whole-number table, checked the same way. Clouds drift **and** change shape, grow, thin, split and merge, with no simulation. Whole lap counts make the wrap at the end of a cycle invisible (`clouds.spec.ts` checks it). Cloud time follows sim time, not the time of day, so a Debug time override doesn't move the clouds.

### Fog

Chunks load about 60 units around the player, so without fog the floor ends in a hard line against the sky. Fog blends distant surfaces toward the sky's color **in their own direction**, using the same `skyColor()` as the sky pass, so it matches the sky everywhere: blue by day, the sunset glow toward the sun, dark at night.

- `RenderSystem` sends the camera position every frame (`setViewPosition`, next to `setViewProjection`), so the renderer can measure each pixel's distance and direction.
- Amount: `smoothstep(FOG_START, FOG_END, distance)`, from 25 to 55 units, complete before the floor ends, so the edge can't show through.
- **Light sources skip it** (the sun and moon are 99 units out and would vanish; debug walls stay crisp).
- **No stars in fog:** stars are drawn in the sky pass, not in `skyColor()`.
- **Meshes and billboards fog the same way:** both shaders include `FOG_GLSL` (`applyFog(color, worldPos)`), so the distances live in one place. On a billboard fog changes only the color; see-through pixels stay see-through.

### Stars

Drawn in the sky pass's `main`, **not** in `skyColor()`, so fog (which will reuse `skyColor()`) never gets stars. Deterministic and stateless: no textures, no time input, so the same view direction always shows the same star on every machine. To reproduce the field on another backend, match this exactly:

1. **Face:** the view direction's largest absolute axis picks one of 6 faces: +x 0, −x 1, +y 2, −y 3, +z 4, −z 5. Face coordinates are the other two components divided by that axis's absolute value (x faces: `(y, z)`, y faces: `(x, z)`, z faces: `(x, y)`), giving −1..1.
2. **Cell:** `grid = (faceUV * 0.5 + 0.5) * 32`, `cell = floor(grid)`.
3. **Hash** (32-bit unsigned, wrapping multiplication):
   ```
   h = (face * 0x9E3779B9) ^ (cellX * 0x85EBCA6B) ^ (cellY * 0xC2B2AE35)
   h ^= h >> 16; h *= 0x7FEB352D; h ^= h >> 15; h *= 0x846CA68B; h ^= h >> 16
   unit(v) = (v >> 8) / 16777216        // top 24 bits as 0..1
   h2 = h * 0x27D4EB2D; h3 = h2 * 0x165667B1; h4 = h3 * 0x9E3779B9
   ```
4. **A star** exists if `unit(h) < 0.24`. Its center in the cell is `cell + 0.2 + 0.6 * (unit(h2), unit(h3))`, and its brightness is `unit(h4)²`, so most are faint.
5. **Shape:** the center is turned back into a 3D direction, and the star is a soft dot measured as `length(viewDir − starDir)` against its radius in pixels (`fwidth(viewDir)`), so it's round on screen whatever face it's on. Radius by brightness: 1.5 px above 0.6, 1 px above 0.25, else 0.75 px.
6. **Speckle-in:** a star shows once the palette's `stars` value passes `(1 − brightness) × 0.85`, fading in over 0.15. Bright stars come out first at dusk and leave last at dawn; the faintest are fully in exactly at full night (`stars` = 1).
7. **Horizon:** stars thin out over the lowest 0.15 of view height and never appear below the horizon.

Tunable in the shader: `STAR_GRID` 32, `STAR_DENSITY` 0.24 (about 700 above the horizon), `STAR_HORIZON_FADE`, `STAR_FADE_RANGE`. (A first version measured the dots in face coordinates: faces seen at an angle squashed them into dashes, so they're measured in view-direction space.)

- **Palette** (`core/lighting/skyPalette.ts`): `SKY_KEYS` is a circular table of art-directed values by time of day, a `TimeOfDayPalette` per key: the sky (horizon, upper, zenith, glow), the light (`sunLight`, `moonLight`, `ambient`), the sun's disc (`sunDisc`), the clouds' three tones (`cloudLight`, `cloudMid`, `cloudShadow`) and `stars`. `paletteAt` blends them all with the same segment and blend, so they move together. `EnvironmentSystem` evaluates it once per update; `RenderSystem` copies the sky fields from there, so the sky and the lighting always come from the same evaluation. Night holds from 20:00 to 05:00, dawn is at 06:00, the day's sky holds from 07:30 to 16:30, then sunset at 18:00 and dusk at 19:00. Daylight is the exception within the day: warm cream at 07:30 and 16:30, near-white at a 12:00 `noon` key, so it warms gradually away from high noon. The sun's disc is always golden (`sunDisc`, colors from colorguide.org/sun), never white. `paletteAt` smoothsteps from the last key at or before the time to the next, measuring forward across midnight. A hold is two neighbouring keys with the same color. Dawn and sunset sit where the sun crosses the horizon, which the spec checks against `EnvironmentSystem`.
- **To the renderer**: `RenderSystem` fills a `SkyState` (palette colors, plus the sun's direction: always the sun, even below the horizon, never the shadow caster, which switches to the moon at night) and calls `setSky` **before** `beginFrame`, every frame and in every mode. `beginFrame` then clears to it, so the color always belongs to the current frame. In `scene_2d` the scene's own `clear()` draws over it.
- **Tuning**: edit the hex values in `SKY_KEYS`, then check them with the Debug screen's Time of Day. The spec reads expected colors from the table, so color changes never touch a test.

## Shadows

Shadow mapping, the standard technique in most 3D engines. Each frame the renderer draws the scene's depth as seen from the shadow-casting light into a texture (the shadow map). Then, for every lit pixel, it asks: is something nearer the light than me, at my spot in that texture? If so, that pixel is in shadow.

### What Casts and Receives

- **Every lit mesh casts and receives, per pixel**: floor, cube/prism/pyramid sides and tops, walls. Mesh on floor, mesh on mesh and a mesh on itself are all the same lookup.
- **Billboards cast and receive, per pixel**: shaded by meshes and other billboards, and casting their sprite's shape.
- **Never**: light sources (`isLightSource`: sun, moon, debug wireframe walls). The sun sphere sits right between the light and the camera, so it would put a disc of shadow around the player.
- **Not**: the `scene_2d` screen quad (a flat overlay), or anything beyond the map's ±40 units around the camera. Shadows fade out over the map's outer 10% instead of ending on a hard line.
- **Ambient is never shadowed**, only direct light. Shadows are naturally faint when ambient is high or direct light is dim.

### Choosing the Shadow Caster

Core (`EnvironmentSystem`) picks it every frame, as a pure function of the time of day:

- The **more visible body** casts: the sun by day, the moon by night.
- **Strength** = that body's visibility × an elevation fade, from 0 at `y = 0.05` to full at `y = 0.25` (direction's height). Near the horizon shadows would stretch for dozens of units.
- At dawn and dusk both bodies sit at the horizon, so the moon → sun handover happens at strength 0, a crossfade rather than a pop.

```typescript
interface Renderer {
    // Optional, like the other lighting setters. Called every frame, strength 0 included:
    // the renderer keeps the last values it got, so skipping a call leaves stale shadows on.
    setShadowCaster?(direction: Vec3, strength: number, focus: Vec3): void;
}
```

`focus` is the render camera's position: core says where it cares about, the renderer decides the map's size and resolution (R-3). The pause menu's Debug screen (dev server only) can turn shadows off (core sends strength 0) and override the time of day.

### Frame Flow

1. `RenderSystem` sets the view-projection, lighting and shadow caster, then records its draws.
2. `endFrame`: if strength > 0, the **depth pass** draws every recorded non-light-source mesh, then every billboard, into a 2048² depth texture, from the light.
3. The **lit pass** replays the recording as before, sampling that texture.

The light's view-projection (`platforms/web/rendering/shadowMath.ts`) is orthographic: sunlight is parallel, so shadows don't grow or shrink with distance from the light. It covers ±40 units around the camera (80 units / 2048 texels ≈ 3.9 cm per texel) and ±100 units along the light. Its centre snaps to whole texels: otherwise every small camera move re-rasterises shadow edges at slightly different spots and they crawl ("shimmer").

### Sampling: Acne, Peter-Panning and Soft Edges

- **Shadow acne**: a surface compares against its own depth, and texel-sized rounding makes it shadow itself in speckles or stripes.
- **Peter-panning**: overcorrecting for acne pushes shadows away from their casters, so objects look like they float.
- The mesh shader balances the two with:
  - `NORMAL_OFFSET` (0.05): look up a point lifted off the surface along its normal.
  - **Receiver-plane depth bias** (in `sampleShadow`): from how the light-space position changes between neighbouring screen pixels (`dFdx`/`dFdy`), work out how the surface's depth tilts across the shadow map. Each of the 9 soft-edge taps then compares against the surface's own depth *at that tap*, not at the centre. Without it, a tilted floor's outer taps look "behind" the floor itself, and the only cure was a large flat bias, which left a gap at every shadow's root.
  - What's left: one texel's worth of that tilt (LINEAR compare reads depths up to a texel away) plus `CONSTANT_BIAS` (~1 cm).
- **Soft edges**: the shadow map is sampled in compare mode with LINEAR filtering (each lookup blends 4 compares), 9 times in a 3×3 grid.

These constants are the first things to adjust if acne or floating shadows show up. The pause menu's Debug screen has a **Shadow Bias** stepper (×0.25 to ×4) that scales both live: ×0.25 shows acne on the floor, high values show shadows pulling away from their casters.

Before blaming the bias for a shadow that floats, check that the caster really touches the floor: a sprite with transparent rows under its feet floats, and its shadow is honest about it (see [Sprite Art](#sprite-art)).

### Billboards

A billboard faces the camera, but casts from a card that faces the light (so its shadow never collapses to a line when the sun is behind the camera). If it looked up its shadow on the camera-facing card, half the sprite would sit behind its own caster and shade itself.

**Casting**: in the depth pass a billboard is drawn on that light-facing card, and pixels with alpha below 0.5 are discarded, so the shadow has the sprite's shape rather than a rectangle's.

**Receiving**: each billboard pixel looks up its shadow where it would be **on the light-facing card**, nudged `SELF_CLEARANCE` (0.1 units) toward the light. The card maths (`LIGHT_CARD_GLSL`) is shared by both, so they always agree. One difference: for receiving, the card's "right" is flipped to point the same way as the visible card's. Looking toward the light the two point opposite ways, and an unflipped lookup reads the card mirrored, so shadows slide across the sprite backwards. Sideways shifts can't cause self-shadowing (the lookup stays on the light's side of the card), and the caster isn't flipped, so a sprite's own shadow never mirrors as the camera moves. Walls and meshes still shade it per pixel, so a sprite half in a wall's shadow is half shaded. With the light straight overhead every facing casts the same, so it keeps the camera-facing card.

### Known Limits

- **Shadows dim both bodies' diffuse light**, not just the caster's: the renderer only gets a direction, not which body. The crossfade keeps the other body dim whenever shadows are strong. Local lights (sconces, lanterns) will need this per light.
- **Billboard models are assumed upright**: anchor in the translation, size from the first column. True of every current `drawTexturedQuad`.
- **Sprites have almost no shadow at noon**: a flat card seen from straight above casts a line. If characters need grounding then, a small blob shadow under them is the usual addition.
- **One map**: if shadows far from the camera look blocky, cascaded shadow maps (several maps at increasing distance) are the usual upgrade.

## 2D Sprite Rendering (Instance Characters)

The renderer supports 2D sprite rendering for instance characters (party members, NPCs, enemies). Sprites are rendered as textured quads with billboard orientation in the 3D scene.

### Renderer Interface Extension

```typescript
interface Renderer {
    // ... existing methods ...
    loadTexture(_assetId: string): Promise<TextureHandle>;
    // model: the billboard's own transform; the renderer applies the view-projection
    drawTexturedQuad(_texture: TextureHandle, _model: Mat4, _size: number, _normal?: Vec3): void;
}
```

### Implementation Details

- **Texture Loading**: Assets are requested by logical ID (e.g., `'circle-sleep00'`), not file paths (compliant with RULE A-1)
- **Texture Format**: RGBA images with alpha channel for transparency
- **Alpha Blending**: Enabled for sprite rendering (`SRC_ALPHA, ONE_MINUS_SRC_ALPHA`)
- **Billboard Calculation**: Sprites are oriented to face the camera while remaining vertical (calculated on CPU)
- **Positioning**: Sprites use 3D world positions (typically on floor plane, Y=0)
- **Quad Geometry**: Unit quad on XZ plane (Y=0), scaled by size parameter

### Sprite Lighting

Sprites are lit **as if they faced the light**: the same light-facing card they cast their shadow from (see [Billboards](#billboards)). Each body adds its full color, already faded by its own visibility, and only shadow dims it:

```glsl
vec3 diffuse = (u_sunColor + u_moonColor) * sampleShadow(v_lightClip, BILLBOARD_BIAS);
vec3 finalColor = textureColor * (u_ambientIntensity + diffuse);
```

Earlier, sprites used the direction to the camera as their normal. Standing on a sprite's sunny side then turned it ambient-only, and its brightness changed as you walked around it. A flat sprite has no real facing, so its brightness shouldn't depend on the camera. The `normal` passed to `drawTexturedQuad` is now only the fallback card when the light is straight overhead.

### Sprite Art

A sprite's image is stretched over a square card `size` world units across, anchored so the card's bottom edge sits on the floor. So:

- **The feet go on the bottom row of the image.** Transparent rows below them lift the drawn sprite, and its shadow, off the floor. With a low sun the gap shows clearly (shadow offset = height / tan(sun elevation)).
- **The image is square**, or it gets squashed onto the square card.
- **The opaque part spans the card's width**, because `INSTANCE_CHARACTER_SIZE` is both the card's size and the collision size. A smaller drawn circle collides bigger than it looks.
- Pixel dimensions don't matter otherwise: a 22×22 and a 64×64 sprite both fill the same card. They just differ in how many pixels per world unit they show.

### Architecture

- Sprite rendering is managed by the instance system (`core/instance.ts`)
- Individual sprite state is tracked in `InstanceCharacter` (`core/instanceCharacter.ts`)
- Billboard transform calculation happens in game loop before rendering
- All GPU operations (texture loading, shader management, rendering) are encapsulated in the renderer backend

## Key Rule: gl.* never leaks upward

No GPU calls should appear outside the renderer layer. All WebGL/GPU operations are encapsulated within the renderer implementation.

## Navigation

- **[Index](INDEX.md)** - Project overview and documentation index
- **[Portability Rules](portability-rules.md)** - All portability enforcement rules and constraints
- **[Architecture](architecture.md)** - High-level architecture, design principles, and platform strategy
- **[Events, State, and Audio Systems](events.md)** - Eventing, global state, audio, and settings events
- **[Camera](camera.md)** - Camera system and mathematical formulas
- **[Systems](systems.md)** - World, party, input, collision, geometry, and menu systems
- **[Controls](controls.md)** - Keyboard, mouse and controller bindings
- **[Data Formats](data-formats.md)** - Chunk, settings, and save data formats
- **[Project Structure](project-structure.md)** - Code organization and project structure
- **[Porting Strategy](porting-strategy.md)** - Porting approach, learning path, and publishing
