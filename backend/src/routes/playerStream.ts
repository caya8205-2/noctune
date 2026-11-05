const CHUNK_SIZE = 1024 * 1024;

type ByteRange = { start: number; end?: number } | { suffix: number };

function parseRange(value?: string): ByteRange | undefined {
  const match = value?.match(/^bytes=(\d*)-(\d*)$/i);
  if (!match || (!match[1] && !match[2])) return undefined;
  const numbers = match.slice(1).filter(Boolean).map(Number);
  if (!numbers.every(Number.isSafeInteger)) return undefined;
  if (!match[1]) return { suffix: Number(match[2]) };
  return { start: Number(match[1]), end: match[2] ? Number(match[2]) : undefined };
}

function validateChunk(res: Response, start: number, end: number, total?: number): number {
  const match = res.headers.get('content-range')?.match(/^bytes (\d+)-(\d+)\/(\d+)$/i);
  const values = match?.slice(1).map(Number);
  const size = values?.[2];
  const encoding = res.headers.get('content-encoding');
  if (res.status !== 206 || !res.body || !values || !values.every(Number.isSafeInteger)
    || !size || values[0] !== start || values[1] !== Math.min(end, size - 1)
    || values[1] < start || (total !== undefined && size !== total)
    || (encoding && encoding.toLowerCase() !== 'identity')) {
    throw new Error('Mismatched upstream audio chunk');
  }
  const length = res.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) !== values[1] - start + 1)) {
    throw new Error('Mismatched upstream audio chunk length');
  }
  return size;
}

/** Stitch bounded CDN requests without reading ahead of downstream demand. */
export async function fetchPlayerStream(url: string, range?: string, signal?: AbortSignal): Promise<Response> {
  const requested = parseRange(range);
  const abort = new AbortController();
  let response: Response | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let downstream: ReadableStreamDefaultController<Uint8Array> | undefined;
  const detach = () => signal?.removeEventListener('abort', onAbort);
  const stop = (reason?: unknown) => {
    abort.abort(reason);
    if (reader) void reader.cancel(reason).catch(() => {});
    else if (response?.body && !response.body.locked) void response.body.cancel(reason).catch(() => {});
    detach();
  };
  const onAbort = () => {
    stop(signal?.reason);
    downstream?.error(signal?.reason);
  };
  signal?.throwIfAborted();
  signal?.addEventListener('abort', onAbort, { once: true });
  const fetchChunk = async (start: number, end: number) => {
    abort.signal.throwIfAborted();
    response = await fetch(url, {
      // Fresh socket per chunk: a keep-alive socket left half-closed by an
      // aborted client (native handback stopping mid-chunk) poisons the pool
      // and stalls the next chunk fetch for seconds, surfacing as a
      // "Resolving audio..." underrun right after handback.
      headers: { Range: `bytes=${start}-${end}`, 'Accept-Encoding': 'identity', Connection: 'close' },
      signal: abort.signal,
    });
    abort.signal.throwIfAborted();
    return response;
  };

  try {
    const needsProbe = requested && ('suffix' in requested
      || (requested.end !== undefined && requested.end < requested.start));
    let start = requested && 'start' in requested ? requested.start : 0;
    let end = requested && 'end' in requested ? requested.end ?? Infinity : Infinity;
    let chunkEnd = Math.min(end, start + CHUNK_SIZE - 1, Number.MAX_SAFE_INTEGER);
    let res = await fetchChunk(needsProbe ? 0 : start, needsProbe ? 0 : chunkEnd);
    if (!res.ok) { detach(); return res; }
    const total = validateChunk(res, needsProbe ? 0 : start, needsProbe ? 0 : chunkEnd);
    const validatorName = res.headers.has('etag') ? 'etag' : 'last-modified';
    const validator = res.headers.get(validatorName);
    const checkChunk = (chunk: Response, from: number, to: number) => {
      validateChunk(chunk, from, to, total);
      if (validator && chunk.headers.get(validatorName) !== validator) {
        throw new Error('Upstream audio changed during streaming');
      }
    };

    if (needsProbe) {
      await res.body!.cancel();
      if ('suffix' in requested) start = Math.max(0, total - requested.suffix);
      if (start >= total || end < start) {
        detach();
        return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${total}`, 'Content-Length': '0' } });
      }
      end = Math.min(end, total - 1);
      chunkEnd = Math.min(end, start + CHUNK_SIZE - 1);
      res = await fetchChunk(start, chunkEnd);
      if (!res.ok) { detach(); return res; }
      checkChunk(res, start, chunkEnd);
    }
    end = Math.min(end, total - 1);
    chunkEnd = Math.min(chunkEnd, end);
    let received = 0;
    let chunkStart = start;
    reader = res.body!.getReader();
    const headers = new Headers(res.headers);
    headers.set('Content-Length', String(end - start + 1));
    headers.set('Accept-Ranges', 'bytes');
    if (requested) headers.set('Content-Range', `bytes ${start}-${end}/${total}`);
    else headers.delete('Content-Range');

    const body = new ReadableStream<Uint8Array>({
      start(controller) { downstream = controller; },
      async pull(controller) {
        try {
          while (true) {
            abort.signal.throwIfAborted();
            const { value, done } = await reader!.read();
            abort.signal.throwIfAborted();
            if (!done) {
              received += value.byteLength;
              if (received > chunkEnd - chunkStart + 1) throw new Error('Oversized upstream audio chunk');
              controller.enqueue(value);
              return;
            }
            if (received !== chunkEnd - chunkStart + 1) throw new Error('Truncated upstream audio chunk');
            reader!.releaseLock();
            reader = undefined;
            if (chunkEnd === end) {
              detach();
              controller.close();
              return;
            }
            chunkStart = chunkEnd + 1;
            chunkEnd = Math.min(end, chunkStart + CHUNK_SIZE - 1);
            const next = await fetchChunk(chunkStart, chunkEnd);
            checkChunk(next, chunkStart, chunkEnd);
            reader = next.body!.getReader();
            received = 0;
          }
        } catch (err) {
          stop(err);
          controller.error(err);
        }
      },
      cancel(reason) { stop(reason); },
    }, { highWaterMark: 0 });
    return new Response(body, { status: requested ? 206 : 200, headers });
  } catch (err) {
    stop(err);
    throw err;
  }
}
