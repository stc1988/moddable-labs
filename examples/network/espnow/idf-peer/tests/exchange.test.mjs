import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { readTypeScript } from "../../../../../modules/network/espnow/tests/typescript.mjs";

const url = (source) =>
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const protocolURL = url(
  await readTypeScript(new URL("../protocol.ts", import.meta.url)),
);
const { BROADCAST, encode, decode } = await import(protocolURL);
let now = 0;
let nextID = 0;
const timers = new Map();
globalThis.IDFPeerTimer = {
  set(callback, delay) {
    const id = ++nextID;
    timers.set(id, { callback, due: now + delay });
    return id;
  },
  clear(id) {
    timers.delete(id);
  },
};
const source = (
  await readTypeScript(new URL("../exchange.ts", import.meta.url))
)
  .replace(/from ["']\.\/protocol["']/, `from '${protocolURL}'`)
  .replace(
    /import Timer from ["']timer["']/,
    "const Timer = globalThis.IDFPeerTimer",
  );
const { default: Exchange } = await import(url(source));
function tick() {
  const [id, timer] = [...timers].sort((a, b) => a[1].due - b[1].due)[0];
  now = timer.due;
  timers.delete(id);
  timer.callback();
}
const defaults = {
  channel: 1,
  magic: 200,
  length: 10,
  count: 3,
  delay: 1000,
  sendTimeout: 2000,
  lmk: new Uint8Array(16).fill(7).buffer,
};
function packet(peerId, data) {
  return Object.assign(data, {
    peerId,
    broadcast: decode(data)?.type === 0,
    rssi: -50,
  });
}

test("CRC/header agree with the installed ESP-IDF C implementation", {
  skip: !process.env.IDF_PATH,
}, () => {
  const idf = process.env.IDF_PATH;
  const crcSource = join(idf, "components/esp_rom/linux/esp_rom_crc.c");
  assert.ok(
    existsSync(crcSource),
    "ESP-IDF host CRC implementation is required",
  );
  const dir = mkdtempSync(join(tmpdir(), "idf-peer-crc-"));
  try {
    const path = join(dir, "oracle.c");
    const binary = join(dir, "oracle");
    writeFileSync(
      path,
      `#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include "esp_rom_crc.h"
struct __attribute__((packed)) Frame { uint8_t type, state; uint16_t sequence, crc; uint32_t magic; };
int main(int argc, char **argv) {
 unsigned length = (unsigned)atoi(argv[1]);
 uint8_t *data = calloc(length, 1);
 struct Frame *f = (struct Frame *)data;
 f->type = 1; f->state = 1; f->sequence = 0x1234; f->magic = 0xaabbccdd;
 f->crc = esp_rom_crc16_le(UINT16_MAX, data, length);
 for (unsigned i = 0; i < length; i++) printf("%02x", data[i]);
 free(data); return 0;
}`,
    );
    execFileSync("cc", [
      path,
      crcSource,
      "-I",
      join(idf, "components/esp_rom/include"),
      "-o",
      binary,
    ]);
    for (const length of [10, 250, 1470]) {
      const expected = execFileSync(binary, [String(length)], {
        encoding: "utf8",
      });
      const data = encode(
        { type: 1, state: 1, sequence: 0x1234, magic: 0xaabbccdd },
        length,
      );
      assert.equal(Buffer.from(data).toString("hex"), expected);
      const fromIDF = Uint8Array.from(Buffer.from(expected, "hex")).buffer;
      assert.deepEqual(decode(fromIDF), {
        type: 1,
        state: 1,
        sequence: 0x1234,
        magic: 0xaabbccdd,
      });
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("invalid frames are rejected without mutating valid input", () => {
  const data = encode(
    { type: 0, state: 1, sequence: 65535, magic: 0xffffffff },
    10,
  );
  const original = data.slice(0);
  assert.ok(decode(data));
  assert.deepEqual(data, original);
  for (let index = 0; index < 10; index++) {
    const bad = data.slice(0);
    new Uint8Array(bad)[index] ^= 1;
    assert.equal(decode(bad), undefined);
  }
  assert.equal(decode(new ArrayBuffer(9)), undefined);
  assert.equal(decode(new ArrayBuffer(1471)), undefined);
  assert.throws(
    () => encode({ type: 0, state: 0, sequence: 0, magic: 0 }, 9),
    /length/,
  );
});

test("two identical apps discover a peer and switch to encrypted unicast with bounded sends", () => {
  timers.clear();
  now = 0;
  const nodes = [];
  function node(id, magic) {
    const peers = new Map();
    const logs = [];
    const writes = [];
    let busy = false;
    const result = { id, peers, logs, writes, stopped: false };
    const radio = {
      id,
      addPeer(peerId, options) {
        peers.set(peerId, options);
      },
      write(data, peerId) {
        assert.equal(busy, false, "core must never receive overlapping writes");
        busy = true;
        writes.push({ peerId, data });
        let delivered = false;
        for (const other of nodes) {
          if (
            other === result ||
            other.stopped ||
            (peerId !== BROADCAST && peerId !== other.id)
          )
            continue;
          if (peerId !== BROADCAST) {
            assert.deepEqual(peers.get(other.id).lmk, other.peers.get(id).lmk);
          }
          delivered = true;
          IDFPeerTimer.set(
            () => other.exchange.receive(packet(id, data.slice(0))),
            1,
          );
        }
        IDFPeerTimer.set(() => {
          busy = false;
          result.exchange.sent({ peerId, success: delivered });
        }, 2);
      },
    };
    result.exchange = new Exchange({
      ...defaults,
      radio,
      magic,
      log(message) {
        logs.push(message);
      },
      onStop(reason) {
        result.stopped = true;
        logs.push(reason);
      },
    });
    nodes.push(result);
    return result;
  }
  const a = node("001122334455", 100);
  const b = node("AABBCCDDEEFF", 200);
  a.exchange.start();
  b.exchange.start();
  for (let steps = 0; timers.size && steps < 100; steps++) tick();
  assert.equal(b.stopped, true);
  assert.equal(a.stopped, false);
  assert.ok(a.logs.includes("LISTEN encrypted unicast"));
  assert.equal(b.writes.filter((frame) => frame.peerId === a.id).length, 3);
  assert.equal(
    a.logs.filter((line) => line.startsWith("RX unicast")).length,
    3,
  );
  assert.equal(a.peers.size, 1);
  assert.equal(b.peers.size, 1);
  a.exchange.stop("test done");
  assert.equal(timers.size, 0);
});

test("discovery during an in-flight broadcast waits for completion; stale callbacks after timeout do nothing", () => {
  timers.clear();
  now = 0;
  const writes = [];
  const stops = [];
  const radio = {
    id: "001122334455",
    addPeer() {},
    write(data, peerId) {
      writes.push({ data, peerId });
    },
  };
  const exchange = new Exchange({
    ...defaults,
    radio,
    log() {},
    onStop(reason) {
      stops.push(reason);
    },
  });
  exchange.start();
  tick();
  exchange.receive(
    packet(
      "AABBCCDDEEFF",
      encode({ type: 0, state: 1, sequence: 0, magic: 100 }, 10),
    ),
  );
  assert.equal(writes.length, 1);
  exchange.sent({ peerId: BROADCAST, success: true });
  tick();
  assert.equal(writes[1].peerId, "AABBCCDDEEFF");
  tick(); // no send completion arrives
  assert.equal(exchange.closed, true);
  assert.match(stops[0], /timed out/);
  exchange.sent({ peerId: "AABBCCDDEEFF", success: true });
  assert.equal(writes.length, 2);
  assert.equal(timers.size, 0);
});

test("invalid packets never register peers; write failure cancels the watchdog", () => {
  timers.clear();
  let registered = 0;
  const stopped = [];
  const exchange = new Exchange({
    ...defaults,
    radio: {
      id: "001122334455",
      addPeer() {
        registered++;
      },
      write() {
        throw Error("send failure");
      },
    },
    log() {},
    onStop(reason) {
      stopped.push(reason);
    },
  });
  exchange.receive(packet("AABBCCDDEEFF", new ArrayBuffer(9)));
  const mismatch = packet(
    "AABBCCDDEEFF",
    encode({ type: 1, state: 0, sequence: 0, magic: 1 }, 10),
  );
  mismatch.broadcast = true;
  exchange.receive(mismatch);
  assert.equal(registered, 0);
  exchange.start();
  tick();
  assert.match(stopped[0], /write failed/);
  assert.equal(timers.size, 0);
});
