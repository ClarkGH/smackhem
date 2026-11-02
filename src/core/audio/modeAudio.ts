import type { TypeSafeEventBus } from '../events';
import type { GameState } from '../gameState';
import { dayPhaseAt, type DayPhase } from '../lighting/environment';

// The ambient bed for each part of the day
export const AMBIENT_BEDS: Readonly<Record<DayPhase, string>> = {
    day: 'ambient_day',
    night: 'ambient_night',
};

const DAY_PHASES = Object.keys(AMBIENT_BEDS) as DayPhase[];

// Played as a fight starts. A stand-in until the battle intro (the party popping out) owns the transition.
export const BATTLE_START_SOUND = 'sfx_battle_start';

// How long the bed takes to fade in or out on a mode change, in seconds
export const AMBIENCE_FADE_SECONDS = 1.5;

// How long the day and night beds overlap when the phase turns, in seconds. A game hour is 5 seconds.
export const DAY_PHASE_CROSSFADE_SECONDS = 6;

// Starts the phase's bed, or resumes it if paused (looping requests never restart, and a resume ignores the fade)
const playBed = (eventBus: TypeSafeEventBus, phase: DayPhase, fadeInSeconds: number): void => {
    eventBus.publish({
        type: 'play_sound_requested',
        soundId: AMBIENT_BEDS[phase],
        category: 'ambient',
        loop: true,
        fadeInSeconds,
    });
};

// Every bed but the one kept, so nothing has to remember which is playing. A bed with no voice ignores it.
const stopBeds = (eventBus: TypeSafeEventBus, fadeOutSeconds: number, kept: DayPhase | null = null): void => {
    DAY_PHASES.forEach((phase) => {
        if (phase !== kept) eventBus.publish({ type: 'stop_sound_requested', soundId: AMBIENT_BEDS[phase], fadeOutSeconds });
    });
};

const pauseBeds = (eventBus: TypeSafeEventBus): void => {
    DAY_PHASES.forEach((phase) => eventBus.publish({ type: 'pause_sound_requested', soundId: AMBIENT_BEDS[phase] }));
};

/**
 * Mode-driven audio: the ambient bed for the time of day, which pauses in the 2D scene, fades out in the instance,
 * in a fight (with a start sound), on quitting to the main menu and on Game Over, and fades in or resumes in the world.
 * Music is modeMusic's. When the day turns to night
 * or back, the beds crossfade. The pause menu isn't a mode change, so ambience keeps playing.
 * Reads the shared GameState's time of day. Requests published here are handled on the next flush.
 */
export const subscribeModeAudio = (eventBus: TypeSafeEventBus, gameState: Readonly<GameState>): (() => void) => {
    const unsubscribeMode = eventBus.subscribe('game_mode_changed', (event) => {
        switch (event.currentMode) {
            case 'scene_2d':
                pauseBeds(eventBus);
                break;
            case 'instance_3d':
                stopBeds(eventBus, AMBIENCE_FADE_SECONDS);
                break;
            case 'world_3d':
                playBed(eventBus, dayPhaseAt(gameState.timeOfDay), AMBIENCE_FADE_SECONDS);
                break;
            case 'battle_25djrpg':
                // The world goes quiet under the battle music, and comes back with the world mode
                eventBus.publish({ type: 'play_sound_requested', soundId: BATTLE_START_SOUND, category: 'sfx' });
                stopBeds(eventBus, AMBIENCE_FADE_SECONDS);
                break;
            case 'main_menu':
            case 'game_over':
                // Quitting or losing a run, the menu is silent
                stopBeds(eventBus, AMBIENCE_FADE_SECONDS);
                break;
            default:
                break;
        }
    });

    // Only world_3d moves time, so the world's bed is the one playing
    const unsubscribePhase = eventBus.subscribe('day_phase_changed', (event) => {
        stopBeds(eventBus, DAY_PHASE_CROSSFADE_SECONDS, event.phase);
        playBed(eventBus, event.phase, DAY_PHASE_CROSSFADE_SECONDS);
    });

    return () => {
        unsubscribeMode();
        unsubscribePhase();
    };
};
