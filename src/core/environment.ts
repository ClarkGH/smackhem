import { Vec3, Mat4 } from '../types/common';
import { GameState } from './gameState';
import { identity } from './math/mathHelpers';

export default class EnvironmentSystem {
    // Configuration Constants
    private readonly DAY_LENGTH_SECONDS = 120;

    private readonly DECLINATION_OFFSET = 0.0;

    private readonly SUN_COLOR: Vec3 = { x: 1.0, y: 0.85, z: 0.2 };

    private readonly MOON_COLOR: Vec3 = { x: 0.4, y: 0.6, z: 0.9 };

    // PERFORMANCE: Pre-allocated fields isolated to this system context
    public readonly lightDirection: Vec3 = { x: 0, y: 0, z: 0 };

    public readonly moonLightDirection: Vec3 = { x: 0, y: 0, z: 0 };

    public readonly sunPosition: Vec3 = { x: 0, y: 0, z: 0 };

    public readonly moonPosition: Vec3 = { x: 0, y: 0, z: 0 };

    public readonly sunColorWithVisibility: Vec3 = { x: 0, y: 0, z: 0 };

    public readonly moonColorWithVisibility: Vec3 = { x: 0, y: 0, z: 0 };

    public readonly sunTransform: Mat4 = identity();

    public readonly moonTransform: Mat4 = identity();

    public ambientIntensity = 0.1;

    public sunVisibility = 0.0;

    public moonVisibility = 0.0;

    public timeOfDay = 0.0;

    // Recyclable internal objects to prevent per-frame garbage collection
    private readonly sunAzimuth = { value: 0 };

    private readonly sunElevation = { value: 0 };

    private readonly sunDirectionForPosition: Vec3 = { x: 0, y: 0, z: 0 };

    private readonly moonDirectionForPosition: Vec3 = { x: 0, y: 0, z: 0 };

    // eslint-disable-next-line
    constructor(private cameraFar: number) {} // I assure you, this is useful

    public computeTimeOfDay(simTime: number): number {
        return (simTime % this.DAY_LENGTH_SECONDS) / this.DAY_LENGTH_SECONDS;
    }

    private computeSunSpherical(timeOfDay: number, outAzimuth: { value: number }, outElevation: { value: number }): void {
        const angle = (timeOfDay - 0.25) * Math.PI * 2;
        // We are mindfully overriding the function parameters memory
        // eslint-disable-next-line
        outAzimuth.value = Math.PI / 2 + angle;
        // eslint-disable-next-line
        outElevation.value = Math.sin(angle) + this.DECLINATION_OFFSET;
    }

    private sphericalToDirection(azimuth: number, elevation: number, out: Vec3): void {
        const cosElev = Math.cos(elevation);
        out.x = cosElev * Math.sin(azimuth);
        out.y = Math.sin(elevation);
        out.z = cosElev * Math.cos(azimuth);

        const len = Math.sqrt(out.x * out.x + out.y * out.y + out.z * out.z);
        if (len > 0.0001) {
            out.x /= len; out.y /= len; out.z /= len;
        }
    }

    private computeAmbientIntensity(elevation: number): number {
        const normalizedElev = Math.max(0, Math.min(1, (elevation + 1) / 2));
        const smoothT = normalizedElev * normalizedElev * (3 - 2 * normalizedElev);
        return 0.1 + (0.5 - 0.1) * smoothT;
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

    private computeCelestialTransform(position: Vec3, size: number, out: Mat4): void {
        const o = out.elements;
        o[0] = size; o[1] = 0; o[2] = 0; o[3] = 0;
        o[4] = 0; o[5] = size; o[6] = 0; o[7] = 0;
        o[8] = 0; o[9] = 0; o[10] = size; o[11] = 0;
        o[12] = position.x; o[13] = position.y; o[14] = position.z; o[15] = 1;
    }

    public update(gameState: GameState, cameraPosition: Vec3, sunSize: number, moonSize: number): void {
        const interpolatedState = gameState.interpolated;
        const celestialDistance = this.cameraFar - 1.0;

        this.timeOfDay = this.computeTimeOfDay(interpolatedState.simulationTime);

        this.computeSunSpherical(this.timeOfDay, this.sunAzimuth, this.sunElevation);

        // Sun vector mapping
        this.sphericalToDirection(this.sunAzimuth.value, this.sunElevation.value, this.lightDirection);
        this.ambientIntensity = this.computeAmbientIntensity(this.sunElevation.value);

        // Moon vector mapping (Offset by PI)
        const moonAzimuth = this.sunAzimuth.value + Math.PI;
        const moonElevation = -this.sunElevation.value;
        this.sphericalToDirection(moonAzimuth, moonElevation, this.moonLightDirection);

        this.sunVisibility = this.computeCelestialVisibility(this.sunElevation.value);
        this.moonVisibility = this.computeCelestialVisibility(moonElevation);

        // Visibility color scaling
        this.sunColorWithVisibility.x = this.SUN_COLOR.x * this.sunVisibility;
        this.sunColorWithVisibility.y = this.SUN_COLOR.y * this.sunVisibility;
        this.sunColorWithVisibility.z = this.SUN_COLOR.z * this.sunVisibility;

        this.moonColorWithVisibility.x = this.MOON_COLOR.x * this.moonVisibility;
        this.moonColorWithVisibility.y = this.MOON_COLOR.y * this.moonVisibility;
        this.moonColorWithVisibility.z = this.MOON_COLOR.z * this.moonVisibility;

        // Position placements tracking camera offset anchor
        this.sunDirectionForPosition.x = this.lightDirection.x;
        this.sunDirectionForPosition.y = this.lightDirection.y;
        this.sunDirectionForPosition.z = this.lightDirection.z;
        this.computeCelestialPosition(this.sunDirectionForPosition, celestialDistance, cameraPosition, this.sunPosition);

        this.moonDirectionForPosition.x = this.moonLightDirection.x;
        this.moonDirectionForPosition.y = this.moonLightDirection.y;
        this.moonDirectionForPosition.z = this.moonLightDirection.z;
        this.computeCelestialPosition(this.moonDirectionForPosition, celestialDistance, cameraPosition, this.moonPosition);

        // Compute local space transform translation matrices
        this.computeCelestialTransform(this.sunPosition, sunSize, this.sunTransform);
        this.computeCelestialTransform(this.moonPosition, moonSize, this.moonTransform);
    }
}
