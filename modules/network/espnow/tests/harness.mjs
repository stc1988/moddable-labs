import { readTypeScript } from "./typescript.mjs";

export const calls = [];
export const receivers = new WeakMap();
export const state = { failure: undefined, wifiClosed: 0 };
const peers = new Map();
globalThis.Native = () => class {};
globalThis.native = (name) =>
  function (...args) {
    if (state.failure === name) {
      state.failure = undefined;
      throw new Error("native failure");
    }
    calls.push({ name, args });
    if (name.endsWith("_constructor")) receivers.set(this, args[1]);
    if (name.endsWith("get_id")) return "001122334455";
    if (name.endsWith("get_info"))
      return {
        maxDataLength: state.maxDataLength ?? 1470,
        channel: 1,
        version: 2,
        peerCount: peers.size + 1,
        encryptedPeerCount: 0,
      };
    if (name.endsWith("get_peer")) return peers.get(args[0]);
    if (name.endsWith("add_peer"))
      peers.set(args[0], {
        encrypted: !!args[1],
        channel: args[2],
        interface: args[3] ? "ap" : "sta",
      });
    if (name.endsWith("remove_peer")) peers.delete(args[0]);
  };
globalThis.ESPNowTestWiFi = class {
  close() {
    state.wifiClosed++;
  }
};
const url = (source) =>
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const coreURL = url(
  await readTypeScript(new URL("../core.ts", import.meta.url)),
);
export const { default: ESPNowCore } = await import(coreURL);
const wrapperSource = (
  await readTypeScript(new URL("../espnow.ts", import.meta.url))
)
  .replace(/from ['"]espnow\/core['"]/, `from '${coreURL}'`)
  .replace(
    /import WiFi from ['"]embedded:network\/interface\/wifi['"]/,
    "const WiFi = globalThis.ESPNowTestWiFi",
  );
export const { default: ESPNow } = await import(url(wrapperSource));
export function sent(success = true) {
  calls
    .filter((c) => c.name.endsWith("_constructor"))
    .at(-1)
    .args[1].onESPNowSent(success);
}
