import { describe, it, expect } from 'vitest';
import type { BattleState, Combatant } from './battle';
import chooseEnemyCommand from './enemyAi';
import { DEFAULT_BATTLE_LAYOUT } from './battleField';
import { createEnemy, createPartyMember, setHp } from '../combat';
import { ENEMY_SHEETS, PARTY_MEMBER_SHEETS } from '../combatSheets';

const origin = () => ({ x: 0, y: 0, z: 0 });

const fighter = (id: string, side: Combatant['side']): Combatant => ({
    id,
    side,
    unit: side === 'party' ? createPartyMember(PARTY_MEMBER_SHEETS.circle) : createEnemy(ENEMY_SHEETS.evil_circle),
    position: origin(),
    home: origin(),
    atb: 0,
});

// Two party members and one enemy, built by hand: no encounter has two members yet
const battleWith = (): BattleState => ({
    encounterId: 'npc_evil_circle_1',
    npcId: 'npc_evil_circle_1',
    combatants: [fighter('party:0', 'party'), fighter('party:1', 'party'), fighter('enemy:0', 'enemy')],
    outcome: 'ongoing',
    returnMode: 'world_3d',
    center: origin(),
    facing: 0,
    layout: { ...DEFAULT_BATTLE_LAYOUT },
    phase: { kind: 'acting', actingId: 'enemy:0', beatRemaining: 0 },
    readyQueue: [],
    log: [],
});

describe('chooseEnemyCommand', () => {
    it('attacks the first party member', () => {
        expect(chooseEnemyCommand(battleWith(), 'enemy:0')).toEqual({ kind: 'attack', targetId: 'party:0' });
    });

    it('skips party members who are down', () => {
        const battle = battleWith();
        setHp(battle.combatants[0].unit, 0);

        expect(chooseEnemyCommand(battle, 'enemy:0')).toEqual({ kind: 'attack', targetId: 'party:1' });
    });
});
