import { Vec3 } from '../../types/common';
import { GameState } from '../gameState';
import { smoothstep } from '../math/mathHelpers';
import { createPalette, paletteAt, type TimeOfDayPalette } from './skyPalette';
import { cloudTimeAt } from './clouds';
import { starTimeAt } from './stars';

export const DAY_LENGTH_SECONDS = 120;

export default class EnvironmentSystem {
    // Configuration Constants
    private readonly DECLINATION_OFFSET = 0.0;

    // Shadows fade in as the caster climbs from SHADOW_FADE_LOW to SHADOW_FADE_HIGH (direction y).
    // Below that they'd stretch for dozens of units, and at dawn/dusk both bodies sit there,
    // so the handover from one to the other happens at zero strength.
    private readonly SHADOW_FADE_LOW = 0.05;

    private readonly SHADOW_FADE_HIGH = 0.25;

    // PERFORMANCE: Pre-allocated fields isolated to this system context
    public readonly lightDirection: Vec3 = { x: 0, y: 0, z: 0 };

    public readonly moonLightDirection: Vec3 = { x: 0, y: 0, z: 0 };

    public readonly sunPosition: Vec3 = { x: 0, y: 0, z: 0 };

    public readonly moonPosition: Vec3 = { x: 0, y: 0, z: 0 };

    public readonly sunColorWithVisibility: Vec3 = { x: 0, y: 0, z: 0 };

    public readonly moonColorWithVisibility: Vec3 = { x: 0, y: 0, z: 0 };

    // This frame's palette (sky, light colors, ambient, stars), filled once per update.
    // RenderSystem reads the sky from here too, so sky and lighting come from one evaluation.
    public readonly palette: TimeOfDayPalette = createPalette();

    public ambientIntensity = 0.1;

    public sunVisibility = 0.0;

    public moonVisibility = 0.0;

    // The one body casting shadows: the more visible of the two. Surface -> body, like lightDirection.
    public readonly shadowLightDirection: Vec3 = { x: 0, y: 1, z: 0 };

    // 0..1, 0 means no shadows this frame
    public shadowStrength = 0.0;

    public timeOfDay = 0.0;

    // Sim time wrapped to the cloud cycle. From sim time, not the time of day, so a Debug
    // time-of-day override doesn't move the clouds.
    public cloudTime = 0.0;

    // Sim time wrapped to the star twinkle cycle, from sim time for the same reason
    public starTime = 0.0;

    // Recyclable internal objects to prevent per-frame garbage collection
    private readonly sunAzimuth = { value: 0 };

    private readonly sunElevation = { value: 0 };

    private readonly sunDirectionForPosition: Vec3 = { x: 0, y: 0, z: 0 };

    private readonly moonDirectionForPosition: Vec3 = { x: 0, y: 0, z: 0 };

    constructor(private cameraFar: number) {} // I assure you, this is useful

    private computeSunSpherical(timeOfDay: number, outAzimuth: { value: number }, outElevation: { value: number }): void {
        const angle = (timeOfDay - 0.25) * Math.PI * 2;
        // We are mindfully overriding the function parameter's memory
        outAzimuth.value = Math.PI / 2 + angle;
        outElevation.value = Math.sin(angle) + this.DECLINATION_OFFSET;
    }

    // sinElevation is already the sine of the angle above the horizon (-1..1), as computeSunSpherical gives it
    private sphericalToDirection(azimuth: number, sinElevation: number, out: Vec3): void {
        const clamped = Math.max(-1, Math.min(1, sinElevation));
        const cosElev = Math.sqrt(1 - clamped * clamped);
        out.x = cosElev * Math.sin(azimuth);
        out.y = clamped;
        out.z = cosElev * Math.cos(azimuth);

        const len = Math.sqrt(out.x * out.x + out.y * out.y + out.z * out.z);
        if (len > 0.0001) {
            out.x /= len; out.y /= len; out.z /= len;
        }
    }

    private computeCelestialVisibility(elevation: number): number {
        const FADE_BAND = 0.15;
        const t = Math.max(0, Math.min(1, (elevation + FADE_BAND) / (2 * FADE_BAND)));
        return t * t * (3 - 2 * t);
    }

    private computeCelestialPosition(dirVec: Vec3, distance: number, cameraPosition: Vec3, out: Vec3): void {
        out.x = cameraPosition.x + dirVec.x * distance;
        out.y = cameraPosition.y + dirVec.y * distance;
        out.z = cameraPosition.z + dirVec.z * distance;
    }

    // timeOfDayOverride (0..1) replaces the clock, for the debug menu. It never changes simulation time.
    public update(
        gameState: GameState,
        cameraPosition: Vec3,
        timeOfDayOverride: number | null = null,
    ): void {
        const interpolatedState = gameState.interpolated;
        const celestialDistance = this.cameraFar - 1.0;

        this.timeOfDay = timeOfDayOverride ?? gameState.timeOfDay;
        paletteAt(this.timeOfDay, this.palette);
        this.cloudTime = cloudTimeAt(interpolatedState.simulationTime);
        this.starTime = starTimeAt(interpolatedState.simulationTime);

        this.computeSunSpherical(this.timeOfDay, this.sunAzimuth, this.sunElevation);

        // Sun vector mapping
        this.sphericalToDirection(this.sunAzimuth.value, this.sunElevation.value, this.lightDirection);
        this.ambientIntensity = this.palette.ambient;

        // Moon vector mapping (Offset by PI)
        const moonAzimuth = this.sunAzimuth.value + Math.PI;
        const moonElevation = -this.sunElevation.value;
        this.sphericalToDirection(moonAzimuth, moonElevation, this.moonLightDirection);

        this.sunVisibility = this.computeCelestialVisibility(this.sunElevation.value);
        this.moonVisibility = this.computeCelestialVisibility(moonElevation);

        // The palette sets each body's color and warmth; visibility fades it across the horizon,
        // in step with shadow strength, which uses visibility too
        const { sunLight, moonLight } = this.palette;
        this.sunColorWithVisibility.x = sunLight.x * this.sunVisibility;
        this.sunColorWithVisibility.y = sunLight.y * this.sunVisibility;
        this.sunColorWithVisibility.z = sunLight.z * this.sunVisibility;

        this.moonColorWithVisibility.x = moonLight.x * this.moonVisibility;
        this.moonColorWithVisibility.y = moonLight.y * this.moonVisibility;
        this.moonColorWithVisibility.z = moonLight.z * this.moonVisibility;

        const sunCasts = this.sunVisibility >= this.moonVisibility;
        const caster = sunCasts ? this.lightDirection : this.moonLightDirection;
        const casterVisibility = sunCasts ? this.sunVisibility : this.moonVisibility;
        this.shadowLightDirection.x = caster.x;
        this.shadowLightDirection.y = caster.y;
        this.shadowLightDirection.z = caster.z;
        const fade = smoothstep((caster.y - this.SHADOW_FADE_LOW) / (this.SHADOW_FADE_HIGH - this.SHADOW_FADE_LOW));
        this.shadowStrength = casterVisibility * fade;

        // Where the sun and moon would be, for the debug HUD (the sky shader draws them by direction)
        this.sunDirectionForPosition.x = this.lightDirection.x;
        this.sunDirectionForPosition.y = this.lightDirection.y;
        this.sunDirectionForPosition.z = this.lightDirection.z;
        this.computeCelestialPosition(this.sunDirectionForPosition, celestialDistance, cameraPosition, this.sunPosition);

        this.moonDirectionForPosition.x = this.moonLightDirection.x;
        this.moonDirectionForPosition.y = this.moonLightDirection.y;
        this.moonDirectionForPosition.z = this.moonLightDirection.z;
        this.computeCelestialPosition(this.moonDirectionForPosition, celestialDistance, cameraPosition, this.moonPosition);
    }
}
