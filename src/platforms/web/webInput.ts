import { InputState } from "../../core/input";

export interface WebInputState {
    axes : {
        mouseLookX: number;
        mouseLookY: number;
        padLookX: number;
        padLookY: number;
    }
}

export const createWebInputState = (): WebInputState => ({
    axes: {
        mouseLookX: 0,
        mouseLookY: 0,
        padLookX: 0,
        padLookY: 0
    }
});

export const setupWebInput = (
    canvas: HTMLCanvasElement,
    core: InputState,
    web: WebInputState
  ) => {
    canvas.addEventListener("mousemove", e => {
        web.axes.mouseLookX = e.movementX;
        web.axes.mouseLookY = e.movementY;
    });

    canvas.addEventListener("click", () => {
        canvas.requestPointerLock();
    });

    window.addEventListener("gamepadconnected", e => {
        console.log(`Gamepad connected: ${e.gamepad.id}`);
    });

    window.addEventListener("gamepadisconnected", e => {
        const event = e as GamepadEvent;
        console.log(`Gamepad disconnected: ${event.gamepad.id}`);
    });
};

export const syncWebInput = (coreState: InputState, webState: WebInputState) => {
    const gamepad = navigator.getGamepads()[0];

    let finalX = webState.axes.mouseLookX;
    let finalY = webState.axes.mouseLookY; // TODO: Invert accessibility options

    if (gamepad) {
        const deadzone = 0.15;
        const dz = (v: number) => Math.abs(v) < deadzone ? 0 : v;
        const padX = dz(gamepad.axes[2]);
        const padY = dz(gamepad.axes[3]);

        if (padX !== 0 || padY !== 0) {
            finalX = padX;
            finalY = padY;
        }
    }

    // update core
    coreState.axes.lookX = finalX;
    coreState.axes.lookY = finalY;

    // Reset mouse deltas or they repeat frames
    webState.axes.mouseLookX = 0;
    webState.axes.mouseLookY = 0;
};
