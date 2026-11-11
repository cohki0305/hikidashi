import { afterEach, mock } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// bun test では DOM が無いので、DOM を読む処理のテスト用に happy-dom を全体へ登録する。
// happy-dom の fetch・FormData・Blob・URL などは native と挙動が違う（cookie を落とす、
// CORS や origin の扱いが違うなど）。サーバー側のテストに影響しないよう、登録前の native を
// 退避して復元する。DOM を読むテストが使う window・document などだけが happy-dom のまま残る。
const WEB_GLOBALS = [
  "fetch",
  "Request",
  "Response",
  "Headers",
  "FormData",
  "Blob",
  "File",
  "FileReader",
  "URL",
  "URLSearchParams",
  "AbortController",
  "AbortSignal"
] as const;

const globals = globalThis as unknown as Record<string, unknown>;

const native = new Map<string, unknown>();
for (const key of WEB_GLOBALS) {
  if (Object.hasOwn(globals, key)) native.set(key, globals[key]);
}

GlobalRegistrator.register({ url: "http://localhost:5173" });

for (const key of WEB_GLOBALS) {
  if (native.has(key)) {
    globals[key] = native.get(key);
  } else {
    delete globals[key];
  }
}

// happy-dom には Pointer Capture API が無い。フォーム部品の pointerdown で落ちないよう no-op で補う。
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}

// --conditions browser を使うとサーバー側テストも browser 版で解決されるため、isServer だけ差し替える。
mock.module("@tanstack/router-core/isServer", () => ({
  isServer: undefined,
  loadServerRoute: undefined
}));

// 全テストで 1 つの document を共有するので、document.body に直接足したまま終わるテストが
// あると、あとのファイルのテストに残りが漏れる。テストごとに body を空にする。
afterEach(() => {
  document.body.replaceChildren();
});
