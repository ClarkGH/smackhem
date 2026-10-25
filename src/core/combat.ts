import { ATTACKS, ENEMY_SHEETS, PLAYER_SHEETS } from './combatSheets';

export type PlayerSheetId = 'circle';
export type EnemySheetId = 'goatee_circle';
export type AttackId = 'circle_basic' | 'goatee_basic';

export interface AttackDef {
    id: AttackId;
    power: number; // integer, >= 0. Flat damage for now
}

export interface PlayerSheet {
    kind: 'player';
    id: PlayerSheetId;
    maxHp: number; // integer, >= 1
    basicAttackId: AttackId;
}

export interface EnemySheet {
    kind: 'enemy';
    id: EnemySheetId;
    maxHp: number; // integer, >= 1
    basicAttackId: AttackId;
}

export interface PartyMember {
    kind: 'player';
    sheetId: PlayerSheetId;
    hp: number; // integer, 0..maxHp. Change only via setHp
}

export interface Enemy {
    kind: 'enemy';
    sheetId: EnemySheetId;
    hp: number; // integer, 0..maxHp. Change only via setHp
}

export type BattleOutcome = 'ongoing' | 'won' | 'lost' | 'mutual_defeat';

export const createPartyMember = (sheet: PlayerSheet): PartyMember => ({
    kind: 'player',
    sheetId: sheet.id,
    hp: sheet.maxHp,
});

export const createEnemy = (sheet: EnemySheet): Enemy => ({
    kind: 'enemy',
    sheetId: sheet.id,
    hp: sheet.maxHp,
});

// maxHp is read from the sheet, never copied onto the runtime object
const getSheet = (c: PartyMember | Enemy): PlayerSheet | EnemySheet => (
    c.kind === 'player' ? PLAYER_SHEETS[c.sheetId] : ENEMY_SHEETS[c.sheetId]
);

export const getMaxHp = (c: PartyMember | Enemy): number => getSheet(c).maxHp;

export const getBasicAttack = (c: PartyMember | Enemy): AttackDef => ATTACKS[getSheet(c).basicAttackId];

// The only way HP changes: whole numbers, never below 0 or above maxHp
export const setHp = (c: PartyMember | Enemy, value: number): void => {
    c.hp = Math.min(Math.max(Math.floor(value), 0), getMaxHp(c));
};

export const isDefeated = (c: PartyMember | Enemy): boolean => c.hp === 0;

// Pure, so it can preview damage. Never negative, so a bad power can't heal
export const getAttackDamage = (attack: AttackDef): number => Math.max(0, Math.floor(attack.power));

export const applyAttack = (attack: AttackDef, target: PartyMember | Enemy): void => {
    setHp(target, target.hp - getAttackDamage(attack));
};

// An empty side counts as defeated: nobody is standing
const isSideDefeated = (side: readonly (PartyMember | Enemy)[]): boolean => {
    for (let i = 0; i < side.length; i += 1) {
        if (!isDefeated(side[i])) return false;
    }
    return true;
};

export const getBattleOutcome = (
    party: readonly PartyMember[],
    enemies: readonly Enemy[],
): BattleOutcome => {
    const partyDefeated = isSideDefeated(party);
    const enemiesDefeated = isSideDefeated(enemies);

    if (partyDefeated && enemiesDefeated) return 'mutual_defeat';
    if (enemiesDefeated) return 'won';
    if (partyDefeated) return 'lost';
    return 'ongoing';
};

// mutual_defeat counts as a loss. Ask this, not outcome === 'lost'
export const isLoss = (outcome: BattleOutcome): boolean => outcome === 'lost' || outcome === 'mutual_defeat';
