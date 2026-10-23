import {
    describe,
    it,
    expect,
    beforeEach,
} from 'vitest';
import { TypeSafeEventBus, type GameEvent } from './events';
import { createGameState, type GameState } from './gameState';
import MenuSystem, { MENU_SELECT_SOUND } from './menuSystem';
import { createDefaultSettings, type Settings } from './settings';
import type { PlayerIntent } from '../services/input';
import { createScenario, FIXED_DT, type Scenario } from '../testing/scenario';

const UP: PlayerIntent['navigate'] = { x: 0, y: 1 };
const DOWN: PlayerIntent['navigate'] = { x: 0, y: -1 };

describe('MenuSystem', () => {
    let eventBus: TypeSafeEventBus;
    let gameState: GameState;
    let menu: MenuSystem;
    let settings: Settings;
    let events: GameEvent[];

    const send = (intent: Partial<PlayerIntent>): void => {
        menu.update(gameState, {
            move: { x: 0, y: 0 },
            look: { yaw: 0, pitch: 0 },
            toggleCamera: false,
            ...intent,
        });
        eventBus.flush();
    };

    const selectedLabel = (): string => {
        const view = menu.getView();
        return view.items[view.selected].label;
    };

    const indexOf = (label: string): number => menu.getView().items.findIndex((item) => item.label === label);

    // Clicks an item by its label, wherever it sits on the screen
    const click = (label: string): void => send({ menuPointer: { index: indexOf(label), clicked: true } });

    const openSettings = (): void => click('Settings');

    const valueOf = (label: string): string | undefined => menu.getView().items[indexOf(label)].value;

    const selectSounds = (): number => events.filter(
        (e) => e.type === 'play_sound_requested' && e.soundId === MENU_SELECT_SOUND && e.category === 'ui',
    ).length;

    beforeEach(() => {
        eventBus = new TypeSafeEventBus();
        gameState = createGameState('main_menu');
        settings = createDefaultSettings();
        menu = new MenuSystem(eventBus, settings);
        events = [];
        eventBus.subscribe('play_sound_requested', (e) => { events.push(e); });
        eventBus.subscribe('game_mode_changed', (e) => { events.push(e); });
        eventBus.subscribe('audio_bus_volume_changed', (e) => { events.push(e); });
        eventBus.subscribe('settings_changed', (e) => { events.push(e); });
    });

    it('starts on the main screen with New Game selected', () => {
        expect(menu.getView().title).toBe('Smackhem');
        expect(selectedLabel()).toBe('New Game');
    });

    it('skips disabled items and wraps around', () => {
        send({ navigate: DOWN });
        // Continue and Load Game are disabled
        expect(selectedLabel()).toBe('Settings');

        send({ navigate: DOWN });
        expect(selectedLabel()).toBe('New Game');

        send({ navigate: UP });
        expect(selectedLabel()).toBe('Settings');
    });

    it('goes back up one level at a time, reselecting the item that opened the screen', () => {
        send({ navigate: UP });
        send({ interact: true });
        expect(menu.getView().title).toBe('Settings');

        click('Accessibility');
        expect(menu.getView().title).toBe('Accessibility');

        send({ back: true });
        expect(menu.getView().title).toBe('Settings');
        expect(selectedLabel()).toBe('Accessibility');

        send({ back: true });
        expect(menu.getView().title).toBe('Smackhem');
        expect(selectedLabel()).toBe('Settings');
    });

    it('starts a new game', () => {
        send({ interact: true });

        expect(gameState.discrete.gameMode).toBe('world_3d');
        expect(events).toContainEqual({
            type: 'game_mode_changed',
            previousMode: 'main_menu',
            currentMode: 'world_3d',
        });
    });

    it('plays the select sound when an enabled item is chosen', () => {
        send({ navigate: UP });
        send({ interact: true }); // Settings
        send({ back: true });
        send({ navigate: DOWN });
        send({ interact: true }); // New Game

        expect(selectSounds()).toBe(3);
    });

    it('stays silent for navigation and for back on the main screen', () => {
        send({ navigate: DOWN });
        send({ navigate: UP });
        send({ back: true });

        expect(selectSounds()).toBe(0);
    });

    it('selects the item under the mouse, disabled ones included, without a sound', () => {
        send({ menuPointer: { index: 3, clicked: false } });
        expect(selectedLabel()).toBe('Settings');

        send({ menuPointer: { index: 1, clicked: false } });
        expect(selectedLabel()).toBe('Continue');

        expect(selectSounds()).toBe(0);
    });

    it('chooses the clicked item', () => {
        send({ menuPointer: { index: 3, clicked: true } });
        expect(menu.getView().title).toBe('Settings');
        expect(selectSounds()).toBe(1);

        click('Back');
        click('New Game');
        expect(gameState.discrete.gameMode).toBe('world_3d');
    });

    it('ignores clicks on disabled items', () => {
        send({ menuPointer: { index: 1, clicked: true } });

        expect(menu.getView().title).toBe('Smackhem');
        expect(gameState.discrete.gameMode).toBe('main_menu');
        expect(selectSounds()).toBe(0);
    });

    it('ignores pointer indexes outside the screen', () => {
        send({ menuPointer: { index: 9, clicked: true } });
        send({ menuPointer: { index: -1, clicked: true } });

        expect(selectedLabel()).toBe('New Game');
        expect(gameState.discrete.gameMode).toBe('main_menu');
    });

    it('steps a volume with left/right, publishing the bus volume, without a sound', () => {
        openSettings();
        const before = selectSounds();
        expect(selectedLabel()).toBe('Master Volume');
        expect(valueOf('Master Volume')).toBe('100%');

        send({ navigate: { x: -1, y: 0 } });

        expect(settings.volume.master).toBe(0.9);
        expect(valueOf('Master Volume')).toBe('90%');
        expect(events).toContainEqual({ type: 'audio_bus_volume_changed', category: 'master', volume: 0.9 });
        expect(events).toContainEqual({ type: 'settings_changed' });
        expect(selectSounds()).toBe(before);
    });

    it('clamps volume and publishes nothing when it is already at the limit', () => {
        openSettings();
        const before = events.length;

        // Already at 100%
        send({ navigate: { x: 1, y: 0 } });
        expect(events).toHaveLength(before);

        for (let i = 0; i < 15; i += 1) send({ navigate: { x: -1, y: 0 } });
        expect(settings.volume.master).toBe(0);
    });

    it('steps sensitivity in tenths within its range', () => {
        openSettings();
        send({ menuPointer: { index: indexOf('Mouse Sensitivity'), clicked: false } });

        send({ navigate: { x: 1, y: 0 } });
        send({ navigate: { x: 1, y: 0 } });
        expect(settings.mouseSensitivity).toBe(1.2);
        expect(valueOf('Mouse Sensitivity')).toBe('1.2x');

        for (let i = 0; i < 30; i += 1) send({ navigate: { x: 1, y: 0 } });
        expect(settings.mouseSensitivity).toBe(2);

        for (let i = 0; i < 30; i += 1) send({ navigate: { x: -1, y: 0 } });
        expect(settings.mouseSensitivity).toBe(0.2);
        expect(settings.controllerSensitivity).toBe(1);
    });

    it('flips a toggle on confirm with a sound, or with left/right silently', () => {
        openSettings();
        const before = selectSounds();

        click('Invert Mouse Y');
        expect(settings.invertMouseY).toBe(true);
        expect(valueOf('Invert Mouse Y')).toBe('On');
        expect(selectSounds()).toBe(before + 1);

        send({ navigate: { x: 1, y: 0 } });
        expect(settings.invertMouseY).toBe(false);
        expect(selectSounds()).toBe(before + 1);
        expect(settings.invertControllerY).toBe(false);
    });

    it('steps values with the mouse arrows', () => {
        openSettings();

        send({ menuPointer: { index: indexOf('UI Volume'), clicked: false, step: -1 } });

        expect(settings.volume.ui).toBe(0.9);
        expect(selectedLabel()).toBe('UI Volume');
    });

    it('confirming a slider row does nothing', () => {
        openSettings();
        const before = events.length;

        send({ interact: true });

        expect(events).toHaveLength(before);
        expect(menu.getView().title).toBe('Settings');
    });

    it('steps render scale through its choices, without going past the ends', () => {
        openSettings();
        send({ menuPointer: { index: indexOf('Render Scale'), clicked: false } });
        expect(valueOf('Render Scale')).toBe('100%');

        send({ navigate: { x: -1, y: 0 } });
        expect(settings.renderScale).toBe(0.75);
        send({ navigate: { x: -1, y: 0 } });
        send({ navigate: { x: -1, y: 0 } });
        expect(settings.renderScale).toBe(0.5);
        expect(valueOf('Render Scale')).toBe('50%');
        expect(events).toContainEqual({ type: 'settings_changed' });
    });

    it('hides Window Size where the platform sizes the game (web)', () => {
        openSettings();

        expect(indexOf('Window Size')).toBe(-1);
    });

    it('disables Fullscreen where the platform can\'t do it, and stays silent', () => {
        openSettings();
        const label = "Fullscreen (use the page's button)";
        const before = selectSounds();

        click(label);

        expect(menu.getView().items[indexOf(label)].disabled).toBe(true);
        expect(settings.fullscreen).toBe(false);
        expect(selectSounds()).toBe(before);
    });

    describe('with a platform that supports every display option', () => {
        beforeEach(() => {
            menu = new MenuSystem(eventBus, settings, { fullscreen: true, windowResolution: true });
        });

        it('steps Window Size from the display size through the presets', () => {
            openSettings();
            send({ menuPointer: { index: indexOf('Window Size'), clicked: false } });
            expect(valueOf('Window Size')).toBe('Display');

            send({ navigate: { x: 1, y: 0 } });
            expect(settings.windowResolution).toEqual({ width: 1280, height: 720 });
            expect(valueOf('Window Size')).toBe('1280x720');

            send({ navigate: { x: -1, y: 0 } });
            expect(settings.windowResolution).toBeNull();
        });

        it('requests fullscreen on confirm', () => {
            openSettings();
            const before = selectSounds();

            click('Fullscreen');

            expect(settings.fullscreen).toBe(true);
            expect(selectSounds()).toBe(before + 1);
        });

        it('redraws when settings change from outside the menu', () => {
            openSettings();
            menu.consumeViewChanged();

            // e.g. Escape left fullscreen and bindDisplay mirrored it
            settings.fullscreen = true;
            eventBus.publish({ type: 'settings_changed' });
            eventBus.flush();

            expect(menu.consumeViewChanged()).toBe(true);
            expect(valueOf('Fullscreen')).toBe('On');
        });
    });

    it('has Reduced Motion and Menu Text Size under Settings > Accessibility', () => {
        openSettings();
        click('Accessibility');

        expect(menu.getView().items.map((item) => item.label)).toEqual(['Reduced Motion', 'Menu Text Size', 'Back']);

        click('Reduced Motion');
        expect(settings.reducedMotion).toBe(true);
        expect(valueOf('Reduced Motion')).toBe('On');
    });

    it('steps the menu text size and redraws the menu at that size', () => {
        openSettings();
        click('Accessibility');
        send({ menuPointer: { index: indexOf('Menu Text Size'), clicked: false } });
        expect(menu.getView().textScale).toBe(1);

        send({ navigate: { x: 1, y: 0 } });
        expect(valueOf('Menu Text Size')).toBe('1.5x');
        expect(menu.getView().textScale).toBe(1.5);

        send({ navigate: { x: 1, y: 0 } });
        send({ navigate: { x: 1, y: 0 } });
        expect(settings.menuTextScale).toBe(2);
        expect(menu.getView().textScale).toBe(2);
    });

    describe('pause menu', () => {
        const quitRequests = (): number => events.filter((e) => e.type === 'quit_to_main_menu_requested').length;

        beforeEach(() => {
            gameState.discrete.gameMode = 'world_3d';
            gameState.discrete.isPaused = true;
            eventBus.subscribe('quit_to_main_menu_requested', (e) => { events.push(e); });
            menu.openPause();
        });

        it('opens on Resume', () => {
            expect(menu.getView().title).toBe('Paused');
            expect(selectedLabel()).toBe('Resume');
        });

        it('resumes the game', () => {
            send({ interact: true });

            expect(gameState.discrete.isPaused).toBe(false);
            expect(gameState.discrete.gameMode).toBe('world_3d');
        });

        it('backs out of Settings to the pause menu, not the main menu', () => {
            click('Settings');
            expect(menu.getView().title).toBe('Settings');

            send({ back: true });
            expect(menu.getView().title).toBe('Paused');
            expect(selectedLabel()).toBe('Settings');
        });

        it('resumes on back from the pause menu itself', () => {
            send({ back: true });

            expect(gameState.discrete.isPaused).toBe(false);
        });

        it('Escape steps back one level, Start closes it from any screen', () => {
            click('Settings');
            click('Accessibility');

            // Escape: back and menu together
            send({ back: true, menu: true });
            expect(menu.getView().title).toBe('Settings');
            expect(gameState.discrete.isPaused).toBe(true);

            // Start: menu alone
            send({ menu: true });
            expect(gameState.discrete.isPaused).toBe(false);
        });

        it('asks before quitting, with No selected', () => {
            click('Quit to Main Menu');

            expect(menu.getView().title).toBe('Quit to main menu? Progress will be lost.');
            expect(selectedLabel()).toBe('No');

            send({ interact: true });
            expect(menu.getView().title).toBe('Paused');
            expect(selectedLabel()).toBe('Quit to Main Menu');
            expect(quitRequests()).toBe(0);
        });

        it('requests the quit on Yes', () => {
            click('Quit to Main Menu');
            click('Yes, quit');

            expect(quitRequests()).toBe(1);
        });

        it('resets to the main menu', () => {
            click('Settings');

            menu.reset();

            expect(menu.getView().title).toBe('Smackhem');
            expect(selectedLabel()).toBe('New Game');
        });
    });

    it('the menu button does nothing on the main menu', () => {
        send({ menu: true });
        send({ back: true, menu: true });

        expect(menu.getView().title).toBe('Smackhem');
        expect(gameState.discrete.gameMode).toBe('main_menu');
    });

    it('only reports view changes when something changed', () => {
        expect(menu.consumeViewChanged()).toBe(true);
        expect(menu.consumeViewChanged()).toBe(false);

        send({ navigate: DOWN });
        expect(menu.consumeViewChanged()).toBe(true);
    });
});

describe('MenuSystem - scenario through GameLoop (stub platform)', () => {
    let scenario: Scenario;

    beforeEach(() => {
        scenario = createScenario({ mode: 'main_menu' });
    });

    it('shows the menu, then hides it on New Game', () => {
        expect(scenario.overlay.lastView?.title).toBe('Smackhem');

        scenario.press({ interact: true });

        expect(scenario.gameState.discrete.gameMode).toBe('world_3d');
        expect(scenario.overlay.lastView).toBeNull();
    });

    it('confirming New Game does not also enter the 2D scene', () => {
        // One press, but the frame runs several fixed ticks on the same intent snapshot
        scenario.input.setIntent({ interact: true });
        scenario.frame(FIXED_DT * 3);

        expect(scenario.gameState.discrete.gameMode).toBe('world_3d');
    });

    it('the instance key does nothing in the menu', () => {
        scenario.press({ pause: true });

        expect(scenario.gameState.discrete.gameMode).toBe('main_menu');
        expect(scenario.gameState.discrete.isTimeFrozen).toBe(false);
    });

    it('only redraws the overlay when the menu changes', () => {
        const before = scenario.overlay.renderCount;
        scenario.gameLoop.render();
        scenario.gameLoop.render();

        expect(scenario.overlay.renderCount).toBe(before);
    });
});
