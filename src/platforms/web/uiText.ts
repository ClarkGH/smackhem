// The game's UI text: the system's own proportional sans-serif. The debug HUD stays monospace.
export const UI_FONT_FAMILY = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

// Proportional text can't be lined up with spaces, so a selection mark gets a fixed-width slot instead.
// Wide enough for ▶ or ▼ and a gap, at any text scale.
const MARK_SLOT = '1.25em';

// A row: the mark's slot, then the label. Both are spans, so the row still flows as one line.
export const createMarkedRow = (): HTMLDivElement => {
    const row = document.createElement('div');
    const mark = document.createElement('span');
    Object.assign(mark.style, { display: 'inline-block', width: MARK_SLOT });
    row.appendChild(mark);
    row.appendChild(document.createElement('span'));
    return row;
};

// Only touches the DOM when the text actually changes. An empty mark leaves the slot blank.
export const setMarkedRow = (row: HTMLElement, mark: string, label: string): void => {
    const markSpan = row.children[0] as HTMLElement;
    const labelSpan = row.children[1] as HTMLElement;
    if (markSpan.textContent !== mark) markSpan.textContent = mark;
    if (labelSpan.textContent !== label) labelSpan.textContent = label;
};
