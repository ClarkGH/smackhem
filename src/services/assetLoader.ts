/* eslint-disable no-unused-vars */
import { MapData } from '../types/common';

export interface AssetLoader {
    loadMap(_id: string): Promise<MapData>;
    // Add other asset loading methods
}
