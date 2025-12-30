import { createGameLoop } from '../../core/gameLoop';
import { WebGLRenderer } from './webGLRenderer';
import { createInputState } from '../../core/input';
import { syncWebInput, createWebInputState, setupWebInput } from './webInput';
import { World } from '../../core/world';

console.log("Smackhem bootstrapping...");

// DOM setup
const canvas = document.createElement('canvas');
canvas.width = 800;  // TODO: Variable width
canvas.height = 600; // TODO: Variable height
document.body.appendChild(canvas);

const renderer = new WebGLRenderer(canvas);
const inputState = createInputState();  // core
const webInputState = createWebInputState();  // platform
const world = new World;
setupWebInput(canvas, inputState, webInputState); 

// Wireframe toggle (press '\' key)
let wireframeEnabled = false;
document.addEventListener('keydown', (e) => {
    if (e.key === '\\') {
        wireframeEnabled = !wireframeEnabled;
        renderer.setWireframe(wireframeEnabled);
        console.log(`Wireframe: ${wireframeEnabled ? 'ON' : 'OFF'}`);
    }
});

const render = createGameLoop(
    renderer,
    inputState,
    world,
    () => canvas.width / canvas.height,
);

const loop = () => {
    syncWebInput(inputState, webInputState);
    render();
    requestAnimationFrame(loop);
}

loop();
