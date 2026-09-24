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

export class TypeSafeEventBus implements EventBus {
    private listeners = new Map<string, Array<(event: any) => void>>();

    publish(event: GameEvent): void {
        const handlers = this.listeners.get(event.type);
        if (!handlers) return;

        for (let i = 0; i < handlers.length; i += 1) {
            handlers[i](event);
        }
    }

    subscribe<K extends GameEvent['type']>(
        type: K,
        handler: (event: ExtractEvent<K>) => void,
    ): () => void {
        if (!this.listeners.has(type)) {
            this.listeners.set(type, []);
        }

        const handlers = this.listeners.get(type)!;
        handlers.push(handler);

        return () => {
            const currentHandlers = this.listeners.get(type);
            if (!currentHandlers) return;

            this.listeners.set(
                type,
                currentHandlers.filter((h) => h !== handler),
            );
        };
    }
}
