export function assertByteLengthWithinLimit(byteLength, maxBytes) {
  const size = Number(byteLength);
  const limit = Math.max(1, Number(maxBytes) || 1);
  if (Number.isFinite(size) && size > limit) {
    throw new Error(`Telegram gorseli ${limit} baytlik boyut sinirini asiyor.`);
  }
}

export async function readResponseBufferWithLimit(response, maxBytes) {
  assertByteLengthWithinLimit(response.headers.get("content-length"), maxBytes);

  const reader = response.body?.getReader();
  if (!reader) {
    const buffer = Buffer.from(await response.arrayBuffer());
    assertByteLengthWithinLimit(buffer.length, maxBytes);
    return buffer;
  }

  const chunks = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      assertByteLengthWithinLimit(totalBytes, maxBytes);
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, totalBytes);
}
