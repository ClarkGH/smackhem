import { describe, it, expect } from 'vitest';
import type { BattleState } from '../battle/battle';
import { BATTLE_BEAT_SECONDS } from '../battle/battleSystem';
import { setHp } from '../combat';
import { createDebugSettings } from '../settings/debugSettings';
import { createScenario, FIXED_DT, type Scenario } from '../../testing/scenario';
import {
    HOSTILE,
    landAttack,
    playRound,
    skip,
    startFight,
    waitForTurn,
} from '../../testing/battleScenario';

// The circle has 20 HP, the evil circle 10, both hit for 2. Running there and back is battleRunUp.spec's.

const BEAT_TICKS = Math.ceil(BATTLE_BEAT_SECONDS / FIXED_DT);

const withFight = (): Scenario & { battle: BattleState } => {
    const scenario = createScenario({ debugSettings: createDebugSettings() });
    scenario.addChunk({ npcs: [HOSTILE] });
    return { ...scenario, battle: startFight(scenario) };
};

const hp = (battle: BattleState, id: string): number | undefined => battle.combatants.find((c) => c.id === id)?.unit.hp;

const kinds = (battle: BattleState): string[] => battle.log.map((entry) => entry.kind);

const attackers = (battle: BattleState): string[] => battle.log.flatMap((e) => (e.kind === 'attacked' ? [e.actorId] : []));

describe('Battle turns - scenario (stub platform)', () => {
    it('opens on the party\'s turn, with the fight logged as started', () => {
        const { battle } = withFight();

        expect(battle.phase).toEqual({ kind: 'choosing', actingId: 'party:0' });
        expect(battle.readyQueue).toEqual(['enemy:0']);
        expect(battle.log).toEqual([{ kind: 'battle_started', encounterId: 'npc_evil_circle_1' }]);
    });

    it('sets off only after a command and then a target are chosen, and the hit lands on arrival', () => {
        const scenario = withFight();
        const { battle } = scenario;

        scenario.press({ interact: true });
        expect(battle.phase.kind).toBe('choosing');

        scenario.press({ interact: true });
        expect(battle.phase.kind).toBe('advancing');
        expect(kinds(battle)).toEqual(['battle_started']);

        skip(scenario);
        expect(battle.log.at(-1)).toEqual({
            kind: 'attacked', actorId: 'party:0', targetId: 'enemy:0', attackId: 'circle_basic', damage: 2,
        });
        expect(hp(battle, 'enemy:0')).toBe(8);
        expect(battle.phase).toEqual({ kind: 'acting', actingId: 'party:0', beatRemaining: BATTLE_BEAT_SECONDS });
    });

    it('goes back from the target list to the command list on Back', () => {
        const scenario = withFight();
        const { battle } = scenario;
        scenario.press({ interact: true });

        scenario.press({ back: true });
        // Back on the command list, so this press only opens the target list again
        scenario.press({ interact: true });
        expect(battle.phase.kind).toBe('choosing');

        scenario.press({ interact: true });
        expect(battle.phase.kind).toBe('advancing');
    });

    it('does nothing on Back at the command list: there is no running away yet', () => {
        const scenario = withFight();

        scenario.press({ back: true });
        scenario.tick(5);

        expect(scenario.gameState.discrete.gameMode).toBe('battle_25djrpg');
        expect(scenario.battle.phase).toEqual({ kind: 'choosing', actingId: 'party:0' });
    });

    it('lands one confirm exactly once, however long the beat is held', () => {
        const scenario = withFight();
        landAttack(scenario);

        scenario.tick(BEAT_TICKS - 1);

        expect(attackers(scenario.battle)).toEqual(['party:0']);
        expect(hp(scenario.battle, 'enemy:0')).toBe(8);
    });

    it('lets the enemy take its turn after the party\'s, then hands back to the party', () => {
        const scenario = withFight();
        const { battle } = scenario;
        landAttack(scenario);

        // The beat, the run home, then the enemy's run
        skip(scenario);
        skip(scenario);
        skip(scenario);
        expect(battle.log.at(-1)).toEqual({
            kind: 'attacked', actorId: 'enemy:0', targetId: 'party:0', attackId: 'evil_circle_basic', damage: 2,
        });
        expect(hp(battle, 'party:0')).toBe(18);
        expect(battle.phase.kind).toBe('acting');

        // Its beat and its run home, then the party's gauge fills again (battleAtb.spec)
        skip(scenario);
        skip(scenario);
        waitForTurn(scenario);
        expect(battle.phase).toEqual({ kind: 'choosing', actingId: 'party:0' });
    });

    it('skips the beat on Interact, without that press attacking again', () => {
        const scenario = withFight();
        landAttack(scenario);

        skip(scenario);

        expect(scenario.battle.phase.kind).toBe('returning');
        expect(attackers(scenario.battle)).toEqual(['party:0']);
    });

    it('changes nothing while paused: not the beat, and not a half-chosen target', () => {
        const scenario = withFight();
        const { battle } = scenario;
        // On the target list
        scenario.press({ interact: true });

        scenario.press({ menu: true });
        scenario.press({ navigate: { x: 0, y: -1 } });
        scenario.tick(BEAT_TICKS * 2);
        scenario.click('Resume');
        expect(battle.phase.kind).toBe('choosing');

        // Still on the target list, so one press sets off
        scenario.press({ interact: true });
        expect(battle.phase.kind).toBe('advancing');
        skip(scenario);

        // And a beat doesn't run under the pause menu either
        scenario.press({ menu: true });
        scenario.tick(BEAT_TICKS * 2);
        expect(battle.phase).toEqual({ kind: 'acting', actingId: 'party:0', beatRemaining: BATTLE_BEAT_SECONDS });
    });

    it('wins on the fifth hit, logging the hit, the defeat and the end in that order, then goes back', () => {
        const scenario = withFight();
        const { battle } = scenario;

        for (let i = 0; i < 4; i += 1) playRound(scenario);
        landAttack(scenario);

        expect(battle.outcome).toBe('won');
        expect(kinds(battle).slice(-3)).toEqual(['attacked', 'defeated', 'battle_ended']);
        expect(battle.log.slice(-2)).toEqual([
            { kind: 'defeated', id: 'enemy:0' },
            { kind: 'battle_ended', outcome: 'won' },
        ]);
        // The last beat still plays before the fight ends
        expect(scenario.gameState.discrete.gameMode).toBe('battle_25djrpg');

        skip(scenario);
        expect(scenario.gameState.discrete.gameMode).toBe('world_3d');
        expect(scenario.gameState.discrete.battle).toBeNull();
    });

    it('loses when the party is down, logged in the same order', () => {
        const scenario = withFight();
        const { battle } = scenario;
        setHp(battle.combatants[0].unit, 2);

        // The party's hit, its beat, its run home, then the enemy's run and its hit
        landAttack(scenario);
        skip(scenario);
        skip(scenario);
        skip(scenario);

        expect(battle.outcome).toBe('lost');
        expect(battle.log.slice(-3)).toEqual([
            {
                kind: 'attacked', actorId: 'enemy:0', targetId: 'party:0', attackId: 'evil_circle_basic', damage: 2,
            },
            { kind: 'defeated', id: 'party:0' },
            { kind: 'battle_ended', outcome: 'lost' },
        ]);
    });

    it('logs the HP actually lost, not the attack\'s power', () => {
        const scenario = withFight();
        setHp(scenario.battle.combatants[1].unit, 1);

        landAttack(scenario);

        expect(scenario.battle.log.at(-3)).toMatchObject({ kind: 'attacked', damage: 1 });
    });
});
