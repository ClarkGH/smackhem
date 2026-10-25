import { vi } from 'vitest';

/**
 * Just enough of the Web Audio API and HTMLAudioElement for WebAudioService tests.
 * Time only moves when a test sets currentTime, and sounds only end when a test says so.
 */

export class FakeNode {
    public connected = false;

    public connect(): void {
        this.connected = true;
    }

    public disconnect(): void {
        this.connected = false;
    }
}

export class FakeGain extends FakeNode {
    public gain = { value: 1 };
}

export class FakeBufferSource extends FakeNode {
    public buffer: { duration: number } | null = null;

    public loop = false;

    public onended: (() => void) | null = null;

    public startOffset: number | null = null;

    public stopped = false;

    public start(_when: number, offset: number): void {
        this.startOffset = offset;
    }

    public stop(): void {
        this.stopped = true;
    }

    // Test-only: the sound played to its end
    public end(): void {
        this.onended?.();
    }
}

export class FakeAudioContext {
    public currentTime = 0;

    public state: 'suspended' | 'running' = 'suspended';

    public destination = new FakeNode();

    public sources: FakeBufferSource[] = [];

    public gains: FakeGain[] = [];

    public decodeDuration = 2;

    public createGain(): FakeGain {
        const gain = new FakeGain();
        this.gains.push(gain);
        return gain;
    }

    public createBufferSource(): FakeBufferSource {
        const source = new FakeBufferSource();
        this.sources.push(source);
        return source;
    }

    public createMediaElementSource(): FakeNode {
        return new FakeNode();
    }

    public async decodeAudioData(): Promise<{ duration: number }> {
        return { duration: this.decodeDuration };
    }

    public async resume(): Promise<void> {
        this.state = 'running';
    }
}

// What the next FakeAudio.play() does: start, or refuse like a browser blocking autoplay
export const audioPlayback = { allowed: true };

export class FakeAudio {
    public static created: FakeAudio[] = [];

    public src: string;

    public loop = false;

    public paused = true;

    public currentTime = 0;

    public playCalls = 0;

    private listeners = new Map<string, Array<() => void>>();

    constructor(src: string) {
        this.src = src;
        FakeAudio.created.push(this);
    }

    public play(): Promise<void> {
        this.playCalls += 1;
        if (!audioPlayback.allowed) {
            const error = new Error('play() needs a user gesture');
            error.name = 'NotAllowedError';
            return Promise.reject(error);
        }
        this.paused = false;
        return Promise.resolve();
    }

    public pause(): void {
        this.paused = true;
    }

    public addEventListener(type: string, listener: () => void): void {
        const list = this.listeners.get(type) ?? [];
        list.push(listener);
        this.listeners.set(type, list);
    }

    public removeAttribute(name: string): void {
        if (name === 'src') this.src = '';
    }

    public load(): void {
        // Nothing to reload in a fake
    }

    // Test-only: the element fires an event ('ended', 'error')
    public dispatch(type: string): void {
        (this.listeners.get(type) ?? []).forEach((listener) => listener());
    }
}

/**
 * Installs the fakes as globals. fetch fails for paths containing "missing".
 * Globals are restored after each test by the vitest config (unstubGlobals).
 */
export const installFakeWebAudio = (): { fetchCalls: string[] } => {
    const fetchCalls: string[] = [];
    FakeAudio.created = [];
    audioPlayback.allowed = true;
    vi.stubGlobal('Audio', FakeAudio);
    vi.stubGlobal('fetch', async (url: string) => {
        fetchCalls.push(url);
        return {
            ok: !url.includes('missing'),
            arrayBuffer: async () => new ArrayBuffer(8),
        };
    });
    return { fetchCalls };
};
