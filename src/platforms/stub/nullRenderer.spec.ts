import { createGameLoop } from '../../core/gameLoop';
import { NullRenderer } from './nullRenderer';
import { describe, it, expect } from 'vitest';

describe('Deletion test', () => {
  it('core compiles and runs with stub renderer', () => {
    globalThis.requestAnimationFrame = () => 0;

    const renderer = new NullRenderer();

    expect(() => createGameLoop(renderer)).not.toThrow();
  });
});
