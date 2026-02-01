import '@testing-library/jest-dom';

// Firebase Auth SDK requires global fetch at import time in Node/jsdom environments
if (typeof globalThis.fetch === 'undefined') {
  globalThis.fetch = jest.fn() as unknown as typeof fetch;
  globalThis.Headers = jest.fn() as unknown as typeof Headers;
  globalThis.Request = jest.fn() as unknown as typeof Request;
  globalThis.Response = jest.fn() as unknown as typeof Response;
}
