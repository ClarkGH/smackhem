import {
    describe,
    it,
    expect,
    vi,
} from 'vitest';
import type { NpcJSON } from '../chunkLoader';
import type { GameEvent } from '../events';
import { createDebugSettings } from '../settings/debugSettings';
import { createScenario, type Scenario } from '../../testing/scenario';

// The player starts at the origin looking down -z, so it stands in reach, dead ahead
const HOSTILE: NpcJSON = {
    id: 'npc_evil_circle_1',
    sprite: 'evil_circle_idle_1',
    pos: [0, 0, -1.5],
    size: 1,
    line: 'Me Fight! You want figh?!',
    encounterId: 'npc_evil_circle_1',
};

const DOWN = { navigate: { x: 0, y: -1 } } as const;

type ModeChange = Extract<GameEvent, { type: 'game_mode_changed' }>;

const withNpc = (npc: NpcJSON): Scenario & { modeChanges: ModeChange[] } => {
    const scenario = createScenario({ debugSettings: createDebugSettings() });
    scenario.addChunk({ npcs: [npc] });
    const modeChanges: ModeChange[] = [];
    scenario.eventBus.subscribe('game_mode_changed', (e) => { modeChanges.push(e); });
    return { ...scenario, modeChanges };
};

// Talks to it and answers Yes (selected by default), then one more frame for battle_requested to be handled
const startFight = (scenario: Scenario): void => {
    scenario.press({ interact: true });
    scenario.press({ interact: true });
    scenario.tick();
};

describe('Starting a fight - scenario (stub platform)', () => {
    it('starts the NPC\'s encounter on Yes', () => {
        const scenario = withNpc(HOSTILE);

        startFight(scenario);

        const { battle, gameMode } = scenario.gameState.discrete;
        expect(gameMode).toBe('battle_25djrpg');
        expect(battle).toMatchObject({
            encounterId: 'npc_evil_circle_1',
            npcId: 'npc_evil_circle_1',
            outcome: 'ongoing',
            returnMode: 'world_3d',
        });
        // Where they stand is battleStage.spec's business
        expect(battle?.combatants).toMatchObject([
            { id: 'party:0', side: 'party', unit: { kind: 'player', sheetId: 'circle', hp: 20 } },
            { id: 'enemy:0', side: 'enemy', unit: { kind: 'enemy', sheetId: 'evil_circle', hp: 10 } },
        ]);
        // Published while battle_requested was handled, so listeners hear it on the next flush
        scenario.tick();
        expect(scenario.modeChanges).toEqual([
            { type: 'game_mode_changed', previousMode: 'world_3d', currentMode: 'battle_25djrpg' },
        ]);
    });

    it('starts one frame after Yes: choice_made, then battle_requested, each on its own flush', () => {
        const scenario = withNpc(HOSTILE);
        scenario.press({ interact: true });

        scenario.press({ interact: true });
        expect(scenario.gameState.discrete.battle).toBeNull();

        scenario.tick();
        expect(scenario.gameState.discrete.battle).not.toBeNull();
    });

    it('starts nothing on No', () => {
        const scenario = withNpc(HOSTILE);
        scenario.press({ interact: true });

        scenario.press(DOWN);
        scenario.press({ interact: true });
        scenario.tick(5);

        expect(scenario.gameState.discrete.battle).toBeNull();
        expect(scenario.gameState.discrete.gameMode).toBe('world_3d');
    });

    it('starts nothing on Back, and the NPC can be asked again', () => {
        const scenario = withNpc(HOSTILE);
        scenario.press({ interact: true });

        scenario.press({ back: true });
        scenario.tick(5);
        expect(scenario.gameState.discrete.battle).toBeNull();

        startFight(scenario);
        expect(scenario.gameState.discrete.battle).not.toBeNull();
    });

    it('warns and starts nothing for an encounter that does not exist', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const scenario = withNpc({ ...HOSTILE, encounterId: 'npc_nobody_1' });

        startFight(scenario);

        expect(scenario.gameState.discrete.battle).toBeNull();
        expect(scenario.gameState.discrete.gameMode).toBe('world_3d');
        expect(warn.mock.calls.filter(([message]) => String(message).startsWith('Unknown encounter'))).toHaveLength(1);
    });

    it('ignores a second request while a fight is on', () => {
        const scenario = withNpc(HOSTILE);
        startFight(scenario);
        const { battle } = scenario.gameState.discrete;

        scenario.eventBus.publish({ type: 'battle_requested', encounterId: 'npc_evil_circle_1', npcId: 'npc_evil_circle_1' });
        scenario.tick();

        expect(scenario.gameState.discrete.battle).toBe(battle);
        expect(scenario.modeChanges).toHaveLength(1);
    });
});

describe('During a fight - scenario (stub platform)', () => {
    it('holds the world still: no time, moving or looking', () => {
        const scenario = withNpc(HOSTILE);
        startFight(scenario);
        const { timeOfDay } = scenario.gameState;
        const position = { ...scenario.gameState.interpolated.cameraPosition };
        const yaw = scenario.gameState.interpolated.cameraYaw;

        scenario.input.setIntent({ move: { x: 1, y: 1 }, lookRate: { yaw: 1, pitch: 1 } });
        scenario.tick(60);

        expect(scenario.gameState.timeOfDay).toBe(timeOfDay);
        expect(scenario.gameState.interpolated.cameraPosition).toEqual(position);
        expect(scenario.gameState.interpolated.cameraYaw).toBe(yaw);
    });

    it('shows no interact prompt', () => {
        const scenario = withNpc(HOSTILE);
        startFight(scenario);

        scenario.tick();

        expect(scenario.gameState.discrete.interactTarget).toBeNull();
    });

    it('ignores the instance toggle', () => {
        const scenario = withNpc(HOSTILE);
        startFight(scenario);

        scenario.press({ pause: true });
        scenario.tick(5);

        expect(scenario.gameState.discrete.instanceIsOpen).toBe(false);
        expect(scenario.gameState.discrete.gameMode).toBe('battle_25djrpg');
    });

    it('pauses, keeping the fight, and resumes into it', () => {
        const scenario = withNpc(HOSTILE);
        startFight(scenario);
        const { battle } = scenario.gameState.discrete;

        scenario.press({ menu: true });
        expect(scenario.gameState.discrete.isPaused).toBe(true);
        scenario.tick(30);
        scenario.click('Resume');

        expect(scenario.gameState.discrete.gameMode).toBe('battle_25djrpg');
        expect(scenario.gameState.discrete.battle).toBe(battle);
    });

    it('is thrown away by quitting to the main menu', () => {
        const scenario = withNpc(HOSTILE);
        startFight(scenario);

        scenario.press({ menu: true });
        scenario.click('Quit to Main Menu');
        scenario.click('Yes, quit');
        scenario.tick();

        expect(scenario.gameState.discrete.gameMode).toBe('main_menu');
        expect(scenario.gameState.discrete.battle).toBeNull();
    });
});

describe('Coming back from a fight - scenario (stub platform)', () => {
    // Slice 2's turn loop will decide the outcome. Until then a test decides it.
    const endFight = (scenario: Scenario): void => {
        const { battle } = scenario.gameState.discrete;
        if (!battle) throw new Error('No fight to end');
        battle.outcome = 'won';
        scenario.tick();
    };

    it('returns to the world once the outcome is decided, and drops the fight', () => {
        const scenario = withNpc(HOSTILE);
        startFight(scenario);

        endFight(scenario);

        expect(scenario.gameState.discrete.gameMode).toBe('world_3d');
        expect(scenario.gameState.discrete.battle).toBeNull();
        expect(scenario.modeChanges.at(-1)).toEqual(
            { type: 'game_mode_changed', previousMode: 'battle_25djrpg', currentMode: 'world_3d' },
        );
    });

    it('comes back to the world as it was: camera, interact target, and moving again', () => {
        const scenario = withNpc(HOSTILE);
        startFight(scenario);
        const position = { ...scenario.gameState.interpolated.cameraPosition };
        const yaw = scenario.gameState.interpolated.cameraYaw;

        endFight(scenario);
        scenario.tick();
        expect(scenario.gameState.interpolated.cameraPosition).toEqual(position);
        expect(scenario.gameState.interpolated.cameraYaw).toBe(yaw);
        // Beaten, so it's gone and nothing is in reach (battleDefeat.spec covers the rest)
        expect(scenario.gameState.discrete.interactTarget).toBeNull();

        scenario.input.setIntent({ move: { x: 1, y: 0 } });
        scenario.tick(10);
        expect(scenario.gameState.interpolated.cameraPosition.x).toBeGreaterThan(position.x);
    });

    it('comes back to the instance as it was, when the fight started there', () => {
        // Beside the circle, which opens 3 units ahead at (0, -3), and out of the camera's reach
        const scenario = withNpc({ ...HOSTILE, pos: [1.5, 0, -3] });
        scenario.press({ pause: true });
        scenario.tick(120);
        expect(scenario.gameState.discrete.instanceIsActive).toBe(true);
        const circle = { ...scenario.gameState.interpolated.instanceCharacterPosition };

        startFight(scenario);
        expect(scenario.gameState.discrete.battle?.returnMode).toBe('instance_3d');
        endFight(scenario);

        expect(scenario.gameState.discrete.gameMode).toBe('instance_3d');
        expect(scenario.gameState.discrete.instanceIsActive).toBe(true);
        expect(scenario.gameState.discrete.instanceIsOpen).toBe(true);
        expect(scenario.gameState.interpolated.instanceCharacterPosition).toEqual(circle);
    });
});
