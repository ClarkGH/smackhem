export type PlayerIntentAction = 'Look' | 'Interact' | 'Pause' | 'ToggleDebugHUD' | 'Back' | 'Menu';

export interface InputState {
    actions: Record<PlayerIntentAction, boolean>;
    axes: {
        // Mouse: distance moved this frame
        lookX: number;
        lookY: number;
        // Stick: turn rate, -1..1
        lookRateX: number;
        lookRateY: number;
        moveX: number;
        moveY: number;
    };
    // Edge-triggered menu steps, -1 / 0 / 1, cleared once read
    navigate: {
        x: number;
        y: number;
    };
}

export const createInputState = (): InputState => ({
    actions: {
        Look: false,
        Interact: false,
        Pause: false,
        ToggleDebugHUD: false,
        Back: false,
        Menu: false,
    },
    axes: {
        lookX: 0,
        lookY: 0,
        lookRateX: 0,
        lookRateY: 0,
        moveX: 0,
        moveY: 0,
    },
    navigate: {
        x: 0,
        y: 0,
    },
});
