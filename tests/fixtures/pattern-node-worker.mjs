import { parentPort } from 'node:worker_threads';
globalThis.self = {
    addEventListener(type, listener) { if (type === 'message') parentPort.on('message', data => listener({ data })); },
    postMessage(data) { parentPort.postMessage(data); },
};
await import('../../src/workflow/operations/pattern-worker.js');
