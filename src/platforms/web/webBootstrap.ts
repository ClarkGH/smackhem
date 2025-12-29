import { createGameLoop } from '../../core/gameLoop';
import { WebGLRenderer } from './webGLRenderer';
import { createInputState } from '../../core/input';
import { pollGamepad, setupWebInput } from './webInput';

console.log("Smackhem bootstrapping...");

// DOM setup
const canvas = document.createElement('canvas');
canvas.width = 800;  // TODO: Variable width
canvas.height = 600; // TODO: Variable height
document.body.appendChild(canvas);

const renderer = new WebGLRenderer(canvas);
const inputState = createInputState();
setupWebInput(canvas, inputState); 

// Wireframe toggle (press '\' key)
let wireframeEnabled = false;
document.addEventListener('keydown', (e) => {
    if (e.key === '\\') {
        wireframeEnabled = !wireframeEnabled;
        renderer.setWireframe(wireframeEnabled);
        console.log(`Wireframe: ${wireframeEnabled ? 'ON' : 'OFF'}`);
    }
});

const render = createGameLoop(renderer, inputState);

const loop = () => {
  pollGamepad(inputState);
  render();
  requestAnimationFrame(loop);
}

loop();
