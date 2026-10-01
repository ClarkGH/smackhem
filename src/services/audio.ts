export type AudioCategory = 'master' | 'sfx' | 'music' | 'ambient' | 'ui';

export interface SoundHandle {
    readonly id: string;
}

export interface PlaybackHandle {
    pause(): void;
    resume(): void;
    stop(): void;
}

export interface AudioService {
    play(sound: SoundHandle, category?: AudioCategory): PlaybackHandle;
    setVolume(category: AudioCategory, volume: number): void;
    getVolume(category: AudioCategory): number;
}

export class SoundRegistry {
    private cache = new Map<string, SoundHandle>();

    public register(id: string, handle: SoundHandle): void {
        this.cache.set(id, handle);
    }

    public get(id: string): SoundHandle | undefined {
        return this.cache.get(id);
    }
}
