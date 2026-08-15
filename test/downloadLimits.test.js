import test from "node:test";
import assert from "node:assert/strict";
import { readResponseBufferWithLimit } from "../src/downloadLimits.js";

test("a Telegram file within the configured limit is read", async () => {
  const response = new Response(new Uint8Array([1, 2, 3]), {
    headers: { "content-length": "3" }
  });

  assert.deepEqual([...await readResponseBufferWithLimit(response, 4)], [1, 2, 3]);
});

test("an oversized Telegram file is rejected before reading its body", async () => {
  const response = new Response(new Uint8Array([1, 2, 3, 4]), {
    headers: { "content-length": "4" }
  });

  await assert.rejects(readResponseBufferWithLimit(response, 3), /boyut sinirini asiyor/i);
});

test("streamed bytes are limited even without a content-length header", async () => {
  const response = new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2]));
      controller.enqueue(new Uint8Array([3, 4]));
      controller.close();
    }
  }));

  await assert.rejects(readResponseBufferWithLimit(response, 3), /boyut sinirini asiyor/i);
});
