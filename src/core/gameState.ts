import type { Vec3 } from '../types/common';
import type { BattleState } from './battle/battle';
import type { EnemySheetId } from './combat';
import { PLAYER_HEIGHT } from './camera';

export interface TransitionState<T> {
    isActive: boolean;
    isTransitioning: boolean;
    progress: number;
    direction: 1 | -1;
    from: T | null;
    to: T | null;
}

export const createTransitionState = <T>(): TransitionState<T> => ({
    isActive: false,
    isTransitioning: false,
    progress: 0,
    direction: 1,
    from: null,
    to: null,
});

export interface InterpolatedState {
    cameraPosition: Vec3;
    cameraYaw: number;
    cameraPitch: number;
    simulationTime: number;
    instanceCharacterPosition: Vec3;
    sceneCharacterPositionPx: { x: number; y: number };
    instanceTransitionProgress: number;
    sceneTransitionProgress: number;
}

export type GameMode = 'main_menu' | 'world_3d' | 'instance_3d' | 'scene_2d' | 'battle_25djrpg' | 'game_over';

// TODO: Establish a differentiation between exploration in the world and in the instance
export interface DiscreteState {
    gameMode: GameMode;
    debugHUDVisible: boolean;
    instanceIsActive: boolean;
    instanceIsTransitioning: boolean;
    instanceTransitionDirection: 1 | -1;
    interactTarget: string | null;
    savedCameraState: { position: Vec3; yaw: number; pitch: number } | null;
    sceneIsTransitioning: boolean;
    sceneTransitionDirection: 1 | -1;
    isPaused: boolean;
    // From the instance starting to open until it has fully closed, a fight started inside it included.
    // The world's time, movement and look stop while it's set.
    instanceIsOpen: boolean;
    isTransitioningPitch: boolean;
    targetPitch: number;
    // The NPC line on screen, null when nobody is talking. choice is null for a plain line.
    // A plain line closes on Interact or Back. A choice closes when an option is picked, and Back picks No (see GameLoop).
    activeSpeech: { npcId: string; line: string; choice: { options: readonly string[]; selected: number } | null } | null;
    battle: BattleState | null;
    defeatedNpcIds: string[];
    // HP carried between fights by enemies whose sheet keepsDamage (Deathgaze-style, battle.md).
    // By sheet, not placement, since one such enemy can turn up in several places. Missing means full.
    keptEnemyHp: Partial<Record<EnemySheetId, number>>;
}

export interface GameState {
    interpolated: InterpolatedState;
    discrete: DiscreteState;
    timeOfDay: number;
}

export const createGameState = (initialMode: GameMode = 'world_3d'): GameState => ({
    timeOfDay: 0,
    interpolated: {
        cameraPosition: { x: 0, y: PLAYER_HEIGHT, z: 0 },
        cameraYaw: 0,
        cameraPitch: 0,
        simulationTime: 0,
        instanceCharacterPosition: { x: 0, y: 0, z: 0 },
        sceneCharacterPositionPx: { x: 432, y: 336 },
        instanceTransitionProgress: 0,
        sceneTransitionProgress: 0,
    },
    discrete: {
        gameMode: initialMode,
        instanceIsOpen: false,
        isPaused: false,
        debugHUDVisible: false,
        instanceIsActive: false,
        instanceIsTransitioning: false,
        instanceTransitionDirection: 1,
        interactTarget: null,
        savedCameraState: null,
        sceneIsTransitioning: false,
        sceneTransitionDirection: 1,
        isTransitioningPitch: false,
        targetPitch: 0,
        activeSpeech: null,
        // The fight in progress, null outside one. Built at battle start (flag 1), dropped when it ends.
        battle: null,
        defeatedNpcIds: [],
        keptEnemyHp: {},
    },
});
