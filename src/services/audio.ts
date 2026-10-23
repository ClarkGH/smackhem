export type AudioCategory = 'master' | 'sfx' | 'music' | 'ambient' | 'ui';

export interface SoundHandle {
    // Opaque identifier, FFI-friendly and serializable
    readonly id: string;
}

export interface PlaybackHandle {
    pause(): void;
    resume(): void;
    stop(): void;
    isFinished(): boolean;
}

export interface AudioService {
    // Category lets the backend decide buffered vs streamed, core never knows which
    loadSound(soundId: string, category?: AudioCategory): Promise<SoundHandle>;
    play(sound: SoundHandle, category?: AudioCategory, loop?: boolean): PlaybackHandle;
    getVolume(category: AudioCategory): number;
    setVolume(category: AudioCategory, volume: number): void;
}
