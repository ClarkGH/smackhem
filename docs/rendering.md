# Rendering Layer (Portable by Design)

## Table of Contents

- [Renderer Interface](#renderer-interface)
- [WebGL Implementation](#webgl-implementation)
- [Future Native Renderer](#future-native-renderer)
- [Lighting System (Grayscale)](#lighting-system-grayscale)
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
- [Key Rule: gl.* never leaks upward](#key-rule-gl-never-leaks-upward)
- [Navigation](#navigation)

## Renderer Interface

```typescript
interface Renderer {
  beginFrame(): void;
  drawMesh(
    mesh: MeshHandle,
    transform: Mat4,
    color: Vec3
  ): void;
  endFrame(): void;
}
```

## WebGL Implementation

- Uses WebGL2
- One shader pair
- No textures
- **Grayscale directional lighting** (ambient + diffuse)
- Depth test only

## Future Native Renderer

- Same interface
- Different implementation
- Game code unchanged

## Lighting System (Grayscale)

The rendering system uses grayscale directional lighting with ambient and diffuse components. All lighting calculations are performed in shaders using world-space normals.

### Directional Light Direction

Light direction is a normalized 3D vector pointing from the light source toward the scene.
For a sun in the east casting light westward:

```typescript
lightDirection = normalize({x: -1, y: 0.2, z: 0})
```

### Lambertian Diffuse Lighting

Diffuse lighting calculation (performed in fragment shader):

```typescript
dotProduct = dot(surfaceNormal, -lightDirection)
diffuse = max(dotProduct, 0.0)
```

The dot product between the surface normal and the negated light direction determines how much light hits the surface. Surfaces facing away from the light receive no diffuse lighting.

### Final Lighting Calculation

Combines ambient and diffuse lighting:

```typescript
lighting = ambientIntensity + diffuse * (1.0 - ambientIntensity)
finalColor = baseColor * lightColor * lighting
```

Where:

- `ambientIntensity` = varies with time of day (0.1-0.5, dark night to bright day)
- `lightColor` = varies with time of day (cool moon tones to warm sun tones, grayscale)
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
  - Light direction points FROM light source TOWARD scene
  - Rotation around Y-axis in XZ plane

### Lighting Parameters

1. **Light Direction**: Rotates around the Y axis (sun/moon arc across sky)
   - Computed from time of day (0-1 cycle)
   - Normalized 3D vector in world space
   - Sun at top (noon), moon at bottom (midnight)

2. **Light Color**: Elevation-based gradient (sunlight only)
   - Grayscale RGB values
   - Transitions from white (zenith) to red/orange (horizon) based on sun elevation
   - No night colors (currently debugging sun cycle)
   - Smooth interpolation via smoothstep function

3. **Ambient Intensity**: Currently disabled
   - Returns 0.0 for debugging purposes
   - Will be restored later with elevation-based transitions

### Renderer Interface Extension

```typescript
interface Renderer {
    // ... existing methods ...
    setLightDirection?(_direction: Vec3): void;
    setLightColor?(_color: Vec3): void;
    setAmbientIntensity?(_intensity: number): void;
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

// Convert spherical to Cartesian direction vector
const cosElev = Math.cos(elevation);
out.x = cosElev * Math.sin(azimuth);  // East-west component
out.y = Math.sin(elevation);          // Up-down component
out.z = cosElev * Math.cos(azimuth);  // North-south component
// Normalize for unit vector
// Note: No horizon clamping - sun can go below horizon for debugging
```

**Moon Calculation (Currently Disabled):**

Moon code is currently commented out for debugging. Will be restored and replaced in the future.

**Light Direction Selection:**

The system currently uses sun light direction only (moon disabled):

```typescript
const sunVisibility = computeSunVisibility(timeOfDay); // 1.0 at noon, 0.0 at night
const activeLightDirection = lightDirection; // Always use sun light direction
```

**Light Color (Elevation-Based Gradient):**

Color transitions based on sun elevation (sunlight only, no night colors):

```typescript
// Normalize elevation to 0-1 range (horizon to zenith)
const normalizedElev = Math.max(0, Math.min(1, (elevation + 1) / 2));

// Elevation-based color transition (sunlight only, no night colors)
const t = normalizedElev;
const smoothT = t * t * (3 - 2 * t); // Smoothstep function

// White at zenith, red/orange at horizon
lightColor = {
    x: 0.8 + 0.2 * smoothT, // 1.0 at zenith, 0.8 at horizon
    y: 0.7 + 0.3 * smoothT, // 1.0 at zenith, 0.7 at horizon
    z: 0.5 + 0.5 * smoothT  // 1.0 at zenith, 0.5 at horizon (warmer)
};
```

**Ambient Intensity (Currently Disabled):**

Ambient intensity is currently disabled for debugging (returns 0.0). Will be restored later with elevation-based transitions.

```typescript
// Ambient disabled for debugging (will restore later)
return 0.0;
```

**Visual Celestial Objects:**

The sun is rendered as a visible sphere in the sky (moon currently disabled):

- **Positioning**: Placed at infinite distance along light direction vector
  - Distance: `CELESTIAL_DISTANCE = camera.far - 1.0` (ensures visibility)
  - Position: `camera.position + (lightDirection * CELESTIAL_DISTANCE)`

- **Size Constants**:
  - `SUN_SIZE = 0.5` (radius of sun sphere)

- **Colors**:
  - Sun: `{ x: 1.0, y: 0.85, z: 0.2 }` (golden yellow)

- **Visibility**: Colors are multiplied by visibility factor (0-1) for smooth fade in/out
  - Sun fades in at dawn, fades out at dusk

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

## Key Rule: gl.* never leaks upward

No GPU calls should appear outside the renderer layer. All WebGL/GPU operations are encapsulated within the renderer implementation.

## Navigation

- **[Index](INDEX.md)** - Project overview and documentation index
- **[Portability Rules](portability-rules.md)** - All portability enforcement rules and constraints
- **[Architecture](architecture.md)** - High-level architecture, design principles, and platform strategy
- **[Camera](camera.md)** - Camera system and mathematical formulas
- **[Systems](systems.md)** - World, party, input, collision, and geometry systems
- **[Data Formats](data-formats.md)** - Data format specifications
- **[Project Structure](project-structure.md)** - Code organization and project structure
- **[Porting Strategy](porting-strategy.md)** - Porting approach, FFI constraints, and learning path
