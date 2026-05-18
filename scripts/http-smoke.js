const assert = require('assert');
const http = require('http');

const { cors, body, json } = require('../server/lib/http');

// ---- cors ----
// GIVEN a request from the allowed localhost origin
const allowedReq = new http.IncomingMessage(new (require('net').Socket)());
allowedReq.headers = { origin: 'http://localhost:3847' };
const allowedRes = new http.ServerResponse(allowedReq);
allowedRes.setHeader = (name, value) => {
  allowedRes._headers = allowedRes._headers || {};
  allowedRes._headers[name] = value;
};
cors(allowedReq, allowedRes);
assert.strictEqual(
  allowedRes._headers['Access-Control-Allow-Origin'],
  'http://localhost:3847',
  'cors sets origin header for localhost',
);
assert.strictEqual(
  allowedRes._headers['Access-Control-Allow-Methods'],
  'GET,POST,OPTIONS',
  'cors sets methods header',
);
assert.strictEqual(
  allowedRes._headers['Access-Control-Allow-Headers'],
  'Content-Type',
  'cors sets allow-headers',
);

// GIVEN a request from 127.0.0.1 origin
const loopbackReq = new http.IncomingMessage(new (require('net').Socket)());
loopbackReq.headers = { origin: 'http://127.0.0.1:3847' };
const loopbackRes = new http.ServerResponse(loopbackReq);
loopbackRes.setHeader = (name, value) => {
  loopbackRes._headers = loopbackRes._headers || {};
  loopbackRes._headers[name] = value;
};
cors(loopbackReq, loopbackRes);
assert.strictEqual(
  loopbackRes._headers['Access-Control-Allow-Origin'],
  'http://127.0.0.1:3847',
  'cors sets origin for 127.0.0.1',
);

// GIVEN a request from a disallowed origin
const badReq = new http.IncomingMessage(new (require('net').Socket)());
badReq.headers = { origin: 'http://evil.example.com' };
const badRes = new http.ServerResponse(badReq);
badRes.setHeader = () => {};
cors(badReq, badRes);
assert.strictEqual(
  badRes._headers?.Access || badRes._headers?.['access-control-allow-origin'],
  undefined,
  'cors does NOT set origin for disallowed host',
);

// ---- json ----
// GIVEN a response object
const jsonReq = new http.IncomingMessage(new (require('net').Socket)());
const jsonRes = new http.ServerResponse(jsonReq);
let writtenHead = null;
let writtenBody = '';
jsonRes.writeHead = (status, headers) => {
  writtenHead = { status, headers };
};
jsonRes.end = (data) => {
  writtenBody = data;
};
json(jsonRes, { foo: 'bar' });
assert.strictEqual(writtenHead?.status, 200, 'json defaults to status 200');
assert.strictEqual(writtenHead?.headers['Content-Type'], 'application/json', 'json sets Content-Type');
assert.strictEqual(writtenBody, '{"foo":"bar"}', 'json stringifies body');

// GIVEN a custom status code
const statusRes = new http.ServerResponse(new http.IncomingMessage(new (require('net').Socket)()));
let statusHead = null;
statusRes.writeHead = (status, headers) => {
  statusHead = { status, headers };
};
statusRes.end = () => {};
json(statusRes, { err: 'nope' }, 404);
assert.strictEqual(statusHead?.status, 404, 'json uses custom status code');

void (async () => {
  // ---- body (JSON parse) ----
  // GIVEN a request with valid JSON body
  const bodyReq = new http.IncomingMessage(new (require('net').Socket)());
  bodyReq.headers = { 'content-type': 'application/json' };
  const bodyPromise = body(bodyReq);
  bodyReq.emit('data', '{"key":"value"}');
  bodyReq.emit('end');
  const bodyData = await bodyPromise;
  assert.strictEqual(bodyData.key, 'value', 'body parses valid JSON');

  // GIVEN empty body
  const emptyReq = new http.IncomingMessage(new (require('net').Socket)());
  emptyReq.headers = { 'content-type': 'application/json' };
  const emptyPromise = body(emptyReq);
  emptyReq.emit('end');
  const emptyData = await emptyPromise;
  assert.deepStrictEqual(emptyData, {}, 'body returns empty object for empty body');

  // GIVEN invalid JSON body
  const badBodyReq = new http.IncomingMessage(new (require('net').Socket)());
  badBodyReq.headers = { 'content-type': 'application/json' };
  const badBodyPromise = body(badBodyReq);
  badBodyReq.emit('data', 'NOT JSON {{{');
  badBodyReq.emit('end');
  const badBodyData = await badBodyPromise;
  assert.strictEqual(badBodyData._parseError, true, 'body sets _parseError for invalid JSON');

  // GIVEN non-JSON content type
  const nonJsonReq = new http.IncomingMessage(new (require('net').Socket)());
  nonJsonReq.headers = { 'content-type': 'text/plain' };
  nonJsonReq.resume = () => {};
  const nonJsonPromise = body(nonJsonReq);
  const nonJsonData = await nonJsonPromise;
  assert.strictEqual(nonJsonData._parseError, true, 'body sets _parseError for non-json content type');
  assert.strictEqual(nonJsonData._contentType, 'text/plain', 'body includes original content type');

  // GIVEN oversized body
  const bigReq = new http.IncomingMessage(new (require('net').Socket)());
  bigReq.headers = { 'content-type': 'application/json' };
  bigReq.destroy = () => {};
  const bigPromise = body(bigReq);
  bigReq.emit('data', 'x'.repeat(1024 * 1024 + 1));
  try {
    await bigPromise;
    assert.fail('expected oversized body to reject');
  } catch (e) {
    assert(e instanceof Error);
    assert.strictEqual(e.message, 'Payload too large', 'body rejects oversized payload');
  }

  console.log('http smoke ok');
})();
