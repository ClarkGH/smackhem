export type PlayerIntent = 'Look';

export interface InputState {
    actions: Record<PlayerIntent, boolean>
    axes: {
        lookX: number;
        lookY: number;
    }
}

export const createInputState = (): InputState => ({
    actions: { Look: false },
    axes: {
        lookX: 0,
        lookY: 0
    }
});
