import type { BattleView, CombatantView } from '../../services/battleOverlay';
import type { MenuItemView } from '../../services/menuOverlay';
import type {
    BattleCommand,
    BattleLogEntry,
    BattleState,
    Combatant,
} from './battle';
import { findCombatant } from './battle';
import type BattleMenu from './battleMenu';
import { BATTLE_COMMANDS, isCommandEnabled } from './battleMenu';
import { getMaxHp, getName, isDefeated } from '../combat';
import type { BattleOutcome } from '../combat';

// Wording lives here, built from the log's facts, never in the rules (battle.md, The battle screen)
const COMMAND_LABELS: Readonly<Record<BattleCommand['kind'], string>> = {
    attack: 'Attack',
    run: 'Run',
};

const OUTCOME_LINES: Readonly<Record<Exclude<BattleOutcome, 'ongoing'>, string>> = {
    won: 'You won!',
    lost: 'You lost...',
    mutual_defeat: 'Everyone fell...',
    fled: 'You got away!',
};

const nameOf = (battle: BattleState, id: string): string => {
    const combatant = findCombatant(battle, id);
    return combatant ? getName(combatant.unit) : '???';
};

const wordEntry = (battle: BattleState, entry: BattleLogEntry): string => {
    switch (entry.kind) {
        case 'battle_started': {
            const names = battle.combatants.filter((c) => c.side === 'enemy').map((c) => getName(c.unit));
            return names.length === 1 ? `${names[0]} appears!` : `${names.join(', ')} appear!`;
        }
        case 'attacked':
            return `${nameOf(battle, entry.actorId)} attacks ${nameOf(battle, entry.targetId)} for ${entry.damage}.`;
        case 'defeated':
            return `${nameOf(battle, entry.id)} is defeated!`;
        case 'battle_ended':
            return OUTCOME_LINES[entry.outcome];
        default:
            return '';
    }
};

/**
 * Builds the BattleView from the fight and the menu. One view, filled in place every frame (M-1):
 * it only allocates when a new fight starts (its combatant views) and once per new log entry (its line).
 */
export default class BattleScreen {
    private readonly commandRows: MenuItemView[] = BATTLE_COMMANDS.map((kind) => ({
        label: COMMAND_LABELS[kind], adjustable: false, disabled: false,
    }));

    private readonly commands = { items: this.commandRows, selected: 0 };

    private readonly view: BattleView = {
        party: [], enemies: [], log: [], commands: null, textScale: 1,
    };

    // The fight the view was last built for, so a new one starts fresh
    private shownBattle: BattleState | null = null;

    // The fight is over: let go of it, so nothing holds it until the next one (battle.md, Rules it follows)
    public reset(): void {
        this.shownBattle = null;
    }

    public build(battle: BattleState, menu: BattleMenu, textScale: number): BattleView {
        if (battle !== this.shownBattle) this.begin(battle);
        const { view } = this;
        const { phase } = battle;
        const choosing = phase.kind === 'choosing';
        const targetId = choosing ? menu.getTargetId() : null;
        // Nobody acts while everyone waits on their gauges
        const actingId = phase.kind === 'waiting' ? null : phase.actingId;

        // party and enemies were made in combatant order, so their indexes walk together
        let p = 0;
        let e = 0;
        battle.combatants.forEach((combatant) => {
            if (combatant.side === 'party') {
                this.fill(view.party[p], combatant, actingId, targetId);
                p += 1;
            } else {
                this.fill(view.enemies[e], combatant, actingId, targetId);
                e += 1;
            }
        });

        // Only entries added since the last frame are worded
        for (let i = view.log.length; i < battle.log.length; i += 1) {
            view.log.push(wordEntry(battle, battle.log[i]));
        }

        this.commands.selected = menu.getSelected();
        view.commands = choosing ? this.commands : null;
        view.textScale = textScale;
        return view;
    }

    // A new fight: one view per combatant, an empty log, and which commands it allows.
    // Battle start is the allocation boundary (M-1).
    private begin(battle: BattleState): void {
        this.shownBattle = battle;
        const { view } = this;
        for (let i = 0; i < BATTLE_COMMANDS.length; i += 1) {
            this.commandRows[i].disabled = !isCommandEnabled(battle, BATTLE_COMMANDS[i]);
        }
        view.party.length = 0;
        view.enemies.length = 0;
        view.log.length = 0;
        battle.combatants.forEach((combatant) => {
            const out: CombatantView = {
                id: combatant.id,
                name: getName(combatant.unit),
                hp: null,
                maxHp: null,
                isActing: false,
                isTargeted: false,
                isDefeated: false,
                atb: null,
            };
            (combatant.side === 'party' ? view.party : view.enemies).push(out);
        });
    }

    private fill(out: CombatantView, combatant: Combatant, actingId: string | null, targetId: string | null): void {
        const { unit } = combatant;
        const isParty = combatant.side === 'party';
        // Written in place (M-1)
        // Enemy HP and gauges stay hidden, the classic JRPG choice (battle.md, The battle screen)
        out.hp = isParty ? unit.hp : null;
        out.maxHp = isParty ? getMaxHp(unit) : null;
        out.atb = isParty ? combatant.atb : null;
        out.isActing = combatant.id === actingId;
        out.isTargeted = combatant.id === targetId;
        out.isDefeated = isDefeated(unit);
    }
}
