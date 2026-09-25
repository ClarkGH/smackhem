import { Vec3 } from 'src/types/common';

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

export type GameMode = 'world_3d' | 'instance_3d' | 'scene_2d';

// TODO: Consider renaming isPaused to something else if it's only pausing the 3D world
// TODO: Establish a differentiation between exploration in the world and in the instance
export interface DiscreteState {
    gameMode: GameMode;
    isPaused: boolean;
    debugHUDVisible: boolean;
    instanceIsActive: boolean;
    instanceIsTransitioning: boolean;
    instanceTransitionDirection: 1 | -1;
    sceneIsActive: boolean
    sceneIsTransitioning: boolean;
    sceneTransitionDirection: 1 | -1;
    sceneIsPaused: boolean;
    sceneCharacterPositionGrid: { x: number; y: number };
    isTransitioningPitch: boolean;
    savedPitch: number;
    targetPitch: number;
}

export interface GameState {
    interpolated: InterpolatedState;
    discrete: DiscreteState;
}

export const createGameState = (): GameState => ({
    interpolated: {
        cameraPosition: { x: 0, y: 0, z: 0 },
        cameraYaw: 0,
        cameraPitch: 0,
        simulationTime: 0,
        instanceCharacterPosition: { x: 0, y: 0, z: 0 },
        sceneCharacterPositionPx: { x: 432, y: 336 },
        instanceTransitionProgress: 0,
        sceneTransitionProgress: 0,
    },
    discrete: {
        gameMode: 'world_3d',
        isPaused: false,
        debugHUDVisible: false,
        instanceIsActive: false,
        instanceIsTransitioning: false,
        instanceTransitionDirection: 1,
        sceneIsActive: false,
        sceneIsTransitioning: false,
        sceneTransitionDirection: 1,
        sceneIsPaused: false,
        sceneCharacterPositionGrid: { x: 12, y: 9 },
        isTransitioningPitch: false,
        savedPitch: 0,
        targetPitch: 0,
    },
});
