import type { PromptOverlay, PromptView } from '../../services/promptOverlay';

/**
 * Stub prompt overlay for testing (Rule P-1)
 * Draws nothing, keeps a copy of the last view for assertions (core reuses its object)
 */
export default class NullPromptOverlay implements PromptOverlay {
    public lastView: PromptView | null = null;

    public render(view: PromptView | null): void {
        this.lastView = view ? { ...view } : null;
    }
}
