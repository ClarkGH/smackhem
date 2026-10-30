import type {
    Renderer, MeshHandle, SkyState, TextureHandle,
} from '../../../services/renderer';
import type { Mat4, Vec3 } from '../../../types/common';
import { identity } from '../../../core/math/mathHelpers';
import DrawList from './drawList';
import { computeLightViewProj } from './shadowMath';
import {
    CLOUD_CYCLE_SECONDS, CLOUD_HIGH_OCTAVE_LAPS, CLOUD_NOISE_PERIOD, CLOUD_OCTAVE_LAPS,
} from '../../../core/lighting/clouds';
import { STAR_CYCLE_SECONDS, STAR_TWINKLE_SLOT_SECONDS } from '../../../core/lighting/stars';

// A number as a GLSL float literal (GLSL won't turn 256 into 256.0 for you)
const glslFloat = (value: number): string => (Number.isInteger(value) ? `${value}.0` : `${value}`);

// Each octave's laps per cloud cycle, as GLSL vec2 constants, from the same tables core uses
const lapsGlsl = (name: string, laps: readonly (readonly [number, number])[]): string => laps
    .map(([x, z], i) => `const vec2 ${name}_${i} = vec2(${glslFloat(x)}, ${glslFloat(z)});`)
    .join('\n            ');
const CLOUD_LAPS_GLSL = `${lapsGlsl('CLOUD_LAPS', CLOUD_OCTAVE_LAPS)}
            ${lapsGlsl('CLOUD_HIGH_LAPS', CLOUD_HIGH_OCTAVE_LAPS)}`;

// Shadow map: SHADOW_MAP_SIZE texels across SHADOW_HALF_EXTENT * 2 world units around the camera
// (~4 cm per texel), and SHADOW_DEPTH_RADIUS units either side along the light
const SHADOW_MAP_SIZE = 2048;
const SHADOW_HALF_EXTENT = 40;
const SHADOW_DEPTH_RADIUS = 100;

// The shadow map lives on its own texture unit, sprites use unit 0
const SHADOW_TEXTURE_UNIT = 1;

// The sky's colors and directions setSky copies each frame, listed once rather than every frame (M-1)
const SKY_VEC3_FIELDS = ['horizon', 'upper', 'zenith', 'glow', 'sunDirection', 'cloudLight', 'cloudMid', 'cloudShadow'] as const;

// Where a billboard point sits on the card it casts from: upright, facing the shadow light.
// Shared by the billboard's shadow lookup (receiving) and the billboard caster (depth pass), so the
// two always agree. Assumes an upright billboard model: column 0 = right * size, column 3 = anchor.
const LIGHT_CARD_GLSL = `
            // local: the quad vertex's x and z (-0.5..0.5). clearance: distance toward the light.
            // matchCameraRight: point the card's right the same way as the visible card's (model column 0).
            // The shadow lookup needs it: looking toward the light the two "rights" are opposite, and the
            // lookup would read the card mirrored, so shadows would slide across the sprite backwards.
            // The caster leaves it off, so a sprite's own shadow never flips as the camera moves.
            vec3 lightCardPosition(mat4 model, vec2 local, vec3 shadowDirection, vec3 cameraFacing, float clearance, bool matchCameraRight) {
                vec3 toLight = vec3(shadowDirection.x, 0.0, shadowDirection.z);
                float toLightLength = length(toLight);
                // Light straight overhead: every facing casts the same, keep the camera-facing one
                vec3 facing = toLightLength > 0.01 ? toLight / toLightLength : normalize(cameraFacing);
                vec3 right = vec3(-facing.z, 0.0, facing.x);
                if (matchCameraRight && dot(right, model[0].xyz) < 0.0) right = -right;
                float size = length(model[0].xyz);
                return model[3].xyz
                    + right * (local.x * size)
                    + vec3(0.0, local.y * size, 0.0)
                    + facing * clearance;
            }
`;

// The sky's color in a view direction. Used by the sky pass, and later by fog so distant objects
// match the sky behind them. Expects u_skyHorizon, u_skyUpper, u_skyZenith, u_skyGlow, u_sunDirection.
const SKY_COLOR_GLSL = `
            // Height (view direction y) by which the horizon color has become the upper color
            const float HORIZON_BAND = 0.25;
            // Halo: tight around the sun itself, so it rises and sets with the sun
            const float HALO_POWER = 24.0;
            // Band: wide warmth along the horizon on the sun's side of the sky (by compass direction)
            const float BAND_POWER = 3.0;
            const float BAND_HEIGHT = 0.35;
            const float BAND_STRENGTH = 0.6;

            vec3 skyColor(vec3 viewDir) {
                float height = viewDir.y;
                // Below the horizon stays horizon color (seen past the floor's edge)
                vec3 low = mix(u_skyHorizon, u_skyUpper, smoothstep(0.0, HORIZON_BAND, height));
                vec3 color = mix(low, u_skyZenith, smoothstep(HORIZON_BAND, 1.0, height));

                // Glow, in two parts. The sun may be below the horizon (afterglow).
                vec3 sunDir = normalize(u_sunDirection);
                float halo = pow(max(dot(viewDir, sunDir), 0.0), HALO_POWER);
                // The band compares compass directions only, so it hugs the horizon whatever the
                // sun's height; it fades as the palette's glow color fades after dawn and sunset.
                // Straight up or down there's no compass direction, so no band.
                float band = 0.0;
                if (length(viewDir.xz) > 0.001 && length(sunDir.xz) > 0.001) {
                    float sameSide = max(dot(normalize(viewDir.xz), normalize(sunDir.xz)), 0.0);
                    band = pow(sameSide, BAND_POWER) * (1.0 - smoothstep(0.0, BAND_HEIGHT, abs(height)));
                }
                float amount = clamp(halo + band * BAND_STRENGTH, 0.0, 1.0);

                // Screen blend: tints toward the glow color but can't pass full brightness,
                // so no flat white patch. Black glow (day, night) still adds nothing.
                return color + u_skyGlow * amount * (1.0 - color);
            }
`;

// Fog, shared by the mesh and billboard shaders so both fade the same way. Needs SKY_COLOR_GLSL
// before it, and u_eye (the camera's position).
const FOG_GLSL = `
            // Fog starts at FOG_START and is complete at FOG_END (world units from the camera),
            // before the floor ends (~60 units out), so the world melts into the sky behind it
            const float FOG_START = 25.0;
            const float FOG_END = 55.0;

            // Distant surfaces take the sky's color in their direction, glow included
            vec3 applyFog(vec3 color, vec3 worldPos) {
                vec3 toPixel = worldPos - u_eye;
                float pixelDistance = length(toPixel);
                float fog = smoothstep(FOG_START, FOG_END, pixelDistance);
                return mix(color, skyColor(toPixel / max(pixelDistance, 0.0001)), fog);
            }
`;

// Shared by the mesh and billboard fragment shaders, which declare u_shadowMap and u_shadowStrength
const SHADOW_SAMPLING_GLSL = `
            const float SHADOW_TEXEL = 1.0 / ${SHADOW_MAP_SIZE}.0;

            // Caps the receiver-plane slope (depth per map width) so grazing surfaces don't blow it up.
            // 4.0 is a surface about 84 degrees from facing the light (tan 10), with the map 80 wide and 200 deep.
            const float MAX_DEPTH_SLOPE = 4.0;

            // lightClip: a position in the shadow caster's clip space.
            // constantBias: depth allowance on top of the slope term. slopeBiasScale: debug multiplier.
            // 1.0 fully lit by the caster, down to 0.0 in full shadow
            float sampleShadow(vec3 lightClip, float constantBias, float slopeBiasScale) {
                if (u_shadowStrength <= 0.0) return 1.0;

                vec3 p = lightClip * 0.5 + 0.5;

                // Receiver-plane depth bias: how this surface's depth changes across the map, from
                // how p changes between neighbouring screen pixels. Each tap below then compares
                // against the surface's own depth at the tap, not at the centre, so the outer taps of
                // a sloped floor don't land "behind" the floor itself. Must run before any branch
                // that differs between neighbouring pixels, or the derivatives are undefined.
                vec3 dx = dFdx(p);
                vec3 dy = dFdy(p);
                float det = dx.x * dy.y - dx.y * dy.x;
                vec2 slope = abs(det) > 1e-12
                    ? vec2(dy.y * dx.z - dx.y * dy.z, dx.x * dy.z - dy.x * dx.z) / det
                    : vec2(0.0);
                slope = clamp(slope, -MAX_DEPTH_SLOPE, MAX_DEPTH_SLOPE);

                // Outside the map is lit
                float edge = min(min(p.x, 1.0 - p.x), min(p.y, 1.0 - p.y));
                if (edge <= 0.0 || p.z >= 1.0) return 1.0;

                // LINEAR compare reads stored depths up to a texel away from the tap: allow one
                // texel's worth of slope for that, which the plane can't account for
                float bias = constantBias + dot(abs(slope), vec2(SHADOW_TEXEL)) * slopeBiasScale;

                // 3x3 taps, each already a 2x2 compare with LINEAR filtering: soft edges
                float lit = 0.0;
                for (int x = -1; x <= 1; x++) {
                    for (int y = -1; y <= 1; y++) {
                        vec2 offset = vec2(float(x), float(y)) * SHADOW_TEXEL;
                        float tapDepth = p.z + dot(slope, offset) - bias;
                        lit += texture(u_shadowMap, vec3(p.xy + offset, tapDepth));
                    }
                }
                lit /= 9.0;

                // Fade out over the outer 10% of the map, rather than a hard line
                return mix(1.0, lit, u_shadowStrength * smoothstep(0.0, 0.1, edge));
            }
`;

interface WebGLMesh {
    vao: WebGLVertexArrayObject;
    vertexCount: number;
}

interface WebGLTextureData {
    texture: WebGLTexture;
    width: number;
    height: number;
}

export default class WebGLRenderer implements Renderer {
    private gl: WebGL2RenderingContext;

    private canvas: HTMLCanvasElement;

    private program: WebGLProgram | null = null;

    private meshes: Map<string, WebGLMesh> = new Map();

    private wireframe: boolean = false;

    private meshCache = new Map<string, MeshHandle>();

    private textures = new Map<string, WebGLTextureData>();

    private textureCache = new Map<string, TextureHandle>();

    private textureProgram: WebGLProgram | null = null;

    private quadVAO: WebGLVertexArrayObject | null = null;

    private screenQuadProgram: WebGLProgram | null = null;

    private screenQuadVAO: WebGLVertexArrayObject | null = null;

    private readonly sunDirection: Vec3 = { x: -1, y: 0, z: 0 };

    private readonly sunColor: Vec3 = { x: 0, y: 0, z: 0 };

    private readonly moonDirection: Vec3 = { x: 1, y: 0, z: 0 };

    private readonly moonColor: Vec3 = { x: 0, y: 0, z: 0 };

    private ambientIntensity: number = 0.3;

    // Copied in by setSky before beginFrame. Starts as the old flat grey, so a core that
    // never sets a sky looks the same as before.
    private readonly sky: SkyState = {
        horizon: { x: 160 / 255, y: 160 / 255, z: 160 / 255 },
        upper: { x: 160 / 255, y: 160 / 255, z: 160 / 255 },
        zenith: { x: 160 / 255, y: 160 / 255, z: 160 / 255 },
        glow: { x: 0, y: 0, z: 0 },
        sunDirection: { x: 0, y: 1, z: 0 },
        stars: 0,
        cloudLight: { x: 1, y: 1, z: 1 },
        cloudMid: { x: 0.8, y: 0.8, z: 0.8 },
        cloudShadow: { x: 0.6, y: 0.6, z: 0.6 },
        cloudTime: 0,
        starTime: 0,
        moonDirection: { x: 0, y: -1, z: 0 },
        sunDisc: { x: 0, y: 0, z: 0 },
        moonDisc: { x: 0, y: 0, z: 0 },
        sunVisibility: 0,
        moonVisibility: 0,
    };

    private skyProgram: WebGLProgram | null = null;

    // Holds no attributes: the sky triangle's corners come from gl_VertexID
    private skyVAO: WebGLVertexArrayObject | null = null;

    private skyLocs: {
        viewProj: WebGLUniformLocation | null;
        horizon: WebGLUniformLocation | null;
        upper: WebGLUniformLocation | null;
        zenith: WebGLUniformLocation | null;
        glow: WebGLUniformLocation | null;
        sunDirection: WebGLUniformLocation | null;
        stars: WebGLUniformLocation | null;
        eye: WebGLUniformLocation | null;
        cloudTime: WebGLUniformLocation | null;
        starTime: WebGLUniformLocation | null;
        moonDirection: WebGLUniformLocation | null;
        sunDisc: WebGLUniformLocation | null;
        moonDisc: WebGLUniformLocation | null;
        sunVisibility: WebGLUniformLocation | null;
        moonVisibility: WebGLUniformLocation | null;
        cloudLight: WebGLUniformLocation | null;
        cloudMid: WebGLUniformLocation | null;
        cloudShadow: WebGLUniformLocation | null;
    } = {
            viewProj: null,
            horizon: null,
            upper: null,
            zenith: null,
            glow: null,
            sunDirection: null,
            stars: null,
            eye: null,
            cloudTime: null,
            starTime: null,
            moonDirection: null,
            sunDisc: null,
            moonDisc: null,
            sunVisibility: null,
            moonVisibility: null,
            cloudLight: null,
            cloudMid: null,
            cloudShadow: null,
        };

    // Copied in by setViewPosition once per frame, for fog distances
    private readonly eye: Vec3 = { x: 0, y: 0, z: 0 };

    // Copied in by setViewProjection once per frame, shared by every world draw
    private viewProj: Mat4 = identity();

    // Draws are recorded during the frame and replayed in endFrame, so later
    // passes (shadow depth) can walk the same list. Sized above a full load radius of chunks
    private readonly drawList = new DrawList(1024);

    // Copied in by setShadowCaster once per frame. Strength 0 skips the depth pass.
    private readonly shadowDirection: Vec3 = { x: 0, y: 1, z: 0 };

    private shadowStrength = 0;

    // Debug multiplier on the mesh shader's normal offset and depth bias
    private shadowBiasScale = 1;

    private readonly shadowFocus: Vec3 = { x: 0, y: 0, z: 0 };

    private readonly lightViewProj: Mat4 = identity();

    private shadowProgram: WebGLProgram | null = null;

    private shadowModelLoc: WebGLUniformLocation | null = null;

    private shadowLightViewProjLoc: WebGLUniformLocation | null = null;

    // Billboards cast from a light-facing card, with their transparent pixels cut out
    private shadowBillboardProgram: WebGLProgram | null = null;

    private shadowBillboardLocs: {
        lightViewProj: WebGLUniformLocation | null;
        model: WebGLUniformLocation | null;
        shadowDirection: WebGLUniformLocation | null;
        normal: WebGLUniformLocation | null;
        texture: WebGLUniformLocation | null;
    } = {
            lightViewProj: null, model: null, shadowDirection: null, normal: null, texture: null,
        };

    private shadowTexture: WebGLTexture | null = null;

    private shadowFramebuffer: WebGLFramebuffer | null = null;

    private uniformLocations: {
        color: WebGLUniformLocation | null;
        viewProj: WebGLUniformLocation | null;
        model: WebGLUniformLocation | null;
        normalMatrix: WebGLUniformLocation | null;
        sunDirection: WebGLUniformLocation | null;
        sunColor: WebGLUniformLocation | null;
        moonDirection: WebGLUniformLocation | null;
        moonColor: WebGLUniformLocation | null;
        ambientIntensity: WebGLUniformLocation | null;
        isLightSource: WebGLUniformLocation | null;
        lightViewProj: WebGLUniformLocation | null;
        shadowStrength: WebGLUniformLocation | null;
        shadowBiasScale: WebGLUniformLocation | null;
        skyHorizon: WebGLUniformLocation | null;
        skyUpper: WebGLUniformLocation | null;
        skyZenith: WebGLUniformLocation | null;
        skyGlow: WebGLUniformLocation | null;
        eye: WebGLUniformLocation | null;
    } = {
            color: null,
            viewProj: null,
            model: null,
            normalMatrix: null,
            sunDirection: null,
            sunColor: null,
            moonDirection: null,
            moonColor: null,
            ambientIntensity: null,
            isLightSource: null,
            lightViewProj: null,
            shadowStrength: null,
            shadowBiasScale: null,
            skyHorizon: null,
            skyUpper: null,
            skyZenith: null,
            skyGlow: null,
            eye: null,
        };

    private identityMatrix: Mat4;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        const gl = canvas.getContext('webgl2');
        if (!gl) {
            throw new Error('WebGL2 not supported');
        }

        this.gl = gl;
        this.gl.clearColor(160 / 255, 160 / 255, 160 / 255, 1);

        // Set viewport
        this.gl.viewport(0, 0, canvas.width, canvas.height);

        // Enable depth testing
        this.gl.enable(this.gl.DEPTH_TEST);
        this.gl.depthFunc(this.gl.LEQUAL);

        // Pre-allocate identity matrix (reused every frame)
        this.identityMatrix = identity();

        this.initShaders();
        this.initShadowMap();
        this.initTextureShaders();
        this.createQuadMesh();
        this.initScreenQuadShaders();
        this.initSkyShaders();
    }

    private initShaders(): void {
        // Fixed attribute locations, so the shadow program can draw the same VAOs
        const vertexShaderSource = `#version 300 es
            layout(location = 0) in vec3 a_position;
            layout(location = 1) in vec3 a_normal;
            
            uniform mat4 u_viewProj;
            uniform mat4 u_model;
            uniform mat4 u_normalMatrix;
            
            out vec3 v_normal;
            out vec3 v_worldPos;
            
            void main() {
                vec4 worldPos = u_model * vec4(a_position, 1.0);
                v_worldPos = worldPos.xyz;
                v_normal = normalize((u_normalMatrix * vec4(a_normal, 0.0)).xyz);
                gl_Position = u_viewProj * worldPos;
            }
        `;

        // highp: world positions reach ~100 units, which mediump can't hold to shadow-texel precision
        const fragmentShaderSource = `#version 300 es
            precision highp float;
            
            uniform vec3 u_color;
            uniform vec3 u_sunDirection;
            uniform vec3 u_sunColor;
            uniform vec3 u_moonDirection;
            uniform vec3 u_moonColor;
            uniform float u_ambientIntensity;
            uniform float u_isLightSource; // 1.0 if object is self-illuminated, 0.0 otherwise
            uniform mat4 u_lightViewProj;
            uniform highp sampler2DShadow u_shadowMap;
            uniform float u_shadowStrength;
            uniform float u_shadowBiasScale;
            // Fog: the sky's colors and the camera's position. skyColor() also reads u_sunDirection,
            // declared above for sunlight: the same value, the sun's own direction.
            uniform vec3 u_skyHorizon;
            uniform vec3 u_skyUpper;
            uniform vec3 u_skyZenith;
            uniform vec3 u_skyGlow;
            uniform vec3 u_eye;
            
            in vec3 v_normal;
            in vec3 v_worldPos;
            
            out vec4 fragColor;
${SHADOW_SAMPLING_GLSL}
${SKY_COLOR_GLSL}
${FOG_GLSL}
            // Lifts the lookup off the surface along its normal, about a texel, so a surface
            // doesn't shadow itself in speckles ("acne"). Too much and shadows detach from their base.
            const float NORMAL_OFFSET = 0.05;
            // Depth allowance on top of sampleShadow's slope term (depth 0.005 = 1 world unit, so ~1 cm)
            const float CONSTANT_BIAS = 0.00005;

            float shadowFactor(vec3 normal) {
                vec4 lightPos = u_lightViewProj * vec4(v_worldPos + normal * NORMAL_OFFSET * u_shadowBiasScale, 1.0);
                return sampleShadow(lightPos.xyz, CONSTANT_BIAS * u_shadowBiasScale, u_shadowBiasScale);
            }
            
            void main() {
                if (u_isLightSource > 0.5) {
                    fragColor = vec4(u_color, 1.0);
                    return;
                }

                // Both directions point FROM the surface TOWARD the respective body.
                // u_sunColor / u_moonColor already have that body's own visibility
                // (elevation-based fade) baked in on the CPU side, so a body below
                // the horizon contributes (0,0,0) here with no branching needed.
                vec3 sunDir = normalize(u_sunDirection);
                vec3 moonDir = normalize(u_moonDirection);
                
                float sunDiff = max(dot(v_normal, sunDir), 0.0);
                float moonDiff = max(dot(v_normal, moonDir), 0.0);
                
                // Shadow dims both bodies' diffuse. Only one casts, and whenever the other is
                // bright enough to matter the shadow strength is near zero (the dawn/dusk crossfade).
                // Ambient is never shadowed.
                vec3 diffuse = (sunDiff * u_sunColor + moonDiff * u_moonColor) * shadowFactor(v_normal);
                vec3 finalColor = u_color * (u_ambientIntensity + diffuse);

                // Light sources returned above, so the sun and moon are never fogged
                finalColor = applyFog(finalColor, v_worldPos);
                
                fragColor = vec4(finalColor, 1.0);
            }
        `;

        const vertexShader = this.compileShader(this.gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = this.compileShader(this.gl.FRAGMENT_SHADER, fragmentShaderSource);

        if (!vertexShader || !fragmentShader) {
            throw new Error('Failed to compile shaders');
        }

        this.program = this.createProgram(vertexShader, fragmentShader);
        if (!this.program) {
            throw new Error('Failed to create shader program');
        }

        // Cache uniform locations (lookup once, reuse every frame)
        this.uniformLocations = {
            color: this.gl.getUniformLocation(this.program, 'u_color'),
            viewProj: this.gl.getUniformLocation(this.program, 'u_viewProj'),
            model: this.gl.getUniformLocation(this.program, 'u_model'),
            normalMatrix: this.gl.getUniformLocation(this.program, 'u_normalMatrix'),
            sunDirection: this.gl.getUniformLocation(this.program, 'u_sunDirection'),
            sunColor: this.gl.getUniformLocation(this.program, 'u_sunColor'),
            moonDirection: this.gl.getUniformLocation(this.program, 'u_moonDirection'),
            moonColor: this.gl.getUniformLocation(this.program, 'u_moonColor'),
            ambientIntensity: this.gl.getUniformLocation(this.program, 'u_ambientIntensity'),
            isLightSource: this.gl.getUniformLocation(this.program, 'u_isLightSource'),
            lightViewProj: this.gl.getUniformLocation(this.program, 'u_lightViewProj'),
            shadowStrength: this.gl.getUniformLocation(this.program, 'u_shadowStrength'),
            shadowBiasScale: this.gl.getUniformLocation(this.program, 'u_shadowBiasScale'),
            skyHorizon: this.gl.getUniformLocation(this.program, 'u_skyHorizon'),
            skyUpper: this.gl.getUniformLocation(this.program, 'u_skyUpper'),
            skyZenith: this.gl.getUniformLocation(this.program, 'u_skyZenith'),
            skyGlow: this.gl.getUniformLocation(this.program, 'u_skyGlow'),
            eye: this.gl.getUniformLocation(this.program, 'u_eye'),
        };

        // The sampler's unit never changes, set once
        this.gl.useProgram(this.program);
        this.gl.uniform1i(this.gl.getUniformLocation(this.program, 'u_shadowMap'), SHADOW_TEXTURE_UNIT);
    }

    // Depth-only program and the depth texture it renders into, seen from the shadow caster
    private initShadowMap(): void {
        const { gl } = this;

        const vertexShaderSource = `#version 300 es
            layout(location = 0) in vec3 a_position;

            uniform mat4 u_lightViewProj;
            uniform mat4 u_model;

            void main() {
                gl_Position = u_lightViewProj * u_model * vec4(a_position, 1.0);
            }
        `;

        // No colour output, only depth is written
        const fragmentShaderSource = `#version 300 es
            precision mediump float;
            void main() {}
        `;

        const vertexShader = this.compileShader(gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
        if (!vertexShader || !fragmentShader) {
            throw new Error('Failed to compile shadow shaders');
        }
        this.shadowProgram = this.createProgram(vertexShader, fragmentShader);
        if (!this.shadowProgram) {
            throw new Error('Failed to create shadow shader program');
        }
        this.shadowModelLoc = gl.getUniformLocation(this.shadowProgram, 'u_model');
        this.shadowLightViewProjLoc = gl.getUniformLocation(this.shadowProgram, 'u_lightViewProj');

        // Compare mode: sampling returns "how lit" (0..1) instead of a depth, and LINEAR
        // filtering blends the 4 nearest compares for free
        const texture = gl.createTexture();
        if (!texture) throw new Error('Failed to create shadow map texture');
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
        gl.bindTexture(gl.TEXTURE_2D, null);

        const framebuffer = gl.createFramebuffer();
        if (!framebuffer) throw new Error('Failed to create shadow framebuffer');
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, texture, 0);
        gl.drawBuffers([gl.NONE]);
        gl.readBuffer(gl.NONE);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
            throw new Error('Shadow framebuffer incomplete');
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        this.shadowTexture = texture;
        this.shadowFramebuffer = framebuffer;

        this.initShadowBillboardProgram();
    }

    private initShadowBillboardProgram(): void {
        const { gl } = this;

        // Same attribute locations as the billboard program, so it can draw the same quad VAO
        const vertexShaderSource = `#version 300 es
            layout(location = 0) in vec3 a_position;
            layout(location = 1) in vec2 a_texCoord;

            uniform mat4 u_lightViewProj;
            uniform mat4 u_model;
            uniform vec3 u_shadowDirection;
            uniform vec3 u_normal;

            out vec2 v_texCoord;
${LIGHT_CARD_GLSL}
            void main() {
                vec3 onLightCard = lightCardPosition(u_model, a_position.xz, u_shadowDirection, u_normal, 0.0, false);
                v_texCoord = a_texCoord;
                gl_Position = u_lightViewProj * vec4(onLightCard, 1.0);
            }
        `;

        // Only the sprite's shape casts: see-through pixels write no depth
        const fragmentShaderSource = `#version 300 es
            precision mediump float;

            uniform sampler2D u_texture;

            in vec2 v_texCoord;

            void main() {
                if (texture(u_texture, v_texCoord).a < 0.5) discard;
            }
        `;

        const vertexShader = this.compileShader(gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
        if (!vertexShader || !fragmentShader) {
            throw new Error('Failed to compile billboard shadow shaders');
        }
        const program = this.createProgram(vertexShader, fragmentShader);
        if (!program) {
            throw new Error('Failed to create billboard shadow shader program');
        }
        this.shadowBillboardProgram = program;
        this.shadowBillboardLocs = {
            lightViewProj: gl.getUniformLocation(program, 'u_lightViewProj'),
            model: gl.getUniformLocation(program, 'u_model'),
            shadowDirection: gl.getUniformLocation(program, 'u_shadowDirection'),
            normal: gl.getUniformLocation(program, 'u_normal'),
            texture: gl.getUniformLocation(program, 'u_texture'),
        };
    }

    // Every recorded lit mesh, depth only, from the shadow caster. Light sources don't cast.
    private renderShadowMap(): void {
        const { gl } = this;
        if (!this.shadowProgram || !this.shadowFramebuffer) return;

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFramebuffer);
        gl.viewport(0, 0, SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
        gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.useProgram(this.shadowProgram);
        gl.uniformMatrix4fv(this.shadowLightViewProjLoc, false, this.lightViewProj.elements);

        const list = this.drawList;
        for (let i = 0; i < list.size(); i += 1) {
            const cmd = list.get(i);
            if (cmd.kind === 'mesh' && !cmd.isLightSource) {
                const webglMesh = this.meshes.get(cmd.id);
                if (webglMesh) {
                    gl.bindVertexArray(webglMesh.vao);
                    gl.uniformMatrix4fv(this.shadowModelLoc, false, cmd.matrix.elements);
                    gl.drawArrays(gl.TRIANGLES, 0, webglMesh.vertexCount);
                }
            }
        }

        this.renderBillboardShadows();

        gl.bindVertexArray(null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }

    // Second half of the depth pass, own program so it isn't switched per draw
    private renderBillboardShadows(): void {
        const { gl } = this;
        const program = this.shadowBillboardProgram;
        if (!program || !this.quadVAO) return;
        const locs = this.shadowBillboardLocs;

        gl.useProgram(program);
        gl.bindVertexArray(this.quadVAO);
        gl.uniformMatrix4fv(locs.lightViewProj, false, this.lightViewProj.elements);
        gl.uniform3f(locs.shadowDirection, this.shadowDirection.x, this.shadowDirection.y, this.shadowDirection.z);
        gl.uniform1i(locs.texture, 0);
        gl.activeTexture(gl.TEXTURE0);

        const list = this.drawList;
        for (let i = 0; i < list.size(); i += 1) {
            const cmd = list.get(i);
            if (cmd.kind === 'texturedQuad') {
                const webglTexture = this.textures.get(cmd.id);
                if (webglTexture) {
                    gl.bindTexture(gl.TEXTURE_2D, webglTexture.texture);
                    gl.uniformMatrix4fv(locs.model, false, cmd.matrix.elements);
                    gl.uniform3f(locs.normal, cmd.normal.x, cmd.normal.y, cmd.normal.z);
                    gl.drawArrays(gl.TRIANGLES, 0, 6);
                }
            }
        }

        gl.bindTexture(gl.TEXTURE_2D, null);
    }

    private compileShader(type: number, source: string): WebGLShader | null {
        const shader = this.gl.createShader(type);
        if (!shader) return null;

        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);

        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            const info = this.gl.getShaderInfoLog(shader);
            this.gl.deleteShader(shader);
            console.error('Shader compilation error:', info);
            return null;
        }

        return shader;
    }

    private createProgram(
        vertexShader: WebGLShader,
        fragmentShader: WebGLShader,
    ): WebGLProgram | null {
        const program = this.gl.createProgram();
        if (!program) return null;

        this.gl.attachShader(program, vertexShader);
        this.gl.attachShader(program, fragmentShader);
        this.gl.linkProgram(program);

        if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
            const info = this.gl.getProgramInfoLog(program);
            this.gl.deleteProgram(program);
            console.error('Program linking error:', info);
            return null;
        }

        return program;
    }

    private calculateNormals(vertices: Float32Array): Float32Array {
        const normals = new Float32Array(vertices.length);

        for (let i = 0; i < vertices.length; i += 9) {
            // Get triangle vertices
            const v0 = { x: vertices[i], y: vertices[i + 1], z: vertices[i + 2] };
            const v1 = { x: vertices[i + 3], y: vertices[i + 4], z: vertices[i + 5] };
            const v2 = { x: vertices[i + 6], y: vertices[i + 7], z: vertices[i + 8] };

            // Calculate edge vectors
            const edge1 = {
                x: v1.x - v0.x, y: v1.y - v0.y, z: v1.z - v0.z,
            };
            const edge2 = {
                x: v2.x - v0.x, y: v2.y - v0.y, z: v2.z - v0.z,
            };

            // Cross product for normal
            const normal = {
                x: edge1.y * edge2.z - edge1.z * edge2.y,
                y: edge1.z * edge2.x - edge1.x * edge2.z,
                z: edge1.x * edge2.y - edge1.y * edge2.x,
            };

            // Normalize
            const len = Math.sqrt(normal.x ** 2 + normal.y ** 2 + normal.z ** 2);
            if (len > 0.0001) {
                normal.x /= len;
                normal.y /= len;
                normal.z /= len;
            }

            // Apply to all three vertices of triangle
            for (let j = 0; j < 3; j += 1) {
                const idx = i + j * 3;
                normals[idx] = normal.x;
                normals[idx + 1] = normal.y;
                normals[idx + 2] = normal.z;
            }
        }

        return normals;
    }

    private createMesh(vertices: Float32Array, normals?: Float32Array): MeshHandle {
        const { gl } = this;

        const vao = gl.createVertexArray();
        if (!vao) throw new Error('Failed to create VAO');

        gl.bindVertexArray(vao);

        // Position buffer
        const vbo = gl.createBuffer();
        if (!vbo) throw new Error('Failed to create VBO');
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

        const positionLoc = gl.getAttribLocation(this.program!, 'a_position');
        gl.enableVertexAttribArray(positionLoc);
        gl.vertexAttribPointer(positionLoc, 3, gl.FLOAT, false, 0, 0);

        // Normal buffer (calculate if not provided)
        const calculatedNormals = normals || this.calculateNormals(vertices);
        const normalVbo = gl.createBuffer();
        if (!normalVbo) throw new Error('Failed to create normal VBO');
        gl.bindBuffer(gl.ARRAY_BUFFER, normalVbo);
        gl.bufferData(gl.ARRAY_BUFFER, calculatedNormals, gl.STATIC_DRAW);

        const normalLoc = gl.getAttribLocation(this.program!, 'a_normal');
        gl.enableVertexAttribArray(normalLoc);
        gl.vertexAttribPointer(normalLoc, 3, gl.FLOAT, false, 0, 0);

        gl.bindVertexArray(null);

        const id = crypto.randomUUID();

        this.meshes.set(id, {
            vao,
            vertexCount: vertices.length / 3,
        });

        return { id };
    }

    public createPlaneMesh(size: number): MeshHandle {
        const key = `plane_${size}`;
        if (this.meshCache.has(key)) {
            return this.meshCache.get(key)!;
        }

        const h = size / 2;

        // Two triangles, XZ plane, Y = 0
        const vertices = new Float32Array([
            -h, 0, -h,
            h, 0, -h,
            h, 0, h,

            -h, 0, -h,
            h, 0, h,
            -h, 0, h,
        ]);

        // Negate normals for plane mesh - calculated normals point down, but we want them pointing up for floor
        const verticesArray = new Float32Array(vertices);
        const calculatedNormals = this.calculateNormals(verticesArray);
        for (let i = 0; i < calculatedNormals.length; i += 3) {
            calculatedNormals[i] *= -1;
            calculatedNormals[i + 1] *= -1;
            calculatedNormals[i + 2] *= -1;
        }

        const mesh = this.createMesh(vertices, calculatedNormals);
        this.meshCache.set(key, mesh);

        return mesh;
    }

    public createCubeMesh(size: number): MeshHandle {
        const key = `cube_${size}`;

        if (this.meshCache.has(key)) {
            return this.meshCache.get(key)!;
        }

        const h = size / 2;

        // 6 faces × 2 triangles × 3 vertices
        const vertices = new Float32Array([
            // Front
            -h, -h, h, h, -h, h, h, h, h,
            -h, -h, h, h, h, h, -h, h, h,

            // Back
            -h, -h, -h, -h, h, -h, h, h, -h,
            -h, -h, -h, h, h, -h, h, -h, -h,

            // Left
            -h, -h, -h, -h, -h, h, -h, h, h,
            -h, -h, -h, -h, h, h, -h, h, -h,

            // Right
            h, -h, -h, h, h, -h, h, h, h,
            h, -h, -h, h, h, h, h, -h, h,

            // Top
            -h, h, -h, -h, h, h, h, h, h,
            -h, h, -h, h, h, h, h, h, -h,

            // Bottom
            -h, -h, -h, h, -h, -h, h, -h, h,
            -h, -h, -h, h, -h, h, -h, -h, h,
        ]);

        const mesh = this.createMesh(vertices);

        this.meshCache.set(key, mesh);

        return mesh;
    }

    public createPyramidMesh(size: number): MeshHandle {
        const key = `pyramid_${size}`;
        if (this.meshCache.has(key)) {
            return this.meshCache.get(key)!;
        }

        const h = size / 2;
        const apex = size; // Height of pyramid

        // Square base + 4 triangular faces
        const vertices = new Float32Array([
            // Base (square, two triangles)
            -h, 0, -h, h, 0, -h, h, 0, h,
            -h, 0, -h, h, 0, h, -h, 0, h,

            // Front face
            -h, 0, h, h, 0, h, 0, apex, 0,

            // Back face
            h, 0, -h, -h, 0, -h, 0, apex, 0,

            // Left face
            -h, 0, -h, -h, 0, h, 0, apex, 0,

            // Right face
            h, 0, h, h, 0, -h, 0, apex, 0,
        ]);

        const mesh = this.createMesh(vertices);
        this.meshCache.set(key, mesh);
        return mesh;
    }

    public createPrismMesh(width: number, height: number, depth: number): MeshHandle {
        const key = `prism_${width}_${height}_${depth}`;
        if (this.meshCache.has(key)) {
            return this.meshCache.get(key)!;
        }

        const w = width / 2;
        const h = height / 2;
        const d = depth / 2;

        // Rectangular prism (6 faces, 12 triangles)
        const vertices = new Float32Array([
            // Front
            -w, -h, d, w, -h, d, w, h, d,
            -w, -h, d, w, h, d, -w, h, d,

            // Back
            w, -h, -d, -w, -h, -d, -w, h, -d,
            w, -h, -d, -w, h, -d, w, h, -d,

            // Left
            -w, -h, -d, -w, -h, d, -w, h, d,
            -w, -h, -d, -w, h, d, -w, h, -d,

            // Right
            w, -h, d, w, -h, -d, w, h, -d,
            w, -h, d, w, h, -d, w, h, d,

            // Top
            -w, h, d, w, h, d, w, h, -d,
            -w, h, d, w, h, -d, -w, h, -d,

            // Bottom
            -w, -h, -d, w, -h, -d, w, -h, d,
            -w, -h, -d, w, -h, d, -w, -h, d,
        ]);

        const mesh = this.createMesh(vertices);
        this.meshCache.set(key, mesh);
        return mesh;
    }

    public createSphereMesh(radius: number, segments: number = 16): MeshHandle {
        const key = `sphere_${radius}_${segments}`;
        if (this.meshCache.has(key)) {
            return this.meshCache.get(key)!;
        }

        const vertices: number[] = [];

        for (let lat = 0; lat <= segments; lat += 1) {
            const theta = (lat * Math.PI) / segments;
            const sinTheta = Math.sin(theta);
            const cosTheta = Math.cos(theta);

            for (let lon = 0; lon <= segments; lon += 1) {
                const phi = (lon * 2 * Math.PI) / segments;
                const sinPhi = Math.sin(phi);
                const cosPhi = Math.cos(phi);

                const x = cosPhi * sinTheta;
                const y = cosTheta;
                const z = sinPhi * sinTheta;

                vertices.push(radius * x, radius * y, radius * z);
            }
        }

        const indices: number[] = [];
        for (let lat = 0; lat < segments; lat += 1) {
            for (let lon = 0; lon < segments; lon += 1) {
                const first = lat * (segments + 1) + lon;
                const second = first + segments + 1;

                indices.push(first, second, first + 1);
                indices.push(second, second + 1, first + 1);
            }
        }

        // Convert to triangle list (expand indices)
        const triangleVertices: number[] = [];
        for (let i = 0; i < indices.length; i += 3) {
            const i0 = indices[i] * 3;
            const i1 = indices[i + 1] * 3;
            const i2 = indices[i + 2] * 3;

            triangleVertices.push(
                vertices[i0],
                vertices[i0 + 1],
                vertices[i0 + 2],
                vertices[i1],
                vertices[i1 + 1],
                vertices[i1 + 2],
                vertices[i2],
                vertices[i2 + 1],
                vertices[i2 + 2],
            );
        }

        // Negate normals for spheres to fix lighting direction (invert column-wise)
        const verticesArray = new Float32Array(triangleVertices);
        const calculatedNormals = this.calculateNormals(verticesArray);
        for (let i = 0; i < calculatedNormals.length; i += 3) {
            calculatedNormals[i] *= -1;
            calculatedNormals[i + 1] *= -1;
            calculatedNormals[i + 2] *= -1;
        }

        const mesh = this.createMesh(verticesArray, calculatedNormals);
        this.meshCache.set(key, mesh);
        return mesh;
    }

    public beginFrame(): void {
        // Update viewport in case canvas was resized
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        // This frame's horizon color, set by setSky just before. The sky pass draws over it;
        // it shows only if that pass can't run (scene mode can override with clear())
        this.gl.clearColor(this.sky.horizon.x, this.sky.horizon.y, this.sky.horizon.z, 1);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
        this.drawList.reset();
    }

    public drawMesh(mesh: MeshHandle, model: Mat4, color: Vec3, isLightSource: boolean = false): void {
        this.drawList.pushMesh(mesh.id, model, color, isLightSource);
    }

    private drawMeshNow(meshId: string, model: Mat4, color: Vec3, isLightSource: boolean): void {
        const webglMesh = this.meshes.get(meshId);
        if (!webglMesh || !this.program) {
            return;
        }

        this.gl.useProgram(this.program);
        this.gl.bindVertexArray(webglMesh.vao);

        // Set the light source uniform toggle
        if (this.uniformLocations.isLightSource) {
            this.gl.uniform1f(this.uniformLocations.isLightSource, isLightSource ? 1.0 : 0.0);
        }

        // Set color uniform (using cached location)
        if (this.uniformLocations.color) {
            this.gl.uniform3f(this.uniformLocations.color, color.x, color.y, color.z);
        }

        if (this.uniformLocations.model) {
            this.gl.uniformMatrix4fv(this.uniformLocations.model, false, model.elements);
        }

        // Set wireframe mode
        if (this.wireframe) {
            this.gl.polygonOffset(0, 0);
            this.gl.drawArrays(this.gl.LINE_LOOP, 0, webglMesh.vertexCount);
        } else {
            this.gl.drawArrays(this.gl.TRIANGLES, 0, webglMesh.vertexCount);
        }

        this.gl.bindVertexArray(null);
    }

    // The same for every lit mesh in a frame, so sent once before the replay rather than per mesh.
    // A program keeps its uniforms while other programs draw, so sprites in between don't undo this
    private sendLitFrameUniforms(): void {
        if (!this.program) {
            return;
        }

        this.gl.useProgram(this.program);

        if (this.uniformLocations.viewProj) {
            this.gl.uniformMatrix4fv(this.uniformLocations.viewProj, false, this.viewProj.elements);
        }

        // Use identity normal matrix (keep normals in world space since model transforms are translation-only)
        // Reuse pre-allocated identity matrix
        if (this.uniformLocations.normalMatrix) {
            this.gl.uniformMatrix4fv(this.uniformLocations.normalMatrix, false, this.identityMatrix.elements);
        }

        // Set lighting uniforms (directions are in world space, matching normals)
        // Using cached locations
        if (this.uniformLocations.sunDirection) {
            this.gl.uniform3f(
                this.uniformLocations.sunDirection,
                this.sunDirection.x,
                this.sunDirection.y,
                this.sunDirection.z,
            );
        }

        if (this.uniformLocations.sunColor) {
            this.gl.uniform3f(
                this.uniformLocations.sunColor,
                this.sunColor.x,
                this.sunColor.y,
                this.sunColor.z,
            );
        }

        if (this.uniformLocations.moonDirection) {
            this.gl.uniform3f(
                this.uniformLocations.moonDirection,
                this.moonDirection.x,
                this.moonDirection.y,
                this.moonDirection.z,
            );
        }

        if (this.uniformLocations.moonColor) {
            this.gl.uniform3f(
                this.uniformLocations.moonColor,
                this.moonColor.x,
                this.moonColor.y,
                this.moonColor.z,
            );
        }

        if (this.uniformLocations.ambientIntensity) {
            this.gl.uniform1f(this.uniformLocations.ambientIntensity, this.ambientIntensity);
        }

        if (this.uniformLocations.lightViewProj) {
            this.gl.uniformMatrix4fv(this.uniformLocations.lightViewProj, false, this.lightViewProj.elements);
        }

        if (this.uniformLocations.shadowStrength) {
            this.gl.uniform1f(this.uniformLocations.shadowStrength, this.shadowStrength);
        }

        if (this.uniformLocations.shadowBiasScale) {
            this.gl.uniform1f(this.uniformLocations.shadowBiasScale, this.shadowBiasScale);
        }

        // Fog's sky colors and the camera position
        const { sky, eye } = this;
        const locs = this.uniformLocations;
        if (locs.skyHorizon) this.gl.uniform3f(locs.skyHorizon, sky.horizon.x, sky.horizon.y, sky.horizon.z);
        if (locs.skyUpper) this.gl.uniform3f(locs.skyUpper, sky.upper.x, sky.upper.y, sky.upper.z);
        if (locs.skyZenith) this.gl.uniform3f(locs.skyZenith, sky.zenith.x, sky.zenith.y, sky.zenith.z);
        if (locs.skyGlow) this.gl.uniform3f(locs.skyGlow, sky.glow.x, sky.glow.y, sky.glow.z);
        if (locs.eye) this.gl.uniform3f(locs.eye, eye.x, eye.y, eye.z);
    }

    public endFrame(): void {
        const { gl } = this;
        if (this.shadowStrength > 0) {
            this.renderShadowMap();
        }

        // Bound only for the lit pass: a texture can't be sampled while it's being rendered into
        gl.activeTexture(gl.TEXTURE0 + SHADOW_TEXTURE_UNIT);
        gl.bindTexture(gl.TEXTURE_2D, this.shadowTexture);
        gl.activeTexture(gl.TEXTURE0);

        // Behind everything, before the replay draws the world over it
        this.drawSky();
        this.sendLitFrameUniforms();

        // Replay in call order: scene_2d clears over its meshes before the screen quad
        const list = this.drawList;
        for (let i = 0; i < list.size(); i += 1) {
            const cmd = list.get(i);
            switch (cmd.kind) {
                case 'mesh':
                    this.drawMeshNow(cmd.id, cmd.matrix, cmd.color, cmd.isLightSource);
                    break;
                case 'texturedQuad':
                    this.drawTexturedQuadNow(cmd.id, cmd.matrix, cmd.normal);
                    break;
                case 'screenQuad':
                    this.drawScreenQuadNow(cmd.id, cmd.matrix);
                    break;
                case 'clear':
                    this.clearNow(cmd.color.x, cmd.color.y, cmd.color.z, cmd.alpha);
                    break;
                default:
                    break;
            }
        }

        gl.activeTexture(gl.TEXTURE0 + SHADOW_TEXTURE_UNIT);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.activeTexture(gl.TEXTURE0);
        // Present frame (WebGL handles this automatically)
    }

    public setShadowBias(scale: number): void {
        this.shadowBiasScale = scale;
    }

    public setShadowCaster(direction: Vec3, strength: number, focus: Vec3): void {
        this.shadowDirection.x = direction.x;
        this.shadowDirection.y = direction.y;
        this.shadowDirection.z = direction.z;
        this.shadowStrength = strength;
        this.shadowFocus.x = focus.x;
        this.shadowFocus.y = focus.y;
        this.shadowFocus.z = focus.z;
        if (strength > 0) {
            computeLightViewProj(
                this.shadowDirection,
                this.shadowFocus,
                SHADOW_HALF_EXTENT,
                SHADOW_DEPTH_RADIUS,
                SHADOW_MAP_SIZE,
                this.lightViewProj,
            );
        }
    }

    public getWireframeEnabled(): boolean {
        return this.wireframe;
    }

    public setWireframe(enabled: boolean): void {
        this.wireframe = enabled;
    }

    public setSky(sky: SkyState): void {
        for (let i = 0; i < SKY_VEC3_FIELDS.length; i += 1) {
            const field = SKY_VEC3_FIELDS[i];
            this.sky[field].x = sky[field].x; this.sky[field].y = sky[field].y; this.sky[field].z = sky[field].z;
        }
        this.sky.stars = sky.stars;
        this.sky.cloudTime = sky.cloudTime;
        this.sky.starTime = sky.starTime;
        this.sky.moonDirection.x = sky.moonDirection.x;
        this.sky.moonDirection.y = sky.moonDirection.y;
        this.sky.moonDirection.z = sky.moonDirection.z;
        this.sky.sunDisc.x = sky.sunDisc.x; this.sky.sunDisc.y = sky.sunDisc.y; this.sky.sunDisc.z = sky.sunDisc.z;
        this.sky.moonDisc.x = sky.moonDisc.x; this.sky.moonDisc.y = sky.moonDisc.y; this.sky.moonDisc.z = sky.moonDisc.z;
        this.sky.sunVisibility = sky.sunVisibility;
        this.sky.moonVisibility = sky.moonVisibility;
    }

    private initSkyShaders(): void {
        const { gl } = this;

        // One triangle bigger than the screen, corners from gl_VertexID: (-1,-1), (3,-1), (-1,3).
        // Each corner's ray is un-projected at the near and far planes; dividing in the fragment
        // shader keeps every pixel's view direction exact for any field of view.
        const vertexShaderSource = `#version 300 es
            uniform mat4 u_viewProj;

            out vec4 v_near;
            out vec4 v_far;

            void main() {
                vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)) * 2.0 - 1.0;
                mat4 toWorld = inverse(u_viewProj);
                v_near = toWorld * vec4(corner, -1.0, 1.0);
                v_far = toWorld * vec4(corner, 1.0, 1.0);
                gl_Position = vec4(corner, 0.0, 1.0);
            }
        `;

        const fragmentShaderSource = `#version 300 es
            precision highp float;

            uniform vec3 u_skyHorizon;
            uniform vec3 u_skyUpper;
            uniform vec3 u_skyZenith;
            uniform vec3 u_skyGlow;
            uniform vec3 u_sunDirection;
            uniform float u_skyStars;
            uniform vec3 u_eye;
            uniform float u_cloudTime;
            uniform float u_starTime;
            uniform vec3 u_moonDirection;
            uniform vec3 u_sunDisc;
            uniform vec3 u_moonDisc;
            uniform float u_sunVisibility;
            uniform float u_moonVisibility;
            uniform vec3 u_cloudLight;
            uniform vec3 u_cloudMid;
            uniform vec3 u_cloudShadow;

            in vec4 v_near;
            in vec4 v_far;

            out vec4 fragColor;
${SKY_COLOR_GLSL}
            // Stars, deterministic and stateless: docs/rendering.md "Stars" writes the hash out
            // exactly, so a native shader produces the same sky.
            // Cells per cube face, side to side. Big enough cells that a star never reaches its
            // cell's edge, even where cells are squeezed near the cube's edges or at low resolution.
            const float STAR_GRID = 32.0;
            // Share of cells holding a star: 0.24 of 6 x 32 x 32 is about 1500 over the whole sky,
            // about 700 above the horizon
            const float STAR_DENSITY = 0.24;
            // Height over which stars thin out toward the horizon
            const float STAR_HORIZON_FADE = 0.15;
            // How far past its threshold the palette's stars value must go for a star to be fully in
            const float STAR_FADE_RANGE = 0.15;

            uint starHash(uint face, uint x, uint y) {
                uint h = (face * 0x9E3779B9u) ^ (x * 0x85EBCA6Bu) ^ (y * 0xC2B2AE35u);
                h ^= h >> 16u;
                h *= 0x7FEB352Du;
                h ^= h >> 15u;
                h *= 0x846CA68Bu;
                h ^= h >> 16u;
                return h;
            }

            // Top 24 bits as 0..1
            float starUnit(uint h) {
                return float(h >> 8u) / 16777216.0;
            }

            // Twinkle: now and then a star dims briefly. Its time is cut into slots
            // (core/lighting/stars.ts); per slot, a hash of the star and the slot number decides
            // whether it dips, at the slot's start. Slot numbers repeat every cycle, so wrapping
            // starTime is invisible. Dims only: brightening would pass the speckle-in's values.
            const float STAR_TWINKLE_SLOT = ${glslFloat(STAR_TWINKLE_SLOT_SECONDS)};
            const float STAR_TWINKLE_SLOTS = ${glslFloat(STAR_CYCLE_SECONDS / STAR_TWINKLE_SLOT_SECONDS)};
            // Share of slots in which a star twinkles: about 1 in 12, so roughly every 40 s each
            const float STAR_TWINKLE_CHANCE = 0.08;
            // Seconds a dip lasts, and how much of the star's light it takes at its deepest
            const float STAR_TWINKLE_LENGTH = 0.5;
            const float STAR_TWINKLE_DEPTH = 0.7;

            // 1 when steady, down to 1 - STAR_TWINKLE_DEPTH in a dip
            float starTwinkle(uint h) {
                // The star's own offset, so stars don't all change slot together
                float t = u_starTime / STAR_TWINKLE_SLOT + starUnit(h);
                uint slot = uint(mod(floor(t), STAR_TWINKLE_SLOTS));
                // The star hash again, with the star's value and the slot number in place of a cell
                if (starUnit(starHash(h, slot, 0u)) >= STAR_TWINKLE_CHANCE) return 1.0;
                // One dip at the slot's start, 0 -> 1 -> 0 and flat at both ends, so no pop
                float x = fract(t) * STAR_TWINKLE_SLOT / STAR_TWINKLE_LENGTH;
                if (x >= 1.0) return 1.0;
                float dip = 4.0 * x * (1.0 - x);
                return 1.0 - STAR_TWINKLE_DEPTH * dip * dip;
            }

            // pixelAngle: how much the view direction changes per screen pixel
            float starLight(vec3 viewDir, float pixelAngle) {
                if (u_skyStars <= 0.0 || viewDir.y <= 0.0) return 0.0;

                // Cube face by the largest axis; the other two over it give face coordinates in -1..1.
                // A cube grid keeps cells nearly even; latitude/longitude would bunch them overhead.
                vec3 a = abs(viewDir);
                uint face;
                vec2 faceUV;
                float major;
                if (a.x >= a.y && a.x >= a.z) {
                    face = viewDir.x > 0.0 ? 0u : 1u; faceUV = viewDir.yz; major = viewDir.x;
                } else if (a.y >= a.z) {
                    face = viewDir.y > 0.0 ? 2u : 3u; faceUV = viewDir.xz; major = viewDir.y;
                } else {
                    face = viewDir.z > 0.0 ? 4u : 5u; faceUV = viewDir.xy; major = viewDir.z;
                }
                vec2 grid = (faceUV / abs(major) * 0.5 + 0.5) * STAR_GRID;
                vec2 cell = floor(grid);

                uint h = starHash(face, uint(cell.x), uint(cell.y));
                if (starUnit(h) >= STAR_DENSITY) return 0.0;

                // Further values from the same hash: position (kept off the cell's edges), brightness
                // and twinkle
                uint h2 = h * 0x27D4EB2Du;
                uint h3 = h2 * 0x165667B1u;
                uint h4 = h3 * 0x9E3779B9u;
                uint h5 = h4 * 0x85EBCA6Bu;
                vec2 center = cell + 0.2 + 0.6 * vec2(starUnit(h2), starUnit(h3));
                float b = starUnit(h4);
                // Squared: many faint stars, few bright ones
                float brightness = b * b;

                // Speckle-in: brighter stars have lower thresholds, so they come out first at dusk
                // and leave last at dawn; the faintest are fully in exactly at full night
                float threshold = (1.0 - brightness) * (1.0 - STAR_FADE_RANGE);
                float show = smoothstep(threshold, threshold + STAR_FADE_RANGE, u_skyStars);

                // The star's own direction, rebuilt from its face position. Its round shape is
                // measured against the view direction, not on the face: a face seen at an angle
                // would squash a face-space circle into a dash on screen.
                vec2 starUV = center / STAR_GRID * 2.0 - 1.0;
                float side = sign(major);
                vec3 starDir = face < 2u ? vec3(side, starUV.x, starUV.y)
                    : (face < 4u ? vec3(starUV.x, side, starUV.y) : vec3(starUV.x, starUV.y, side));
                starDir = normalize(starDir);

                // Three sizes, by brightness, in screen pixels (radius)
                float radiusPixels = brightness > 0.6 ? 1.5 : (brightness > 0.25 ? 1.0 : 0.75);
                float radius = radiusPixels * pixelAngle;
                float spot = 1.0 - smoothstep(radius * 0.5, radius, length(viewDir - starDir));

                return spot * brightness * starTwinkle(h5) * show * smoothstep(0.0, STAR_HORIZON_FADE, viewDir.y);
            }

            // Clouds: a flat layer high above the world, shaped by noise where each view ray meets it.
            // Perspective makes them large overhead and small and bunched toward the horizon.
            // docs/rendering.md "Clouds" writes the noise out exactly, like the star hash.
            // Height of the layer above the floor
            const float CLOUD_HEIGHT = 60.0;
            // Noise cells per world unit on the layer (one cell is ~70 units across)
            const float CLOUD_SCALE = 0.014;
            // Density above which there's cloud. Higher means fewer, separate clouds with sky between.
            const float CLOUD_COVERAGE = 0.63;
            // Edges are about one pixel soft (from fwidth), never less than this: crisp, not jagged
            const float CLOUD_EDGE_MIN = 0.002;
            // View height over which clouds fade out at the horizon
            const float CLOUD_HORIZON_FADE = 0.2;
            // Distance along the view ray over which the fine octaves fade out: far away they'd be
            // squeezed below a pixel and shimmer into streaks near the horizon
            const float CLOUD_DETAIL_NEAR = 250.0;
            const float CLOUD_DETAIL_FAR = 800.0;
            // How far toward the sun (world units on the layer) the shading compares density
            const float CLOUD_LIGHT_STEP = 8.0;
            // The noise repeats every CLOUD_PERIOD cells. Motion: each octave travels a whole number
            // of periods (CLOUD_LAPS_n) per CLOUD_CYCLE seconds, so wrapping cloudTime is invisible.
            // All three come from core/lighting/clouds.ts.
            const float CLOUD_PERIOD = ${glslFloat(CLOUD_NOISE_PERIOD)};
            const float CLOUD_CYCLE = ${glslFloat(CLOUD_CYCLE_SECONDS)};
            ${CLOUD_LAPS_GLSL}

            uint cloudHash(vec2 cell) {
                // Wrapped first: the noise repeats, and floats never go negative before uint
                uvec2 c = uvec2(mod(cell, CLOUD_PERIOD));
                uint h = (c.x * 0x8DA6B343u) ^ (c.y * 0xD8163841u);
                h ^= h >> 16u;
                h *= 0x7FEB352Du;
                h ^= h >> 15u;
                h *= 0x846CA68Bu;
                h ^= h >> 16u;
                return h;
            }

            // Smoothly interpolated random values at cell corners, 0..1
            float valueNoise(vec2 p) {
                vec2 cell = floor(p);
                vec2 f = fract(p);
                vec2 u = f * f * (3.0 - 2.0 * f);
                float a = starUnit(cloudHash(cell));
                float b = starUnit(cloudHash(cell + vec2(1.0, 0.0)));
                float c = starUnit(cloudHash(cell + vec2(0.0, 1.0)));
                float d = starUnit(cloudHash(cell + vec2(1.0, 1.0)));
                return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
            }

            // Four octaves, weighted toward the big shapes so clouds read as broad masses, not smoke.
            // detail (0..1) fades the two fine octaves to their average (0.5 each) far away, so the
            // overall amount of cloud stays the same while the shimmer goes.
            // Each octave moves on its own, so clouds drift and change shape as they go
            float cloudDensity(vec2 layerPos, float detail) {
                vec2 p = layerPos * CLOUD_SCALE;
                vec2 travel = vec2(CLOUD_PERIOD * u_cloudTime / CLOUD_CYCLE);
                float fine = 0.1 * valueNoise(p * 4.0 + CLOUD_LAPS_2 * travel)
                    + 0.05 * valueNoise(p * 8.0 + CLOUD_LAPS_3 * travel);
                return 0.6 * valueNoise(p + CLOUD_LAPS_0 * travel)
                    + 0.25 * valueNoise(p * 2.0 + CLOUD_LAPS_1 * travel)
                    + mix(0.075, fine, detail);
            }

            // Three flat tones for a graphic look that suits the 2D sprites: shadow (0), mid (0.5) and
            // light (1), with steps about a pixel soft. Plan 6 maps the three to palette colors.
            float toneBands(float shade, float width) {
                // Thresholds favor the light tones: mostly lit tops, smaller shaded undersides
                float mid = smoothstep(0.3 - width, 0.3 + width, shade);
                float light = smoothstep(0.55 - width, 0.55 + width, shade);
                return 0.5 * mid + 0.5 * light;
            }

            // .x the tone (light on the sun-facing edge, darker in thick middles and on the far side),
            // .y coverage (0..1)
            vec2 cloudAt(vec3 viewDir) {
                // Every value that fwidth needs is computed on every pixel, before any early return:
                // derivatives are undefined once neighbouring pixels take different paths. A near-flat
                // ray uses a clamped height here and is faded out below.
                float rayLength = (CLOUD_HEIGHT - u_eye.y) / max(viewDir.y, 0.01);
                vec2 layerPos = u_eye.xz + viewDir.xz * rayLength;
                float detail = 1.0 - smoothstep(CLOUD_DETAIL_NEAR, CLOUD_DETAIL_FAR, rayLength);
                float density = cloudDensity(layerPos, detail);
                float edge = max(fwidth(density), CLOUD_EDGE_MIN);
                float coverage = smoothstep(CLOUD_COVERAGE - edge, CLOUD_COVERAGE + edge, density);

                // Lit edges: if the cloud is thinner a step toward the sun, this side faces it.
                // Strongest with the sun low to the side, gone with it overhead (no horizontal part)
                // or below the horizon (no visibility), so the fallback below is reached smoothly.
                float lit = 0.6;
                vec2 sunFlat = u_sunDirection.xz;
                if (length(sunFlat) > 0.001) {
                    float towardSun = cloudDensity(layerPos + normalize(sunFlat) * CLOUD_LIGHT_STEP, detail);
                    float edgeStrength = length(sunFlat) * u_sunVisibility;
                    lit = clamp(0.6 + (density - towardSun) * 4.0 * edgeStrength, 0.0, 1.0);
                }
                // Thicker is darker underneath
                float shade = lit * (1.0 - 0.35 * smoothstep(CLOUD_COVERAGE, CLOUD_COVERAGE + 0.25, density));
                float tone = toneBands(shade, max(fwidth(shade), CLOUD_EDGE_MIN));
                float horizonFade = smoothstep(0.0, CLOUD_HORIZON_FADE, viewDir.y);
                return vec2(tone, coverage * horizonFade);
            }

            // The sun and moon, as discs in the sky. Their angular radius matches the old spheres
            // (radius 5 and 4 at 99 units out), so they look the same size as before.
            const float SUN_RADIUS = 0.0506;
            const float MOON_RADIUS = 0.0404;

            // 1 inside a disc of the given angular radius around a direction, with a soft edge
            // about a pixel wide. For small angles the gap between unit vectors is the angle.
            float disc(vec3 viewDir, vec3 bodyDir, float radius, float pixelAngle) {
                float angle = length(viewDir - normalize(bodyDir));
                return 1.0 - smoothstep(radius - pixelAngle, radius + pixelAngle, angle);
            }

            // The high layer: thin streaks far above the puffy clouds, drawn behind them.
            // Higher, and stretched noise cells (more cells across x than along z) make streaks.
            const float CLOUD_HIGH_HEIGHT = 150.0;
            const vec2 CLOUD_HIGH_SCALE = vec2(0.01, 0.03);
            const float CLOUD_HIGH_COVERAGE = 0.68;
            // Partly see-through, and sparse: an accent behind the puffy clouds, not a second sky
            const float CLOUD_HIGH_OPACITY = 0.4;
            // Shifts the high layer into a different part of the noise, so it doesn't copy the low one
            const vec2 CLOUD_HIGH_SEED = vec2(97.0, 41.0);

            // Coverage of the high layer (0..1), already scaled by its opacity and horizon fade
            float highCloudAt(vec3 viewDir) {
                // As in cloudAt: everything fwidth needs, on every pixel, before any early return
                vec2 layerPos = u_eye.xz + viewDir.xz * ((CLOUD_HIGH_HEIGHT - u_eye.y) / max(viewDir.y, 0.01));
                vec2 p = layerPos * CLOUD_HIGH_SCALE + CLOUD_HIGH_SEED;
                vec2 travel = vec2(CLOUD_PERIOD * u_cloudTime / CLOUD_CYCLE);
                float density = 0.7 * valueNoise(p + CLOUD_HIGH_LAPS_0 * travel)
                    + 0.3 * valueNoise(p * 2.0 + CLOUD_HIGH_LAPS_1 * travel);
                float edge = max(fwidth(density), CLOUD_EDGE_MIN);
                float coverage = smoothstep(CLOUD_HIGH_COVERAGE - edge, CLOUD_HIGH_COVERAGE + edge, density);
                return coverage * CLOUD_HIGH_OPACITY * smoothstep(0.0, CLOUD_HORIZON_FADE, viewDir.y);
            }

            // Low clouds catch the sun's glow: warmest near the horizon and on the sun's side.
            // Screen-blended so it can't clip, and the palette's glow is black by day and at night,
            // so only sunrise and sunset change.
            const float CLOUD_WARM_HEIGHT = 0.35;
            const float CLOUD_WARMTH = 0.55;

            vec3 warmCloud(vec3 color, vec3 viewDir) {
                float low = 1.0 - smoothstep(0.0, CLOUD_WARM_HEIGHT, viewDir.y);
                float sunSide = 0.4;
                vec2 sunFlat = u_sunDirection.xz;
                if (length(viewDir.xz) > 0.001 && length(sunFlat) > 0.001) {
                    sunSide = 0.4 + 0.6 * max(dot(normalize(viewDir.xz), normalize(sunFlat)), 0.0);
                }
                return color + u_skyGlow * (low * sunSide * CLOUD_WARMTH) * (1.0 - color);
            }

            void main() {
                vec3 viewDir = normalize(v_far.xyz / v_far.w - v_near.xyz / v_near.w);
                // Before any branch: derivatives need neighbouring pixels on the same path. From the
                // view direction, which is smooth everywhere; face coordinates jump where faces meet.
                float pixelAngle = length(fwidth(viewDir));
                vec3 color = skyColor(viewDir) + vec3(starLight(viewDir, pixelAngle));

                // Sun and moon over the stars and under the clouds, each fading into the sky behind it
                // by its visibility (instead of darkening)
                color = mix(color, u_sunDisc, disc(viewDir, u_sunDirection, SUN_RADIUS, pixelAngle) * u_sunVisibility);
                color = mix(color, u_moonDisc, disc(viewDir, u_moonDirection, MOON_RADIUS, pixelAngle) * u_moonVisibility);

                // Clouds, high layer first so the low puffy layer passes in front of it. Colors come
                // from the palette: the three tones (0, 0.5, 1) map to shadow, mid and light, and
                // the high streaks take the light tone.
                color = mix(color, warmCloud(u_cloudLight, viewDir), highCloudAt(viewDir));
                vec2 cloud = cloudAt(viewDir);
                vec3 tone = cloud.x < 0.5
                    ? mix(u_cloudShadow, u_cloudMid, cloud.x * 2.0)
                    : mix(u_cloudMid, u_cloudLight, cloud.x * 2.0 - 1.0);
                tone = warmCloud(tone, viewDir);
                color = mix(color, tone, cloud.y);

                fragColor = vec4(color, 1.0);
            }
        `;

        const vertexShader = this.compileShader(gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
        if (!vertexShader || !fragmentShader) {
            throw new Error('Failed to compile sky shaders');
        }
        const program = this.createProgram(vertexShader, fragmentShader);
        if (!program) {
            throw new Error('Failed to create sky shader program');
        }
        this.skyProgram = program;
        this.skyLocs = {
            viewProj: gl.getUniformLocation(program, 'u_viewProj'),
            horizon: gl.getUniformLocation(program, 'u_skyHorizon'),
            upper: gl.getUniformLocation(program, 'u_skyUpper'),
            zenith: gl.getUniformLocation(program, 'u_skyZenith'),
            glow: gl.getUniformLocation(program, 'u_skyGlow'),
            sunDirection: gl.getUniformLocation(program, 'u_sunDirection'),
            stars: gl.getUniformLocation(program, 'u_skyStars'),
            eye: gl.getUniformLocation(program, 'u_eye'),
            cloudTime: gl.getUniformLocation(program, 'u_cloudTime'),
            starTime: gl.getUniformLocation(program, 'u_starTime'),
            moonDirection: gl.getUniformLocation(program, 'u_moonDirection'),
            sunDisc: gl.getUniformLocation(program, 'u_sunDisc'),
            moonDisc: gl.getUniformLocation(program, 'u_moonDisc'),
            sunVisibility: gl.getUniformLocation(program, 'u_sunVisibility'),
            moonVisibility: gl.getUniformLocation(program, 'u_moonVisibility'),
            cloudLight: gl.getUniformLocation(program, 'u_cloudLight'),
            cloudMid: gl.getUniformLocation(program, 'u_cloudMid'),
            cloudShadow: gl.getUniformLocation(program, 'u_cloudShadow'),
        };
        this.skyVAO = gl.createVertexArray();
    }

    // The gradient and glow behind the world. No depth test or write, so everything draws over it.
    private drawSky(): void {
        const { gl } = this;
        const program = this.skyProgram;
        if (!program || !this.skyVAO) return;
        const locs = this.skyLocs;
        const { sky } = this;

        gl.useProgram(program);
        gl.bindVertexArray(this.skyVAO);
        gl.uniformMatrix4fv(locs.viewProj, false, this.viewProj.elements);
        gl.uniform3f(locs.horizon, sky.horizon.x, sky.horizon.y, sky.horizon.z);
        gl.uniform3f(locs.upper, sky.upper.x, sky.upper.y, sky.upper.z);
        gl.uniform3f(locs.zenith, sky.zenith.x, sky.zenith.y, sky.zenith.z);
        gl.uniform3f(locs.glow, sky.glow.x, sky.glow.y, sky.glow.z);
        gl.uniform3f(locs.sunDirection, sky.sunDirection.x, sky.sunDirection.y, sky.sunDirection.z);
        gl.uniform1f(locs.stars, sky.stars);
        gl.uniform3f(locs.eye, this.eye.x, this.eye.y, this.eye.z);
        gl.uniform1f(locs.cloudTime, sky.cloudTime);
        gl.uniform1f(locs.starTime, sky.starTime);
        gl.uniform3f(locs.moonDirection, sky.moonDirection.x, sky.moonDirection.y, sky.moonDirection.z);
        gl.uniform3f(locs.sunDisc, sky.sunDisc.x, sky.sunDisc.y, sky.sunDisc.z);
        gl.uniform3f(locs.moonDisc, sky.moonDisc.x, sky.moonDisc.y, sky.moonDisc.z);
        gl.uniform1f(locs.sunVisibility, sky.sunVisibility);
        gl.uniform1f(locs.moonVisibility, sky.moonVisibility);
        gl.uniform3f(locs.cloudLight, sky.cloudLight.x, sky.cloudLight.y, sky.cloudLight.z);
        gl.uniform3f(locs.cloudMid, sky.cloudMid.x, sky.cloudMid.y, sky.cloudMid.z);
        gl.uniform3f(locs.cloudShadow, sky.cloudShadow.x, sky.cloudShadow.y, sky.cloudShadow.z);

        gl.disable(gl.DEPTH_TEST);
        gl.depthMask(false);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.depthMask(true);
        gl.enable(gl.DEPTH_TEST);

        gl.bindVertexArray(null);
    }

    // Looks the uniform up by name each call, like the rest of the billboard draw (no per-draw allocation)
    private setVec3Uniform(program: WebGLProgram, name: string, value: Vec3): void {
        const loc = this.gl.getUniformLocation(program, name);
        if (loc) this.gl.uniform3f(loc, value.x, value.y, value.z);
    }

    public setViewPosition(eye: Vec3): void {
        this.eye.x = eye.x;
        this.eye.y = eye.y;
        this.eye.z = eye.z;
    }

    public setViewProjection(viewProj: Mat4): void {
        // Copy, not keep a reference: core reuses its matrix and could change it mid-frame
        const src = viewProj.elements;
        const dst = this.viewProj.elements;
        for (let i = 0; i < 16; i += 1) {
            dst[i] = src[i];
        }
    }

    public setAmbientIntensity(intensity: number): void {
        this.ambientIntensity = intensity;
    }

    public setCelestialLighting(
        sun: { direction: Vec3; color: Vec3 },
        moon: { direction: Vec3; color: Vec3 },
    ): void {
        // Copy, not keep a reference, as setViewProjection does: the values are read later, in endFrame
        this.sunDirection.x = sun.direction.x;
        this.sunDirection.y = sun.direction.y;
        this.sunDirection.z = sun.direction.z;
        this.sunColor.x = sun.color.x;
        this.sunColor.y = sun.color.y;
        this.sunColor.z = sun.color.z;
        this.moonDirection.x = moon.direction.x;
        this.moonDirection.y = moon.direction.y;
        this.moonDirection.z = moon.direction.z;
        this.moonColor.x = moon.color.x;
        this.moonColor.y = moon.color.y;
        this.moonColor.z = moon.color.z;
    }

    private initTextureShaders(): void {
        // Fixed attribute locations, so the billboard shadow program can draw the same quad VAO
        const vertexShaderSource = `#version 300 es
            layout(location = 0) in vec3 a_position;
            layout(location = 1) in vec2 a_texCoord;
            
            uniform mat4 u_viewProj;
            uniform mat4 u_model;
            uniform mat4 u_lightViewProj;
            uniform vec3 u_shadowDirection;
            uniform vec3 u_normal;
            
            out vec2 v_texCoord;
            out vec3 v_lightClip;
            out vec3 v_worldPos;

            // How far in front of its own light-facing card a pixel looks up its shadow
            const float SELF_CLEARANCE = 0.1;
${LIGHT_CARD_GLSL}
            void main() {
                // Quad vertices are on XZ plane (horizontal, Y=0)
                // Model already includes billboard rotation and position
                // Position components: x = horizontal, z = depth (both map to quad XZ plane)
                vec4 worldPos = u_model * vec4(a_position.x, 0.0, a_position.z, 1.0);
                
                v_texCoord = a_texCoord;
                v_worldPos = worldPos.xyz;
                gl_Position = u_viewProj * worldPos;

                // Shadows are looked up where this pixel would be on the card it casts from,
                // nudged toward the light. Looked up on the camera-facing card, half the sprite
                // would sit behind its own shadow caster.
                vec3 onLightCard = lightCardPosition(u_model, a_position.xz, u_shadowDirection, u_normal, SELF_CLEARANCE, true);
                v_lightClip = (u_lightViewProj * vec4(onLightCard, 1.0)).xyz;
            }
        `;

        // highp for the shadow lookup, as in the mesh shader
        const fragmentShaderSource = `#version 300 es
            precision highp float;
            
            uniform sampler2D u_texture;
            uniform highp sampler2DShadow u_shadowMap;
            uniform float u_shadowStrength;
            uniform float u_ambientIntensity;
            uniform vec3 u_moonColor;
            uniform vec3 u_sunColor;
            // Fog, as in the mesh shader: the sky's colors, the sun's direction and the camera
            uniform vec3 u_skyHorizon;
            uniform vec3 u_skyUpper;
            uniform vec3 u_skyZenith;
            uniform vec3 u_skyGlow;
            uniform vec3 u_sunDirection;
            uniform vec3 u_eye;
            
            in vec2 v_texCoord;
            in vec3 v_lightClip;
            in vec3 v_worldPos;
            
            out vec4 fragColor;
${SHADOW_SAMPLING_GLSL}
${SKY_COLOR_GLSL}
${FOG_GLSL}
            // The lookup already sits in front of the sprite's own caster, so only a small fixed bias
            const float BILLBOARD_BIAS = 0.0002;
            
            void main() {
            vec4 textureSample = texture(u_texture, v_texCoord);
            // Like the shadow pass: see-through pixels write no depth, so they can't hide what's behind
            if (textureSample.a < 0.5) discard;
            vec3 textureColor = textureSample.rgb;
            float textureAlpha = textureSample.a;

            // Lit as if facing the light, the card it casts from, so brightness never depends
            // on where the camera stands. Each body's color already carries its own fade,
            // so only shadow dims it. As in the mesh shader, ambient is never shadowed.
            vec3 diffuse = (u_sunColor + u_moonColor) * sampleShadow(v_lightClip, BILLBOARD_BIAS, 1.0);

            vec3 finalColor = applyFog(textureColor * (u_ambientIntensity + diffuse), v_worldPos);
            // Fog changes the color only; see-through pixels stay see-through
            fragColor = vec4(finalColor, textureAlpha);
        }
        `;

        const vertexShader = this.compileShader(this.gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = this.compileShader(this.gl.FRAGMENT_SHADER, fragmentShaderSource);

        if (!vertexShader || !fragmentShader) {
            throw new Error('Failed to compile texture shaders');
        }

        this.textureProgram = this.createProgram(vertexShader, fragmentShader);
        if (!this.textureProgram) {
            throw new Error('Failed to create texture shader program');
        }
    }

    private createQuadMesh(): void {
        const { gl } = this;

        // Create quad with UV coordinates (centered at origin, facing camera)
        // Vertices: 2 triangles forming a square on XZ plane, Y = 0
        const vertices = new Float32Array([
            // Triangle 1
            -0.5, 0, -0.5, 0, 1, // bottom-left
            0.5, 0, -0.5, 1, 1, // bottom-right
            0.5, 0, 0.5, 1, 0, // top-right

            // Triangle 2
            -0.5, 0, -0.5, 0, 1, // bottom-left
            0.5, 0, 0.5, 1, 0, // top-right
            -0.5, 0, 0.5, 0, 0, // top-left
        ]);

        const vao = gl.createVertexArray();
        if (!vao) throw new Error('Failed to create quad VAO');

        gl.bindVertexArray(vao);

        const vbo = gl.createBuffer();
        if (!vbo) throw new Error('Failed to create quad VBO');
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

        // Position attribute (3 floats: x, y, z)
        const positionLoc = gl.getAttribLocation(this.textureProgram!, 'a_position');
        gl.enableVertexAttribArray(positionLoc);
        gl.vertexAttribPointer(positionLoc, 3, gl.FLOAT, false, 20, 0); // stride 20 (5 floats * 4 bytes)

        // Texture coordinate attribute (2 floats: u, v)
        const texCoordLoc = gl.getAttribLocation(this.textureProgram!, 'a_texCoord');
        gl.enableVertexAttribArray(texCoordLoc);
        gl.vertexAttribPointer(texCoordLoc, 2, gl.FLOAT, false, 20, 12); // offset 12 (3 floats * 4 bytes)

        gl.bindVertexArray(null);

        this.quadVAO = vao;
    }

    public async loadTexture(assetId: string): Promise<TextureHandle> {
        // Check cache first
        if (this.textureCache.has(assetId)) {
            return this.textureCache.get(assetId)!;
        }

        // Map asset ID to file path (backend-specific)
        // For now, assume asset ID is the filename without extension
        // Vite serves files from src/ at root, so use absolute path
        const path = `assets/images/${assetId}.png`;

        // Load image
        const response = await fetch(path);
        if (!response.ok) {
            throw new Error(`Failed to load texture: ${path}`);
        }

        const blob = await response.blob();
        const imageBitmap = await createImageBitmap(blob);

        // Create WebGL texture
        const texture = this.gl.createTexture();
        if (!texture) {
            throw new Error('Failed to create WebGL texture');
        }

        this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
        this.gl.texImage2D(
            this.gl.TEXTURE_2D,
            0,
            this.gl.RGBA,
            this.gl.RGBA,
            this.gl.UNSIGNED_BYTE,
            imageBitmap,
        );

        // Set texture parameters
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);

        this.gl.bindTexture(this.gl.TEXTURE_2D, null);

        // Store texture
        const webglTexture: WebGLTextureData = {
            texture,
            width: imageBitmap.width,
            height: imageBitmap.height,
        };

        this.textures.set(assetId, webglTexture);

        // Create handle and cache
        const handle: TextureHandle = { id: assetId };
        this.textureCache.set(assetId, handle);

        return handle;
    }

    public drawTexturedQuad(texture: TextureHandle, model: Mat4, normal: Vec3 = { x: 0, y: 1, z: 0 }): void {
        this.drawList.pushTexturedQuad(texture.id, model, normal);
    }

    private drawTexturedQuadNow(textureId: string, model: Mat4, normal: Vec3): void {
        const webglTexture = this.textures.get(textureId);
        if (!webglTexture || !this.textureProgram || !this.quadVAO) {
            return;
        }

        const { gl } = this;

        // Use texture shader program
        gl.useProgram(this.textureProgram);
        gl.bindVertexArray(this.quadVAO);

        // Bind texture
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, webglTexture.texture);

        // Set texture uniform
        const textureLoc = gl.getUniformLocation(this.textureProgram, 'u_texture');
        if (textureLoc) {
            gl.uniform1i(textureLoc, 0);
        }

        // Model already includes billboard rotation and size scaling from CPU
        const viewProjLoc = gl.getUniformLocation(this.textureProgram, 'u_viewProj');
        if (viewProjLoc) {
            gl.uniformMatrix4fv(viewProjLoc, false, this.viewProj.elements);
        }

        const modelLoc = gl.getUniformLocation(this.textureProgram, 'u_model');
        if (modelLoc) {
            gl.uniformMatrix4fv(modelLoc, false, model.elements);
        }

        // Set lighting uniforms
        const sunColorLoc = gl.getUniformLocation(this.textureProgram, 'u_sunColor');
        if (sunColorLoc) {
            gl.uniform3f(sunColorLoc, this.sunColor.x, this.sunColor.y, this.sunColor.z);
        }

        const moonColorLoc = gl.getUniformLocation(this.textureProgram, 'u_moonColor');
        if (moonColorLoc) {
            gl.uniform3f(moonColorLoc, this.moonColor.x, this.moonColor.y, this.moonColor.z);
        }

        const ambientIntensityLoc = gl.getUniformLocation(this.textureProgram, 'u_ambientIntensity');
        if (ambientIntensityLoc) {
            gl.uniform1f(ambientIntensityLoc, this.ambientIntensity);
        }

        const normalLoc = gl.getUniformLocation(this.textureProgram, 'u_normal');
        if (normalLoc) {
            gl.uniform3f(normalLoc, normal.x, normal.y, normal.z);
        }

        const shadowMapLoc = gl.getUniformLocation(this.textureProgram, 'u_shadowMap');
        if (shadowMapLoc) {
            gl.uniform1i(shadowMapLoc, SHADOW_TEXTURE_UNIT);
        }

        const lightViewProjLoc = gl.getUniformLocation(this.textureProgram, 'u_lightViewProj');
        if (lightViewProjLoc) {
            gl.uniformMatrix4fv(lightViewProjLoc, false, this.lightViewProj.elements);
        }

        const shadowStrengthLoc = gl.getUniformLocation(this.textureProgram, 'u_shadowStrength');
        if (shadowStrengthLoc) {
            gl.uniform1f(shadowStrengthLoc, this.shadowStrength);
        }

        const shadowDirectionLoc = gl.getUniformLocation(this.textureProgram, 'u_shadowDirection');
        if (shadowDirectionLoc) {
            gl.uniform3f(shadowDirectionLoc, this.shadowDirection.x, this.shadowDirection.y, this.shadowDirection.z);
        }

        // Fog: the sky's colors, the sun's direction and the camera position
        const { sky, eye } = this;
        const program = this.textureProgram;
        this.setVec3Uniform(program, 'u_skyHorizon', sky.horizon);
        this.setVec3Uniform(program, 'u_skyUpper', sky.upper);
        this.setVec3Uniform(program, 'u_skyZenith', sky.zenith);
        this.setVec3Uniform(program, 'u_skyGlow', sky.glow);
        this.setVec3Uniform(program, 'u_sunDirection', sky.sunDirection);
        this.setVec3Uniform(program, 'u_eye', eye);

        // Enable alpha blending for transparency
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        // Draw quad (6 vertices: 2 triangles)
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        // Disable blending after drawing
        gl.disable(gl.BLEND);

        gl.bindVertexArray(null);
        gl.bindTexture(gl.TEXTURE_2D, null);
    }

    private initScreenQuadShaders(): void {
        const { gl } = this;

        const vertexShaderSource = `#version 300 es
            in vec3 a_position;
            in vec2 a_texCoord;

            uniform mat4 u_transform;

            out vec2 v_texCoord;

            void main() {
                // Flat 2D screen-space sprite: this quad's geometry varies on
                // local X and Z (same layout as the billboard quad, which lies
                // flat on Y=0). Unlike the billboard shader, BOTH of those axes
                // are meaningful screen directions here - there's no "depth
                // toward camera" for something drawn on a flat overlay - so we
                // read local X and Z straight into clip X/Y instead of
                // discarding one and routing the other to depth.
                vec4 clipPos = u_transform * vec4(a_position.x, a_position.z, 0.0, 1.0);
                v_texCoord = a_texCoord;
                gl_Position = clipPos;
            }
        `;

        const fragmentShaderSource = `#version 300 es
            precision mediump float;

            uniform sampler2D u_texture;

            in vec2 v_texCoord;

            out vec4 fragColor;

            void main() {
                // Unlit - this is a flat UI overlay sprite, not a lit world
                // object, so no sun/moon diffuse term here.
                fragColor = texture(u_texture, v_texCoord);
            }
        `;

        const vertexShader = this.compileShader(gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource);

        const program = gl.createProgram();
        if (!program) throw new Error('Failed to create screen quad program');

        if (vertexShader) gl.attachShader(program, vertexShader);
        if (fragmentShader) gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            const info = gl.getProgramInfoLog(program);
            gl.deleteProgram(program);
            throw new Error(`Failed to link screen quad program: ${info}`);
        }

        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);

        this.screenQuadProgram = program;

        // Same quad geometry as the billboard quad - but its own VAO. Attribute
        // locations are assigned per-program by the driver, not guaranteed to
        // match textureProgram's, so the two VAOs can't safely be shared even
        // though the vertex data is identical.
        const vertices = new Float32Array([
            -0.5, 0, -0.5, 0, 1,
            0.5, 0, -0.5, 1, 1,
            0.5, 0, 0.5, 1, 0,

            -0.5, 0, -0.5, 0, 1,
            0.5, 0, 0.5, 1, 0,
            -0.5, 0, 0.5, 0, 0,
        ]);

        const vao = gl.createVertexArray();
        if (!vao) throw new Error('Failed to create screen quad VAO');
        gl.bindVertexArray(vao);

        const vbo = gl.createBuffer();
        if (!vbo) throw new Error('Failed to create screen quad VBO');
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

        const positionLoc = gl.getAttribLocation(program, 'a_position');
        gl.enableVertexAttribArray(positionLoc);
        gl.vertexAttribPointer(positionLoc, 3, gl.FLOAT, false, 20, 0);

        const texCoordLoc = gl.getAttribLocation(program, 'a_texCoord');
        gl.enableVertexAttribArray(texCoordLoc);
        gl.vertexAttribPointer(texCoordLoc, 2, gl.FLOAT, false, 20, 12);

        gl.bindVertexArray(null);

        this.screenQuadVAO = vao;
    }

    public drawScreenQuad(texture: TextureHandle, transform: Mat4): void {
        this.drawList.pushScreenQuad(texture.id, transform);
    }

    private drawScreenQuadNow(textureId: string, transform: Mat4): void {
        const webglTexture = this.textures.get(textureId);
        if (!webglTexture || !this.screenQuadProgram || !this.screenQuadVAO) {
            return;
        }

        const { gl } = this;

        gl.useProgram(this.screenQuadProgram);
        gl.bindVertexArray(this.screenQuadVAO);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, webglTexture.texture);

        const textureLoc = gl.getUniformLocation(this.screenQuadProgram, 'u_texture');
        if (textureLoc) gl.uniform1i(textureLoc, 0);

        const transformLoc = gl.getUniformLocation(this.screenQuadProgram, 'u_transform');
        if (transformLoc) gl.uniformMatrix4fv(transformLoc, false, transform.elements);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        gl.drawArrays(gl.TRIANGLES, 0, 6);

        gl.disable(gl.BLEND);
        gl.bindVertexArray(null);
        gl.bindTexture(gl.TEXTURE_2D, null);
    }

    public clear(r: number, g: number, b: number, a: number): void {
        this.drawList.pushClear(r, g, b, a);
    }

    private clearNow(r: number, g: number, b: number, a: number): void {
        this.gl.clearColor(r, g, b, a);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
    }

    public getViewportWidth(): number {
        return this.canvas.width;
    }

    public getViewportHeight(): number {
        return this.canvas.height;
    }
}
