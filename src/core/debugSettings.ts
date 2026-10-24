// Debug-only values, changed from the pause menu's Debug screen and never saved (D-1)
export interface DebugSettings {
    wireframe: boolean;
    shadows: boolean;
    // Multiplier on the renderer's shadow bias, one of SHADOW_BIAS_SCALES
    shadowBiasScale: number;
    // Shown instead of the live clock, null follows simulation time. Whole hours, 0..23
    timeOfDayHour: number | null;
}

// Low shows acne, high shows shadows floating off their casters
export const SHADOW_BIAS_SCALES = [0.25, 0.5, 1, 2, 4];

export const createDebugSettings = (): DebugSettings => ({
    wireframe: false,
    shadows: true,
    shadowBiasScale: 1,
    timeOfDayHour: null,
});
