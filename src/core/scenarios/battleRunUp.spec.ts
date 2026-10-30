import { describe, it, expect } from 'vitest';
import type { BattleState, Combatant } from '../battle/battle';
import { BATTLE_RUN_SPEED, BATTLE_STRIKE_GAP } from '../battle/battleSystem';
import { setHp } from '../combat';
import { createDebugSettings } from '../settings/debugSettings';
import { createScenario, FIXED_DT, type Scenario } from '../../testing/scenario';
import {
    HOSTILE,
    confirmAttack,
    skip,
    startFight,
    waitForTurn,
} from '../../testing/battleScenario';

const withFight = (): Scenario & { battle: BattleState; party: Combatant; enemy: Combatant } => {
    const scenario = createScenario({ debugSettings: createDebugSettings() });
    scenario.addChunk({ npcs: [HOSTILE] });
    const battle = startFight(scenario);
    return {
        ...scenario, battle, party: battle.combatants[0], enemy: battle.combatants[1],
    };
};

const distance = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.hypot(a.x - b.x, a.z - b.z);

const attacks = (battle: BattleState): number => battle.log.filter((e) => e.kind === 'attacked').length;

describe('Running to the target - scenario (stub platform)', () => {
    it('sets off on confirm, carrying the command, with nothing landed yet', () => {
        const scenario = withFight();

        confirmAttack(scenario);

        expect(scenario.battle.phase).toEqual({
            kind: 'advancing', actingId: 'party:0', command: { kind: 'attack', targetId: 'enemy:0' },
        });
        expect(attacks(scenario.battle)).toBe(0);
        expect(scenario.enemy.unit.hp).toBe(10);
    });

    it('runs towards the target at the run speed, every tick', () => {
        const scenario = withFight();
        confirmAttack(scenario);
        const start = distance(scenario.party.position, scenario.enemy.position);

        scenario.tick(5);

        // The confirm tick moved it once too
        const run = start - distance(scenario.party.position, scenario.enemy.position);
        expect(run).toBeGreaterThan(5 * BATTLE_RUN_SPEED * FIXED_DT - 1e-6);
        expect(run).toBeLessThan(7 * BATTLE_RUN_SPEED * FIXED_DT + 1e-6);
    });

    it('lands the hit when it arrives, a strike gap short of the target', () => {
        const scenario = withFight();
        confirmAttack(scenario);

        // About 2.6 units at 8 a second is 20 ticks. Its beat (60 ticks) is still playing after 30.
        scenario.tick(30);

        expect(attacks(scenario.battle)).toBe(1);
        expect(scenario.enemy.unit.hp).toBe(8);
        expect(distance(scenario.party.position, scenario.enemy.position)).toBeCloseTo(BATTLE_STRIKE_GAP, 6);
        expect(scenario.battle.phase.kind).toBe('acting');
        // Its home never moved
        expect(scenario.party.home.z).toBeGreaterThan(scenario.party.position.z);
    });

    it('lands it straight away when Interact skips the run, and only once however it is held', () => {
        const scenario = withFight();
        confirmAttack(scenario);

        skip(scenario);

        expect(attacks(scenario.battle)).toBe(1);
        expect(distance(scenario.party.position, scenario.enemy.position)).toBeCloseTo(BATTLE_STRIKE_GAP, 6);
        scenario.tick(10);
        expect(attacks(scenario.battle)).toBe(1);
    });

    it('runs home after the beat, then hands the turn on', () => {
        const scenario = withFight();
        confirmAttack(scenario);
        skip(scenario);

        // The beat
        skip(scenario);
        expect(scenario.battle.phase).toEqual({ kind: 'returning', actingId: 'party:0' });

        // About 20 ticks home, then the enemy is a few ticks into its own run
        scenario.tick(25);
        expect(scenario.party.position).toEqual(scenario.party.home);
        // The enemy's turn: it sets off with no menu, its command chosen by its AI
        expect(scenario.battle.phase).toMatchObject({ kind: 'advancing', actingId: 'enemy:0' });
    });

    it('skips the run home on Interact too', () => {
        const scenario = withFight();
        confirmAttack(scenario);
        skip(scenario);
        skip(scenario);

        skip(scenario);

        expect(scenario.party.position).toEqual(scenario.party.home);
        expect(scenario.battle.phase).toMatchObject({ actingId: 'enemy:0' });
    });

    it('lets the enemy run to the party and back the same way', () => {
        const scenario = withFight();
        confirmAttack(scenario);
        skip(scenario);
        skip(scenario);
        skip(scenario);

        skip(scenario);
        expect(scenario.party.unit.hp).toBe(18);
        expect(distance(scenario.enemy.position, scenario.party.position)).toBeCloseTo(BATTLE_STRIKE_GAP, 6);

        skip(scenario);
        skip(scenario);
        expect(scenario.enemy.position).toEqual(scenario.enemy.home);
        // Then the party's turn, once its gauge fills again (battleAtb.spec)
        waitForTurn(scenario);
        expect(scenario.battle.phase).toEqual({ kind: 'choosing', actingId: 'party:0' });
    });

    it('stands still under the pause menu, mid-run', () => {
        const scenario = withFight();
        confirmAttack(scenario);
        scenario.tick(2);
        const at = { ...scenario.party.position };

        scenario.press({ menu: true });
        scenario.tick(60);

        expect(scenario.party.position).toEqual(at);
        expect(attacks(scenario.battle)).toBe(0);
    });

    it('ends the fight after the finishing blow\'s beat, with no run home', () => {
        const scenario = withFight();
        setHp(scenario.enemy.unit, 2);
        confirmAttack(scenario);
        skip(scenario);
        expect(scenario.battle.outcome).toBe('won');

        skip(scenario);

        expect(scenario.gameState.discrete.battle).toBeNull();
        expect(scenario.gameState.discrete.gameMode).toBe('world_3d');
    });
});
