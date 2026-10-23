import type { TypeSafeEventBus } from './events';

export const AMBIENT_SOUND = 'ambient_night';

export const MODE_CHANGE_SOUND = 'sfx_mode_change';

// Starts the ambience, or resumes it if paused (looping requests never restart)
export const playAmbience = (eventBus: TypeSafeEventBus): void => {
    eventBus.publish({
        type: 'play_sound_requested',
        soundId: AMBIENT_SOUND,
        category: 'ambient',
        loop: true,
    });
};

/**
 * Mode-driven audio: a sound on every mode change, and ambience that
 * pauses in the 2D scene, stops in the instance, and starts or resumes in the world.
 * Requests published here are handled on the next flush.
 */
export const subscribeModeAudio = (eventBus: TypeSafeEventBus): (() => void) => eventBus.subscribe(
    'game_mode_changed',
    (event) => {
        eventBus.publish({ type: 'play_sound_requested', soundId: MODE_CHANGE_SOUND, category: 'sfx' });

        switch (event.currentMode) {
            case 'scene_2d':
                eventBus.publish({ type: 'pause_sound_requested', soundId: AMBIENT_SOUND });
                break;
            case 'instance_3d':
                eventBus.publish({ type: 'stop_sound_requested', soundId: AMBIENT_SOUND });
                break;
            case 'world_3d':
                playAmbience(eventBus);
                break;
            default:
                break;
        }
    },
);
