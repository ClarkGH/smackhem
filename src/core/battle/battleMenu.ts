import type { PlayerIntent } from '../../services/input';
import type { BattleCommand, BattleState, CombatantId } from './battle';
import { isDefeated } from '../combat';
import { ENCOUNTERS } from '../combatSheets';

// The command rows, top to bottom. Tech, Item and Defend join later.
export const BATTLE_COMMANDS: readonly BattleCommand['kind'][] = ['attack', 'run'];

// Whether a command row can be chosen in this fight. Run only where the encounter allows it.
export const isCommandEnabled = (battle: BattleState, kind: BattleCommand['kind']): boolean => (
    kind !== 'run' || ENCOUNTERS[battle.encounterId].canRun
);

// The next standing enemy after from, wrapping round, in combatant order. From null starts at the first.
const nextTarget = (battle: BattleState, from: CombatantId | null, direction: 1 | -1): CombatantId | null => {
    const { combatants } = battle;
    const count = combatants.length;
    let start = combatants.findIndex((c) => c.id === from);
    if (start < 0) start = direction > 0 ? count - 1 : 0;
    for (let step = 1; step <= count; step += 1) {
        const candidate = combatants[(start + direction * step + count) % count];
        if (candidate.side === 'enemy' && !isDefeated(candidate.unit)) return candidate.id;
    }
    return null;
};

/**
 * The party's choice before it's confirmed: Command, then Target. See docs/battle.md (Commands).
 * Kept apart from BattleState, so pausing mid-choice loses nothing, and it never applies combat rules.
 * Run has no target, so confirming it hands it over straight from the command list.
 */
export default class BattleMenu {
    private step: 'command' | 'target' = 'command';

    // Index into BATTLE_COMMANDS
    private selected = 0;

    // The enemy the target cursor is on, while on the target list
    private targetId: CombatantId | null = null;

    // A party member starts choosing: back to the command list, first command selected
    public open(): void {
        this.step = 'command';
        this.selected = 0;
        this.targetId = null;
    }

    // One tick of input. The confirmed command on the tick it's confirmed, otherwise null.
    // Back on the target list returns to the command list. Back on the command list does nothing: Run is its own row.
    public update(battle: BattleState, intent: PlayerIntent): BattleCommand | null {
        if (this.step === 'command') {
            if (intent.navigate && intent.navigate.y !== 0) {
                // +1 is up, towards the start of the list
                this.moveSelection(battle, intent.navigate.y > 0 ? -1 : 1);
            }
            if (intent.interact) {
                const kind = BATTLE_COMMANDS[this.selected];
                if (!isCommandEnabled(battle, kind)) return null;
                if (kind === 'run') return { kind: 'run' };
                this.step = 'target';
                this.targetId = nextTarget(battle, null, 1);
            }
            return null;
        }

        if (intent.back) {
            this.step = 'command';
            this.targetId = null;
            return null;
        }

        // Either axis moves between enemies, so the d-pad works however they end up laid out
        const move = intent.navigate ? (intent.navigate.x || -intent.navigate.y) : 0;
        if (move !== 0) {
            this.targetId = nextTarget(battle, this.targetId, move > 0 ? 1 : -1);
        }

        if (intent.interact && this.targetId !== null) {
            return { kind: 'attack', targetId: this.targetId };
        }
        return null;
    }

    // For the view: the highlighted command row, an index into BATTLE_COMMANDS
    public getSelected(): number {
        return this.selected;
    }

    // For the view: the enemy under the target cursor, null while on the command list
    public getTargetId(): CombatantId | null {
        return this.step === 'target' ? this.targetId : null;
    }

    // Wraps like the menus, and skips rows that can't be chosen, like MenuSystem does
    private moveSelection(battle: BattleState, direction: -1 | 1): void {
        const count = BATTLE_COMMANDS.length;
        let next = this.selected;
        for (let i = 0; i < count; i += 1) {
            next = (next + direction + count) % count;
            if (isCommandEnabled(battle, BATTLE_COMMANDS[next])) break;
        }
        this.selected = next;
    }
}
