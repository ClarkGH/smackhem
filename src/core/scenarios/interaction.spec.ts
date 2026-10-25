import { describe, it, expect } from 'vitest';
import type { NpcJSON } from '../../services/chunkLoader';
import { createDebugSettings } from '../settings/debugSettings';
import { createScenario, type Scenario } from '../../testing/scenario';

const LINE = "Me NPC, me no do nuthin' yet.. but me look great!";

// The player starts at the origin looking down -z
const npcAt = (id: string, x: number, z: number): NpcJSON => ({
    id, sprite: 'npc-lmao', pos: [x, 0, z], size: 1, line: LINE,
});

const AHEAD = npcAt('ahead', 0, -1.5);

const withNpcs = (npcs: NpcJSON[]): Scenario => {
    const scenario = createScenario({ debugSettings: createDebugSettings() });
    scenario.addChunk({ npcs });
    return scenario;
};

describe('NPC speech - scenario (stub platform)', () => {
    it('says its line when you interact facing it', () => {
        const { gameState, speech, press } = withNpcs([AHEAD]);

        press({ interact: true });

        expect(gameState.discrete.activeSpeech).toMatchObject({ npcId: 'ahead', line: LINE });
        expect(speech.lastView?.text).toBe(LINE);
        // Dead ahead, so centered across
        expect(speech.lastView?.x).toBeCloseTo(0.5, 3);
    });

    it('anchors the bubble over its head, not at its feet', () => {
        // Two units tall, so its head is above eye level (1.6) and lands above the middle of the screen
        const { speech, press } = withNpcs([{ ...AHEAD, size: 2 }]);

        press({ interact: true });

        expect(speech.lastView?.y).toBeLessThan(0.5);
    });

    it('stays open until closed, however long it takes to read', () => {
        const {
            gameState, speech, press, tick,
        } = withNpcs([AHEAD]);
        press({ interact: true });

        tick(600);

        expect(gameState.discrete.activeSpeech).not.toBeNull();
        expect(speech.lastView?.text).toBe(LINE);
    });

    it('closes on Interact, and that press does not open it again', () => {
        const { gameState, speech, press } = withNpcs([AHEAD]);
        press({ interact: true });
        expect(gameState.discrete.activeSpeech).not.toBeNull();

        press({ interact: true });

        expect(gameState.discrete.activeSpeech).toBeNull();
        expect(speech.lastView).toBeNull();
    });

    it('tells the overlay to hide once, not every frame after', () => {
        const { speech, press, tick } = withNpcs([AHEAD]);
        press({ interact: true });
        press({ interact: true });
        expect(speech.lastView).toBeNull();
        const calls = speech.renderCount;

        tick(30);

        expect(speech.renderCount).toBe(calls);
    });

    it('closes on Back', () => {
        const { gameState, press } = withNpcs([AHEAD]);
        press({ interact: true });
        expect(gameState.discrete.activeSpeech).not.toBeNull();

        press({ back: true });

        expect(gameState.discrete.activeSpeech).toBeNull();
    });

    it('stops world time while talking, and starts it again after', () => {
        const { gameState, press, tick } = withNpcs([AHEAD]);
        press({ interact: true });
        const { timeOfDay } = gameState;
        const { simulationTime } = gameState.interpolated;

        tick(60);
        expect(gameState.timeOfDay).toBe(timeOfDay);
        expect(gameState.interpolated.simulationTime).toBe(simulationTime);

        // Closed, the clock moves again, so the check above isn't just a stuck clock
        press({ interact: true });
        tick(60);
        expect(gameState.timeOfDay).not.toBe(timeOfDay);
    });

    it('holds the player still while talking: no moving or looking', () => {
        const {
            gameState, input, press, tick,
        } = withNpcs([AHEAD]);
        press({ interact: true });
        const position = { ...gameState.interpolated.cameraPosition };
        const yaw = gameState.interpolated.cameraYaw;

        input.setIntent({ move: { x: 1, y: -1 }, lookRate: { yaw: 1, pitch: 1 } });
        tick(60);

        expect(gameState.interpolated.cameraPosition).toEqual(position);
        expect(gameState.interpolated.cameraYaw).toBe(yaw);
    });

    it('ignores the instance toggle while talking', () => {
        const { gameState, press } = withNpcs([AHEAD]);
        press({ interact: true });

        press({ pause: true });

        expect(gameState.discrete.gameMode).toBe('world_3d');
        expect(gameState.discrete.isTimeFrozen).toBe(false);
    });

    it('says nothing to an NPC behind you, or out of reach', () => {
        // far's edge is 2.5 away, past the reach of 2
        const { gameState, press } = withNpcs([npcAt('behind', 0, 1.5), npcAt('far', 0, -3)]);

        press({ interact: true });

        expect(gameState.discrete.activeSpeech).toBeNull();
    });

    it('reaches a big NPC by its edge, not its centre', () => {
        // Centre 3 away: size 3 puts the edge at 1.5, in reach. Size 1 puts it at 2.5, out of reach.
        const big = withNpcs([{ ...npcAt('big', 0, -3), size: 3 }]);
        const small = withNpcs([npcAt('small', 0, -3)]);

        big.press({ interact: true });
        small.press({ interact: true });

        expect(big.gameState.discrete.activeSpeech?.npcId).toBe('big');
        expect(small.gameState.discrete.activeSpeech).toBeNull();
    });

    it('picks the nearer edge, so a big NPC can win over a smaller, closer-centred one', () => {
        // Centres: big 2.5 away (edge 1.0), small 1.9 away (edge 1.4)
        const { gameState, press } = withNpcs([{ ...npcAt('big', 0.4, -2.5), size: 3 }, npcAt('small', -0.3, -1.9)]);

        press({ interact: true });

        expect(gameState.discrete.activeSpeech?.npcId).toBe('big');
    });

    it('talks to the nearer of two NPCs', () => {
        const { gameState, press } = withNpcs([npcAt('further', 0, -1.9), npcAt('nearer', 0.3, -1.2)]);

        press({ interact: true });

        expect(gameState.discrete.activeSpeech?.npcId).toBe('nearer');
    });

    it('hides over the pause menu, and is still open on resume', () => {
        const {
            gameState, speech, press, click, tick,
        } = withNpcs([AHEAD]);
        press({ interact: true });
        expect(speech.lastView).not.toBeNull();

        press({ menu: true });
        tick(30);
        expect(speech.lastView).toBeNull();

        click('Resume');
        expect(gameState.discrete.activeSpeech).not.toBeNull();
        expect(speech.lastView?.text).toBe(LINE);
    });

    it('leaves the 2D scene on interact without starting to talk', () => {
        const {
            gameState, press, enterScene,
        } = withNpcs([AHEAD]);
        enterScene();
        expect(gameState.discrete.gameMode).toBe('scene_2d');

        press({ interact: true });

        expect(gameState.discrete.gameMode).toBe('world_3d');
        expect(gameState.discrete.activeSpeech).toBeNull();
    });
});

describe('NPC speech in the instance - scenario (stub platform)', () => {
    // The instance opens with the circle 3 units ahead of the camera, at (0, -3), and the camera stays put
    const openInstance = (scenario: Scenario): void => {
        scenario.press({ pause: true });
        scenario.tick(120);
        expect(scenario.gameState.discrete.instanceIsActive).toBe(true);
    };

    it('lets the circle talk to an NPC beside it, whichever way it faces', () => {
        // Beside the circle, and out of the camera's reach, so only the circle can be talking
        const scenario = withNpcs([npcAt('beside', 1.5, -3)]);
        openInstance(scenario);

        scenario.press({ interact: true });

        expect(scenario.gameState.discrete.activeSpeech?.npcId).toBe('beside');
        expect(scenario.speech.lastView?.text).toBe(LINE);
    });

    it('does nothing while the instance is still opening', () => {
        const scenario = withNpcs([npcAt('beside', 1.5, -3)]);
        scenario.press({ pause: true });
        scenario.tick(5);
        expect(scenario.gameState.discrete.instanceIsTransitioning).toBe(true);

        scenario.press({ interact: true });

        expect(scenario.gameState.discrete.activeSpeech).toBeNull();
    });

    it('keeps talking but hides the bubble when the speaker is behind the camera', () => {
        const scenario = withNpcs([npcAt('behind', 0, 3)]);
        openInstance(scenario);
        // Walk the circle back past the camera, until the NPC stops it
        scenario.input.setIntent({ move: { x: 0, y: -1 } });
        scenario.tick(60);
        scenario.input.reset();
        expect(scenario.gameState.interpolated.instanceCharacterPosition.z).toBeGreaterThan(0);

        scenario.press({ interact: true });

        expect(scenario.gameState.discrete.activeSpeech?.npcId).toBe('behind');
        expect(scenario.speech.lastView).toBeNull();
    });
});

describe('interact prompt - scenario (stub platform)', () => {
    it('shows over the NPC Interact would reach', () => {
        const { gameState, prompt, tick } = withNpcs([AHEAD]);

        tick();

        expect(gameState.discrete.interactTarget).toBe('ahead');
        expect(prompt.lastView?.x).toBeCloseTo(0.5, 3);
    });

    it('shows nothing when nothing is in reach and in front', () => {
        // far's edge is 2.5 away, past the reach of 2
        const { gameState, prompt, tick } = withNpcs([npcAt('behind', 0, 1.5), npcAt('far', 0, -3)]);

        tick();

        expect(gameState.discrete.interactTarget).toBeNull();
        expect(prompt.lastView).toBeNull();
    });

    it('moves to the next NPC as you walk past the first', () => {
        const {
            gameState, input, tick,
        } = withNpcs([npcAt('first', -1.2, -1.5), npcAt('second', 0, -4)]);
        tick();
        expect(gameState.discrete.interactTarget).toBe('first');

        // 2.5 units on, the first is behind and the second is in reach
        input.setIntent({ move: { x: 0, y: 1 } });
        tick(15);
        input.reset();
        tick();

        expect(gameState.discrete.interactTarget).toBe('second');
    });

    it('hides while talking, and comes back once the conversation closes', () => {
        const {
            gameState, prompt, press, tick,
        } = withNpcs([AHEAD]);
        tick();
        expect(prompt.lastView).not.toBeNull();

        press({ interact: true });
        expect(gameState.discrete.activeSpeech).not.toBeNull();
        tick();
        expect(prompt.lastView).toBeNull();

        press({ interact: true });
        tick();
        expect(gameState.discrete.activeSpeech).toBeNull();
        expect(prompt.lastView).not.toBeNull();
    });

    it('is the same target Interact reaches, so the two never disagree', () => {
        const { gameState, press, tick } = withNpcs([npcAt('further', 0, -1.9), npcAt('nearer', 0.3, -1.2)]);
        tick();
        const shown = gameState.discrete.interactTarget;

        press({ interact: true });

        expect(shown).toBe('nearer');
        expect(gameState.discrete.activeSpeech?.npcId).toBe(shown);
    });

    it('shows over the circle\'s target in the instance', () => {
        const scenario = withNpcs([npcAt('beside', 1.5, -3)]);
        scenario.press({ pause: true });
        scenario.tick(120);
        expect(scenario.gameState.discrete.instanceIsActive).toBe(true);

        expect(scenario.gameState.discrete.interactTarget).toBe('beside');
        expect(scenario.prompt.lastView).not.toBeNull();
    });
});
