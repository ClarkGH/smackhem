import {
    describe,
    it,
    expect,
    beforeEach,
    vi,
} from 'vitest';
import { TypeSafeEventBus } from './events';
import { createGameState, type GameState } from './gameState';
import { GameLoop } from './gameLoop';
import { World } from './world';
import AudioSystem from './audioSystem';
import { AMBIENT_SOUND, MODE_CHANGE_SOUND, subscribeModeAudio } from './modeAudio';
import { MENU_SELECT_SOUND } from './menuSystem';
import NullRenderer from '../platforms/stub/nullRenderer';
import StubInput from '../platforms/stub/stubInput';
import StubAudioService, { type StubPlaybackHandle } from '../platforms/stub/stubAudioService';
import type { PlayerIntent } from '../services/input';

const FIXED_DT = 1 / 60;

describe('mode-driven audio - scenario (stub platform)', () => {
    let input: StubInput;
    let gameState: GameState;
    let gameLoop: GameLoop;
    let audio: StubAudioService;

    // Mode events are flushed at the end of an update, the audio requests they publish on the next
    const press = (intent: Partial<PlayerIntent>): void => {
        input.setIntent(intent);
        gameLoop.update(FIXED_DT);
        input.reset();
        gameLoop.update(FIXED_DT);
    };

    const tick = (count: number): void => {
        for (let i = 0; i < count; i += 1) {
            gameLoop.update(FIXED_DT);
        }
    };

    const voicesOf = (soundId: string): StubPlaybackHandle[] => audio.voices.filter((v) => v.id === soundId);

    beforeEach(async () => {
        vi.spyOn(console, 'log').mockImplementation(() => {});

        input = new StubInput();
        gameState = createGameState('main_menu');
        audio = new StubAudioService();
        const eventBus = new TypeSafeEventBus();
        const audioSystem = new AudioSystem(audio, eventBus);
        await audioSystem.preload(AMBIENT_SOUND, 'ambient');
        await audioSystem.preload(MODE_CHANGE_SOUND, 'sfx');
        await audioSystem.preload(MENU_SELECT_SOUND, 'ui');

        gameLoop = new GameLoop(
            new NullRenderer(),
            input,
            new World(),
            () => 16 / 9,
            eventBus,
            gameState,
        );

        subscribeModeAudio(eventBus);
        tick(1);
    });

    // New Game is the first entry in the start-up menu
    const startNewGame = (): void => press({ interact: true });

    it('is silent in the menu and starts the ambience on New Game', () => {
        expect(voicesOf(AMBIENT_SOUND)).toHaveLength(0);

        startNewGame();

        expect(gameState.discrete.gameMode).toBe('world_3d');
        expect(voicesOf(AMBIENT_SOUND)).toHaveLength(1);
        expect(voicesOf(AMBIENT_SOUND)[0].isFinished()).toBe(false);
    });

    it('pauses the ambience in the 2D scene and resumes it on return', () => {
        startNewGame();
        press({ interact: true });
        expect(gameState.discrete.gameMode).toBe('scene_2d');
        expect(voicesOf(AMBIENT_SOUND)[0].paused).toBe(true);

        press({ interact: true });
        expect(gameState.discrete.gameMode).toBe('world_3d');
        expect(voicesOf(AMBIENT_SOUND)).toHaveLength(1);
        expect(voicesOf(AMBIENT_SOUND)[0].paused).toBe(false);
    });

    it('stops the ambience in the instance and starts it again on return', () => {
        startNewGame();
        press({ pause: true });
        expect(gameState.discrete.gameMode).toBe('instance_3d');
        expect(voicesOf(AMBIENT_SOUND)[0].stopped).toBe(true);

        press({ pause: true });
        // Mode returns to world_3d when the exit transition finishes
        tick(120);
        expect(gameState.discrete.gameMode).toBe('world_3d');

        const ambience = voicesOf(AMBIENT_SOUND);
        expect(ambience).toHaveLength(2);
        expect(ambience[1].isFinished()).toBe(false);
    });

    it('plays the mode change sound on every change, New Game included', () => {
        startNewGame();
        press({ interact: true });
        press({ interact: true });

        expect(voicesOf(MODE_CHANGE_SOUND)).toHaveLength(3);
    });
});
