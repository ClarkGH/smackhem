import type { MenuItemView } from './menuOverlay';

export interface BattleView {
    party: CombatantView[];
    enemies: CombatantView[];
    log: string[]; // already worded, newest last
    // The command list while a party member is choosing, null otherwise. Rows reuse the menu's
    commands: { items: MenuItemView[]; selected: number } | null;
    textScale: number; // the menu text size setting, like MenuView
}

export interface CombatantView {
    id: string; // matches a CombatantId, e.g. 'enemy:0'
    name: string;
    hp: number | null; // null when hidden (enemies, by default)
    maxHp: number | null;
    isActing: boolean; // their turn
    isTargeted: boolean; // the target cursor is on them
    isDefeated: boolean;
    // The ATB gauge, 0..1. null when hidden (enemies, like their HP)
    atb: number | null;
}

/**
 * Battle overlay interface
 * Draws the bubble core describes. Core never sees pixels or the DOM.
 */
export interface BattleOverlay {
    // null hides it
    render(view: BattleView | null): void;
}
