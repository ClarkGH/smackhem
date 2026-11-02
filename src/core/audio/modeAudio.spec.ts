import {
    describe,
    it,
    expect,
    beforeEach,
} from 'vitest';
import AudioSystem from './audioSystem';
import {
    AMBIENCE_FADE_SECONDS,
    AMBIENT_BEDS,
    BATTLE_START_SOUND,
    DAY_PHASE_CROSSFADE_SECONDS,
    subscribeModeAudio,
} from './modeAudio';
import { MENU_SELECT_SOUND } from '../menu/menuSystem';
import StubAudioService, { type StubPlaybackHandle } from '../../platforms/stub/stubAudioService';
import type { PlayerIntent } from '../../services/input';
import { createScenario, FIXED_DT, type Scenario } from '../../testing/scenario';
import { createDebugSettings } from '../settings/debugSettings';
import {
    HOSTILE,
    loseFight,
    startFight,
    winFight,
} from '../../testing/battleScenario';
import { DAY_LENGTH_SECONDS, NIGHT_STARTS_AT } from '../lighting/environment';

// A new run starts at midnight, so the night bed is the one playing unless a spec moves the clock
const NIGHT_BED = AMBIENT_BEDS.night;
const DAY_BED = AMBIENT_BEDS.day;

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
        await audioSystem.preload(NIGHT_BED, 'ambient');
        await audioSystem.preload(DAY_BED, 'ambient');
        await audioSystem.preload(MENU_SELECT_SOUND, 'ui');
        await audioSystem.preload(BATTLE_START_SOUND, 'sfx');
        subscribeModeAudio(scenario.eventBus, scenario.gameState);
    });

    const fadeInOf = (soundId: string): number | undefined => audio.playCalls.find((c) => c.id === soundId)?.fadeInSeconds;

    // New Game is the first entry in the start-up menu
    const startNewGame = (): void => press({ interact: true });

    it('is silent in the menu and starts the ambience on New Game', () => {
        scenario.tick();
        expect(voicesOf(NIGHT_BED)).toHaveLength(0);

        startNewGame();

        expect(scenario.gameState.discrete.gameMode).toBe('world_3d');
        expect(voicesOf(NIGHT_BED)).toHaveLength(1);
        expect(voicesOf(NIGHT_BED)[0].isFinished()).toBe(false);
    });

    it('pauses the ambience in the 2D scene and resumes it on return', () => {
        startNewGame();
        scenario.enterScene();
        // One flush deeper than interact was: scene request -> mode change -> pause request
        scenario.tick();
        expect(scenario.gameState.discrete.gameMode).toBe('scene_2d');
        expect(voicesOf(NIGHT_BED)[0].paused).toBe(true);

        press({ interact: true });
        expect(scenario.gameState.discrete.gameMode).toBe('world_3d');
        expect(voicesOf(NIGHT_BED)).toHaveLength(1);
        expect(voicesOf(NIGHT_BED)[0].paused).toBe(false);
    });

    it('stops the ambience in the instance and starts it again on return', () => {
        startNewGame();
        press({ pause: true });
        expect(scenario.gameState.discrete.gameMode).toBe('instance_3d');
        expect(voicesOf(NIGHT_BED)[0].stopped).toBe(true);

        press({ pause: true });
        // Mode returns to world_3d when the exit transition finishes
        scenario.tick(120);
        expect(scenario.gameState.discrete.gameMode).toBe('world_3d');

        const ambience = voicesOf(NIGHT_BED);
        expect(ambience).toHaveLength(2);
        expect(ambience[1].isFinished()).toBe(false);
    });

    it('keeps the ambience playing while paused', () => {
        startNewGame();

        press({ menu: true });

        expect(scenario.gameState.discrete.isPaused).toBe(true);
        expect(voicesOf(NIGHT_BED)[0].isFinished()).toBe(false);
        expect(voicesOf(NIGHT_BED)[0].paused).toBe(false);
    });

    it('stops the ambience when quitting to the main menu', () => {
        startNewGame();
        press({ menu: true });
        click('Quit to Main Menu');
        click('Yes, quit');
        // One flush deeper than a mode change: quit request -> reset and mode change -> stop request
        scenario.tick();

        expect(scenario.gameState.discrete.gameMode).toBe('main_menu');
        expect(voicesOf(NIGHT_BED)[0].stopped).toBe(true);
    });

    it('stops the ambience on Game Over, a menu like the main menu', () => {
        startNewGame();
        scenario.addChunk({ npcs: [HOSTILE] });
        startFight(scenario);
        loseFight(scenario);
        // Loss -> game_over_requested -> mode change -> stop request
        scenario.tick(3);

        expect(scenario.gameState.discrete.gameMode).toBe('game_over');
        expect(voicesOf(NIGHT_BED)[0].stopped).toBe(true);
    });

    it('plays the start sound and fades the ambience out as a fight starts, and fades it back in after', () => {
        startNewGame();
        scenario.addChunk({ npcs: [HOSTILE] });
        startFight(scenario);
        // One flush per level, after the one that built the fight: mode change, then the audio requests
        scenario.tick(2);

        expect(voicesOf(BATTLE_START_SOUND)).toHaveLength(1);
        expect(voicesOf(NIGHT_BED)[0].stopped).toBe(true);
        expect(voicesOf(NIGHT_BED)[0].fadeOutSeconds).toBe(AMBIENCE_FADE_SECONDS);

        winFight(scenario);
        scenario.tick(2);

        expect(scenario.gameState.discrete.gameMode).toBe('world_3d');
        expect(voicesOf(NIGHT_BED)).toHaveLength(2);
        expect(voicesOf(NIGHT_BED)[1].isFinished()).toBe(false);
    });

    describe('fades and the day/night bed', () => {
        it('fades the bed in on New Game, and out on leaving for the instance', () => {
            startNewGame();
            expect(fadeInOf(NIGHT_BED)).toBe(AMBIENCE_FADE_SECONDS);

            press({ pause: true });
            expect(voicesOf(NIGHT_BED)[0].fadeOutSeconds).toBe(AMBIENCE_FADE_SECONDS);
        });

        it('plays the day bed, not the night one, on a New Game started in the daytime', () => {
            scenario.gameState.timeOfDay = 0.5;
            startNewGame();

            expect(voicesOf(DAY_BED)).toHaveLength(1);
            expect(voicesOf(NIGHT_BED)).toHaveLength(0);
        });

        it('crossfades from day to night on the tick dusk is crossed', () => {
            scenario.gameState.timeOfDay = 0.5;
            startNewGame();
            // Half a tick short of dusk, so the next tick crosses it
            scenario.gameState.timeOfDay = NIGHT_STARTS_AT - FIXED_DT / DAY_LENGTH_SECONDS / 2;

            scenario.tick();
            // The phase change is published by the tick and handled at the end of its frame, the requests on the next
            scenario.tick();

            expect(voicesOf(DAY_BED)[0].stopped).toBe(true);
            expect(voicesOf(DAY_BED)[0].fadeOutSeconds).toBe(DAY_PHASE_CROSSFADE_SECONDS);
            expect(voicesOf(NIGHT_BED)).toHaveLength(1);
            expect(voicesOf(NIGHT_BED)[0].isFinished()).toBe(false);
            expect(fadeInOf(NIGHT_BED)).toBe(DAY_PHASE_CROSSFADE_SECONDS);
        });

        it('resumes the same bed after the 2D scene, since time stood still there', () => {
            scenario.gameState.timeOfDay = 0.5;
            startNewGame();
            scenario.enterScene();
            scenario.tick();
            press({ interact: true });

            expect(voicesOf(DAY_BED)).toHaveLength(1);
            expect(voicesOf(DAY_BED)[0].paused).toBe(false);
            expect(voicesOf(NIGHT_BED)).toHaveLength(0);
        });
    });
});
