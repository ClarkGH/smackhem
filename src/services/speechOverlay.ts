/**
 * What the speech bubble shows and where, built by core and drawn by the overlay.
 */
export interface SpeechView {
    text: string;
    // Anchor over the NPC's head, 0..1 across the viewport, y down
    x: number;
    y: number;
    // Null for a plain line. Selected indexes options.
    choice: { options: readonly string[]; selected: number } | null;
}

/**
 * Speech overlay interface
 * Draws the bubble core describes. Core never sees pixels or the DOM.
 */
export interface SpeechOverlay {
    // null hides it
    render(view: SpeechView | null): void;
}
