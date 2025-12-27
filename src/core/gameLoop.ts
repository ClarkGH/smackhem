import type { Renderer } from '../services/renderer';

export function gameLoop(renderer: Renderer): void {
    // Basic render loop - just clear the screen for now
    function render() {
        renderer.beginFrame();
        // TODO: Draw meshes here
        renderer.endFrame();
        
        // Request next frame
        requestAnimationFrame(render);
    }
    
    // Start the render loop
    render();
}
