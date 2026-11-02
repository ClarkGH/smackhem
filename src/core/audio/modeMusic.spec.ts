import {
    describe,
    it,
    expect,
    beforeEach,
} from 'vitest';
import AudioSystem from './audioSystem';
import {
    BATTLE_MUSIC,
    FIELD_MUSIC,
    GAME_OVER_MUSIC,
    MUSIC_FADE_SECONDS,
    subscribeModeMusic,
} from './modeMusic';
import StubAudioService, { type StubPlaybackHandle } from '../../platforms/stub/stubAudioService';
import type { PlayerIntent } from '../../services/input';
import { createScenario, type Scenario } from '../../testing/scenario';
import { createDebugSettings } from '../settings/debugSettings';
import {
    HOSTILE,
    loseFight,
    startFight,
    winFight,
} from '../../testing/battleScenario';

describe('mode-driven music - scenario (stub platform)', () => {
    let scenario: Scenario;
    let audio: StubAudioService;

    // Mode changes are handled at the end of a frame, and the audio requests they publish on the next one
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
        await audioSystem.preload(FIELD_MUSIC.soundId, 'music');
        await audioSystem.preload(BATTLE_MUSIC.soundId, 'music');
        await audioSystem.preload(GAME_OVER_MUSIC.soundId, 'music');
        subscribeModeMusic(scenario.eventBus);
    });

    // New Game is the first entry in the start-up menu
    const startNewGame = (): void => press({ interact: true });

    const fight = (): void => {
        scenario.addChunk({ npcs: [HOSTILE] });
        startFight(scenario);
        // One flush per level, after the one that built the fight: mode change, then the music requests
        scenario.tick(2);
    };

    it('is silent in the menu, and fades the field music in on New Game', () => {
        scenario.tick();
        expect(audio.voices).toHaveLength(0);

        startNewGame();

        expect(voicesOf(FIELD_MUSIC.soundId)).toHaveLength(1);
        expect(audio.playCalls[0]).toEqual({
            id: FIELD_MUSIC.soundId, category: 'music', loop: true, fadeInSeconds: MUSIC_FADE_SECONDS,
        });
    });

    it('keeps the same field music going through the instance and the 2D scene', () => {
        startNewGame();
        press({ pause: true });
        expect(scenario.gameState.discrete.gameMode).toBe('instance_3d');
        press({ pause: true });
        scenario.tick(120);
        scenario.enterScene();
        scenario.tick();

        expect(voicesOf(FIELD_MUSIC.soundId)).toHaveLength(1);
        expect(voicesOf(FIELD_MUSIC.soundId)[0].isFinished()).toBe(false);
    });

    it('keeps playing under the pause menu', () => {
        startNewGame();

        press({ menu: true });

        expect(scenario.gameState.discrete.isPaused).toBe(true);
        expect(voicesOf(FIELD_MUSIC.soundId)[0].isFinished()).toBe(false);
    });

    it('crossfades from the field music to the battle music when a fight starts', () => {
        startNewGame();

        fight();

        expect(scenario.gameState.discrete.gameMode).toBe('battle_25djrpg');
        const field = voicesOf(FIELD_MUSIC.soundId)[0];
        expect(field.stopped).toBe(true);
        expect(field.fadeOutSeconds).toBe(MUSIC_FADE_SECONDS);
        expect(voicesOf(BATTLE_MUSIC.soundId)).toHaveLength(1);
        expect(voicesOf(BATTLE_MUSIC.soundId)[0].isFinished()).toBe(false);
    });

    it('starts the field music over after a won fight', () => {
        startNewGame();
        fight();

        winFight(scenario);
        scenario.tick(2);

        expect(scenario.gameState.discrete.gameMode).toBe('world_3d');
        expect(voicesOf(BATTLE_MUSIC.soundId)[0].stopped).toBe(true);
        // A new voice, from the top, while the first one stays stopped
        const field = voicesOf(FIELD_MUSIC.soundId);
        expect(field).toHaveLength(2);
        expect(field[1].isFinished()).toBe(false);
    });

    it('plays the game over music once on a loss, and stops it on returning to the title', () => {
        startNewGame();
        fight();
        loseFight(scenario);
        // Loss -> game_over_requested -> mode change -> music requests
        scenario.tick(3);

        expect(scenario.gameState.discrete.gameMode).toBe('game_over');
        expect(voicesOf(BATTLE_MUSIC.soundId)[0].stopped).toBe(true);
        expect(audio.playCalls.find((c) => c.id === GAME_OVER_MUSIC.soundId)?.loop).toBe(false);

        click('Return to Title');
        scenario.tick(2);

        expect(scenario.gameState.discrete.gameMode).toBe('main_menu');
        expect(voicesOf(GAME_OVER_MUSIC.soundId)[0].stopped).toBe(true);
    });

    it('stops the music when quitting to the main menu', () => {
        startNewGame();
        press({ menu: true });
        click('Quit to Main Menu');
        click('Yes, quit');
        // One flush deeper than a mode change: quit request -> reset and mode change -> stop request
        scenario.tick();

        expect(scenario.gameState.discrete.gameMode).toBe('main_menu');
        expect(voicesOf(FIELD_MUSIC.soundId)[0].stopped).toBe(true);
    });
});
