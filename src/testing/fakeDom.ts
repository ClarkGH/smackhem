import { vi } from 'vitest';

type Listener = (event: any) => void;

/**
 * Just enough DOM for the web platform's tests: event targets that record listeners and can fire
 * events, a document with fullscreen and pointer-lock state, and canvases whose 2D context
 * records text drawn at a fixed width per character (like a monospace font).
 */
export class FakeEventTarget {
    private listeners = new Map<string, Listener[]>();

    public addEventListener(type: string, listener: Listener): void {
        const list = this.listeners.get(type) ?? [];
        list.push(listener);
        this.listeners.set(type, list);
    }

    public removeEventListener(type: string, listener: Listener): void {
        this.listeners.set(type, (this.listeners.get(type) ?? []).filter((l) => l !== listener));
    }

    // Test-only: fires an event at every listener of that type
    public dispatch(type: string, event: Record<string, unknown> = {}): void {
        const full = { preventDefault: () => {}, ...event };
        (this.listeners.get(type) ?? []).forEach((listener) => listener(full));
    }
}

export const CHAR_WIDTH = 10;

// The document state elements touch (fullscreen, pointer lock), defined before the elements
interface DocumentState {
    fullscreenElement: unknown;
    pointerLockElement: unknown;
    dispatch: (type: string) => void;
}

// The installed document, set by installFakeDom
const current: { document: DocumentState | null } = { document: null };

export interface DrawnText {
    text: string;
    x: number;
    y: number;
}

export class FakeContext2D {
    public drawn: DrawnText[] = [];

    public font = '';

    public fillStyle = '';

    public strokeStyle = '';

    public textBaseline = '';

    public lineWidth = 1;

    public lineJoin = '';

    public miterLimit = 1;

    public clearRect(): void {
        this.drawn = [];
    }

    public fillRect(): void {
        // Background only, nothing to record
    }

    public fillText(text: string, x: number, y: number): void {
        this.drawn.push({ text, x, y });
    }

    public strokeText(): void {
        // Outline only, fillText records the text
    }

    public measureText(text: string): { width: number } {
        return { width: text.length * CHAR_WIDTH };
    }
}

export class FakeElement extends FakeEventTarget {
    public style: Record<string, string> = {};

    public children: FakeElement[] = [];

    public parentElement: FakeElement | null = null;

    public id = '';

    // CSS box, what getBoundingClientRect reports
    public rect = {
        left: 0, top: 0, width: 800, height: 600,
    };

    public fullscreenRequests = 0;

    // Whether the next requestFullscreen is allowed
    public allowFullscreen = true;

    public appendChild(child: FakeElement): FakeElement {
        this.children.push(child);
        // eslint-disable-next-line no-param-reassign
        child.parentElement = this;
        return child;
    }

    public getBoundingClientRect() {
        return { ...this.rect, right: this.rect.left + this.rect.width, bottom: this.rect.top + this.rect.height };
    }

    public requestFullscreen(): Promise<void> {
        this.fullscreenRequests += 1;
        if (!this.allowFullscreen) return Promise.reject(new Error('Fullscreen is not allowed here'));
        if (current.document) {
            current.document.fullscreenElement = this;
            current.document.dispatch('fullscreenchange');
        }
        return Promise.resolve();
    }

    public removeAttribute(): void {
        // Unused attributes
    }
}

export class FakeCanvas extends FakeElement {
    public width = 300;

    public height = 150;

    public ctx = new FakeContext2D();

    // Counts assignments, since assigning a canvas size clears it even when the size is unchanged
    public sizeAssignments = 0;

    public getContext(): FakeContext2D {
        return this.ctx;
    }

    public requestPointerLock(): void {
        if (current.document) {
            current.document.pointerLockElement = this;
            current.document.dispatch('pointerlockchange');
        }
    }
}

// Wraps width/height so tests can count how often a canvas size is assigned
export const trackCanvasSize = (canvas: FakeCanvas): FakeCanvas => {
    let width = canvas.width;
    let height = canvas.height;
    Object.defineProperty(canvas, 'width', {
        get: () => width,
        set: (value: number) => { width = value; canvas.sizeAssignments += 1; },
    });
    Object.defineProperty(canvas, 'height', {
        get: () => height,
        set: (value: number) => { height = value; canvas.sizeAssignments += 1; },
    });
    return canvas;
};

export class FakeDocument extends FakeEventTarget implements DocumentState {
    public fullscreenEnabled = true;

    public fullscreenElement: FakeElement | null = null;

    public pointerLockElement: FakeElement | null = null;

    public body = new FakeElement();

    public created: FakeElement[] = [];

    public createElement(tag: string): FakeElement {
        const element = tag === 'canvas' ? new FakeCanvas() : new FakeElement();
        this.created.push(element);
        return element;
    }

    public getElementById(): null {
        return null;
    }

    public exitFullscreen(): Promise<void> {
        this.fullscreenElement = null;
        this.dispatch('fullscreenchange');
        return Promise.resolve();
    }

    public exitPointerLock(): void {
        this.pointerLockElement = null;
        this.dispatch('pointerlockchange');
    }
}

/**
 * Installs a fresh document and window as globals.
 * Globals are restored after each test by the vitest config (unstubGlobals).
 */
export const installFakeDom = (): { document: FakeDocument; window: FakeEventTarget } => {
    const document = new FakeDocument();
    const window = new FakeEventTarget();
    current.document = document;
    vi.stubGlobal('document', document);
    vi.stubGlobal('window', window);
    return { document, window };
};
