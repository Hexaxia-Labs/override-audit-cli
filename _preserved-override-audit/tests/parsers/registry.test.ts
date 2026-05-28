import { fetchDistTags, fetchDistTagsBatch } from '../../src/parsers/registry.js';

function mockFetch(map: Record<string, { status?: number; body?: unknown }>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    const key = Object.keys(map).find(k => url.includes(k));
    if (!key) return new Response('not found', { status: 404 });
    const { status = 200, body = {} } = map[key]!;
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
}

describe('fetchDistTags', () => {
  it('returns dist-tags from a 200 response', async () => {
    const fetchImpl = mockFetch({
      esbuild: { body: { 'dist-tags': { latest: '0.28.0', next: '0.29.0-rc.1' } } },
    });
    const tags = await fetchDistTags('esbuild', { fetchImpl });
    expect(tags).toEqual({ latest: '0.28.0', next: '0.29.0-rc.1' });
  });

  it('returns null on non-200', async () => {
    const fetchImpl = mockFetch({ gone: { status: 404 } });
    expect(await fetchDistTags('gone', { fetchImpl })).toBeNull();
  });

  it('returns null on malformed JSON', async () => {
    const fetchImpl = (async () => new Response('not json', { status: 200 })) as unknown as typeof fetch;
    expect(await fetchDistTags('any', { fetchImpl })).toBeNull();
  });

  it('returns null when fetch throws (timeout, network error)', async () => {
    const fetchImpl = (async () => { throw new Error('econnrefused'); }) as unknown as typeof fetch;
    expect(await fetchDistTags('any', { fetchImpl })).toBeNull();
  });

  it('encodes scoped names without URL-encoding the scope slash', async () => {
    let capturedUrl = '';
    const fetchImpl = (async (input: RequestInfo | URL) => {
      capturedUrl = typeof input === 'string' ? input : input.toString();
      return new Response(JSON.stringify({ 'dist-tags': { latest: '1.0.0' } }), { status: 200 });
    }) as unknown as typeof fetch;
    await fetchDistTags('@esbuild/linux-x64', { fetchImpl });
    expect(capturedUrl).toContain('/%40esbuild/linux-x64');   // scope %40, slash literal
  });
});

describe('fetchDistTagsBatch', () => {
  it('fetches multiple packages in parallel; per-package failures do not affect others', async () => {
    const fetchImpl = mockFetch({
      esbuild: { body: { 'dist-tags': { latest: '0.28.0' } } },
      postcss: { body: { 'dist-tags': { latest: '8.5.15' } } },
      'broken-pkg': { status: 500 },
    });
    const result = await fetchDistTagsBatch(['esbuild', 'postcss', 'broken-pkg'], { fetchImpl });
    expect(result.get('esbuild')).toEqual({ latest: '0.28.0' });
    expect(result.get('postcss')).toEqual({ latest: '8.5.15' });
    expect(result.has('broken-pkg')).toBe(false);
  });

  it('dedupes the input set', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return new Response(JSON.stringify({ 'dist-tags': { latest: '1' } }), { status: 200 });
    }) as unknown as typeof fetch;
    await fetchDistTagsBatch(['a', 'a', 'a'], { fetchImpl });
    expect(calls).toBe(1);
  });
});
