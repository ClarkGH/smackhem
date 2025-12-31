import createGameLoop from '../../core/gameLoop';
import WebGLRenderer from './webGLRenderer';
import { createInputState } from '../../core/input';
import { syncWebInput, createWebInputState, setupWebInput } from './webInput';
import { World } from '../../core/world';
import WebClock from './webClock';
import { createCamera } from '../../core/camera';

// DOM setup
const canvas = document.createElement('canvas');
canvas.width = 800; // TODO: Variable width
canvas.height = 600; // TODO: Variable height
document.body.appendChild(canvas);

const renderer = new WebGLRenderer(canvas);
const inputState = createInputState();
const webInputState = createWebInputState();
const world = new World();
setupWebInput(canvas, inputState, webInputState);

const initialCamera = createCamera();
world.updateActiveChunks(initialCamera.position, renderer);

// Wireframe toggle (press '\' key)
let wireframeEnabled = false;
document.addEventListener('keydown', (e) => {
    if (e.key === '\\') {
        wireframeEnabled = !wireframeEnabled;
        renderer.setWireframe(wireframeEnabled);
        console.log(`Wireframe: ${wireframeEnabled ? 'ON' : 'OFF'}`);
    }
});

const clock = new WebClock();
const gameLoop = createGameLoop(
    renderer,
    inputState,
    world,
    () => canvas.width / canvas.height,
);

const loop = () => {
    clock.update();
    syncWebInput(inputState, webInputState);
    gameLoop.update(clock.getDeltaTime());
    gameLoop.render();
    requestAnimationFrame(loop);
};

loop();
