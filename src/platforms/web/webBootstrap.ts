import { gameLoop } from '../../core/gameLoop';
import { WebGLRenderer } from './webGLRenderer';

console.log("Smackhem bootstrapping...");

// DOM setup
const canvas = document.createElement('canvas');
document.body.appendChild(canvas);

// Create renderer (platform-specific)
const renderer = new WebGLRenderer(canvas);

// Start game loop
gameLoop();
