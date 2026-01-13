import { describe, it, expect } from 'vitest';
import type { Input } from '../../services/input';
import { GameLoop } from '../../core/gameLoop';
import NullRenderer from './nullRenderer';
import { World } from '../../core/world';

describe('Deletion test', () => {
    it('core compiles and runs with stub renderer', () => {
        globalThis.requestAnimationFrame = () => 0;

        const renderer = new NullRenderer();
        const mockInput: Input = {
            getIntent: () => ({
                move: { x: 0, y: 0 },
                look: { yaw: 0, pitch: 0 },
                toggleCamera: false,
            }),
            update: () => {
                // No-op
            },
        };
        const mockWorld: World = new World();

        expect(() => new GameLoop(
            renderer,
            mockInput,
            mockWorld,
            () => 800 / 600,
        )).not.toThrow();
    });
});
