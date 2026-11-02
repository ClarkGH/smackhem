import type { TypeSafeEventBus } from '../events';
import type { GameMode } from '../gameState';

export interface MusicTrack {
    soundId: string;
    loop: boolean;
}

export const FIELD_MUSIC: MusicTrack = { soundId: 'music_field', loop: true };

export const BATTLE_MUSIC: MusicTrack = { soundId: 'music_battle', loop: true };

// Plays once and leaves silence after it
export const GAME_OVER_MUSIC: MusicTrack = { soundId: 'music_game_over', loop: false };

/**
 * What plays in each mode, null for silence. The same track in two modes carries on across the change,
 * so the instance and the 2D scene keep the field music going. The title screen is silent for now.
 */
export const MODE_MUSIC: Readonly<Record<GameMode, MusicTrack | null>> = {
    main_menu: null,
    world_3d: FIELD_MUSIC,
    instance_3d: FIELD_MUSIC,
    scene_2d: FIELD_MUSIC,
    battle_25djrpg: BATTLE_MUSIC,
    game_over: GAME_OVER_MUSIC,
};

// How long the old track fades out and the new one fades in, overlapping, in seconds
export const MUSIC_FADE_SECONDS = 1;

/**
 * Mode-driven music: one current track, crossfaded to the next whenever the mode changes to another.
 * A stopped track is forgotten, so coming back to it starts it over (the field music after a fight).
 * The pause menu isn't a mode change, so music keeps playing. Requests published here are handled on the next flush.
 */
export const subscribeModeMusic = (eventBus: TypeSafeEventBus): (() => void) => {
    // The track playing now, null for silence
    let current: MusicTrack | null = null;

    return eventBus.subscribe('game_mode_changed', (event) => {
        const next = MODE_MUSIC[event.currentMode];
        if (next === current) return;
        if (current) {
            eventBus.publish({ type: 'stop_sound_requested', soundId: current.soundId, fadeOutSeconds: MUSIC_FADE_SECONDS });
        }
        if (next) {
            eventBus.publish({
                type: 'play_sound_requested',
                soundId: next.soundId,
                category: 'music',
                loop: next.loop,
                fadeInSeconds: MUSIC_FADE_SECONDS,
            });
        }
        current = next;
    });
};
