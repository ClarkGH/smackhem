import { describe, it, expect } from 'vitest';
import type { NpcJSON } from '../chunkLoader';
import type { GameEvent } from '../events';
import { createDebugSettings } from '../settings/debugSettings';
import { createScenario, type Scenario } from '../../testing/scenario';
import { HOSTILE, loseFight as loseQuickly, startFight } from '../../testing/battleScenario';

type ModeChange = Extract<GameEvent, { type: 'game_mode_changed' }>;

const withHostile = (npc: NpcJSON = HOSTILE): Scenario & { modeChanges: ModeChange[] } => {
    const scenario = createScenario({ debugSettings: createDebugSettings() });
    scenario.addChunk({ npcs: [npc] });
    const modeChanges: ModeChange[] = [];
    scenario.eventBus.subscribe('game_mode_changed', (e) => { modeChanges.push(e); });
    return { ...scenario, modeChanges };
};

// Talks, answers Yes, loses straight away (testing/battleScenario.ts), then the frames for game_over_requested
const loseFight = (scenario: Scenario): void => {
    startFight(scenario);
    loseQuickly(scenario);
    scenario.tick(2);
};

describe('Game over - scenario (stub platform)', () => {
    it('follows a lost fight, with the Game Over screen up and the fight dropped', () => {
        const scenario = withHostile();

        loseFight(scenario);

        expect(scenario.gameState.discrete.gameMode).toBe('game_over');
        expect(scenario.gameState.discrete.battle).toBeNull();
        expect(scenario.overlay.lastView?.title).toBe('Game Over');
        expect(scenario.overlay.lastView?.items.map((item) => item.label)).toEqual(['Return to Title']);
        expect(scenario.modeChanges.at(-1)).toEqual(
            { type: 'game_mode_changed', previousMode: 'battle_25djrpg', currentMode: 'game_over' },
        );
    });

    it('never goes back to the world first', () => {
        const scenario = withHostile();

        loseFight(scenario);

        expect(scenario.modeChanges.map((change) => change.currentMode)).not.toContain('world_3d');
    });

    it('keeps the enemy: a loss never removes it', () => {
        const scenario = withHostile();

        loseFight(scenario);

        expect(scenario.gameState.discrete.defeatedNpcIds).toEqual([]);
        expect(scenario.world.findNpc('npc_evil_circle_1')).toBeDefined();
    });

    it('can only be left through Return to Title: Back, Menu and the instance toggle do nothing', () => {
        const scenario = withHostile();
        loseFight(scenario);

        scenario.press({ back: true });
        scenario.press({ menu: true });
        scenario.press({ pause: true });
        scenario.tick(5);

        expect(scenario.gameState.discrete.gameMode).toBe('game_over');
        expect(scenario.gameState.discrete.isPaused).toBe(false);
        expect(scenario.gameState.discrete.instanceIsOpen).toBe(false);
        expect(scenario.overlay.lastView?.title).toBe('Game Over');
    });

    it('holds the world still behind it', () => {
        const scenario = withHostile();
        loseFight(scenario);
        const { timeOfDay } = scenario.gameState;

        scenario.input.setIntent({ move: { x: 0, y: 1 } });
        scenario.tick(60);

        expect(scenario.gameState.timeOfDay).toBe(timeOfDay);
    });

    it('returns to the title on confirm, as a fresh start', () => {
        const scenario = withHostile();
        loseFight(scenario);

        scenario.press({ interact: true });
        scenario.tick();

        expect(scenario.gameState.discrete.gameMode).toBe('main_menu');
        expect(scenario.overlay.lastView?.title).toBe('Smackhem');
    });

    it('follows a fight lost in the instance too', () => {
        // Beside the circle, which opens 3 units ahead at (0, -3)
        const scenario = withHostile({ ...HOSTILE, pos: [1.5, 0, -3] });
        scenario.press({ pause: true });
        scenario.tick(120);

        loseFight(scenario);

        expect(scenario.gameState.discrete.gameMode).toBe('game_over');
    });
});
