// Temporary Test file to verify deletion test (RULE P-1)
// This demonstrates that core code can compile and run with only stub backends
// 
// To test: Delete all files in platforms/web/ and platforms/native/
// Then import this instead of webBootstrap in main.ts

import { gameLoop } from '../../core/gameLoop';
import { NullRenderer } from './nullRenderer';

console.log("Testing deletion test - using NullRenderer stub");

// Create null renderer (no actual rendering, just satisfies interface)
const renderer = new NullRenderer();

// Core game loop should work with stub renderer
// (It won't render anything, but it compiles and runs)
gameLoop(renderer);

console.log("Deletion test passed: Core compiles with stub backends only");

