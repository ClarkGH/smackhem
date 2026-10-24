import {
    describe,
    it,
    expect,
    beforeEach,
    vi,
} from 'vitest';
import { WebAudioService } from './webAudioService';
import StubAudioService from '../../stub/stubAudioService';
import type { AudioService } from '../../../services/audio';
import {
    audioPlayback,
    FakeAudio,
    FakeAudioContext,
    installFakeWebAudio,
} from '../../../testing/fakeWebAudio';

/**
 * Contract: what core relies on from any AudioService. Runs against the stub and the web service,
 * so a test passing on the stub means the same thing as passing on the real backend.
 */
const describeAudioServiceContract = (name: string, create: () => AudioService): void => {
    describe(`AudioService contract: ${name}`, () => {
        let audio: AudioService;

        beforeEach(() => {
            audio = create();
        });

        it('loads sounds by ID, buffered and streamed', async () => {
            expect((await audio.loadSound('ui_menu_select', 'ui')).id).toBe('ui_menu_select');
            expect((await audio.loadSound('ambient_night', 'ambient')).id).toBe('ambient_night');
        });

        it('a playing voice is not finished, a stopped one is', async () => {
            const voice = audio.play(await audio.loadSound('ui_menu_select', 'ui'), 'ui');
            expect(voice.isFinished()).toBe(false);

            voice.stop();
            expect(voice.isFinished()).toBe(true);
        });

        it('a paused voice is not finished, so it can still be stopped', async () => {
            const voice = audio.play(await audio.loadSound('ambient_night', 'ambient'), 'ambient', true);

            voice.pause();
            expect(voice.isFinished()).toBe(false);
            voice.resume();
            expect(voice.isFinished()).toBe(false);
        });

        it('clamps volume to 0..1 and defaults to full', () => {
            expect(audio.getVolume('music')).toBe(1);
            audio.setVolume('music', 1.5);
            expect(audio.getVolume('music')).toBe(1);
            audio.setVolume('music', -1);
            expect(audio.getVolume('music')).toBe(0);
        });
    });
};

describeAudioServiceContract('StubAudioService', () => new StubAudioService());
describeAudioServiceContract('WebAudioService', () => {
    installFakeWebAudio();
    return new WebAudioService('/assets/audio/', new FakeAudioContext() as unknown as AudioContext);
});

describe('WebAudioService', () => {
    let ctx: FakeAudioContext;
    let audio: WebAudioService;
    let fetchCalls: string[];

    beforeEach(() => {
        ({ fetchCalls } = installFakeWebAudio());
        ctx = new FakeAudioContext();
        audio = new WebAudioService('/assets/audio/', ctx as unknown as AudioContext);
    });

    describe('loading', () => {
        it('maps a sound ID to its file', async () => {
            await audio.loadSound('ui_menu_select', 'ui');

            expect(fetchCalls).toEqual(['/assets/audio/ui_menu_select.ogg']);
        });

        it('shares one fetch between loads of the same sound in flight', async () => {
            const [first, second] = await Promise.all([
                audio.loadSound('ui_menu_select', 'ui'),
                audio.loadSound('ui_menu_select', 'ui'),
            ]);

            expect(fetchCalls).toHaveLength(1);
            expect(first).toBe(second);
        });

        it('lets a failed load be retried', async () => {
            await expect(audio.loadSound('missing_sound', 'sfx')).rejects.toThrow();
            await expect(audio.loadSound('missing_sound', 'sfx')).rejects.toThrow();

            expect(fetchCalls).toHaveLength(2);
        });

        it('streams music and ambience instead of downloading and decoding them', async () => {
            await audio.loadSound('ambient_night', 'ambient');

            expect(fetchCalls).toHaveLength(0);
        });
    });

    describe('buffered playback', () => {
        const playClick = async (loop = false) => audio.play(await audio.loadSound('ui_menu_select', 'sfx'), 'sfx', loop);

        it('resumes from where it was paused, on a new source node', async () => {
            const voice = await playClick();
            expect(ctx.sources[0].startOffset).toBe(0);

            ctx.currentTime = 0.5;
            voice.pause();
            expect(ctx.sources[0].stopped).toBe(true);

            ctx.currentTime = 3;
            voice.resume();
            expect(ctx.sources).toHaveLength(2);
            expect(ctx.sources[1].startOffset).toBeCloseTo(0.5);
        });

        it('wraps the resume point of a looping sound', async () => {
            // Duration is 2s, paused 5s in: 1s into the third loop
            const voice = await playClick(true);
            ctx.currentTime = 5;
            voice.pause();
            voice.resume();

            expect(ctx.sources[1].startOffset).toBeCloseTo(1);
        });

        it('finishes when the sound ends, and resume does nothing after that', async () => {
            const voice = await playClick();

            ctx.sources[0].end();
            expect(voice.isFinished()).toBe(true);

            voice.resume();
            expect(ctx.sources).toHaveLength(1);
        });

        it('ignores the end of a source that pause already replaced', async () => {
            const voice = await playClick();
            const first = ctx.sources[0];
            voice.pause();
            voice.resume();

            // The old node's end event can still arrive late
            first.end();

            expect(voice.isFinished()).toBe(false);
        });

        it('stays stopped', async () => {
            const voice = await playClick();

            voice.stop();
            voice.resume();

            expect(voice.isFinished()).toBe(true);
            expect(ctx.sources).toHaveLength(1);
        });
    });

    describe('streamed playback', () => {
        const playAmbience = async () => audio.play(await audio.loadSound('ambient_night', 'ambient'), 'ambient', true);

        it('streams through a looping audio element', async () => {
            await playAmbience();

            const element = FakeAudio.created[0];
            expect(element.src).toBe('/assets/audio/ambient_night.ogg');
            expect(element.loop).toBe(true);
            expect(element.playCalls).toBe(1);
        });

        it('retries a stream the browser refused, once audio is unlocked', async () => {
            audioPlayback.allowed = false;
            await playAmbience();
            // Let the refused play() settle
            await Promise.resolve();
            await Promise.resolve();

            audioPlayback.allowed = true;
            audio.resumeContext();

            expect(FakeAudio.created[0].playCalls).toBe(2);
            expect(FakeAudio.created[0].paused).toBe(false);
        });

        it('does not retry a refused stream that was paused meanwhile', async () => {
            audioPlayback.allowed = false;
            const voice = await playAmbience();
            await Promise.resolve();
            await Promise.resolve();

            voice.pause();
            audioPlayback.allowed = true;
            audio.resumeContext();

            expect(FakeAudio.created[0].playCalls).toBe(1);
        });

        it('finishes when the element ends or fails to load', async () => {
            vi.spyOn(console, 'error').mockImplementation(() => {});
            const ended = await playAmbience();
            FakeAudio.created[0].dispatch('ended');
            expect(ended.isFinished()).toBe(true);

            const failed = await playAmbience();
            FakeAudio.created[1].dispatch('error');
            expect(failed.isFinished()).toBe(true);
        });
    });

    describe('mixing', () => {
        it('keeps volumes set before the audio context exists, and applies them when it does', async () => {
            const lazy = new WebAudioService('/assets/audio/');
            lazy.setVolume('sfx', 0.25);
            expect(lazy.getVolume('sfx')).toBe(0.25);

            vi.stubGlobal('AudioContext', FakeAudioContext);
            const sound = await lazy.loadSound('ui_menu_select', 'sfx');
            lazy.play(sound, 'sfx');

            // master + sfx/ui/music/ambient, created in that order
            const busVolumes = (lazy as unknown as { gains: Map<string, { gain: { value: number } }> }).gains;
            expect(busVolumes.get('sfx')?.gain.value).toBe(0.25);
        });

        it('starts the context on resumeContext, which needs a user gesture', () => {
            audio.resumeContext();

            expect(ctx.state).toBe('running');
        });
    });
});
