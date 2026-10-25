import type { GameState } from './gameState';
import type { World } from './world';
import type RenderSystem from './lighting/renderSystem';
import type { Vec3 } from '../types/common';
import type { SpeechOverlay, SpeechView } from '../services/speechOverlay';
import type { PromptOverlay, PromptView } from '../services/promptOverlay';

// How far above an NPC's head the bubble and prompt are anchored
export const OVERHEAD_OFFSET = 0.2;

// Any overlay that draws a view, and hides on null
interface ViewOverlay<V> {
    render(view: V | null): void;
}

// Sends the view every frame it's visible, and null only once when it stops being visible
class ShownOverlay<V> {
    private shown = false;

    constructor(private readonly overlay: ViewOverlay<V> | undefined) {}

    public update(view: V | null): void {
        if (!this.overlay) return;
        if (view) {
            this.overlay.render(view);
            this.shown = true;
        } else if (this.shown) {
            this.overlay.render(null);
            this.shown = false;
        }
    }
}

/**
 * The speech bubble and the interact prompt, placed over NPCs' heads each frame.
 * Runs after the 3D frame is drawn, so they're placed with this frame's camera.
 */
export default class OverheadOverlays {
    // Filled in place every frame they show (M-1)
    private readonly speechView: SpeechView = { text: '', x: 0, y: 0 };

    private readonly promptView: PromptView = { x: 0, y: 0 };

    private readonly head: Vec3 = { x: 0, y: 0, z: 0 };

    private readonly speech: ShownOverlay<SpeechView>;

    private readonly prompt: ShownOverlay<PromptView>;

    constructor(
        private readonly world: World,
        private readonly renderSystem: RenderSystem,
        speech?: SpeechOverlay,
        prompt?: PromptOverlay,
    ) {
        this.speech = new ShownOverlay(speech);
        this.prompt = new ShownOverlay(prompt);
    }

    public render(gameState: GameState): void {
        const { activeSpeech, interactTarget } = gameState.discrete;

        // The bubble over the speaker, the prompt over whatever Interact would reach right now
        let speechVisible = false;
        if (activeSpeech) {
            this.speechView.text = activeSpeech.line;
            speechVisible = this.projectOverHead(gameState, activeSpeech.npcId, this.speechView);
        }
        this.speech.update(speechVisible ? this.speechView : null);

        const promptVisible = interactTarget !== null && this.projectOverHead(gameState, interactTarget, this.promptView);
        this.prompt.update(promptVisible ? this.promptView : null);
    }

    // Where over an NPC's head lands on screen, false when it can't be shown: menus, other modes, behind the camera
    private projectOverHead(gameState: GameState, npcId: string, out: { x: number; y: number }): boolean {
        const { gameMode, isPaused } = gameState.discrete;
        if (isPaused || (gameMode !== 'world_3d' && gameMode !== 'instance_3d')) return false;
        const npc = this.world.findNpc(npcId);
        if (!npc) return false;
        const { head } = this;
        head.x = npc.position.x;
        head.y = npc.position.y + npc.size + OVERHEAD_OFFSET;
        head.z = npc.position.z;
        return this.renderSystem.projectToViewport(head, out);
    }
}
