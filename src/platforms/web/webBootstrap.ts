import { gameLoop } from '../../core/gameLoop';
import { WebGLRenderer } from './webGLRenderer';

console.log("Smackhem bootstrapping...");

// DOM setup
const canvas = document.createElement('canvas');
canvas.width = 800;  // TODO: Variable width
canvas.height = 600; // TODO: Variable height
document.body.appendChild(canvas);

// Create renderer (platform-specific)
const renderer = new WebGLRenderer(canvas);

// Start game loop with renderer
gameLoop(renderer);