import type { BattleOverlay, BattleView, CombatantView } from '../../services/battleOverlay';

// A copy of one fighter, so later changes core makes to its object don't reach the copy
const copyCombatant = (combatant: CombatantView): CombatantView => ({ ...combatant });

/**
 * Stub Battle overlay for testing (Rule P-1)
 * Draws nothing, keeps a copy of the last view for assertions (core reuses its objects).
 * Every nested object and array is copied too, or a test could pass on a view the overlay was never sent.
 */
export default class NullBattleOverlay implements BattleOverlay {
    public lastView: BattleView | null = null;

    public renderCount = 0;

    public render(view: BattleView | null): void {
        this.lastView = view ? {
            ...view,
            party: view.party.map(copyCombatant),
            enemies: view.enemies.map(copyCombatant),
            log: [...view.log],
            commands: view.commands ? {
                ...view.commands,
                items: view.commands.items.map((item) => ({ ...item })),
            } : null,
        } : null;
        this.renderCount += 1;
    }
}
