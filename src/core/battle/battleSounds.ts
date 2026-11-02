import type { TypeSafeEventBus } from '../events';
import type { BattleLogEntry, BattleState } from './battle';

export const HIT_SOUND = 'sfx_hit';

export const DEFEATED_SOUND = 'sfx_defeated';

/**
 * What each log entry sounds like, null for silence. The fight's start sound plays on the mode change (modeAudio),
 * and how it ended is the music's to say (modeMusic).
 */
export const LOG_SOUNDS: Readonly<Record<BattleLogEntry['kind'], string | null>> = {
    battle_started: null,
    attacked: HIT_SOUND,
    defeated: DEFEATED_SOUND,
    battle_ended: null,
};

/**
 * The fight's sound effects, voiced from the log the way BattleScreen words it: each entry once, as it arrives.
 * The rules never ask for a sound, so the log stays the one record of what happened (battle.md, The battle screen).
 */
export default class BattleSounds {
    // How many of this fight's entries have been voiced
    private voiced = 0;

    constructor(private readonly eventBus: TypeSafeEventBus) {}

    // A new fight is voiced from its first entry
    public begin(): void {
        this.voiced = 0;
    }

    // Every entry added since the last call. A request is made only for an entry with a sound, once per action (M-1).
    public update(battle: BattleState): void {
        const { log } = battle;
        while (this.voiced < log.length) {
            const soundId = LOG_SOUNDS[log[this.voiced].kind];
            if (soundId) this.eventBus.publish({ type: 'play_sound_requested', soundId, category: 'sfx' });
            this.voiced += 1;
        }
    }
}
