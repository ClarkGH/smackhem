import './platforms/web/webBootstrap';

// Start-up confirmation
console.log("Let's see if we work...");

// Basic WebGL canvas setup placeholder
const canvas = document.createElement('canvas');

document.body.appendChild(canvas);

const gl = canvas.getContext('webgl2');

if (!gl) {
  throw new Error('No hello');
}

gl.clearColor(0, 0, 0, 1);
gl.clear(gl.COLOR_BUFFER_BIT);

// Confirmation that we're running without errors
console.log('Hello world');
