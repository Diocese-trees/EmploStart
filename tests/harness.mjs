/*
 * Shared test harness for the EmploStart browser modules.
 *
 * The scripts are plain browser IIFEs that attach to `window`, so we run them
 * in a vm context with a tiny DOM/storage shim and the host's real
 * TextEncoder/Blob/Response/DecompressionStream implementations.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { deflateRawSync } from 'node:zlib';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function makeStorage() {
  const map = new Map();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    clear: () => { map.clear(); }
  };
}

export function makeWindow() {
  const localStorage = makeStorage();
  const sessionStorage = makeStorage();
  const win = {};
  const sandbox = {
    window: win,
    document: {
      querySelector: () => null,
      getElementById: () => null,
      addEventListener: () => {},
      createElement: () => ({ style: {}, appendChild() {}, addEventListener: () => {} })
    },
    localStorage,
    sessionStorage,
    TextEncoder,
    TextDecoder,
    Blob,
    Response,
    DecompressionStream,
    URL,
    console
  };
  vm.createContext(sandbox);
  win.localStorage = localStorage;
  win.sessionStorage = sessionStorage;
  return { win, sandbox, localStorage, sessionStorage };
}

export function loadInto(win, rel) {
  const sandbox = vm.createContext({
    window: win,
    document: {
      querySelector: () => null,
      getElementById: () => null,
      addEventListener: () => {},
      createElement: () => ({ style: {}, appendChild() {}, addEventListener: () => {} })
    },
    localStorage: win.localStorage,
    sessionStorage: win.sessionStorage,
    fetch: () => Promise.reject(new Error('offline')),
    TextEncoder,
    TextDecoder,
    Blob,
    Response,
    DecompressionStream,
    URL,
    console
  });
  vm.runInContext(readFileSync(join(root, rel), 'utf8'), sandbox, { filename: rel });
  return win;
}

/* Build an in-memory ZIP with one entry, either stored (0) or deflate-raw (8). */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) { c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) { crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8); }
  return (crc ^ 0xffffffff) >>> 0;
}

export function buildZip(name, content, method = 0) {
  const nameBytes = Buffer.from(name, 'utf8');
  const raw = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
  let body = raw;
  if (method === 8) {
    body = deflateRawSync(raw);
  }
  const crc = crc32(raw);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(method, 8);
  local.writeUInt16LE(0, 10);
  local.writeUInt16LE(0, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(raw.length, 22);
  local.writeUInt16LE(nameBytes.length, 26);
  local.writeUInt16LE(0, 28);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(method, 10);
  central.writeUInt16LE(0, 12);
  central.writeUInt16LE(0, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(body.length, 20);
  central.writeUInt32LE(raw.length, 24);
  central.writeUInt16LE(nameBytes.length, 28);
  central.writeUInt16LE(0, 30);
  central.writeUInt16LE(0, 32);
  central.writeUInt16LE(0, 34);
  central.writeUInt16LE(0, 36);
  central.writeUInt32LE(0, 38);
  central.writeUInt32LE(0, 42);

  const localPart = Buffer.concat([local, nameBytes, body]);
  const centralPart = Buffer.concat([central, nameBytes]);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(centralPart.length, 12);
  eocd.writeUInt32LE(localPart.length, 16);
  eocd.writeUInt16LE(0, 20);

  const zip = Buffer.concat([localPart, centralPart, eocd]);
  return zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength);
}
