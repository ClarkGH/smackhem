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

    const playLoop = (soundId: string): void => {
        eventBus.publish({
            type: 'play_sound_requested',
            soundId,
            category: 'ambient',
            loop: true,
        });
    };

    it('keeps the playing voice when a loop is requested again', async () => {
        await audioSystem.preload('ambient_night', 'ambient');

        playLoop('ambient_night');
        eventBus.flush();
        playLoop('ambient_night');
        eventBus.flush();

        expect(audio.voices).toHaveLength(1);
        expect(audio.voices[0].isFinished()).toBe(false);
    });

    it('resumes a paused loop instead of starting another', async () => {
        await audioSystem.preload('ambient_night', 'ambient');

        playLoop('ambient_night');
        eventBus.flush();
        eventBus.publish({ type: 'pause_sound_requested', soundId: 'ambient_night' });
        eventBus.flush();
        expect(audio.voices[0].paused).toBe(true);

        playLoop('ambient_night');
        eventBus.flush();

        expect(audio.voices).toHaveLength(1);
        expect(audio.voices[0].paused).toBe(false);
    });

    it('starts a loop again after it was stopped', async () => {
        await audioSystem.preload('ambient_night', 'ambient');

        playLoop('ambient_night');
        eventBus.flush();
        eventBus.publish({ type: 'stop_sound_requested', soundId: 'ambient_night' });
        eventBus.flush();
        playLoop('ambient_night');
        eventBus.flush();

        expect(audio.voices).toHaveLength(2);
        expect(audio.voices[0].stopped).toBe(true);
        expect(audio.voices[1].isFinished()).toBe(false);
    });

    it('restarts a one-shot, leaving one live voice', async () => {
        await audioSystem.preload('sfx_mode_change', 'sfx');

        // Two requests in the same flush, as from two fixed ticks in one frame
        eventBus.publish({ type: 'play_sound_requested', soundId: 'sfx_mode_change', category: 'sfx' });
        eventBus.publish({ type: 'play_sound_requested', soundId: 'sfx_mode_change', category: 'sfx' });
        eventBus.flush();

        expect(audio.voices).toHaveLength(2);
        expect(audio.voices[0].stopped).toBe(true);
        expect(audio.voices[1].isFinished()).toBe(false);
    });

    it('does not stop a voice that already finished', async () => {
        await audioSystem.preload('sfx_mode_change', 'sfx');

        eventBus.publish({ type: 'play_sound_requested', soundId: 'sfx_mode_change', category: 'sfx' });
        eventBus.flush();
        audio.voices[0].finish();

        const stop = vi.spyOn(audio.voices[0], 'stop');
        eventBus.publish({ type: 'play_sound_requested', soundId: 'sfx_mode_change', category: 'sfx' });
        eventBus.flush();

        expect(stop).not.toHaveBeenCalled();
        expect(audio.voices).toHaveLength(2);
    });

    it('can stop a paused voice', async () => {
        await audioSystem.preload('ambient_night', 'ambient');

        playLoop('ambient_night');
        eventBus.flush();
        eventBus.publish({ type: 'pause_sound_requested', soundId: 'ambient_night' });
        eventBus.publish({ type: 'stop_sound_requested', soundId: 'ambient_night' });
        eventBus.flush();

        expect(audio.voices[0].stopped).toBe(true);
    });

    it('ignores pausing or stopping a sound with no voice', () => {
        eventBus.publish({ type: 'pause_sound_requested', soundId: 'missing' });
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
