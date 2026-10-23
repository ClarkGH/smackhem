import {
    describe,
    it,
    expect,
    beforeEach,
    vi,
} from 'vitest';
import { TypeSafeEventBus } from './events';
import AudioSystem from './audioSystem';
import StubAudioService from '../platforms/stub/stubAudioService';
import createStubPlatform from '../platforms/stub/stubBootstrap';

describe('AudioSystem - event integration', () => {
    let audio: StubAudioService;
    let eventBus: TypeSafeEventBus;
    let audioSystem: AudioSystem;

    beforeEach(() => {
        audio = new StubAudioService();
        eventBus = new TypeSafeEventBus();
        audioSystem = new AudioSystem(audio, eventBus);
    });

    it('plays a preloaded sound on flush', async () => {
        await audioSystem.preload('menu_select', 'ui');

        eventBus.publish({ type: 'play_sound_requested', soundId: 'menu_select', category: 'ui' });
        eventBus.flush();

        expect(audio.playCalls).toEqual([{ id: 'menu_select', category: 'ui', loop: false }]);
    });

    it('does not play before the bus is flushed', async () => {
        await audioSystem.preload('menu_select', 'ui');

        eventBus.publish({ type: 'play_sound_requested', soundId: 'menu_select', category: 'ui' });

        expect(audio.playCalls).toHaveLength(0);
    });

    it('ignores sounds that were never loaded', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        eventBus.publish({ type: 'play_sound_requested', soundId: 'missing', category: 'sfx' });

        expect(() => eventBus.flush()).not.toThrow();
        expect(audio.playCalls).toHaveLength(0);
        expect(warn).toHaveBeenCalledOnce();

        warn.mockRestore();
    });

    it('applies bus volume changes', () => {
        eventBus.publish({ type: 'audio_bus_volume_changed', category: 'music', volume: 0.25 });
        eventBus.flush();

        expect(audio.getVolume('music')).toBe(0.25);
        expect(audio.getVolume('sfx')).toBe(1);
    });

    it('stub platform exposes an audio service (RULE P-1)', async () => {
        const platform = await createStubPlatform();

        expect(platform.audio).toBeInstanceOf(StubAudioService);
    });
});
