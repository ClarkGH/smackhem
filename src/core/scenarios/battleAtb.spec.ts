import { describe, it, expect } from 'vitest';
import type { BattleState, Combatant } from '../battle/battle';
import { ATB_FILL_PER_SECOND } from '../battle/battleSystem';
import { setHp } from '../combat';
import type { BattleMode } from '../settings/settings';
import { createDefaultSettings, parseSettings, serializeSettings } from '../settings/settings';
import { createDebugSettings } from '../settings/debugSettings';
import { createScenario, FIXED_DT, type Scenario } from '../../testing/scenario';
import {
    HOSTILE,
    confirmAttack,
    landAttack,
    skip,
    startFight,
    waitForTurn,
} from '../../testing/battleScenario';

const withFight = (mode: BattleMode = 'wait'): Scenario & { battle: BattleState; party: Combatant; enemy: Combatant } => {
    const settings = createDefaultSettings();
    settings.battleMode = mode;
    const scenario = createScenario({ debugSettings: createDebugSettings(), settings });
    scenario.addChunk({ npcs: [HOSTILE] });
    const battle = startFight(scenario);
    return {
        ...scenario, battle, party: battle.combatants[0], enemy: battle.combatants[1],
    };
};

// Plays the first round through to both runs home: the party's turn, then the enemy's
const finishFirstRound = (scenario: Scenario): void => {
    landAttack(scenario);
    skip(scenario);
    skip(scenario);
    skip(scenario);
    skip(scenario);
    skip(scenario);
};

const TICKS_TO_FILL = Math.ceil(1 / (ATB_FILL_PER_SECOND * FIXED_DT));

describe('ATB gauges - scenario (stub platform)', () => {
    it('opens with every gauge full and everyone queued in line order, so the party goes first', () => {
        const { battle, party, enemy } = withFight();

        expect(party.atb).toBe(1);
        expect(enemy.atb).toBe(1);
        expect(battle.phase).toEqual({ kind: 'choosing', actingId: 'party:0' });
        expect(battle.readyQueue).toEqual(['enemy:0']);
    });

    it('empties a gauge when its owner sets off', () => {
        const scenario = withFight();

        confirmAttack(scenario);

        expect(scenario.party.atb).toBe(0);
        expect(scenario.enemy.atb).toBe(1);
    });

    it('waits between turns once nobody is full, filling from sim time, and the first to fill goes next', () => {
        const scenario = withFight();
        finishFirstRound(scenario);
        expect(scenario.battle.phase).toEqual({ kind: 'waiting' });
        const before = scenario.party.atb;

        scenario.tick(10);
        expect(scenario.party.atb).toBeCloseTo(before + 10 * ATB_FILL_PER_SECOND * FIXED_DT, 6);

        waitForTurn(scenario);
        // The party set off first, so its gauge filled first
        expect(scenario.battle.phase).toEqual({ kind: 'choosing', actingId: 'party:0' });
        expect(scenario.party.atb).toBe(1);
    });

    it('takes about a full gauge\'s worth of ticks from empty to full', () => {
        const scenario = withFight();
        finishFirstRound(scenario);
        let ticks = 0;
        while (scenario.battle.phase.kind === 'waiting' && ticks < 1000) {
            scenario.tick();
            ticks += 1;
        }

        // The party emptied a few skipped ticks before the round ended, so a little less than a full fill
        expect(ticks).toBeLessThanOrEqual(TICKS_TO_FILL);
        expect(ticks).toBeGreaterThan(TICKS_TO_FILL - 10);
    });

    it('never fills the acting combatant\'s own gauge during its turn', () => {
        const scenario = withFight();
        confirmAttack(scenario);

        scenario.tick(10);

        expect(scenario.battle.phase.kind).toBe('advancing');
        expect(scenario.party.atb).toBe(0);
    });

    it('stops every gauge under the pause menu', () => {
        const scenario = withFight();
        finishFirstRound(scenario);
        scenario.tick(5);
        const { atb } = scenario.party;

        scenario.press({ menu: true });
        scenario.tick(60);

        expect(scenario.party.atb).toBe(atb);
    });

    it('never fills a defeated gauge', () => {
        // Active, so gauges fill while the party chooses: a test in Wait would pass for the wrong reason
        const scenario = withFight('active');
        finishFirstRound(scenario);
        waitForTurn(scenario);
        setHp(scenario.enemy.unit, 0);
        const { atb } = scenario.enemy;

        scenario.tick(30);

        expect(atb).toBeLessThan(1);
        expect(scenario.enemy.atb).toBe(atb);
        expect(scenario.battle.readyQueue).toEqual([]);
    });
});

describe('Active and Wait - scenario (stub platform)', () => {
    // The party's next turn comes first, while the enemy's gauge is still filling
    const choosingWithEnemyFilling = (mode: BattleMode): Scenario & { party: Combatant; enemy: Combatant; battle: BattleState } => {
        const scenario = withFight(mode);
        finishFirstRound(scenario);
        waitForTurn(scenario);
        expect(scenario.battle.phase).toEqual({ kind: 'choosing', actingId: 'party:0' });
        expect(scenario.enemy.atb).toBeLessThan(1);
        return scenario;
    };

    it('Wait: gauges stop while the command menu is open', () => {
        const scenario = choosingWithEnemyFilling('wait');
        const { atb } = scenario.enemy;

        scenario.tick(30);

        expect(scenario.enemy.atb).toBe(atb);
    });

    it('Active: gauges keep filling while you choose, so dithering costs you', () => {
        const scenario = choosingWithEnemyFilling('active');
        const { atb } = scenario.enemy;

        scenario.tick(30);

        expect(scenario.enemy.atb).toBeGreaterThan(atb);
    });

    it('Active: an enemy whose gauge fills while you choose goes straight after you', () => {
        const scenario = choosingWithEnemyFilling('active');

        scenario.tick(TICKS_TO_FILL);
        expect(scenario.battle.readyQueue).toEqual(['enemy:0']);

        landAttack(scenario);
        skip(scenario);
        skip(scenario);
        expect(scenario.battle.phase).toMatchObject({ kind: 'advancing', actingId: 'enemy:0' });
    });
});

describe('ATB in the view - scenario (stub platform)', () => {
    it('shows the party\'s gauge and hides the enemy\'s, like its HP', () => {
        const scenario = withFight();
        confirmAttack(scenario);

        const view = scenario.battleOverlay.lastView;

        expect(view?.party[0].atb).toBe(0);
        expect(view?.enemies[0].atb).toBeNull();
    });

    it('marks nobody as acting while everyone waits', () => {
        const scenario = withFight();
        finishFirstRound(scenario);

        scenario.tick();

        const view = scenario.battleOverlay.lastView;
        expect(view?.party[0].isActing).toBe(false);
        expect(view?.enemies[0].isActing).toBe(false);
    });
});

describe('The Battle Mode setting - scenario (stub platform)', () => {
    const labels = (scenario: Scenario): string[] => scenario.overlay.lastView?.items.map((item) => item.label) ?? [];
    const valueOf = (scenario: Scenario, label: string): string | undefined => {
        const index = labels(scenario).indexOf(label);
        return scenario.overlay.lastView?.items[index]?.value;
    };

    it('switches between Wait and Active from Settings, and is saved', () => {
        const scenario = createScenario({ mode: 'main_menu' });
        let saves = 0;
        scenario.eventBus.subscribe('settings_changed', () => { saves += 1; });
        scenario.click('Settings');
        expect(valueOf(scenario, 'Battle Mode')).toBe('Wait');

        scenario.click('Battle Mode');

        expect(scenario.settings.battleMode).toBe('active');
        expect(valueOf(scenario, 'Battle Mode')).toBe('Active');
        expect(saves).toBe(1);
    });

    it('round-trips through saved settings, and a bad value falls back to Wait', () => {
        const settings = createDefaultSettings();
        settings.battleMode = 'active';

        expect(parseSettings(serializeSettings(settings)).battleMode).toBe('active');
        expect(parseSettings('{"battleMode": "turbo"}').battleMode).toBe('wait');
    });
});
