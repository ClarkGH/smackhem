export type PlayerIntent = 'Look';

export interface InputState {
    actions: Record<PlayerIntent, boolean>
    axes: {
        lookX: number;
        lookY: number;
        moveX: -1 | 0 | 1;
        moveY: -1 | 0 | 1;
    }
}

export const createInputState = (): InputState => ({
    actions: { Look: false },
    axes: {
        lookX: 0,
        lookY: 0,
        moveX: 0,
        moveY: 0
    }
});
