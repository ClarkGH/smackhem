import {
    describe,
    it,
    expect,
    beforeEach,
} from 'vitest';
import AudioSystem from './audioSystem';
import { AMBIENT_SOUND, MODE_CHANGE_SOUND, subscribeModeAudio } from './modeAudio';
import { MENU_SELECT_SOUND } from '../menu/menuSystem';
import StubAudioService, { type StubPlaybackHandle } from '../../platforms/stub/stubAudioService';
import type { PlayerIntent } from '../../services/input';
import { createScenario, type Scenario } from '../../testing/scenario';
import { createDebugSettings } from '../settings/debugSettings';
import { HOSTILE, loseFight, startFight } from '../../testing/battleScenario';

describe('mode-driven audio - scenario (stub platform)', () => {
    let scenario: Scenario;
    let audio: StubAudioService;

    // Mode changes are handled at the end of a frame, and the audio requests they publish
    // on the next one, so let one more frame run before checking sounds
    const press = (intent: Partial<PlayerIntent>): void => {
        scenario.press(intent);
        scenario.tick();
    };

    const click = (label: string): void => {
        scenario.click(label);
        scenario.tick();
    };

    const voicesOf = (soundId: string): StubPlaybackHandle[] => audio.voices.filter((v) => v.id === soundId);

    beforeEach(async () => {
        scenario = createScenario({ mode: 'main_menu', debugSettings: createDebugSettings() });
        audio = new StubAudioService();
        const audioSystem = new AudioSystem(audio, scenario.eventBus);
        await audioSystem.preload(AMBIENT_SOUND, 'ambient');
        await audioSystem.preload(MODE_CHANGE_SOUND, 'sfx');
        await audioSystem.preload(MENU_SELECT_SOUND, 'ui');
        subscribeModeAudio(scenario.eventBus);
    });

    // New Game is the first entry in the start-up menu
    const startNewGame = (): void => press({ interact: true });

    it('is silent in the menu and starts the ambience on New Game', () => {
        scenario.tick();
        expect(voicesOf(AMBIENT_SOUND)).toHaveLength(0);

        startNewGame();

        expect(scenario.gameState.discrete.gameMode).toBe('world_3d');
        expect(voicesOf(AMBIENT_SOUND)).toHaveLength(1);
        expect(voicesOf(AMBIENT_SOUND)[0].isFinished()).toBe(false);
    });

    it('pauses the ambience in the 2D scene and resumes it on return', () => {
        startNewGame();
        scenario.enterScene();
        // One flush deeper than interact was: scene request -> mode change -> pause request
        scenario.tick();
        expect(scenario.gameState.discrete.gameMode).toBe('scene_2d');
        expect(voicesOf(AMBIENT_SOUND)[0].paused).toBe(true);

        press({ interact: true });
        expect(scenario.gameState.discrete.gameMode).toBe('world_3d');
        expect(voicesOf(AMBIENT_SOUND)).toHaveLength(1);
        expect(voicesOf(AMBIENT_SOUND)[0].paused).toBe(false);
    });

    it('stops the ambience in the instance and starts it again on return', () => {
        startNewGame();
        press({ pause: true });
        expect(scenario.gameState.discrete.gameMode).toBe('instance_3d');
        expect(voicesOf(AMBIENT_SOUND)[0].stopped).toBe(true);

        press({ pause: true });
        // Mode returns to world_3d when the exit transition finishes
        scenario.tick(120);
        expect(scenario.gameState.discrete.gameMode).toBe('world_3d');

        const ambience = voicesOf(AMBIENT_SOUND);
        expect(ambience).toHaveLength(2);
        expect(ambience[1].isFinished()).toBe(false);
    });

    it('plays the mode change sound on every change, New Game included', () => {
        startNewGame();
        scenario.enterScene();
        press({ interact: true });

        expect(voicesOf(MODE_CHANGE_SOUND)).toHaveLength(3);
    });

    it('keeps the ambience playing while paused', () => {
        startNewGame();

        press({ menu: true });

        expect(scenario.gameState.discrete.isPaused).toBe(true);
        expect(voicesOf(AMBIENT_SOUND)[0].isFinished()).toBe(false);
        expect(voicesOf(AMBIENT_SOUND)[0].paused).toBe(false);
    });

    it('stops the ambience when quitting to the main menu', () => {
        startNewGame();
        press({ menu: true });
        click('Quit to Main Menu');
        click('Yes, quit');
        // One flush deeper than a mode change: quit request -> reset and mode change -> stop request
        scenario.tick();

        expect(scenario.gameState.discrete.gameMode).toBe('main_menu');
        expect(voicesOf(AMBIENT_SOUND)[0].stopped).toBe(true);
    });

    it('stops the ambience on Game Over, a menu like the main menu', () => {
        startNewGame();
        scenario.addChunk({ npcs: [HOSTILE] });
        startFight(scenario);
        loseFight(scenario);
        // Loss -> game_over_requested -> mode change -> stop request
        scenario.tick(3);

        expect(scenario.gameState.discrete.gameMode).toBe('game_over');
        expect(voicesOf(AMBIENT_SOUND)[0].stopped).toBe(true);
    });
});
