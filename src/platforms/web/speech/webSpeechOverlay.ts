import type { SpeechOverlay, SpeechView } from '../../../services/speechOverlay';

/**
 * Web speech bubble: one absolutely placed div over the canvas, inside the same container.
 * A rough placeholder, the design comes later. It never takes mouse events.
 */
export default class WebSpeechOverlay implements SpeechOverlay {
    private readonly bubble: HTMLDivElement;

    constructor(container: HTMLElement) {
        // The bubble is placed relative to the container
        if (getComputedStyle(container).position === 'static') {
            container.style.position = 'relative';
        }

        const bubble = document.createElement('div');
        Object.assign(bubble.style, {
            position: 'absolute',
            display: 'none',
            maxWidth: '260px',
            padding: '8px 12px',
            background: '#fff',
            color: '#000',
            border: '2px solid #000',
            borderRadius: '12px',
            font: '16px monospace',
            pointerEvents: 'none',
            // Centered over the anchor, sitting on top of it
            transform: 'translate(-50%, -100%)',
        });
        container.appendChild(bubble);
        this.bubble = bubble;
    }

    public render(view: SpeechView | null): void {
        if (!view) {
            this.bubble.style.display = 'none';
            return;
        }
        if (this.bubble.textContent !== view.text) this.bubble.textContent = view.text;
        this.bubble.style.left = `${view.x * 100}%`;
        this.bubble.style.top = `${view.y * 100}%`;
        this.bubble.style.display = 'block';
    }
}
