export type PlayerIntent = 'Look';

export interface InputState {
    actions: Record<PlayerIntent, boolean>
    axes: {
        mouseLookX: number;
        mouseLookY: number;
        padLookX: number;
        padLookY: number;
        lookX: number;
        lookY: number;
    }
}

export const createInputState = (): InputState => ({
    actions: { Look: false },
    axes: {
        mouseLookX: 0,
        mouseLookY: 0,
        padLookX: 0,
        padLookY: 0,
        lookX: 0,
        lookY: 0
    }
});
