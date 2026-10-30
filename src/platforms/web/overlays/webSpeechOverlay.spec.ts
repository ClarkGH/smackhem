import {
    describe,
    it,
    expect,
    beforeEach,
    vi,
} from 'vitest';
import WebSpeechOverlay from './webSpeechOverlay';
import type { SpeechView } from '../../../services/speechOverlay';
import { FakeElement, installFakeDom } from '../../../testing/fakeDom';

const YES_NO = ['Yes', 'No'];

const view = (choice: SpeechView['choice']): SpeechView => ({
    text: 'Begin combat', x: 0.5, y: 0.4, choice,
});

describe('WebSpeechOverlay', () => {
    let overlay: WebSpeechOverlay;
    let bubble: FakeElement;
    // The option list, and its rows
    let optionList: FakeElement;
    const rowText = (): string[] => optionList.children
        .filter((row) => row.style.display !== 'none')
        .map((row) => (row as unknown as { textContent: string }).textContent);

    beforeEach(() => {
        installFakeDom();
        vi.stubGlobal('getComputedStyle', () => ({ position: 'relative' }));
        const container = new FakeElement();
        overlay = new WebSpeechOverlay(container as unknown as HTMLElement);
        [bubble] = container.children;
        [, optionList] = bubble.children;
    });

    it('shows a plain line with no options', () => {
        overlay.render(view(null));

        expect(bubble.style.display).toBe('block');
        expect(optionList.style.display).toBe('none');
    });

    it('lists the options, marking the selected one with a shape, not just bold', () => {
        overlay.render(view({ options: YES_NO, selected: 0 }));

        expect(optionList.style.display).toBe('block');
        expect(rowText()).toEqual(['▶ Yes', '  No']);
        expect(optionList.children[0].style.fontWeight).toBe('bold');
    });

    it('moves the mark when the selection moves, reusing its rows', () => {
        overlay.render(view({ options: YES_NO, selected: 0 }));
        const rows = [...optionList.children];

        overlay.render(view({ options: YES_NO, selected: 1 }));

        expect(rowText()).toEqual(['  Yes', '▶ No']);
        expect(optionList.children).toEqual(rows);
    });

    it('hides the options again for a plain line after a choice', () => {
        overlay.render(view({ options: YES_NO, selected: 0 }));

        overlay.render(view(null));

        expect(optionList.style.display).toBe('none');
    });

    it('hides the bubble on null', () => {
        overlay.render(view({ options: YES_NO, selected: 0 }));

        overlay.render(null);

        expect(bubble.style.display).toBe('none');
    });
});
