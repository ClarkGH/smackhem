import type {
    AttackDef,
    AttackId,
    EnemySheet,
    EnemySheetId,
    PlayerSheet,
    PlayerSheetId,
} from './combat';

// Sheets and attacks are fixed templates, runtime HP lives on PartyMember / Enemy
export const PLAYER_SHEETS: Readonly<Record<PlayerSheetId, PlayerSheet>> = {
    circle: {
        kind: 'player', id: 'circle', maxHp: 20, basicAttackId: 'circle_basic',
    },
};

export const ENEMY_SHEETS: Readonly<Record<EnemySheetId, EnemySheet>> = {
    goatee_circle: {
        kind: 'enemy', id: 'goatee_circle', maxHp: 10, basicAttackId: 'goatee_basic',
    },
};

export const ATTACKS: Readonly<Record<AttackId, AttackDef>> = {
    circle_basic: { id: 'circle_basic', power: 2 },
    goatee_basic: { id: 'goatee_basic', power: 2 },
};
