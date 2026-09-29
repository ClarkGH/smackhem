export type PlayerIntentAction = 'Look' | 'Interact' | 'Pause' | 'ToggleDebugHUD';

export interface InputState {
    actions: Record<PlayerIntentAction, boolean>;
    axes: {
        lookX: number;
        lookY: number;
        moveX: number;
        moveY: number;
    };
}

export const createInputState = (): InputState => ({
    actions: {
        Look: false,
        Interact: false,
        Pause: false,
        ToggleDebugHUD: false,
    },
    axes: {
        lookX: 0,
        lookY: 0,
        moveX: 0,
        moveY: 0,
    },
});
