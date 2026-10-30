import {
    describe, it, expect, vi,
} from 'vitest';
import WebChunkSource from './webChunkSource';

interface FakeFile {
    status: number;
    contentType: string;
    body: string;
}

// A server holding these files. Anything else is a 404, like a static host's.
// Restored after each test by the vitest config (unstubGlobals).
const serve = (files: Record<string, FakeFile>): string[] => {
    const requested: string[] = [];
    vi.stubGlobal('fetch', async (url: string, init?: { method?: string }) => {
        requested.push(`${init?.method ?? 'GET'} ${url}`);
        const file = files[url] ?? { status: 404, contentType: 'text/plain', body: '' };
        return {
            ok: file.status >= 200 && file.status < 300,
            headers: { get: (name: string) => (name === 'content-type' ? file.contentType : null) },
            text: async () => file.body,
        };
    });
    return requested;
};

const CHUNK_TEXT = '{"schemaVersion":2}';

describe('WebChunkSource.fetchChunkJSON', () => {
    it('reads the chunk\'s file, offset so negative coordinates make positive names', async () => {
        const requested = serve({
            '/chunks/9999_10002.json': { status: 200, contentType: 'application/json', body: CHUNK_TEXT },
        });

        const text = await new WebChunkSource('/chunks/').fetchChunkJSON(-1, 2);

        expect(text).toBe(CHUNK_TEXT);
        expect(requested).toEqual(['HEAD /chunks/9999_10002.json', 'GET /chunks/9999_10002.json']);
    });

    it('is null when there\'s no file', async () => {
        const requested = serve({});

        expect(await new WebChunkSource('/chunks/').fetchChunkJSON(0, 0)).toBeNull();
        expect(requested).toEqual(['HEAD /chunks/10000_10000.json']);
    });

    it('is null when the dev server answers a missing file with its HTML page', async () => {
        serve({
            '/chunks/10000_10000.json': { status: 200, contentType: 'text/html', body: '<!doctype html>' },
        });

        expect(await new WebChunkSource('/chunks/').fetchChunkJSON(0, 0)).toBeNull();
    });

    it('is null when the server can\'t be reached', async () => {
        vi.stubGlobal('fetch', async () => { throw new TypeError('Failed to fetch'); });

        expect(await new WebChunkSource('/chunks/').fetchChunkJSON(0, 0)).toBeNull();
    });
});
