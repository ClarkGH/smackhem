import { describe, it, expect } from 'vitest';
import type { NpcJSON } from '../chunkLoader';
import type { GameEvent } from '../events';
import { createScenario, type Scenario } from '../../testing/scenario';

// The player starts at the origin looking down -z, so both stand in reach, dead ahead
const PLAIN: NpcJSON = {
    id: 'plain', sprite: 'lmao_idle_1', pos: [0, 0, -1.5], size: 1, line: 'Hello',
};
const HOSTILE: NpcJSON = {
    ...PLAIN, id: 'hostile', sprite: 'evil_circle_idle_1', line: 'Begin combat', encounterId: 'npc_evil_circle_1',
};

// +1 is up, towards the start of the list, as in the menus
const UP = { navigate: { x: 0, y: 1 } } as const;
const DOWN = { navigate: { x: 0, y: -1 } } as const;

type ChoiceMade = Extract<GameEvent, { type: 'choice_made' }>;

const talkingTo = (npc: NpcJSON): Scenario & { choices: ChoiceMade[] } => {
    const scenario = createScenario();
    scenario.addChunk({ npcs: [npc] });
    const choices: ChoiceMade[] = [];
    scenario.eventBus.subscribe('choice_made', (e) => { choices.push(e); });
    scenario.press({ interact: true });
    return { ...scenario, choices };
};

describe('NPC choice - scenario (stub platform)', () => {
    it('gives a plain NPC no choice, and closing it chooses nothing', () => {
        const {
            gameState, speech, press, choices,
        } = talkingTo(PLAIN);

        expect(gameState.discrete.activeSpeech?.choice).toBeNull();
        expect(speech.lastView?.choice).toBeNull();

        press({ interact: true });
        expect(gameState.discrete.activeSpeech).toBeNull();
        expect(choices).toEqual([]);
    });

    it('asks a hostile NPC\'s question with Yes and No, Yes selected', () => {
        const { gameState, speech } = talkingTo(HOSTILE);

        expect(gameState.discrete.activeSpeech?.choice).toEqual({ options: ['Yes', 'No'], selected: 0 });
        expect(speech.lastView?.text).toBe('Begin combat');
        expect(speech.lastView?.choice).toEqual({ options: ['Yes', 'No'], selected: 0 });
    });

    it('moves the selection up and down, wrapping like the menus, and the bubble follows', () => {
        const { gameState, speech, press } = talkingTo(HOSTILE);

        press(DOWN);
        expect(gameState.discrete.activeSpeech?.choice?.selected).toBe(1);
        expect(speech.lastView?.choice?.selected).toBe(1);

        press(DOWN);
        expect(gameState.discrete.activeSpeech?.choice?.selected).toBe(0);

        press(UP);
        expect(gameState.discrete.activeSpeech?.choice?.selected).toBe(1);
        expect(speech.lastView?.choice?.selected).toBe(1);
    });

    it('confirms Yes with Interact: closes, and reports it once', () => {
        const {
            gameState, speech, press, tick, choices,
        } = talkingTo(HOSTILE);

        press({ interact: true });
        tick(5);

        expect(gameState.discrete.activeSpeech).toBeNull();
        expect(speech.lastView).toBeNull();
        expect(choices).toEqual([{ type: 'choice_made', npcId: 'hostile', optionIndex: 0 }]);
    });

    it('confirms No after moving to it, so Yes and No can be told apart', () => {
        const { press, choices } = talkingTo(HOSTILE);

        press(DOWN);
        press({ interact: true });

        expect(choices).toEqual([{ type: 'choice_made', npcId: 'hostile', optionIndex: 1 }]);
    });

    it('treats Back as No, whatever is selected, and that press does nothing else', () => {
        const {
            gameState, press, tick, choices,
        } = talkingTo(HOSTILE);

        // Yes is selected, Back still answers No
        press({ back: true });
        tick(5);

        expect(gameState.discrete.activeSpeech).toBeNull();
        expect(choices).toEqual([{ type: 'choice_made', npcId: 'hostile', optionIndex: 1 }]);
    });

    it('can be asked again after saying No', () => {
        const { gameState, press, choices } = talkingTo(HOSTILE);
        press({ back: true });

        press({ interact: true });

        expect(gameState.discrete.activeSpeech?.choice).toEqual({ options: ['Yes', 'No'], selected: 0 });
        expect(choices).toHaveLength(1);
    });

    it('keeps the selection through the pause menu, and menu presses never reach it', () => {
        const {
            gameState, speech, press, click, choices,
        } = talkingTo(HOSTILE);
        press(DOWN);

        press({ menu: true });
        press(DOWN);
        press(DOWN);
        click('Resume');

        expect(gameState.discrete.activeSpeech?.choice?.selected).toBe(1);
        expect(speech.lastView?.choice?.selected).toBe(1);
        expect(choices).toEqual([]);
    });
});
