import { InputState } from '../../core/input';

export interface KeyMapping {
    forward: string[];
    backward: string[];
    left: string[];
    right: string[];
}

export const DEFAULT_KEY_MAPPING: KeyMapping = {
    forward: ['w', 'W', 'ArrowUp'],
    backward: ['s', 'S', 'ArrowDown'],
    left: ['a', 'A', 'ArrowLeft'],
    right: ['d', 'D', 'ArrowRight'],
};

export interface WebInputState {
    axes : {
        mouseLookX: number;
        mouseLookY: number;
        padLookX: number;
        padLookY: number;
    };
    pressedKeys: Set<string>;
    keyMapping: KeyMapping;
}

export const createWebInputState = (keyMapping?: KeyMapping): WebInputState => ({
    axes: {
        mouseLookX: 0,
        mouseLookY: 0,
        padLookX: 0,
        padLookY: 0,
    },
    pressedKeys: new Set<string>(),
    keyMapping: keyMapping || DEFAULT_KEY_MAPPING,
});

export const setupWebInput = (
    canvas: HTMLCanvasElement,
    core: InputState,
    webState: WebInputState,
) => {
    canvas.addEventListener('mousemove', (e) => {
        webState.axes.mouseLookX = e.movementX;
        webState.axes.mouseLookY = e.movementY;
    });

    const handleKeyDown = (e: KeyboardEvent) => {
        webState.pressedKeys.add(e.key);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
        webState.pressedKeys.delete(e.key);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    canvas.addEventListener('click', () => {
        canvas.requestPointerLock();
    });

    window.addEventListener('gamepadconnected', (e) => {
        console.log(`Gamepad connected: ${e.gamepad.id}`);
    });

    window.addEventListener('gamepadisconnected', (e) => {
        const event = e as GamepadEvent;
        console.log(`Gamepad disconnected: ${event.gamepad.id}`);
    });
};

export const syncWebInput = (coreState: InputState, webState: WebInputState) => {
    const gamepad = navigator.getGamepads()[0];

    let finalLookX = webState.axes.mouseLookX;
    let finalLookY = webState.axes.mouseLookY; // TODO: Invert for accessibility options
    let finalMoveX = 0;
    let finalMoveY = 0;

    const mapping = webState.keyMapping;
    const isKeyPressed = (keys: string[]): boolean => keys.some(
        (key) => webState.pressedKeys.has(key),
    );

    if (isKeyPressed(mapping.forward)) finalMoveY += 1;
    if (isKeyPressed(mapping.backward)) finalMoveY -= 1;
    if (isKeyPressed(mapping.left)) finalMoveX -= 1;
    if (isKeyPressed(mapping.right)) finalMoveX += 1;

    // Normalize diagonal movement
    if (finalMoveX !== 0 && finalMoveY !== 0) {
        const len = Math.sqrt(finalMoveX * finalMoveX + finalMoveY * finalMoveY);
        finalMoveX /= len;
        finalMoveY /= len;
    }

    if (gamepad) {
        const deadzone = 0.15;
        const dz = (v: number) => (Math.abs(v) < deadzone ? 0 : v);
        const padLookX = dz(gamepad.axes[2]);
        const padLookY = dz(gamepad.axes[3]);
        const padMoveX = dz(gamepad.axes[0]);
        const padMoveY = dz(gamepad.axes[1]);

        if (padLookX !== 0 || padLookY !== 0) {
            finalLookX = padLookX;
            finalLookY = padLookY;
        }

        if (padMoveX !== 0 || padMoveY !== 0) {
            finalMoveX = padMoveX;
            finalMoveY = padMoveY;
        }
    }

    // update core
    coreState.axes.lookX = finalLookX;
    coreState.axes.lookY = finalLookY;
    coreState.axes.moveX = finalMoveX;
    coreState.axes.moveY = finalMoveY;

    // Reset mouse deltas or they repeat frames
    webState.axes.mouseLookX = 0;
    webState.axes.mouseLookY = 0;
};
