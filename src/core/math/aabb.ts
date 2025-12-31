import { Vec3 } from 'src/types/common';

export default class AABB {
    min: Vec3;

    max: Vec3;

    constructor(
        min: Vec3 = { x: 0, y: 0, z: 0 },
        max: Vec3 = { x: 0, y: 0, z: 0 },
    ) {
        this.min = min;
        this.max = max;
    }

    contains(point: Vec3): boolean {
        return (
            point.x >= this.min.x && point.x <= this.max.x
            && point.y >= this.min.y && point.y <= this.max.y
            && point.z >= this.min.z && point.z <= this.max.z
        );
    }

    intersects(other: AABB): boolean {
        return (
            this.min.x <= other.max.x && this.max.x >= other.min.x
            && this.min.y <= other.max.y && this.max.y >= other.min.y
            && this.min.z <= other.max.z && this.max.z >= other.min.z
        );
    }

    getCenter(): Vec3 {
        return {
            x: (this.min.x + this.max.x) / 2,
            y: (this.min.y + this.max.y) / 2,
            z: (this.min.z + this.max.z) / 2,
        };
    }

    getSize(): Vec3 {
        return {
            x: this.max.x - this.min.x,
            y: this.max.y - this.min.y,
            z: this.max.z - this.min.z,
        };
    }
}
