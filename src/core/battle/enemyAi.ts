import type { BattleCommand, BattleState, CombatantId } from './battle';
import { isDefeated } from '../combat';

/**
 * The enemy's command for its turn. For now: its basic attack on the first party member still standing.
 * actorId is unused until enemies have AI of their own (an ai id on EnemySheet, say).
 * Only called while the fight is ongoing, so someone in the party is always standing.
 */
const chooseEnemyCommand = (battle: BattleState, _actorId: CombatantId): BattleCommand => {
    const { combatants } = battle;
    for (let i = 0; i < combatants.length; i += 1) {
        if (combatants[i].side === 'party' && !isDefeated(combatants[i].unit)) {
            return { kind: 'attack', targetId: combatants[i].id };
        }
    }
    throw new Error('chooseEnemyCommand: nobody in the party is standing');
};

export default chooseEnemyCommand;
