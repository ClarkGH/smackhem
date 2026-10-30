import { DEFAULT_BATTLE_LAYOUT, type BattleLayout } from '../battle/battleField';

// Debug-only values, changed from the pause menu's Debug screen and never saved (D-1)
export interface DebugSettings {
    wireframe: boolean;
    shadows: boolean;
    // Multiplier on the renderer's shadow bias, one of SHADOW_BIAS_SCALES
    shadowBiasScale: number;
    // Shown instead of the live clock, null follows simulation time. Quarter hours, 0..95
    timeOfDayQuarter: number | null;
    // Billboards lean back to face the camera fully, instead of standing upright (battle.md, Drawing the fight)
    billboardTilt: boolean;
    // A dark disc under each combatant, off by default: it's lit like any mesh, so it reads as a puck (battle.md, Drawing the fight)
    blobShadows: boolean;
    // The battle camera: degrees it looks down, and units back from the field. Tuned in the debug menu (battle.md, Debug).
    battleCameraPitchDeg: number;
    battleCameraDistance: number;
    // Where the lines stand. Read when a fight starts, so a change shows from the next fight (battle.md, Debug).
    battleLayout: BattleLayout;
}

// Fine enough to tune sunrises and sunsets, which change a lot within an hour
export const QUARTERS_PER_DAY = 96;

// Low shows acne, high shows shadows floating off their casters
export const SHADOW_BIAS_SCALES = [0.25, 0.5, 1, 2, 4];

// Clark's pick from the camera prototype: 15 degrees down from 7 units away
export const BATTLE_CAMERA_PITCH_DEG = 15;
export const BATTLE_CAMERA_DISTANCE = 7;

// The debug menu's steps and limits for the battle camera
export const BATTLE_CAMERA_PITCH_STEP = 5;
export const BATTLE_CAMERA_PITCH_RANGE = { min: 5, max: 75 };
export const BATTLE_CAMERA_DISTANCE_STEP = 0.5;
export const BATTLE_CAMERA_DISTANCE_RANGE = { min: 3, max: 20 };

// The debug menu's step and limits for the battle layout, in units. Depths start past 0, so the lines never meet the center.
export const BATTLE_LAYOUT_STEP = 0.25;
export const BATTLE_DEPTH_RANGE = { min: 0.5, max: 8 };
export const BATTLE_SPACING_RANGE = { min: 0.5, max: 5 };

export const createDebugSettings = (): DebugSettings => ({
    wireframe: false,
    shadows: true,
    shadowBiasScale: 1,
    timeOfDayQuarter: null,
    billboardTilt: false,
    blobShadows: false,
    battleCameraPitchDeg: BATTLE_CAMERA_PITCH_DEG,
    battleCameraDistance: BATTLE_CAMERA_DISTANCE,
    battleLayout: { ...DEFAULT_BATTLE_LAYOUT },
});
