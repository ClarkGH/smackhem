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

    window.addEventListener("gamepadconnected", (e) => {
        const gp = e.gamepad;
        console.log(`Gamepad connected: ${gp.id}`);
    });
}
