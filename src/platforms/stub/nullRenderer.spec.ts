import { InputState } from 'src/core/input';
import { createGameLoop } from '../../core/gameLoop';
import { NullRenderer } from './nullRenderer';
import { describe, it, expect } from 'vitest';

describe('Deletion test', () => {
    it('core compiles and runs with stub renderer', () => {
        globalThis.requestAnimationFrame = () => 0;

        const renderer = new NullRenderer();

        const mockCoreInput : InputState = {
            actions: { Look: true },
            axes: {
                lookX: 0,
                lookY: 0
            }
        };

        expect(() => createGameLoop(renderer, mockCoreInput)).not.toThrow();
  });
});
