# Camera System (First-Person Focus)

## 9.1 Camera Modes

- First-person (default)
- Optional slightly elevated free camera (toggleable)

## 9.2 Camera Rules

- Yaw + pitch only
- No roll
- Clamped pitch
- Explicit smoothing (no browser magic)
- Camera update =/= render
  - Update simulation via fixed or variable time/steps
  - interpolate the render

## 9.2.1 Technical Jargon and Formulae

### 9.2.2 Identity Matrices

Identity matrices represent the default state of an object in 3D space. We use them as the starting point.

When we "clear" an object's rotation or movement, we set its matrix back to Identity.

When we calculate a complex transformation (e.g., Rotate -> Scale -> Move), we start with an Identity matrix and then multiply our transformation matrices onto it one by one. Rotation will be translated with euler angles, gimble lock is a consideration to move towards quaternions when necessary.

If a shader expects a matrix, but we don't want to apply any transformation to the vertices, we pass the identity matrix

- Scale = 1
- Rotation = 0deg
- Position = (0,0,0)

This ties into the w component. By having 1s on the diagonal and 0s elsewhere, our matrix will tell the GPU to keep x as x, y as y, z as z, and w as 1.

### 9.2.3 Perspective Projection Matrix

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

### 9.2.4 Direction Vector Formula

`Direction = normalize(B - A)`

Everything we build uses lines

`dx = x_B - x_A`
`dy = y_B - y_A`
`dz = z_B - z_A`

`e.g. Direction = (dx, dy, dz) / sqrt(dx^2 + dy^2 + dz^2)`

### 9.2.5 Look-At Matrix (View Matrix)

~~For a 3D camera, we need to define Up/Right to create a proper orientation matrices. We will be using a 16 element list or array for the matrices~~

~~`Forward Axis = normalize(Target - EyeLevel)`~~
~~`Right Axis = normalize(forwardAxis x WorldUp)`~~
~~`Up Axis = forwardAxis x rightAxis`~~

**Note:** This section is obsolete. We now use quaternions to compute camera orientation (see section 9.2.8.1). The view matrix structure remains the same (16-element array), but the rotation vectors are computed via quaternion rotation rather than cross products from a target point.

### 9.2.7 Orientation Vectors

3D orientation requires three vectors within a 16 element list to define an xyz coordinate system

`e = element list`

**Matrix Layout:**

- `Right = e[0] to e[2]` (column 0)
- `Up = e[4] to e[6]` (column 1)
- `Forward = e[8] to e[10]` (column 2)

~~Right is perpendicular to Forward. We calculate it by taking the cross product of the World-Up and Forward vectors. This results in a horizontal vector that points to the right of the camera's perspective.~~

~~Up is the cross product of the Forward and Right vectors. It points up from the top of the camera's eye level.~~

~~Forward is the cross product of the forward and right axes. It's the exact direction the camera is pointing at.~~

~~`x component = (cosYaw * cosPitch)`~~
~~`y component = (sinPitch)`~~
~~`z component = (sinYaw * cosPitch)`~~

**Note:** The Euler angle formulas above are obsolete. We now compute these vectors using quaternion rotation (see section 9.2.8.1). The basis vectors are obtained by applying the camera's quaternion rotation to the initial basis vectors `(1,0,0)`, `(0,1,0)`, and `(0,0,-1)`.

### 9.2.8 Translation and Final Matrix

We want to store the inverted position of the camera. View matrices move the world in the opposite direction vs moving the camera. We will always be at "the center".

- e[12] to e[14] store the inverted position of the camera.

We'll also want a "w" for the 4x4 matrix mathy stuff (homogenous coordinates)

- e[15] = 1

### 9.2.8.1 Quaternion Rotation System

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

### 9.2.9 Matrix Multiplication

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

### 9.2.10 Lighting System (Grayscale)

**Directional Light Direction**
Light direction is a normalized 3D vector pointing from the light source toward the scene.
For a sun in the east casting light westward:

```typescript
lightDirection = normalize({x: -1, y: 0.2, z: 0})
```

**Lambertian Diffuse Lighting**
Diffuse lighting calculation:

```typescript
dotProduct = dot(surfaceNormal, -lightDirection)
diffuse = max(dotProduct, 0.0)
```

**Final Lighting Calculation**
Combines ambient and diffuse lighting:

```typescript
lighting = ambientIntensity + diffuse * (1.0 - ambientIntensity)
finalColor = baseColor * lightColor * lighting
```

Where:

- `ambientIntensity` = varies with time of day (0.2-0.5, dark night to bright day)
- `lightColor` = varies with time of day (cool moon tones to warm sun tones, grayscale)
- `baseColor` = mesh color (grayscale values)

**Day/Night Cycle**
The lighting system implements a deterministic sun/moon cycle:

- **Light Direction**: Rotates around Y axis based on simulation time
  - Sun arc: from horizon (east) → overhead (noon) → horizon (west) → below horizon (night)
  - Moon arc: opposite phase (visible during night)
  - Direction computed as: `{x: cos(angle), y: sin(angle), z: 0}` where angle = `timeOfDay * 2π`

- **Light Color**: Interpolates between cool (night) and warm (day)
  - Uses sinusoidal interpolation for smooth transitions
  - Day: warmer tones (slightly higher RGB values)
  - Night: cooler tones (slightly lower, more neutral RGB values)

- **Ambient Intensity**: Varies from dark (night) to bright (day)
  - Range: 0.2 (night) to 0.5 (day)
  - Smoothly transitions via sinusoidal interpolation

All lighting parameters are computed deterministically from accumulated simulation time, ensuring reproducibility across platforms and game sessions.

**Normal Transformation**
Surface normals must be transformed by the inverse transpose of the model matrix:

```typescript
normalMatrix = transpose(inverse(modelMatrix))
transformedNormal = normalize(normalMatrix * normal)
```

**Normal Calculation from Triangle**
For a triangle with vertices v0, v1, v2:

```typescript
edge1 = v1 - v0
edge2 = v2 - v0
normal = normalize(cross(edge1, edge2))
```

### 9.2.11 Geometric Mesh Generation

**Cube Mesh**
For a cube of size `s`, centered at origin:

```typescript
half = s / 2
vertices = [
    // 6 faces × 2 triangles × 3 vertices = 36 vertices
    // Each face: two triangles forming a square
]
```

**Pyramid Mesh**
For a pyramid of base size `s` and height `h`:

```typescript
half = s / 2
apex = h
// Base: square (2 triangles)
// 4 faces: triangles from base corners to apex
```

**Sphere Mesh (UV Sphere)**
TODO: Revisit this. Can we add performance?
For a sphere of radius `r` with `segments` divisions:

```typescript
for lat = 0 to segments:
    theta = (lat * π) / segments
    for lon = 0 to segments:
        phi = (lon * 2π) / segments
        x = r * cos(phi) * sin(theta)
        y = r * cos(theta)
        z = r * sin(phi) * sin(theta)
```

**Prism Mesh**
For a rectangular prism of width `w`, height `h`, depth `d`:

```typescript
halfW = w / 2
halfH = h / 2
halfD = d / 2
// 6 rectangular faces, each as 2 triangles
```
