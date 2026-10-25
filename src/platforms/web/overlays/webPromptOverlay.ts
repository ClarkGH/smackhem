import type { PromptOverlay, PromptView } from '../../../services/promptOverlay';
import type { InputDevice } from '../input/webInput';

// The Interact button on each device, see docs/controls.md
const INTERACT_LABEL: Record<InputDevice, string> = { keyboard: 'E', gamepad: 'Ⓐ' };

/**
 * Web interact prompt: a small key hint over whatever Interact would reach.
 * A rough placeholder like the speech bubble. The label follows the last device the player touched.
 */
export default class WebPromptOverlay implements PromptOverlay {
    private readonly hint: HTMLDivElement;

    constructor(container: HTMLElement, private getDevice: () => InputDevice) {
        if (getComputedStyle(container).position === 'static') {
            container.style.position = 'relative';
        }

        const hint = document.createElement('div');
        Object.assign(hint.style, {
            position: 'absolute',
            display: 'none',
            padding: '2px 8px',
            background: 'rgba(0, 0, 0, 0.7)',
            color: '#fff',
            border: '1px solid #fff',
            borderRadius: '6px',
            font: '14px monospace',
            pointerEvents: 'none',
            transform: 'translate(-50%, -100%)',
        });
        container.appendChild(hint);
        this.hint = hint;
    }

    public render(view: PromptView | null): void {
        if (!view) {
            this.hint.style.display = 'none';
            return;
        }
        const label = INTERACT_LABEL[this.getDevice()];
        if (this.hint.textContent !== label) this.hint.textContent = label;
        this.hint.style.left = `${view.x * 100}%`;
        this.hint.style.top = `${view.y * 100}%`;
        this.hint.style.display = 'block';
    }
}
