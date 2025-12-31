import { createGameLoop } from '../../core/gameLoop';
import { WebGLRenderer } from './webGLRenderer';
import { createInputState } from '../../core/input';
import { syncWebInput, createWebInputState, setupWebInput } from './webInput';
import { AABB, World } from '../../core/world';
import { createTranslationMatrix } from '../../core/math';

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

// Temporary world chunk data
const chunkId = world.getChunkID(0, 0);
const floorTransform = createTranslationMatrix(0, 0, 0);
const cubeTransform  = createTranslationMatrix(0, 0.5, 0);

world.addChunk({
    id: chunkId,
    bounds: new AABB(
        { x: -5, y: -1, z: -5 },
        { x:  5, y:  5, z:  5 }
    ),
    meshes: [
        // Floor (greyscale)
        {
            mesh: renderer.createPlaneMesh(10),
            transform: floorTransform,
            color: { x: 0.5, y: 0, z: 0.5 }
        },

        // Cube (colored)
        {
            mesh: renderer.createCubeMesh(1),
            transform: cubeTransform,
            color: { x: 0.2, y: 0.8, z: 0.3 }
        }
    ]
});

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
