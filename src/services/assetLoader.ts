export interface AssetLoader {
    loadMap(id: string): Promise<MapData>;
    // Add other asset loading methods
}
