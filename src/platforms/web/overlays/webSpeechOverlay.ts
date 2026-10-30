import type { SpeechOverlay, SpeechView } from '../../../services/speechOverlay';
import { UI_FONT_FAMILY, createMarkedRow, setMarkedRow } from '../uiText';

// Marks the selected option by shape as well as weight, so it never relies on looks alone
const SELECTED_MARK = '▶';

/**
 * Web speech bubble: one absolutely placed div over the canvas, inside the same container.
 * A rough placeholder, the design comes later. It never takes mouse events.
 */
export default class WebSpeechOverlay implements SpeechOverlay {
    private readonly bubble: HTMLDivElement;

    private readonly text: HTMLDivElement;

    private readonly optionList: HTMLDivElement;

    // One row per option, made once and reused. Rows past the current options are hidden.
    private readonly rows: HTMLDivElement[] = [];

    // What the rows show now, so they're only rewritten when the choice changes, not every frame
    private shownOptions: readonly string[] | null = null;

    private shownSelected = -1;

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
            font: `16px ${UI_FONT_FAMILY}`,
            pointerEvents: 'none',
            // Centered over the anchor, sitting on top of it
            transform: 'translate(-50%, -100%)',
        });

        const text = document.createElement('div');
        bubble.appendChild(text);

        const optionList = document.createElement('div');
        Object.assign(optionList.style, {
            display: 'none',
            marginTop: '6px',
        });
        bubble.appendChild(optionList);

        container.appendChild(bubble);
        this.bubble = bubble;
        this.text = text;
        this.optionList = optionList;
    }

    public render(view: SpeechView | null): void {
        if (!view) {
            this.bubble.style.display = 'none';
            return;
        }
        if (this.text.textContent !== view.text) this.text.textContent = view.text;
        this.renderChoice(view.choice);
        this.bubble.style.left = `${view.x * 100}%`;
        this.bubble.style.top = `${view.y * 100}%`;
        this.bubble.style.display = 'block';
    }

    private renderChoice(choice: SpeechView['choice']): void {
        const options = choice ? choice.options : null;
        const selected = choice ? choice.selected : -1;
        if (options === this.shownOptions && selected === this.shownSelected) return;
        this.shownOptions = options;
        this.shownSelected = selected;

        const count = options ? options.length : 0;
        for (let i = 0; i < count; i += 1) {
            const row = this.rows[i] ?? this.addRow();
            const isSelected = i === selected;
            setMarkedRow(row, isSelected ? SELECTED_MARK : '', options![i]);
            row.style.fontWeight = isSelected ? 'bold' : 'normal';
            row.style.display = 'block';
        }
        for (let i = count; i < this.rows.length; i += 1) {
            this.rows[i].style.display = 'none';
        }
        this.optionList.style.display = count > 0 ? 'block' : 'none';
    }

    private addRow(): HTMLDivElement {
        // The mark's fixed slot keeps the options lined up under each other
        const row = createMarkedRow();
        this.optionList.appendChild(row);
        this.rows.push(row);
        return row;
    }
}
