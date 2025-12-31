import type { Renderer } from '../../services/renderer';
import type { Clock } from '../../services/clock';
import type { Input } from '../../services/input';
import createGameLoop from '../../core/gameLoop';
import WebGLRenderer from './webGLRenderer';
import { World } from '../../core/world';
import WebClock from './webClock';
import { createCamera } from '../../core/camera';
import { WebInputService } from './webInputService';

export interface PlatformServices {
    renderer: Renderer;
    clock: Clock;
    input: Input;
    getAspectRatio: () => number;
}

export const createWebPlatform = async (): Promise<PlatformServices> => {
    // DOM setup
    const canvas = document.createElement('canvas');
    canvas.width = 800; // TODO: Variable width
    canvas.height = 600; // TODO: Variable height
    document.body.appendChild(canvas);

    const renderer = new WebGLRenderer(canvas);
    const input = new WebInputService(canvas);
    const clock = new WebClock();

    // Wireframe toggle (press '\' key)
    let wireframeEnabled = false;
    document.addEventListener('keydown', (e) => {
        if (e.key === '\\') {
            wireframeEnabled = !wireframeEnabled;
            renderer.setWireframe(wireframeEnabled);
            console.log(`Wireframe: ${wireframeEnabled ? 'ON' : 'OFF'}`);
        }
    });

    return {
        renderer,
        clock,
        input,
        getAspectRatio: () => canvas.width / canvas.height,
    };
};

// Legacy bootstrap function for direct import (will be removed)
export const bootstrapWeb = (): void => {
    createWebPlatform().then((platform) => {
        const world = new World();
        const initialCamera = createCamera();
        world.updateActiveChunks(initialCamera.position, platform.renderer);

        const gameLoop = createGameLoop(
            platform.renderer,
            platform.input,
            world,
            platform.getAspectRatio,
        );

        const loop = () => {
            platform.clock.update();
            platform.input.update();
            gameLoop.update(platform.clock.getDeltaTime());
            gameLoop.render();
            requestAnimationFrame(loop);
        };

        loop();
    }).catch(console.error);
};
