import { webcrypto } from "node:crypto";

/** jose (JWT) expects the Web Crypto global; Node 18 only exposes it via node:crypto. */
if (typeof globalThis.crypto === "undefined") {
  globalThis.crypto = webcrypto as Crypto;
}
