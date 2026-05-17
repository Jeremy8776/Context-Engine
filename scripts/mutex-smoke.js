// @ts-check

// mutex-smoke.js — Smoke test for per-key mutex concurrency

const assert = require('assert');
const { createKeyMutex } = require('../server/lib/per-key-mutex');

void (async () => {
  // ---- serial execution per key ----

  // GIVEN a mutex
  const mutex = createKeyMutex();

  // WHEN two operations run on the same key
  const order = /** @type {string[]} */ ([]);
  let p1Done = false;
  const p1 = mutex('key-a', () => {
    /** @type {Promise<void>} */
    const promise = new Promise((resolve) =>
      setTimeout(() => {
        order.push('p1');
        p1Done = true;
        resolve();
      }, 50),
    );
    return promise;
  });
  // eslint-disable-next-line @typescript-eslint/require-await
  const p2 = mutex('key-a', async () => {
    assert.ok(p1Done, 'p2 must wait for p1');
    order.push('p2');
  });
  await p1;
  await p2;
  assert.deepStrictEqual(order, ['p1', 'p2'], 'same-key operations are serialized');

  // ---- parallel execution across keys ----

  // WHEN two operations run on different keys
  const parallelOrder = /** @type {string[]} */ ([]);
  let aStarted = false;
  let bStarted = false;
  const pa = mutex('key-x', () => {
    /** @type {Promise<void>} */
    const promise = new Promise((resolve) =>
      setTimeout(() => {
        aStarted = true;
        parallelOrder.push('a');
        resolve();
      }, 30),
    );
    return promise;
  });
  const pb = mutex('key-y', () => {
    /** @type {Promise<void>} */
    const promise = new Promise((resolve) =>
      setTimeout(() => {
        bStarted = true;
        parallelOrder.push('b');
        resolve();
      }, 10),
    );
    return promise;
  });
  await Promise.all([pa, pb]);
  assert.ok(aStarted && bStarted, 'different keys run in parallel');
  assert.strictEqual(parallelOrder[0], 'b', 'shorter task on different key finishes first');

  // ---- predecessor error doesn't block successor ----

  // GIVEN a mutex
  const errMutex = createKeyMutex();

  // WHEN the first operation on a key throws
  let successorRan = false;
  const failing = errMutex('err-key', () => Promise.reject(new Error('intentional')));
  try {
    await failing;
  } catch {
    // expected
  }
  // eslint-disable-next-line @typescript-eslint/require-await
  const succeeding = errMutex('err-key', async () => {
    successorRan = true;
  });
  await succeeding;
  assert.ok(successorRan, 'successor runs even after predecessor error');

  // ---- return value preserved ----

  const returnMutex = createKeyMutex();
  const result = await returnMutex('ret-key', () => Promise.resolve(42));
  assert.strictEqual(result, 42, 'return value is preserved');

  // ---- cleanup after completion ----

  // WHEN an operation completes
  const cleanMutex = createKeyMutex();
  await cleanMutex('clean-key', () => Promise.resolve());
  // AND we start a new operation on the same key
  let secondRan = false;
  // eslint-disable-next-line @typescript-eslint/require-await
  await cleanMutex('clean-key', async () => {
    secondRan = true;
  });
  assert.ok(secondRan, 'key is reusable after completion');

  console.log('mutex smoke ok');
})();
