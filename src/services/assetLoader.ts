/* eslint-disable no-unused-vars */
import { MapData } from '../types/common';

export interface AssetLoader {
    loadMap(_id: string): Promise<MapData>;
    loadTexture(_assetId: string): Promise<ImageBitmap>;
}
