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

    it('passes loop through to the audio service', async () => {
        await audioSystem.preload('night_ambience', 'ambient');

        eventBus.publish({
            type: 'play_sound_requested',
            soundId: 'night_ambience',
            category: 'ambient',
            loop: true,
        });
        eventBus.flush();

        expect(audio.playCalls).toEqual([{ id: 'night_ambience', category: 'ambient', loop: true }]);
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

    it('stops every live voice of a sound', async () => {
        await audioSystem.preload('footstep', 'sfx');
        await audioSystem.preload('menu_select', 'ui');

        eventBus.publish({ type: 'play_sound_requested', soundId: 'footstep', category: 'sfx' });
        eventBus.publish({ type: 'play_sound_requested', soundId: 'footstep', category: 'sfx' });
        eventBus.publish({ type: 'play_sound_requested', soundId: 'menu_select', category: 'ui' });
        eventBus.flush();

        eventBus.publish({ type: 'stop_sound_requested', soundId: 'footstep' });
        eventBus.flush();

        const [first, second, other] = audio.voices;
        expect(first.stopped).toBe(true);
        expect(second.stopped).toBe(true);
        expect(other.stopped).toBe(false);
    });

    it('can stop a paused voice', async () => {
        await audioSystem.preload('night_ambience', 'ambient');

        eventBus.publish({
            type: 'play_sound_requested',
            soundId: 'night_ambience',
            category: 'ambient',
            loop: true,
        });
        eventBus.flush();
        audio.voices[0].pause();

        eventBus.publish({ type: 'stop_sound_requested', soundId: 'night_ambience' });
        eventBus.flush();

        expect(audio.voices[0].stopped).toBe(true);
    });

    it('drops finished voices instead of stopping them again', async () => {
        await audioSystem.preload('footstep', 'sfx');

        eventBus.publish({ type: 'play_sound_requested', soundId: 'footstep', category: 'sfx' });
        eventBus.flush();
        audio.voices[0].finish();

        // The next play prunes the finished voice
        eventBus.publish({ type: 'play_sound_requested', soundId: 'footstep', category: 'sfx' });
        eventBus.flush();

        const stop = vi.spyOn(audio.voices[0], 'stop');
        eventBus.publish({ type: 'stop_sound_requested', soundId: 'footstep' });
        eventBus.flush();

        expect(stop).not.toHaveBeenCalled();
        expect(audio.voices[1].stopped).toBe(true);
    });

    it('ignores stopping a sound with no voices', () => {
        eventBus.publish({ type: 'stop_sound_requested', soundId: 'missing' });

        expect(() => eventBus.flush()).not.toThrow();
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
