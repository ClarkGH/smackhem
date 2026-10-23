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

// Browser "standard" gamepad layout, Xbox labels (A bottom, B right, X left, Y top)
const PAD_BUTTON = {
    A: 0,
    B: 1,
    Y: 3,
    START: 9,
    UP: 12,
    DOWN: 13,
    LEFT: 14,
    RIGHT: 15,
} as const;

const STICK_DEADZONE = 0.15;
// A left stick push past this counts as one menu step
const STICK_NAVIGATE_THRESHOLD = 0.5;

export interface WebInputState {
    axes : {
        mouseLookX: number;
        mouseLookY: number;
        padLookX: number;
        padLookY: number;
    };
    pressedKeys: Set<string>;
    keyMapping: KeyMapping;
    toggleDebugHUD: boolean;
    pause: boolean;
    interact: boolean;
    back: boolean;
    // The menu button: Escape, Start, or losing the cursor during play
    menu: boolean;
    // Whether a menu is showing, so losing the cursor to it isn't read as a pause request
    menuOpen: boolean;
    // Last menu step pressed this frame
    navigate: { x: number; y: number };
    // Previous frame's gamepad state, to act on presses rather than holds
    padButtons: boolean[];
    padStickStep: { x: number; y: number };
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
    toggleDebugHUD: false,
    pause: false,
    interact: false,
    back: false,
    menu: false,
    menuOpen: false,
    navigate: { x: 0, y: 0 },
    padButtons: [],
    padStickStep: { x: 0, y: 0 },
});

export const setupWebInput = (
    canvas: HTMLCanvasElement,
    core: InputState,
    webState: WebInputState,
) => {
    canvas.addEventListener('mousemove', (e) => {
        // Several events can arrive per frame, keep all of them
        webState.axes.mouseLookX += e.movementX;
        webState.axes.mouseLookY += e.movementY;
    });

    const handleKeyDown = (e: KeyboardEvent) => {
        webState.pressedKeys.add(e.key);
        // Toggle debug HUD on F3 (debug keys live on the F-keys, see docs/controls.md)
        if (e.key === 'F3') {
            webState.toggleDebugHUD = true;
            // Prevent the browser's find-next
            e.preventDefault();
        }
        // Pause on space key
        if (e.key === ' ' || e.key === 'Space') {
            webState.pause = true;
            e.preventDefault(); // Prevent page scroll
        }
        // Interact on E key, Enter also confirms in menus
        if (e.key === 'e' || e.key === 'E' || e.key === 'Enter') {
            webState.interact = true;
        }
        if (e.key === 'Escape' || e.key === 'Backspace') {
            webState.back = true;
            e.preventDefault();
        }
        // Escape is also the menu button: it opens the pause menu during play
        if (e.key === 'Escape') {
            webState.menu = true;
        }
        // Embedded in a page (itch.io), these would scroll it around the game
        if (e.key.startsWith('Arrow') || e.key === 'Enter') {
            e.preventDefault();
        }
        // Menu steps from the movement keys, key repeat scrolls through items
        const mapping = webState.keyMapping;
        if (mapping.forward.includes(e.key)) webState.navigate.y = 1;
        if (mapping.backward.includes(e.key)) webState.navigate.y = -1;
        if (mapping.left.includes(e.key)) webState.navigate.x = -1;
        if (mapping.right.includes(e.key)) webState.navigate.x = 1;
    };

    const handleKeyUp = (e: KeyboardEvent) => {
        webState.pressedKeys.delete(e.key);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    canvas.addEventListener('click', () => {
        canvas.requestPointerLock();
    });
    // Browsers release the cursor on Escape and may not pass that Escape on to the page,
    // so losing the cursor during play counts as the menu button. A menu releasing it doesn't.
    document.addEventListener('pointerlockchange', () => {
        if (!document.pointerLockElement && !webState.menuOpen) {
            webState.menu = true;
        }
    });
    // e.g. an iframe without pointer lock permission
    document.addEventListener('pointerlockerror', () => {
        console.warn('Pointer lock refused, mouse look needs the cursor captured');
    });

    window.addEventListener('gamepadconnected', (e) => {
        console.log(`Gamepad connected: ${e.gamepad.id}`);
    });

    window.addEventListener('gamepadisconnected', (e) => {
        const event = e as GamepadEvent;
        console.log(`Gamepad disconnected: ${event.gamepad.id}`);
    });
};

const stickStep = (value: number): number => {
    if (value > STICK_NAVIGATE_THRESHOLD) return 1;
    if (value < -STICK_NAVIGATE_THRESHOLD) return -1;
    return 0;
};

export const syncWebInput = (
    coreState: InputState,
    webState: WebInputState,
): { toggleDebugHUD: boolean; pause: boolean; interact: boolean } => {
    // Reset toggle flags after sync (they're consumed once per frame)
    const toggleDebugHUD = webState.toggleDebugHUD;
    webState.toggleDebugHUD = false;
    let pause = webState.pause;
    webState.pause = false;
    let interact = webState.interact;
    webState.interact = false;
    let back = webState.back;
    webState.back = false;
    let menu = webState.menu;
    webState.menu = false;
    let navigateX = webState.navigate.x;
    let navigateY = webState.navigate.y;
    webState.navigate.x = 0;
    webState.navigate.y = 0;

    let finalLookRateX = 0;
    let finalLookRateY = 0;
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

    const gamepad = navigator.getGamepads()[0];
    if (gamepad) {
        const dz = (v: number) => (Math.abs(v) < STICK_DEADZONE ? 0 : v);
        const padMoveX = dz(gamepad.axes[0]);
        const padMoveY = dz(gamepad.axes[1]);

        // The right stick is a turn rate, kept apart from the mouse's distance
        finalLookRateX = dz(gamepad.axes[2]);
        finalLookRateY = dz(gamepad.axes[3]);

        if (padMoveX !== 0 || padMoveY !== 0) {
            finalMoveX = padMoveX;
            finalMoveY = -padMoveY;
        }

        // Buttons act on the press, not while held
        const justPressed = (index: number): boolean => {
            const isPressed = gamepad.buttons[index]?.pressed ?? false;
            const wasPressed = webState.padButtons[index] ?? false;
            webState.padButtons[index] = isPressed;
            return isPressed && !wasPressed;
        };
        const padA = justPressed(PAD_BUTTON.A);
        const padB = justPressed(PAD_BUTTON.B);
        const padY = justPressed(PAD_BUTTON.Y);
        const padStart = justPressed(PAD_BUTTON.START);
        const padUp = justPressed(PAD_BUTTON.UP);
        const padDown = justPressed(PAD_BUTTON.DOWN);
        const padLeft = justPressed(PAD_BUTTON.LEFT);
        const padRight = justPressed(PAD_BUTTON.RIGHT);

        if (padA) interact = true;
        if (padB) back = true;
        if (padY) pause = true;
        if (padStart) menu = true;
        if (padUp) navigateY = 1;
        if (padDown) navigateY = -1;
        if (padLeft) navigateX = -1;
        if (padRight) navigateX = 1;

        // One menu step per left stick push, stick up is negative
        const stepX = stickStep(gamepad.axes[0]);
        const stepY = -stickStep(gamepad.axes[1]);
        if (stepX !== 0 && stepX !== webState.padStickStep.x) navigateX = stepX;
        if (stepY !== 0 && stepY !== webState.padStickStep.y) navigateY = stepY;
        webState.padStickStep.x = stepX;
        webState.padStickStep.y = stepY;
    }

    // update core
    coreState.axes.lookX = webState.axes.mouseLookX;
    coreState.axes.lookY = webState.axes.mouseLookY;
    coreState.axes.lookRateX = finalLookRateX;
    coreState.axes.lookRateY = finalLookRateY;
    coreState.axes.moveX = finalMoveX;
    coreState.axes.moveY = finalMoveY;

    if (interact) coreState.actions.Interact = true;
    if (pause) coreState.actions.Pause = true;
    if (toggleDebugHUD) coreState.actions.ToggleDebugHUD = true;
    if (back) coreState.actions.Back = true;
    if (menu) coreState.actions.Menu = true;
    if (navigateX !== 0) coreState.navigate.x = navigateX;
    if (navigateY !== 0) coreState.navigate.y = navigateY;

    // Reset mouse deltas or they repeat frames
    webState.axes.mouseLookX = 0;
    webState.axes.mouseLookY = 0;

    return { toggleDebugHUD, pause, interact };
};
