import {
    describe,
    it,
    expect,
    beforeEach,
} from 'vitest';
import type { GameEvent } from '../events';
import { createDebugSettings, type DebugSettings } from '../settings/debugSettings';
import { createScenario, type Scenario } from '../../testing/scenario';
import { createPalette, paletteAt } from '../lighting/skyPalette';
import { cloudTimeAt } from '../lighting/clouds';
import { starTimeAt } from '../lighting/stars';
import EnvironmentSystem from '../lighting/environment';
import { createGameState } from '../gameState';

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

    // Steps Time of Day from Live to an exact time. Live -> 00:00 is one step, then one per quarter hour.
    const setTime = (hours: number): void => {
        for (let i = 0; i < hours * 4 + 1; i += 1) step('Time of Day', 1);
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

    it('enters the 2D scene, closing the menu', () => {
        scenario.click('Debug');
        scenario.click('Enter 2D Scene');

        expect(scenario.gameState.discrete.gameMode).toBe('scene_2d');
        expect(scenario.gameState.discrete.isPaused).toBe(false);
        expect(scenario.overlay.lastView).toBeNull();
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

    it('overrides the time of day by the quarter hour, without moving simulation time', () => {
        const { gameState, gameLoop } = scenario;
        const simulationTime = gameState.interpolated.simulationTime;
        scenario.click('Debug');
        expect(valueOf('Time of Day')).toBe('Live');

        step('Time of Day', 1);
        expect(valueOf('Time of Day')).toBe('00:00');
        expect(gameLoop.getTimeOfDay()).toBe(0);

        step('Time of Day', 1);
        expect(valueOf('Time of Day')).toBe('00:15');
        expect(gameLoop.getTimeOfDay()).toBe(1 / 96);

        // 00:15 -> 12:00 is 47 more quarter hours
        for (let i = 0; i < 47; i += 1) step('Time of Day', 1);
        expect(valueOf('Time of Day')).toBe('12:00');
        expect(gameLoop.getTimeOfDay()).toBe(0.5);
        expect(gameState.interpolated.simulationTime).toBe(simulationTime);
        expect(settingsChanges).toHaveLength(0);
    });

    it('casts noon shadows from the camera, and Shadows Off sends zero strength', () => {
        scenario.click('Debug');
        setTime(12);
        expect(valueOf('Time of Day')).toBe('12:00');

        const caster = scenario.renderer.getShadowCaster();
        expect(caster.strength).toBeCloseTo(1, 5);
        // High in the south at noon (+z), neither east nor west
        expect(caster.direction.x).toBeCloseTo(0, 5);
        expect(caster.direction.z).toBeGreaterThan(0);
        expect(caster.direction.y).toBeGreaterThan(0.5);
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

    it('sends the palette\'s sky colors and the sun\'s direction for the overridden hour, before beginFrame', () => {
        scenario.click('Debug');
        // Live -> 00:00 is one step, then four per hour
        let stepsTaken = 0;
        [0, 6, 12, 18].forEach((hour) => {
            for (; stepsTaken < hour * 4 + 1; stepsTaken += 1) step('Time of Day', 1);
            const sky = scenario.renderer.getSky();
            const expected = createPalette();
            paletteAt(hour / 24, expected);
            (['horizon', 'upper', 'zenith', 'glow', 'cloudLight', 'cloudMid', 'cloudShadow', 'stars'] as const).forEach((field) => {
                expect(sky[field]).toEqual(expected[field]);
            });
            if (hour === 0) expect(sky.stars).toBe(1);
            if (hour === 12) expect(sky.stars).toBe(0);

            // The sun's own direction, whatever the hour
            const environment = new EnvironmentSystem(100);
            environment.update(createGameState(), { x: 0, y: 0, z: 0 }, hour / 24);
            expect(sky.sunDirection).toEqual(environment.lightDirection);
            if (hour === 0) {
                // Midnight: below the horizon, and not the moon the shadows switch to
                expect(sky.sunDirection.y).toBeLessThan(0);
                expect(sky.sunDirection).not.toEqual(environment.shadowLightDirection);
            }
            expect(scenario.renderer.wasSkySetBeforeBeginFrame()).toBe(true);
        });
    });

    it('puts the sun and moon in the sky state: directions, palette disc colors, visibilities', () => {
        scenario.click('Debug');
        setTime(6);

        const environment = new EnvironmentSystem(100);
        environment.update(createGameState(), { x: 0, y: 0, z: 0 }, 6 / 24);
        // 06:00: the sun is on the horizon, partly visible, so its disc is fading, not dark
        expect(environment.sunVisibility).toBeGreaterThan(0);
        expect(environment.sunVisibility).toBeLessThan(1);

        const sky = scenario.renderer.getSky();
        expect(sky.sunDisc).toEqual(environment.palette.sunDisc);
        expect(sky.moonDisc).toEqual(environment.palette.moonLight);
        expect(sky.sunVisibility).toBeCloseTo(environment.sunVisibility, 6);
        expect(sky.moonVisibility).toBeCloseTo(environment.moonVisibility, 6);
        expect(sky.moonDirection).toEqual(environment.moonLightDirection);
        expect(sky.sunDirection).toEqual(environment.lightDirection);
    });

    it('sends a cloud time that follows sim time, not the Debug time of day', () => {
        const { gameState } = scenario;
        // Resume, so sim time runs, then a few seconds of play
        scenario.press({ menu: true });
        scenario.tick(120);
        const sky = scenario.renderer.getSky();
        expect(sky.cloudTime).toBeCloseTo(cloudTimeAt(gameState.interpolated.simulationTime), 6);
        expect(sky.cloudTime).toBeGreaterThan(0);

        // Overriding the time of day leaves the clouds where they are
        scenario.press({ menu: true });
        scenario.click('Debug');
        setTime(18);
        expect(scenario.renderer.getSky().cloudTime).toBeCloseTo(sky.cloudTime, 6);
    });

    it('sends a star time that follows sim time, not the Debug time of day', () => {
        const { gameState } = scenario;
        scenario.press({ menu: true });
        scenario.tick(120);
        const sky = scenario.renderer.getSky();
        expect(sky.starTime).toBeCloseTo(starTimeAt(gameState.interpolated.simulationTime), 6);
        expect(sky.starTime).toBeGreaterThan(0);

        // Overriding the time of day leaves the twinkle where it is
        scenario.press({ menu: true });
        scenario.click('Debug');
        setTime(18);
        expect(scenario.renderer.getSky().starTime).toBeCloseTo(sky.starTime, 6);
    });

    it('stops at 23:45 and steps back to Live', () => {
        scenario.click('Debug');
        for (let i = 0; i < 110; i += 1) step('Time of Day', 1);
        expect(valueOf('Time of Day')).toBe('23:45');

        for (let i = 0; i < 110; i += 1) step('Time of Day', -1);
        expect(valueOf('Time of Day')).toBe('Live');
        expect(debug.timeOfDayQuarter).toBeNull();
    });

    it('shows quarter hours, e.g. 06:30 for sunrise tuning', () => {
        scenario.click('Debug');
        setTime(6.5);
        expect(valueOf('Time of Day')).toBe('06:30');
        expect(scenario.gameLoop.getTimeOfDay()).toBe(6.5 / 24);
    });
});
