export type AudioCategory = 'master' | 'sfx' | 'music' | 'ambient' | 'ui';

export interface SoundHandle {
    // Opaque identifier, FFI-friendly and serializable
    readonly id: string;
}

export interface PlaybackHandle {
    pause(): void;
    resume(): void;
    // fadeOutSeconds ramps the voice down, then stops it. 0 or left out cuts at once.
    // Finished from the moment it's called, so core never waits on the fade. It runs on the backend's clock.
    stop(fadeOutSeconds?: number): void;
    isFinished(): boolean;
}

export interface AudioService {
    // Category lets the backend decide buffered vs streamed, core never knows which
    loadSound(soundId: string, category?: AudioCategory): Promise<SoundHandle>;
    // fadeInSeconds ramps the voice up from silence, on the backend's clock. 0 or left out starts at full volume.
    play(sound: SoundHandle, category?: AudioCategory, loop?: boolean, fadeInSeconds?: number): PlaybackHandle;
    getVolume(category: AudioCategory): number;
    setVolume(category: AudioCategory, volume: number): void;
}
