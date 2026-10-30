import type { PlatformServices } from '../../services/platform';
import { WebInputService } from './input/webInputService';
import type { ChunkSource } from '../../services/chunkSource';
import { ChunkLoader } from '../../core/chunkLoader';
import { createChunkStreamer, type ChunkUpdater } from '../../core/chunkStreamer';
import WebChunkSource from './webChunkSource';
import WebGLRenderer from './rendering/webGLRenderer';
import WebClock from './webClock';
import WebAudioService from './audio/webAudioService';
import WebMenuOverlay from './menu/webMenuOverlay';
import WebSpeechOverlay from './overlays/webSpeechOverlay';
import WebPromptOverlay from './overlays/webPromptOverlay';
import WebBattleOverlay from './overlays/webBattleOverlay';
import LocalStorageStore from './localStorageStore';
import WebDisplay from './webDisplay';

// PlatformServices interface moved to src/services/platform.ts
// This export is kept for backward compatibility but should use the shared type

// Chunks from JSON files, through core's ChunkLoader and streamer.
// A factory, so each game keeps its own loaded chunks.
export const createChunkUpdater = (source: ChunkSource): ChunkUpdater => {
    const chunkLoader = new ChunkLoader();
    return createChunkStreamer((chunkX, chunkZ, renderer) => chunkLoader.loadChunk(source, chunkX, chunkZ, renderer));
};

export const createWebPlatform = async (): Promise<PlatformServices & { canvas: HTMLCanvasElement; chunkSource: ChunkSource }> => {
    // DOM setup: the canvas fills #app, which fills the page (or an itch.io iframe).
    // The menu and debug overlays sit on top of it inside the same container.
    let container = document.getElementById('app');
    if (!container) {
        container = document.createElement('div');
        container.id = 'app';
        document.body.appendChild(container);
    }
    const canvas = document.createElement('canvas');
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);

    // Before the renderer and overlays, so the canvas already has its real size
    const display = new WebDisplay(container, canvas);

    const renderer = new WebGLRenderer(canvas);
    const input = new WebInputService(canvas);
    const clock = new WebClock();
    const chunkSource = new WebChunkSource('/chunks/');
    const audio = new WebAudioService('/assets/audio/');
    const menu = new WebMenuOverlay(canvas, {
        pointer: (pointer) => input.pointMenu(pointer),
        back: () => input.pressBack(),
        opened: (open) => input.setMenuOpen(open),
    });
    const speech = new WebSpeechOverlay(container);
    const prompt = new WebPromptOverlay(container, () => input.getLastDevice());
    const battle = new WebBattleOverlay(container);

    // Browsers block audio until a user gesture, unlock on the first one
    const unlockAudio = () => {
        audio.resumeContext();
        document.removeEventListener('pointerdown', unlockAudio);
        document.removeEventListener('keydown', unlockAudio);
    };
    document.addEventListener('pointerdown', unlockAudio);
    document.addEventListener('keydown', unlockAudio);

    return {
        renderer,
        clock,
        input,
        audio,
        menu,
        speech,
        prompt,
        battle,
        storage: new LocalStorageStore(),
        display,
        canvas,
        chunkSource,
        getAspectRatio: () => canvas.width / canvas.height,
    };
};
