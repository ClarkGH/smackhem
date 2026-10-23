import type {
    AudioCategory,
    AudioService,
    PlaybackHandle,
    SoundHandle,
} from '../services/audio';
import type { TypeSafeEventBus } from './events';

// Swap-remove finished voices in place, no allocation (M-1)
const pruneFinished = (voices: PlaybackHandle[]): void => {
    let i = 0;
    while (i < voices.length) {
        if (voices[i].isFinished()) {
            voices[i] = voices[voices.length - 1];
            voices.pop();
        } else {
            i += 1;
        }
    }
};

/**
 * Owns loaded sound handles and turns audio events into AudioService calls.
 * Replaces the standalone SoundRegistry, the lookup lives with the system that uses it.
 */
export default class AudioSystem {
    private sounds = new Map<string, SoundHandle>();

    // Live voices per sound, bounded by sounds played x concurrent voices (M-2)
    private voices = new Map<string, PlaybackHandle[]>();

    private audio: AudioService;

    constructor(audio: AudioService, eventBus: TypeSafeEventBus) {
        this.audio = audio;

        eventBus.subscribe('play_sound_requested', (event) => {
            const handle = this.sounds.get(event.soundId);
            if (!handle) {
                // No loading inside handlers (Pitfall 2), sounds must be preloaded
                console.warn(`Sound not loaded: ${event.soundId}`);
                return;
            }
            const playback = this.audio.play(handle, event.category, event.loop);

            let voices = this.voices.get(event.soundId);
            if (voices) {
                pruneFinished(voices);
            } else {
                voices = [];
                this.voices.set(event.soundId, voices);
            }
            voices.push(playback);
        });

        eventBus.subscribe('stop_sound_requested', (event) => {
            const voices = this.voices.get(event.soundId);
            if (!voices) return;

            for (let i = 0; i < voices.length; i += 1) {
                voices[i].stop();
            }
            voices.length = 0;
        });

        eventBus.subscribe('audio_bus_volume_changed', (event) => {
            this.audio.setVolume(event.category, event.volume);
        });
    }

    public async preload(soundId: string, category: AudioCategory): Promise<void> {
        if (this.sounds.has(soundId)) return;
        const handle = await this.audio.loadSound(soundId, category);
        this.sounds.set(soundId, handle);
    }
}
