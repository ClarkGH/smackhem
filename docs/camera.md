# Camera System (First-Person Focus)

## Table of Contents

- [Camera Modes](#camera-modes)
- [Camera Rules](#camera-rules)
- [Technical Jargon and Formulae](#technical-jargon-and-formulae)
  - [Identity Matrices](#identity-matrices)
  - [Perspective Projection Matrix](#perspective-projection-matrix)
  - [Direction Vector Formula](#direction-vector-formula)
  - [View Matrix (Quaternion-Based)](#view-matrix-quaternion-based)
  - [Orientation Vectors](#orientation-vectors)
  - [Translation and Final Matrix](#translation-and-final-matrix)
  - [Quaternion Rotation System](#quaternion-rotation-system)
  - [Matrix Multiplication](#matrix-multiplication)
- [Navigation](#navigation)

## Camera Modes

- First-person (default)
- Optional slightly elevated free camera (toggleable)

## Camera Rules

- Yaw + pitch only
- No roll
- Clamped pitch
- Explicit smoothing (no browser magic)
- Camera update =/= render
  - Update simulation via fixed or variable time/steps
  - interpolate the render

## Technical Jargon and Formulae

### Identity Matrices

Identity matrices represent the default state of an object in 3D space. We use them as the starting point.

When we "clear" an object's rotation or movement, we set its matrix back to Identity.

When we calculate a complex transformation (e.g., Rotate -> Scale -> Move), we start with an Identity matrix and then multiply our transformation matrices onto it one by one. Rotation will be translated with euler angles, gimble lock is a consideration to move towards quaternions when necessary.

If a shader expects a matrix, but we don't want to apply any transformation to the vertices, we pass the identity matrix

- Scale = 1
- Rotation = 0deg
- Position = (0,0,0)

This ties into the w component. By having 1s on the diagonal and 0s elsewhere, our matrix will tell the GPU to keep x as x, y as y, z as z, and w as 1.

### Perspective Projection Matrix

Perspective lives inside a 16 element array.

The field of view or (fov) is the vertical angle in radians, that the camera can see. Larger means more is visible but objects are smaller.

`f = scaling factor`
`f = 1.0 / tan(fov / 2)`

The aspect ratio is the viewports width over it's height.

`eg. myAspectRatio = 1920 / 1080`

Near and far are the clipping planes. Anything out of bounds will be invisible.

- normalizationFactor

We want to scale the horizon off of the aspect ratio

`e[0] = x-scale`
`x-scale = f / aspect ratio`

We want to scale y by the focal factor

`e[5] = y-scale`
`y-scale = f`

We want to map the z-coordinates in a non-linear depth-buffer. This gives us more depth precision for objects closer to the camera.

`e[10] = (far + near) * normalizationFactor`
`e[14] = (2 * far * near) * normalizationFactor`

We need a projection trick value. We set it as -1 to move the original z-value into the "w" scaling factor.

`e[11] = projection trick value`

Wherever we are is a silly variable name we're rolling with to do some wonky stuff with right and left handed coordinates. Standby there, brains too tired after learning 3D math.

### Direction Vector Formula

`Direction = normalize(B - A)`

Everything we build uses lines

`dx = x_B - x_A`
`dy = y_B - y_A`
`dz = z_B - z_A`

`e.g. Direction = (dx, dy, dz) / sqrt(dx^2 + dy^2 + dz^2)`

### View Matrix (Quaternion-Based)

The view matrix transforms world coordinates into camera space. We use quaternions to compute camera orientation, avoiding gimbal lock and providing smooth rotation.

**Note:** The view matrix structure is a 16-element array (column-major order). The rotation vectors are computed via quaternion rotation rather than cross products from a target point. See [Quaternion Rotation System](#quaternion-rotation-system) for details.

### Orientation Vectors

3D orientation requires three vectors within a 16 element list to define an xyz coordinate system.

`e = element list`

**Matrix Layout:**

- `Right = e[0] to e[2]` (column 0)
- `Up = e[4] to e[6]` (column 1)
- `Forward = e[8] to e[10]` (column 2)

**Computation:**

The basis vectors are obtained by applying the camera's quaternion rotation to the initial basis vectors:

- Initial right: `(1, 0, 0)`
- Initial up: `(0, 1, 0)`
- Initial forward: `(0, 0, -1)` (WebGL looks down -Z)

See [Quaternion Rotation System](#quaternion-rotation-system) for the rotation computation.

### Translation and Final Matrix

We want to store the inverted position of the camera. View matrices move the world in the opposite direction vs moving the camera. We will always be at "the center".

- e[12] to e[14] store the inverted position of the camera.

We'll also want a "w" for the 4x4 matrix mathy stuff (homogenous coordinates)

- e[15] = 1

### Quaternion Rotation System

We use quaternions to represent 3D rotations, avoiding gimbal lock and providing smooth interpolation. A quaternion is a 4-component vector: `{x, y, z, w}` where `(x, y, z)` is the imaginary part and `w` is the real part.

**Quaternion Identity**
The identity quaternion (no rotation) is:

```text
q_identity = {x: 0, y: 0, z: 0, w: 1}
```

**Quaternion Normalization**
Quaternions must be unit quaternions (length = 1) for rotation:

```text
length = sqrt(x² + y² + z² + w²)
q_normalized = {x/length, y/length, z/length, w/length}
```

**Quaternion Multiplication**
Composing two rotations: `q_result = q_a * q_b`

```text
x = a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y
y = a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x
z = a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w
w = a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z
```

**Quaternion from Axis-Angle**
Create a rotation quaternion from an axis vector and angle:

```text
halfAngle = angle / 2
s = sin(halfAngle)
q = normalize({
    x: axis.x * s,
    y: axis.y * s,
    z: axis.z * s,
    w: cos(halfAngle)
})
```

**Quaternion Apply to Vector**
Rotate a 3D vector by a quaternion: `v_rotated = q * v * q^-1`
For unit quaternions, `q^-1` is the conjugate `{-x, -y, -z, w}`.

The formula expands to:

```text
// First multiply: q * v (treating v as quaternion with w=0)
tx = qw * vx + qy * vz - qz * vy
ty = qw * vy + qz * vx - qx * vz
tz = qw * vz + qx * vy - qy * vx
tw = -qx * vx - qy * vy - qz * vz

// Then multiply by conjugate q^-1
result.x = tx * qw + tw * (-qx) + ty * (-qz) - tz * (-qy)
result.y = ty * qw + tw * (-qy) + tz * (-qx) - tx * (-qz)
result.z = tz * qw + tw * (-qz) + tx * (-qy) - ty * (-qx)
```

**FPS Camera: Yaw and Pitch**
For first-person camera control:

- Yaw rotates around world Y-axis (up): `yawQuat = axisAngle({0, 1, 0}, -yaw)`
- Pitch rotates around local X-axis (right): `pitchQuat = axisAngle({1, 0, 0}, pitch)`
- Combined rotation: `rotation = normalize(yawQuat * pitchQuat)`

The multiplication order `yawQuat * pitchQuat` applies pitch first (in local space), then yaw (in world space), ensuring pitch always rotates up/down relative to the camera's current orientation.

**Camera Basis Vectors**
The camera's orientation vectors are computed by rotating the initial basis:

- Initial right: `(1, 0, 0)`
- Initial up: `(0, 1, 0)`
- Initial forward: `(0, 0, -1)` (WebGL looks down -Z)

After quaternion rotation:

```text
right = quaternionApplyToVector(rotation, {1, 0, 0})
up = quaternionApplyToVector(rotation, {0, 1, 0})
forward = quaternionApplyToVector(rotation, {0, 0, -1})
```

These form the rotation part of the view matrix (transposed for column-major storage).

Camera is a system, not math in input code.

### Matrix Multiplication

In order to change position, we'll need to combine two matrices for their product. We'll do so via matrix multiplication.
<https://en.wikipedia.org/wiki/Matrix_multiplication>

`AB = C`
`ViewMatrix = RotationMatrix * TranslationMatrix`
`CameraMatrix = ProjectionMatrix x ViewMatrix`

Row major order is more human readable and easier to manipulate for CPUs. WebGL wants column major order, but it comes with a built in transposition method that doesn't actually work.

- We're forced to use column major order for WebGL
- Console SDKs, Godot, and GLSL all use Column Major
- As needed we transpose the matrices, which will swap from Row / Column major

```text
Given a 3D array, A[i][j][k]
  With dimensions, L x M x N
Given a base memory address, B
Given a weight, W
Given a row index, i
Given a column index, j
Given the total rows, M
Given the total columns, N
Given the lower bound of rows, L_r
Given the lower bound of columns, L_c

Row major skips full row of size N to reach the correct row, then adds the column offest

- Row Major = B + W * [(i - L_r) * N + (j - L_c)]

Column major skips full columns of size M to reach the correct column then adds the row offset

- Column Major = B + W * [(j - L_c) * M + (j - L_r)]
```

## Navigation

- **[Index](INDEX.md)** - Project overview and documentation index
- **[Portability Rules](portability-rules.md)** - All portability enforcement rules and constraints
- **[Architecture](architecture.md)** - High-level architecture, design principles, and platform strategy
- **[Rendering](rendering.md)** - Rendering system, lighting, and day/night cycle
- **[Systems](systems.md)** - World, party, input, collision, and geometry systems
- **[Data Formats](data-formats.md)** - Data format specifications
- **[Project Structure](project-structure.md)** - Code organization and project structure
- **[Porting Strategy](porting-strategy.md)** - Porting approach, FFI constraints, and learning path
