export type GameEvent =
    | {
        type: 'game_mode_changed';
        previousMode: 'world_3d' | 'scene_2d';
        currentMode: 'world_3d' | 'scene_2d';
    };

type ExtractEvent<K extends GameEvent['type']> = Extract<GameEvent, { type: K }>;

export interface EventBus {
    publish(event: GameEvent): void;

    subscribe<K extends GameEvent['type']>(
        type: K,
        handler: (event: ExtractEvent<K>) => void,
    ): () => void;
}
