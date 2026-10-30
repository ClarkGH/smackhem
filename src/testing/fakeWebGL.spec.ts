import { describe, it, expect } from 'vitest';
import { createFakeWebGL } from './fakeWebGL';

// Two programs that share a uniform name, as the lit and sky programs share u_sunDirection
const twoProgramsSharingSun = () => {
    const fake = createFakeWebGL();
    const { gl } = fake;
    const lit = gl.createProgram()!;
    const sky = gl.createProgram()!;
    const litSun = gl.getUniformLocation(lit, 'u_sunDirection');
    const skySun = gl.getUniformLocation(sky, 'u_sunDirection');
    gl.getUniformLocation(lit, 'u_isLightSource');
    return {
        fake, lit, sky, litSun, skySun,
    };
};

describe('createFakeWebGL', () => {
    it('tells a uniform apart by its program', () => {
        const {
            fake, lit, sky, litSun, skySun,
        } = twoProgramsSharingSun();

        fake.gl.uniform3f(litSun, 1, 0, 0);
        fake.gl.uniform3f(skySun, 0, 1, 0);
        fake.gl.uniform3f(litSun, 0, 0, 1);

        expect(fake.sentTo('u_sunDirection')).toHaveLength(3);
        expect(fake.sentTo('u_sunDirection', lit).map((call) => call.args.slice(1))).toEqual([[1, 0, 0], [0, 0, 1]]);
        expect(fake.sentTo('u_sunDirection', sky)).toHaveLength(1);
    });

    it('finds a program by a uniform only it has', () => {
        const { fake, lit } = twoProgramsSharingSun();

        expect(fake.programWith('u_isLightSource')).toBe(lit);
    });

    it('refuses to guess when several programs or none have the uniform', () => {
        const { fake } = twoProgramsSharingSun();

        expect(() => fake.programWith('u_sunDirection')).toThrow('2 programs');
        expect(() => fake.programWith('u_missing')).toThrow('0 programs');
    });
});
