import type {
    AttackDef,
    AttackId,
    EncounterDef,
    EncounterId,
    EnemySheet,
    EnemySheetId,
    PartyMemberSheet,
    PartyMemberSheetId,
} from './combat';

// Sheets and attacks are fixed templates, runtime HP lives on PartyMember / Enemy
export const PARTY_MEMBER_SHEETS: Readonly<Record<PartyMemberSheetId, PartyMemberSheet>> = {
    circle: {
        kind: 'player', id: 'circle', maxHp: 20, basicAttackId: 'circle_basic', name: 'Circle', spriteId: 'circle_sleep_1',
    },
};

export const ENEMY_SHEETS: Readonly<Record<EnemySheetId, EnemySheet>> = {
    evil_circle: {
        kind: 'enemy',
        id: 'evil_circle',
        maxHp: 10,
        basicAttackId: 'evil_circle_basic',
        name: 'Evil Circle',
        spriteId: 'evil_circle_idle_1',
        keepsDamage: false,
    },
    // Debug only, never required (D-1): a Deathgaze-style enemy that keeps its damage when you run
    debug_boss: {
        kind: 'enemy',
        id: 'debug_boss',
        maxHp: 30,
        basicAttackId: 'evil_circle_basic',
        name: 'Debug Boss',
        spriteId: 'evil_circle_idle_1',
        keepsDamage: true,
    },
};

export const ATTACKS: Readonly<Record<AttackId, AttackDef>> = {
    circle_basic: { id: 'circle_basic', power: 2 },
    evil_circle_basic: { id: 'evil_circle_basic', power: 2 },
};

export const ENCOUNTERS: Readonly<Record<EncounterId, EncounterDef>> = {
    npc_evil_circle_1: { id: 'npc_evil_circle_1', enemies: ['evil_circle'], canRun: true },
    // Debug only, never required (D-1). The crowd: three at once, for the rubric's Scales check and target switching.
    // The boss: keeps its damage when you run. Cornered: Run is offered but disabled.
    debug_crowd: { id: 'debug_crowd', enemies: ['evil_circle', 'evil_circle', 'evil_circle'], canRun: true },
    debug_boss: { id: 'debug_boss', enemies: ['debug_boss'], canRun: true },
    debug_cornered: { id: 'debug_cornered', enemies: ['evil_circle'], canRun: false },
};
