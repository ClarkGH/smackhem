export interface PromptView {
    x: number;
    y: number;
}

export interface PromptOverlay {
    render(view: PromptView | null): void;
}
