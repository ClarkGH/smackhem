import type {
    AudioCategory,
    AudioService,
    PlaybackHandle,
    SoundHandle,
} from '../../../services/audio';

// Long-form categories stream from a media element instead of decoding into memory (Pitfall 3)
const STREAMED_CATEGORIES: ReadonlySet<AudioCategory> = new Set<AudioCategory>(['music', 'ambient']);

const MIX_CATEGORIES: readonly AudioCategory[] = ['sfx', 'ui', 'music', 'ambient'];

/**
 * Buffered sound, hidden from core: contains raw decompressed PCM AudioBuffer in memory
 */
export class WebSoundHandle implements SoundHandle {
    public readonly id: string;

    public readonly buffer: AudioBuffer;

    constructor(id: string, buffer: AudioBuffer) {
        this.id = id;
        this.buffer = buffer;
    }
}

/**
 * Streamed sound, only the URL is kept. Nothing is decoded until playback.
 */
export class WebStreamHandle implements SoundHandle {
    public readonly id: string;

    public readonly url: string;

    constructor(id: string, url: string) {
        this.id = id;
        this.url = url;
    }
}

/**
 * Playback of a buffered sound.
 * AudioBufferSourceNodes are single-use, so every start/resume creates a fresh node.
 */
export class WebPlaybackHandle implements PlaybackHandle {
    private source: AudioBufferSourceNode | null = null;

    private startedAt = 0;

    private pauseOffset = 0;

    private finished = false;

    private readonly ctx: AudioContext;

    private readonly buffer: AudioBuffer;

    private readonly output: AudioNode;

    private readonly loop: boolean;

    constructor(ctx: AudioContext, buffer: AudioBuffer, output: AudioNode, loop: boolean) {
        this.ctx = ctx;
        this.buffer = buffer;
        this.output = output;
        this.loop = loop;
        this.start(0);
    }

    private start(offset: number): void {
        const source = this.ctx.createBufferSource();
        source.buffer = this.buffer;
        source.loop = this.loop;
        source.connect(this.output);
        source.onended = () => {
            // Ignore stale nodes, pause/stop detach their own handler
            if (this.source !== source) return;
            this.source = null;
            this.finished = true;
        };
        source.start(0, offset);

        this.source = source;
        this.startedAt = this.ctx.currentTime - offset;
    }

    private halt(): void {
        if (!this.source) return;
        const source = this.source;
        this.source = null;
        source.onended = null;
        source.stop();
        source.disconnect();
    }

    public pause(): void {
        if (!this.source) return;
        const elapsed = this.ctx.currentTime - this.startedAt;
        this.pauseOffset = this.loop
            ? elapsed % this.buffer.duration
            : Math.min(elapsed, this.buffer.duration);
        this.halt();
    }

    public resume(): void {
        if (this.source || this.finished) return;
        this.start(this.pauseOffset);
    }

    public stop(): void {
        this.halt();
        this.finished = true;
    }

    public isFinished(): boolean {
        return this.finished;
    }
}

/**
 * Playback of a streamed sound, an HTMLAudioElement routed into the category mix bus.
 */
export class WebStreamPlaybackHandle implements PlaybackHandle {
    private readonly element: HTMLAudioElement;

    private readonly node: MediaElementAudioSourceNode;

    private readonly onBlocked: (handle: WebStreamPlaybackHandle) => void;

    private finished = false;

    // Autoplay rejected play(), waiting for the service to retry after a user gesture
    private blocked = false;

    constructor(
        ctx: AudioContext,
        url: string,
        output: AudioNode,
        loop: boolean,
        onBlocked: (handle: WebStreamPlaybackHandle) => void,
    ) {
        this.onBlocked = onBlocked;
        this.element = new Audio(url);
        this.element.loop = loop;
        // Never fires while looping, only stop() finishes a loop
        this.element.addEventListener('ended', () => this.finish());
        this.element.addEventListener('error', () => {
            if (this.finished) return;
            console.error(`Failed to stream audio: ${url}`);
            this.finish();
        });
        this.node = ctx.createMediaElementSource(this.element);
        this.node.connect(output);
        this.playElement();
    }

    private playElement(): void {
        this.element.play().catch((error: DOMException) => {
            if (error.name === 'NotAllowedError' && !this.finished) {
                this.blocked = true;
                this.onBlocked(this);
                return;
            }
            // AbortError: pause() or stop() interrupted play(), nothing to report
            if (error.name !== 'AbortError') {
                console.error(`Failed to stream audio: ${this.element.src}`, error);
            }
        });
    }

    private finish(): void {
        if (this.finished) return;
        this.finished = true;
        this.blocked = false;
        this.element.pause();
        this.node.disconnect();
        // Release the network stream
        this.element.removeAttribute('src');
        this.element.load();
    }

    /**
     * Called by the service inside a user gesture, once autoplay is allowed
     */
    public retryBlocked(): void {
        if (!this.blocked) return;
        this.blocked = false;
        this.playElement();
    }

    public pause(): void {
        // A paused voice should not start when audio unlocks
        this.blocked = false;
        this.element.pause();
    }

    public resume(): void {
        if (this.finished || !this.element.paused) return;
        this.playElement();
    }

    public stop(): void {
        this.finish();
    }

    public isFinished(): boolean {
        return this.finished;
    }
}

/**
 * Web Audio implementation of AudioService
 *
 * Voice -> [category gain] -> [master gain] -> speakers
 */
export class WebAudioService implements AudioService {
    // Keyed by sound ID only, a sound's category is fixed by its first load
    private cache: Map<string, Promise<SoundHandle>> = new Map();

    private volumes: Map<AudioCategory, number> = new Map();

    private gains: Map<AudioCategory, GainNode> = new Map();

    private audioContext?: AudioContext;

    private basePath: string;

    // Streams the browser refused to autoplay, retried on resumeContext()
    private blockedStreams: WebStreamPlaybackHandle[] = [];

    constructor(basePath: string, audioContext?: AudioContext) {
        this.basePath = basePath;
        this.audioContext = audioContext;
        this.volumes.set('master', 1);
        MIX_CATEGORIES.forEach((category) => this.volumes.set(category, 1));
    }

    // Lazily built so construction has no side effects before a user gesture
    private getAudioContext(): AudioContext {
        if (!this.audioContext) {
            this.audioContext = new AudioContext();
        }

        if (this.gains.size === 0) {
            const ctx = this.audioContext;
            const master = ctx.createGain();
            master.gain.value = this.getVolume('master');
            master.connect(ctx.destination);
            this.gains.set('master', master);

            MIX_CATEGORIES.forEach((category) => {
                const gain = ctx.createGain();
                gain.gain.value = this.getVolume(category);
                gain.connect(master);
                this.gains.set(category, gain);
            });
        }

        return this.audioContext;
    }

    private getCategoryGain(category: AudioCategory): GainNode {
        this.getAudioContext();
        return this.gains.get(category)!;
    }

    /**
     * Browsers start AudioContexts suspended until a user gesture (web-only, not on AudioService)
     */
    public resumeContext(): void {
        const ctx = this.getAudioContext();
        if (ctx.state === 'suspended') {
            ctx.resume().catch((error) => {
                console.error('Failed to resume AudioContext:', error);
            });
        }

        // Retry synchronously, play() only counts as user-initiated inside the gesture
        const blocked = this.blockedStreams;
        this.blockedStreams = [];
        for (let i = 0; i < blocked.length; i += 1) {
            blocked[i].retryBlocked();
        }
    }

    public loadSound(soundId: string, category: AudioCategory = 'sfx'): Promise<SoundHandle> {
        const cached = this.cache.get(soundId);
        if (cached) {
            return cached;
        }

        // Cache the in-flight load so concurrent requests share one fetch and decode
        const pending = this.fetchSound(soundId, category);
        this.cache.set(soundId, pending);
        // Failed loads are evicted so they can be retried
        pending.catch(() => this.cache.delete(soundId));
        return pending;
    }

    private async fetchSound(soundId: string, category: AudioCategory): Promise<SoundHandle> {
        // Map sound ID to file path (backend-specific, Rule A-1)
        const path = `${this.basePath}${soundId}.ogg`;

        if (STREAMED_CATEGORIES.has(category)) {
            return new WebStreamHandle(soundId, path);
        }

        const response = await fetch(path);
        if (!response.ok) {
            throw new Error(`Failed to load sound: ${path}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await this.getAudioContext().decodeAudioData(arrayBuffer);

        return new WebSoundHandle(soundId, audioBuffer);
    }

    public play(sound: SoundHandle, category: AudioCategory = 'sfx', loop: boolean = false): PlaybackHandle {
        const ctx = this.getAudioContext();
        const output = this.getCategoryGain(category);

        if (sound instanceof WebStreamHandle) {
            return new WebStreamPlaybackHandle(ctx, sound.url, output, loop, (handle) => {
                this.blockedStreams.push(handle);
            });
        }

        if (sound instanceof WebSoundHandle) {
            return new WebPlaybackHandle(ctx, sound.buffer, output, loop);
        }

        throw new Error(`Invalid asset passed to WebAudioService: ${sound.id}`);
    }

    public getVolume(category: AudioCategory): number {
        return this.volumes.get(category) ?? 1;
    }

    public setVolume(category: AudioCategory, volume: number): void {
        const clamped = Math.max(0, Math.min(1, volume));
        this.volumes.set(category, clamped);

        const gain = this.gains.get(category);
        if (gain) {
            gain.gain.value = clamped;
        }
    }
}

export default WebAudioService;
