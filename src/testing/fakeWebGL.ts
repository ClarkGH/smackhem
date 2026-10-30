/**
 * A WebGL2 context that draws nothing and records every call, for renderer tests.
 * A Proxy answers any method name, so this doesn't list WebGL's ~70 calls by hand and
 * new renderer code runs against it unchanged. Constants (gl.TEXTURE_2D) are numbers, one per name.
 */

export interface GLCall {
    name: string;
    args: unknown[];
}

export interface FakeWebGL {
    gl: WebGL2RenderingContext;
    canvas: HTMLCanvasElement;
    calls: GLCall[];
    // How many times the renderer called a GL method, e.g. count('drawArrays')
    count: (name: string) => number;
    // Every call that set one uniform, in call order, e.g. sentTo('u_color').
    // Programs can share a uniform name (the sky has its own u_sunDirection), so pass a program to pick one
    sentTo: (uniform: string, program?: WebGLProgram) => GLCall[];
    // The one program that looked this uniform up; throws if none or several did
    programWith: (uniform: string) => WebGLProgram;
}

// A uniform location remembers its program and name, so tests can say which uniform a call set
interface FakeUniformLocation {
    program: WebGLProgram;
    uniform: string;
}

export const createFakeWebGL = (width = 800, height = 600): FakeWebGL => {
    const calls: GLCall[] = [];
    const constants = new Map<string, number>();
    // Kept apart from calls, so a test can clear calls after setup and still find programs
    const programsByUniform = new Map<string, WebGLProgram[]>();

    const constant = (name: string): number => {
        if (!constants.has(name)) constants.set(name, constants.size + 1);
        return constants.get(name)!;
    };

    // What a call returns when the renderer needs more than undefined to carry on
    const answer = (name: string, args: unknown[]): unknown => {
        if (name.startsWith('create')) return { created: name };
        if (name === 'getUniformLocation') {
            const [program, uniform] = args as [WebGLProgram, string];
            const programs = programsByUniform.get(uniform) ?? [];
            if (!programs.includes(program)) programs.push(program);
            programsByUniform.set(uniform, programs);
            return { program, uniform } as FakeUniformLocation;
        }
        if (name === 'getAttribLocation') return 0;
        if (name === 'getShaderParameter' || name === 'getProgramParameter') return true;
        if (name === 'checkFramebufferStatus') return constant('FRAMEBUFFER_COMPLETE');
        if (name.endsWith('InfoLog')) return '';
        return undefined;
    };

    const gl = new Proxy({}, {
        get: (_target, property) => {
            const name = String(property);
            if (/^[A-Z0-9_]+$/.test(name)) return constant(name);
            return (...args: unknown[]) => {
                // Copy arrays as they were at the call: the renderer reuses its matrices, so a kept
                // reference would show a later frame's values
                calls.push({ name, args: args.map((arg) => (arg instanceof Float32Array ? arg.slice() : arg)) });
                return answer(name, args);
            };
        },
    }) as WebGL2RenderingContext;

    const canvas = {
        width,
        height,
        getContext: (type: string) => (type === 'webgl2' ? gl : null),
    } as unknown as HTMLCanvasElement;

    const programWith = (uniform: string): WebGLProgram => {
        const programs = programsByUniform.get(uniform) ?? [];
        if (programs.length !== 1) {
            throw new Error(`${programs.length} programs look up ${uniform}, expected exactly 1`);
        }
        return programs[0];
    };

    return {
        gl,
        canvas,
        calls,
        count: (name) => calls.filter((call) => call.name === name).length,
        sentTo: (uniform, program) => calls.filter((call) => {
            const location = call.args[0] as FakeUniformLocation | null;
            return call.name.startsWith('uniform') && location?.uniform === uniform
                && (program === undefined || location.program === program);
        }),
        programWith,
    };
};
