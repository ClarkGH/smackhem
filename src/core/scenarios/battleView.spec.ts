import {
    describe, it, expect, vi,
} from 'vitest';
import BattleScreen from '../battle/battleScreen';
import { setHp } from '../combat';
import { createDebugSettings } from '../settings/debugSettings';
import { createDefaultSettings } from '../settings/settings';
import { createScenario, type Scenario } from '../../testing/scenario';
import {
    HOSTILE,
    landAttack,
    loseFight,
    skip,
    startFight,
    winFight,
} from '../../testing/battleScenario';

const withHostile = (textScale = 1): Scenario => {
    const settings = createDefaultSettings();
    settings.menuTextScale = textScale;
    const scenario = createScenario({ debugSettings: createDebugSettings(), settings });
    scenario.addChunk({ npcs: [HOSTILE] });
    return scenario;
};

const COMMAND_ROWS = [
    { label: 'Attack', adjustable: false, disabled: false },
    { label: 'Run', adjustable: false, disabled: false },
];

describe('Battle view - scenario (stub platform)', () => {
    it('shows nothing outside a fight', () => {
        const scenario = withHostile();

        scenario.tick(5);

        expect(scenario.battleOverlay.lastView).toBeNull();
        expect(scenario.battleOverlay.renderCount).toBe(0);
    });

    it('shows the fight as it opens: who\'s who, the party\'s HP, enemy HP hidden, and the command list', () => {
        const scenario = withHostile(1.5);

        startFight(scenario);

        expect(scenario.battleOverlay.lastView).toEqual({
            party: [{
                id: 'party:0', name: 'Circle', hp: 20, maxHp: 20, isActing: true, isTargeted: false, isDefeated: false, atb: 1,
            }],
            enemies: [{
                id: 'enemy:0', name: 'Evil Circle', hp: null, maxHp: null, isActing: false, isTargeted: false, isDefeated: false, atb: null,
            }],
            log: ['Evil Circle appears!'],
            commands: { items: COMMAND_ROWS, selected: 0 },
            textScale: 1.5,
        });
    });

    it('marks the enemy the target cursor is on', () => {
        const scenario = withHostile();
        startFight(scenario);

        scenario.press({ interact: true });

        expect(scenario.battleOverlay.lastView?.enemies[0].isTargeted).toBe(true);
    });

    it('hides the commands once the party member sets off, and drops the target mark', () => {
        const scenario = withHostile();
        startFight(scenario);

        scenario.press({ interact: true });
        scenario.press({ interact: true });

        const view = scenario.battleOverlay.lastView;
        expect(view?.commands).toBeNull();
        expect(view?.enemies[0].isTargeted).toBe(false);
        expect(view?.party[0].isActing).toBe(true);
        // Nothing has landed yet, so nothing new is said
        expect(view?.log).toEqual(['Evil Circle appears!']);
    });

    it('words each hit as it lands, and marks whoever acts', () => {
        const scenario = withHostile();
        startFight(scenario);

        landAttack(scenario);
        expect(scenario.battleOverlay.lastView?.log).toEqual(['Evil Circle appears!', 'Circle attacks Evil Circle for 2.']);

        // The beat, the run home, the enemy's run: its hit lands
        skip(scenario);
        skip(scenario);
        skip(scenario);
        const view = scenario.battleOverlay.lastView;
        expect(view?.log.at(-1)).toBe('Evil Circle attacks Circle for 2.');
        expect(view?.party[0]).toMatchObject({ hp: 18, isActing: false });
        expect(view?.enemies[0].isActing).toBe(true);
    });

    it('words a win, then hides once the fight is over', () => {
        const scenario = withHostile();
        startFight(scenario);
        const { battle } = scenario.gameState.discrete;

        winFight(scenario);
        expect(scenario.battleOverlay.lastView).toBeNull();
        // The last view it was sent, just before the fight ended
        expect(battle?.log.slice(-2).map((entry) => entry.kind)).toEqual(['defeated', 'battle_ended']);

        // Hidden once, not every frame after
        const count = scenario.battleOverlay.renderCount;
        scenario.tick(10);
        expect(scenario.battleOverlay.renderCount).toBe(count);
    });

    it('words the finishing blow and the win while the last beat plays', () => {
        const scenario = withHostile();
        const battle = startFight(scenario);
        setHp(battle.combatants[1].unit, 2);

        landAttack(scenario);

        const view = scenario.battleOverlay.lastView;
        expect(view?.log.slice(-3)).toEqual(['Circle attacks Evil Circle for 2.', 'Evil Circle is defeated!', 'You won!']);
        expect(view?.enemies[0].isDefeated).toBe(true);
    });

    it('words a loss while the last beat plays', () => {
        const scenario = withHostile();
        const battle = startFight(scenario);
        setHp(battle.combatants[0].unit, 2);

        // The party's hit, its beat, its run home, then the enemy's run and its hit
        landAttack(scenario);
        skip(scenario);
        skip(scenario);
        skip(scenario);

        expect(scenario.battleOverlay.lastView?.log.slice(-2)).toEqual(['Circle is defeated!', 'You lost...']);
    });

    it('hides under the pause menu, and comes back on resume', () => {
        const scenario = withHostile();
        startFight(scenario);

        scenario.press({ menu: true });
        expect(scenario.battleOverlay.lastView).toBeNull();

        scenario.click('Resume');
        expect(scenario.battleOverlay.lastView?.commands).toEqual({ items: COMMAND_ROWS, selected: 0 });
    });

    it('starts the next fight with a fresh log', () => {
        const scenario = withHostile();
        startFight(scenario);
        // Lose, then Return to Title, New Game, and the same fight again
        loseFight(scenario);
        scenario.tick(2);
        scenario.press({ interact: true });
        scenario.tick();
        scenario.click('New Game');
        scenario.tick();

        startFight(scenario);

        expect(scenario.battleOverlay.lastView?.log).toEqual(['Evil Circle appears!']);
        expect(scenario.battleOverlay.lastView?.party[0].hp).toBe(20);
    });

    // end() leaves early on a loss, so both ways out are checked (battle.md, Rules it follows)
    it('lets go of a won fight once it ends', () => {
        const scenario = withHostile();
        startFight(scenario);
        const reset = vi.spyOn(BattleScreen.prototype, 'reset');

        winFight(scenario);

        expect(reset).toHaveBeenCalledTimes(1);
    });

    it('lets go of a lost fight once it ends', () => {
        const scenario = withHostile();
        startFight(scenario);
        const reset = vi.spyOn(BattleScreen.prototype, 'reset');

        loseFight(scenario);

        expect(reset).toHaveBeenCalledTimes(1);
    });
});
