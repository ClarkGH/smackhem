import type {
    AudioCategory,
    AudioService,
    PlaybackHandle,
    SoundHandle,
} from '../../services/audio';

export interface StubPlayCall {
    id: string;
    category: AudioCategory;
    loop: boolean;
}

const noopPlayback: PlaybackHandle = {
    pause: () => {},
    resume: () => {},
    stop: () => {},
};

/**
 * Stub audio implementation for testing (Rule P-1)
 * No browser audio APIs, records play calls for assertions
 */
export default class StubAudioService implements AudioService {
    public readonly playCalls: StubPlayCall[] = [];

    private volumes: Map<AudioCategory, number> = new Map();

    async loadSound(soundId: string): Promise<SoundHandle> {
        return { id: soundId };
    }

    play(sound: SoundHandle, category: AudioCategory = 'sfx', loop: boolean = false): PlaybackHandle {
        this.playCalls.push({ id: sound.id, category, loop });
        return noopPlayback;
    }

    getVolume(category: AudioCategory): number {
        return this.volumes.get(category) ?? 1;
    }

    setVolume(category: AudioCategory, volume: number): void {
        this.volumes.set(category, Math.max(0, Math.min(1, volume)));
    }
}
