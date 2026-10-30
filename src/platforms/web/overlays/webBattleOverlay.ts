import type { BattleOverlay, BattleView, CombatantView } from '../../../services/battleOverlay';

// The base text size at 1x, scaled by the view's textScale
const BASE_FONT_PX = 16;

// Shapes, so acting, targeted and selected never rely on color alone (battle.md, The battle screen)
const ACTING_MARK = '▶ ';
const TARGET_MARK = '▼ ';
const SELECTED_MARK = '▶ ';
const NO_MARK = '  ';

// The ATB gauge as blocks, rounded down so it only shows full when it is (a stand-in for the portrait border)
const GAUGE_BLOCKS = 8;
const gaugeText = (atb: number | null): string => {
    if (atb === null) return '';
    const filled = Math.floor(atb * GAUGE_BLOCKS);
    return `  ${'■'.repeat(filled)}${'□'.repeat(GAUGE_BLOCKS - filled)}`;
};

const partyText = (c: CombatantView): string => `${c.isActing ? ACTING_MARK : NO_MARK}${c.name}  HP ${c.hp ?? '?'}/${c.maxHp ?? '?'}${gaugeText(c.atb)}`;

const enemyText = (c: CombatantView): string => {
    let mark = NO_MARK;
    if (c.isTargeted) mark = TARGET_MARK;
    else if (c.isActing) mark = ACTING_MARK;
    return `${mark}${c.name}`;
};

// A styled div added to parent
const panel = (parent: HTMLElement, style: Partial<CSSStyleDeclaration>): HTMLDivElement => {
    const div = document.createElement('div');
    Object.assign(div.style, style);
    parent.appendChild(div);
    return div;
};

// Only touches the DOM when the text actually changes
const setText = (element: HTMLElement, text: string): void => {
    // eslint-disable-next-line no-param-reassign
    if (element.textContent !== text) element.textContent = text;
};

// The row at index i, made on first use and shown
const rowAt = (list: HTMLDivElement, i: number): HTMLDivElement => {
    let row = list.children[i] as HTMLDivElement | undefined;
    if (!row) {
        row = document.createElement('div');
        list.appendChild(row);
    }
    row.style.display = 'block';
    return row;
};

// Rows past the current count stay for reuse, hidden
const hideRowsFrom = (list: HTMLDivElement, count: number): void => {
    for (let i = count; i < list.children.length; i += 1) {
        (list.children[i] as HTMLDivElement).style.display = 'none';
    }
};

/**
 * Web battle screen: a rough first pass (battle.md, The battle screen), not the design.
 * A banner across the top for the newest log line, enemy names in the field, the party panel and
 * command list along the bottom. Divs over the canvas, it never takes mouse events.
 * Rows are made once and reused, and only rewritten when what they show changes.
 */
export default class WebBattleOverlay implements BattleOverlay {
    private readonly root: HTMLDivElement;

    private readonly banner: HTMLDivElement;

    private readonly enemyList: HTMLDivElement;

    private readonly partyList: HTMLDivElement;

    private readonly commandList: HTMLDivElement;

    constructor(container: HTMLElement) {
        // Placed relative to the container, like the speech bubble
        if (getComputedStyle(container).position === 'static') {
            container.style.position = 'relative';
        }

        this.root = panel(container, {
            position: 'absolute', inset: '0', display: 'none', pointerEvents: 'none', fontFamily: 'monospace', color: '#fff',
        });
        this.banner = panel(this.root, {
            position: 'absolute', top: '0', left: '0', right: '0', padding: '6px 12px', background: 'rgba(0, 0, 0, 0.7)', textAlign: 'center',
        });
        this.enemyList = panel(this.root, {
            position: 'absolute', top: '20%', left: '0', right: '0', textAlign: 'center', textShadow: '0 0 3px #000',
        });
        this.partyList = panel(this.root, {
            position: 'absolute', bottom: '0', left: '0', padding: '8px 12px', background: 'rgba(0, 0, 0, 0.7)', whiteSpace: 'pre',
        });
        this.commandList = panel(this.root, {
            position: 'absolute', bottom: '0', right: '0', padding: '8px 12px', background: 'rgba(0, 0, 0, 0.7)', whiteSpace: 'pre',
        });
    }

    public render(view: BattleView | null): void {
        if (!view) {
            this.root.style.display = 'none';
            return;
        }
        const fontSize = `${BASE_FONT_PX * view.textScale}px`;
        if (this.root.style.fontSize !== fontSize) this.root.style.fontSize = fontSize;

        const newest = view.log.length > 0 ? view.log[view.log.length - 1] : '';
        setText(this.banner, newest);
        this.banner.style.display = newest ? 'block' : 'none';

        const { enemyList, partyList, commandList } = this;
        view.enemies.forEach((enemy, i) => {
            const row = rowAt(enemyList, i);
            setText(row, enemyText(enemy));
            row.style.textDecoration = enemy.isDefeated ? 'line-through' : 'none';
            row.style.opacity = enemy.isDefeated ? '0.5' : '1';
        });
        hideRowsFrom(enemyList, view.enemies.length);

        view.party.forEach((member, i) => {
            const row = rowAt(partyList, i);
            setText(row, partyText(member));
            row.style.opacity = member.isDefeated ? '0.5' : '1';
        });
        hideRowsFrom(partyList, view.party.length);

        const { commands } = view;
        if (commands) {
            commands.items.forEach((item, i) => {
                const row = rowAt(commandList, i);
                setText(row, `${i === commands.selected ? SELECTED_MARK : NO_MARK}${item.label}`);
                // Shown but can't be chosen, like Run in a fight you can't leave
                row.style.opacity = item.disabled ? '0.4' : '1';
            });
            hideRowsFrom(commandList, commands.items.length);
        }
        commandList.style.display = commands ? 'block' : 'none';

        this.root.style.display = 'block';
    }
}
