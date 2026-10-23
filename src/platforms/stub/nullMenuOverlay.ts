import type { MenuOverlay, MenuView } from '../../services/menuOverlay';

/**
 * Stub menu overlay for testing (Rule P-1)
 * Draws nothing, keeps the last view for assertions
 */
export default class NullMenuOverlay implements MenuOverlay {
    public lastView: MenuView | null = null;

    public renderCount = 0;

    render(view: MenuView | null): void {
        this.lastView = view;
        this.renderCount += 1;
    }
}
