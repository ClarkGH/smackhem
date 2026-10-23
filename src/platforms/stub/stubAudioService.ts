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

/**
 * Stateful voice so tests can assert on stop/pause and simulate a sound ending
 */
export class StubPlaybackHandle implements PlaybackHandle {
    public readonly id: string;

    public paused = false;

    public stopped = false;

    private ended = false;

    constructor(id: string) {
        this.id = id;
    }

    pause(): void {
        this.paused = true;
    }

    resume(): void {
        this.paused = false;
    }

    stop(): void {
        this.stopped = true;
    }

    isFinished(): boolean {
        return this.stopped || this.ended;
    }

    // Test-only: the sound played to its end
    finish(): void {
        this.ended = true;
    }
}

/**
 * Stub audio implementation for testing (Rule P-1)
 * No browser audio APIs, records play calls for assertions
 */
export default class StubAudioService implements AudioService {
    public readonly playCalls: StubPlayCall[] = [];

    public readonly voices: StubPlaybackHandle[] = [];

    private volumes: Map<AudioCategory, number> = new Map();

    async loadSound(soundId: string): Promise<SoundHandle> {
        return { id: soundId };
    }

    play(sound: SoundHandle, category: AudioCategory = 'sfx', loop: boolean = false): PlaybackHandle {
        this.playCalls.push({ id: sound.id, category, loop });
        const voice = new StubPlaybackHandle(sound.id);
        this.voices.push(voice);
        return voice;
    }

    getVolume(category: AudioCategory): number {
        return this.volumes.get(category) ?? 1;
    }

    setVolume(category: AudioCategory, volume: number): void {
        this.volumes.set(category, Math.max(0, Math.min(1, volume)));
    }
}
