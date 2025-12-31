import { MapData } from '../types/common';

export interface AssetLoader {
    // eslint-disable-next-line no-unused-vars
    loadMap(_id: string): Promise<MapData>;
    // Add other asset loading methods
}
