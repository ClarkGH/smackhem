import type { SpeechOverlay, SpeechView } from '../../services/speechOverlay';

/**
 * Stub speech overlay for testing (Rule P-1)
 * Draws nothing, keeps a copy of the last view for assertions (core reuses its object)
 */
export default class NullSpeechOverlay implements SpeechOverlay {
    public lastView: SpeechView | null = null;

    public renderCount = 0;

    public render(view: SpeechView | null): void {
        this.lastView = view ? { ...view, choice: view.choice ? { ...view.choice } : null } : null;
        this.renderCount += 1;
    }
}
