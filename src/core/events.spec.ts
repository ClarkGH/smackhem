import { describe, it, expect } from 'vitest';
import { TypeSafeEventBus } from './events';

describe('TypeSafeEventBus', () => {
    it('delivers what was published before the flush, in order', () => {
        const bus = new TypeSafeEventBus();
        const seen: string[] = [];
        bus.subscribe('stop_sound_requested', (event) => seen.push(event.soundId));

        bus.publish({ type: 'stop_sound_requested', soundId: 'a' });
        bus.publish({ type: 'stop_sound_requested', soundId: 'b' });
        expect(seen).toEqual([]);

        bus.flush();
        expect(seen).toEqual(['a', 'b']);
    });

    it('holds what a handler publishes for the next flush', () => {
        const bus = new TypeSafeEventBus();
        const seen: string[] = [];
        bus.subscribe('game_over_requested', () => {
            bus.publish({ type: 'stop_sound_requested', soundId: 'echo' });
        });
        bus.subscribe('stop_sound_requested', (event) => seen.push(event.soundId));

        bus.publish({ type: 'game_over_requested' });
        bus.flush();
        expect(seen).toEqual([]);

        bus.flush();
        expect(seen).toEqual(['echo']);
    });

    it('delivers each event exactly once while the queues swap back and forth', () => {
        const bus = new TypeSafeEventBus();
        const seen: string[] = [];
        // Each event asks for the next, so both queues carry events in turn
        bus.subscribe('stop_sound_requested', (event) => {
            seen.push(event.soundId);
            if (seen.length < 4) bus.publish({ type: 'stop_sound_requested', soundId: `${seen.length}` });
        });

        bus.publish({ type: 'stop_sound_requested', soundId: '0' });
        for (let i = 0; i < 6; i += 1) bus.flush();

        expect(seen).toEqual(['0', '1', '2', '3']);
    });
});
