import type { Renderer } from './renderer';
import type { Clock } from './clock';
import type { Input } from './input';
import type { AudioService } from './audio';

/**
 * Platform services interface
 * Shared between all platform implementations (web, stub, future native/console)
 */
export interface PlatformServices {
    renderer: Renderer;
    clock: Clock;
    input: Input;
    audio: AudioService;
    getAspectRatio: () => number;
}
