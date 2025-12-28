import { createGameLoop } from '../../core/gameLoop';
import { WebGLRenderer } from './webGLRenderer';

console.log("Smackhem bootstrapping...");

// DOM setup
const canvas = document.createElement('canvas');
canvas.width = 800;  // TODO: Variable width
canvas.height = 600; // TODO: Variable height
document.body.appendChild(canvas);

// Create renderer (platform-specific)
const renderer = new WebGLRenderer(canvas);

// Wireframe toggle (press 'W' key)
let wireframeEnabled = false;
document.addEventListener('keydown', (e) => {
    if (e.key === '\\') {
        wireframeEnabled = !wireframeEnabled;
        renderer.setWireframe(wireframeEnabled);
        console.log(`Wireframe: ${wireframeEnabled ? 'ON' : 'OFF'}`);
    }
});

// Start game loop with renderer
const render = createGameLoop(renderer);

const loop = () => {
  render();
  requestAnimationFrame(loop);
}

loop();