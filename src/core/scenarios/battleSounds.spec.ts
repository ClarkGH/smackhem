import {
    describe,
    it,
    expect,
    beforeEach,
} from 'vitest';
import AudioSystem from '../audio/audioSystem';
import { DEFEATED_SOUND, HIT_SOUND } from '../battle/battleSounds';
import { setHp } from '../combat';
import StubAudioService from '../../platforms/stub/stubAudioService';
import { createScenario, type Scenario } from '../../testing/scenario';
import { createDebugSettings } from '../settings/debugSettings';
import {
    HOSTILE,
    confirmAttack,
    landAttack,
    playRound,
    skip,
    startFight,
} from '../../testing/battleScenario';

const DOWN = { navigate: { x: 0, y: -1 } } as const;

describe('Battle sounds - scenario (stub platform)', () => {
    let scenario: Scenario;
    let audio: StubAudioService;

    // Requests made in a tick are played when its frame's events are flushed
    const played = (soundId: string): number => audio.playCalls.filter((c) => c.id === soundId).length;

    beforeEach(async () => {
        scenario = createScenario({ debugSettings: createDebugSettings() });
        audio = new StubAudioService();
        const audioSystem = new AudioSystem(audio, scenario.eventBus);
        await audioSystem.preload(HIT_SOUND, 'sfx');
        await audioSystem.preload(DEFEATED_SOUND, 'sfx');
        scenario.addChunk({ npcs: [HOSTILE] });
    });

    it('is silent on confirm, and sounds the hit once, on the frame it lands', () => {
        startFight(scenario);

        confirmAttack(scenario);
        expect(played(HIT_SOUND)).toBe(0);

        skip(scenario);
        expect(played(HIT_SOUND)).toBe(1);

        // Its beat, and every frame after, add nothing
        scenario.tick(30);
        expect(played(HIT_SOUND)).toBe(1);
    });

    it('sounds the hit and the defeat together on a finishing blow, and nothing more as the fight ends', () => {
        const battle = startFight(scenario);
        setHp(battle.combatants[1].unit, 2);

        landAttack(scenario);
        expect(played(HIT_SOUND)).toBe(1);
        expect(played(DEFEATED_SOUND)).toBe(1);

        // The last beat, then the fight is over
        skip(scenario);
        scenario.tick(2);
        expect(scenario.gameState.discrete.battle).toBeNull();
        expect(audio.playCalls).toHaveLength(2);
    });

    it('voices a second fight from its own first entry, not from where the last fight left off', () => {
        startFight(scenario);
        // The party's hit and the enemy's
        playRound(scenario);
        expect(played(HIT_SOUND)).toBe(2);
        // Run, and its beat
        scenario.press(DOWN);
        scenario.press({ interact: true });
        skip(scenario);
        scenario.tick(2);
        expect(scenario.gameState.discrete.gameMode).toBe('world_3d');

        startFight(scenario);
        landAttack(scenario);

        expect(played(HIT_SOUND)).toBe(3);
    });
});
