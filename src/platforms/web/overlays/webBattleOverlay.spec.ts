import {
    describe,
    it,
    expect,
    beforeEach,
    vi,
} from 'vitest';
import WebBattleOverlay from './webBattleOverlay';
import type { BattleView, CombatantView } from '../../../services/battleOverlay';
import { FakeElement, installFakeDom } from '../../../testing/fakeDom';

const combatant = (extra: Partial<CombatantView>): CombatantView => ({
    id: 'party:0',
    name: 'Circle',
    hp: 20,
    maxHp: 20,
    isActing: false,
    isTargeted: false,
    isDefeated: false,
    atb: 1,
    ...extra,
});

const view = (extra: Partial<BattleView> = {}): BattleView => ({
    party: [combatant({ isActing: true })],
    enemies: [combatant({
        id: 'enemy:0', name: 'Evil Circle', hp: null, maxHp: null, atb: null,
    })],
    log: ['Evil Circle appears!'],
    commands: { items: [{ label: 'Attack', adjustable: false, disabled: false }], selected: 0 },
    textScale: 1,
    ...extra,
});

type TextElement = FakeElement & { textContent: string };

// The visible rows of a panel, as [mark, label]: the mark sits in its own fixed-width slot
const shownText = (panel: FakeElement): string[][] => panel.children
    .filter((row) => row.style.display !== 'none')
    .map((row) => row.children.map((span) => (span as TextElement).textContent ?? ''));

describe('WebBattleOverlay', () => {
    let overlay: WebBattleOverlay;
    let root: FakeElement;
    let banner: TextElement;
    let enemies: FakeElement;
    let party: FakeElement;
    let commands: FakeElement;

    beforeEach(() => {
        installFakeDom();
        vi.stubGlobal('getComputedStyle', () => ({ position: 'relative' }));
        const container = new FakeElement();
        overlay = new WebBattleOverlay(container as unknown as HTMLElement);
        [root] = container.children;
        [banner, enemies, party, commands] = root.children as [TextElement, FakeElement, FakeElement, FakeElement];
    });

    it('stays hidden until there is a fight, and hides again on null', () => {
        expect(root.style.display).toBe('none');

        overlay.render(view());
        expect(root.style.display).toBe('block');

        overlay.render(null);
        expect(root.style.display).toBe('none');
    });

    it('announces the newest log line in the top banner', () => {
        overlay.render(view({ log: ['Evil Circle appears!', 'Circle attacks Evil Circle for 2.'] }));

        expect(banner.textContent).toBe('Circle attacks Evil Circle for 2.');
    });

    it('marks who is acting and who is targeted by shape, not color alone', () => {
        overlay.render(view({
            enemies: [combatant({
                id: 'enemy:0', name: 'Evil Circle', hp: null, maxHp: null, isTargeted: true,
            })],
        }));

        expect(shownText(party)).toEqual([['▶', 'Circle  HP 20/20  ■■■■■■■■']]);
        expect(shownText(enemies)).toEqual([['▼', 'Evil Circle']]);
    });

    it('greys out and strikes through a defeated enemy', () => {
        overlay.render(view({
            enemies: [combatant({
                id: 'enemy:0', name: 'Evil Circle', hp: null, maxHp: null, isDefeated: true,
            })],
        }));

        expect(enemies.children[0].style.textDecoration).toBe('line-through');
    });

    it('shows the command list with the selected row marked, and hides it while nobody is choosing', () => {
        overlay.render(view());
        expect(commands.style.display).toBe('block');
        expect(shownText(commands)).toEqual([['▶', 'Attack']]);

        overlay.render(view({ commands: null }));
        expect(commands.style.display).toBe('none');
    });

    it('updates rows in place as HP changes, reusing them', () => {
        overlay.render(view());
        const row = party.children[0];

        overlay.render(view({ party: [combatant({ hp: 18 })] }));

        expect(party.children[0]).toBe(row);
        expect(shownText(party)).toEqual([['', 'Circle  HP 18/20  ■■■■■■■■']]);
    });

    it('draws the party\'s ATB gauge as eight blocks, full only when the gauge is', () => {
        overlay.render(view({ party: [combatant({ atb: 0.5 })] }));
        expect(shownText(party)).toEqual([['', 'Circle  HP 20/20  ■■■■□□□□']]);

        overlay.render(view({ party: [combatant({ atb: 0.99 })] }));
        expect(shownText(party)).toEqual([['', 'Circle  HP 20/20  ■■■■■■■□']]);
    });

    it('fades a command that can\'t be chosen', () => {
        overlay.render(view({
            commands: {
                items: [
                    { label: 'Attack', adjustable: false, disabled: false },
                    { label: 'Run', adjustable: false, disabled: true },
                ],
                selected: 0,
            },
        }));

        expect(commands.children[0].style.opacity).toBe('1');
        expect(commands.children[1].style.opacity).toBe('0.4');
    });

    it('scales its text with the menu text size', () => {
        overlay.render(view({ textScale: 2 }));

        expect(root.style.fontSize).toBe('32px');
    });
});
