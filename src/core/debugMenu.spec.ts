import {
    describe,
    it,
    expect,
    beforeEach,
} from 'vitest';
import type { GameEvent } from './events';
import { createDebugSettings, type DebugSettings } from './debugSettings';
import { createScenario, type Scenario } from '../testing/scenario';

const labels = (scenario: Scenario): string[] => scenario.overlay.lastView?.items.map((item) => item.label) ?? [];

describe('debug menu - scenario (stub platform)', () => {
    let scenario: Scenario;
    let debug: DebugSettings;
    let settingsChanges: GameEvent[];

    // Steps a value row with its < > arrow, like the overlay's hit-test reports
    const step = (label: string, direction: -1 | 1): void => {
        const index = labels(scenario).indexOf(label);
        scenario.press({ menuPointer: { index, clicked: false, step: direction } });
    };

    const valueOf = (label: string): string | undefined => {
        const index = labels(scenario).indexOf(label);
        return scenario.overlay.lastView?.items[index].value;
    };

    beforeEach(() => {
        debug = createDebugSettings();
        scenario = createScenario({ mode: 'main_menu', debugSettings: debug });
        settingsChanges = [];
        scenario.eventBus.subscribe('settings_changed', (e) => { settingsChanges.push(e); });
        // New Game, then pause
        scenario.press({ interact: true });
        scenario.press({ menu: true });
    });

    it('is not offered without debug settings', () => {
        const release = createScenario({ mode: 'main_menu' });
        release.press({ interact: true });
        release.press({ menu: true });

        expect(labels(release)).not.toContain('Debug');
    });

    it('opens from the pause menu and goes back to it', () => {
        expect(scenario.overlay.lastView?.showWorld).toBe(false);
        scenario.click('Debug');
        expect(scenario.overlay.lastView?.title).toBe('Debug');
        expect(scenario.overlay.lastView?.showWorld).toBe(true);

        scenario.click('Back');
        expect(scenario.overlay.lastView?.title).toBe('Paused');
        const view = scenario.overlay.lastView!;
        expect(view.items[view.selected].label).toBe('Debug');
    });

    it('toggles wireframe on the renderer without saving settings', () => {
        scenario.click('Debug');
        scenario.click('Wireframe');

        expect(debug.wireframe).toBe(true);
        expect(valueOf('Wireframe')).toBe('On');
        expect(scenario.renderer.getWireframeEnabled()).toBe(true);
        expect(settingsChanges).toHaveLength(0);

        scenario.click('Wireframe');
        expect(scenario.renderer.getWireframeEnabled()).toBe(false);
    });

    it('overrides the time of day by the hour, without moving simulation time', () => {
        const { gameState, gameLoop } = scenario;
        const simulationTime = gameState.interpolated.simulationTime;
        scenario.click('Debug');
        expect(valueOf('Time of Day')).toBe('Live');

        step('Time of Day', 1);
        expect(valueOf('Time of Day')).toBe('00:00');
        expect(gameLoop.getTimeOfDay()).toBe(0);

        for (let i = 0; i < 12; i += 1) step('Time of Day', 1);
        expect(valueOf('Time of Day')).toBe('12:00');
        expect(gameLoop.getTimeOfDay()).toBe(0.5);
        expect(gameState.interpolated.simulationTime).toBe(simulationTime);
        expect(settingsChanges).toHaveLength(0);
    });

    it('casts noon shadows from the camera, and Shadows Off sends zero strength', () => {
        scenario.click('Debug');
        for (let i = 0; i < 13; i += 1) step('Time of Day', 1);
        expect(valueOf('Time of Day')).toBe('12:00');

        const caster = scenario.renderer.getShadowCaster();
        expect(caster.strength).toBeCloseTo(1, 5);
        // Straight overhead at noon
        expect(caster.direction.y).toBeCloseTo(1, 5);
        expect(caster.focus).toEqual(scenario.gameLoop.getRenderCamera().position);

        scenario.click('Shadows');
        expect(valueOf('Shadows')).toBe('Off');
        expect(scenario.renderer.getShadowCaster().strength).toBe(0);
    });

    it('steps the shadow bias scale on the renderer, within its range, without saving', () => {
        scenario.click('Debug');
        expect(valueOf('Shadow Bias')).toBe('x1');
        expect(scenario.renderer.getShadowBias()).toBe(1);

        step('Shadow Bias', 1);
        expect(scenario.renderer.getShadowBias()).toBe(2);

        for (let i = 0; i < 10; i += 1) step('Shadow Bias', 1);
        expect(valueOf('Shadow Bias')).toBe('x4');

        for (let i = 0; i < 10; i += 1) step('Shadow Bias', -1);
        expect(valueOf('Shadow Bias')).toBe('x0.25');
        expect(scenario.renderer.getShadowBias()).toBe(0.25);
        expect(settingsChanges).toHaveLength(0);
    });

    it('stops at 23:00 and steps back to Live', () => {
        scenario.click('Debug');
        for (let i = 0; i < 30; i += 1) step('Time of Day', 1);
        expect(valueOf('Time of Day')).toBe('23:00');

        for (let i = 0; i < 30; i += 1) step('Time of Day', -1);
        expect(valueOf('Time of Day')).toBe('Live');
        expect(debug.timeOfDayHour).toBeNull();
    });
});
