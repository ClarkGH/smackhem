import { InputState } from "src/core/input";

export const setupWebInput = (canvas: HTMLCanvasElement, state: InputState) => {
    // Translate mouse movement
    canvas.addEventListener('mousemove', (e) => {
        state.axes.lookX = e.movementX;
        state.axes.lookY = e.movementY;
    });

    // Request pointer lock on click (required by browsers for security)
    canvas.addEventListener('click', () => {
        canvas.requestPointerLock({ unadjustedMovement: true });
    });

    // Gamepad events
    window.addEventListener("gamepadconnected", (e) => {
        const gamepad = e.gamepad;
        console.log(`Gamepad connected: ${gamepad.id}`);
    });

    window.addEventListener("gamepaddisconnected", (e) => {
        const gamepad = e.gamepad;
        console.log(`Gamepad disconnected: ${gamepad.id}`);
    });
}

export const pollGamepad = (state: InputState) => {
    const gamepad = navigator.getGamepads()[0];
    if (!gamepad) return;
  
    const deadzone = 0.15;
    const dz = (v: number) => Math.abs(v) < deadzone ? 0 : v;
  
    state.axes.padLookX = dz(gamepad.axes[2]);
    state.axes.padLookY = dz(-gamepad.axes[3]); //TODO: Invert based on accessibilty
  
    // Only override mouse if stick is actually moved
    if (state.axes.padLookX !== 0 || state.axes.padLookY !== 0) {
        state.axes.lookX =
          Math.abs(state.axes.padLookX) > 0
            ? state.axes.padLookX
            : state.axes.mouseLookX;
      
        state.axes.lookY =
          Math.abs(state.axes.padLookY) > 0
            ? state.axes.padLookY
            : state.axes.mouseLookY;
    }
};
