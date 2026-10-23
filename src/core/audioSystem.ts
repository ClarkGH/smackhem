import type {
    AudioCategory,
    AudioService,
    PlaybackHandle,
    SoundHandle,
} from '../services/audio';
import type { TypeSafeEventBus } from './events';

/**
 * Owns loaded sound handles and turns audio events into AudioService calls.
 * Replaces the standalone SoundRegistry, the lookup lives with the system that uses it.
 */
export default class AudioSystem {
    private sounds = new Map<string, SoundHandle>();

    // One voice per sound, bounded by the audio files shipped (M-2)
    private voices = new Map<string, PlaybackHandle>();

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

            const voice = this.voices.get(event.soundId);
            if (voice && !voice.isFinished()) {
                // Loops continue, or resume if paused. One-shots restart.
                if (event.loop) {
                    voice.resume();
                    return;
                }
                voice.stop();
            }

            this.voices.set(event.soundId, this.audio.play(handle, event.category, event.loop));
        });

        eventBus.subscribe('pause_sound_requested', (event) => {
            this.voices.get(event.soundId)?.pause();
        });

        eventBus.subscribe('stop_sound_requested', (event) => {
            const voice = this.voices.get(event.soundId);
            if (!voice) return;
            voice.stop();
            this.voices.delete(event.soundId);
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
