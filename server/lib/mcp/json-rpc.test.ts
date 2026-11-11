import { describe, expect, test } from "bun:test";
import {
  handleJsonRpc,
  type JsonRpcHandlers,
  MCP_INSTRUCTIONS,
  PROTOCOL_VERSION
} from "./json-rpc";

const handlers: JsonRpcHandlers = {
  listTools: () => [{ name: "echo", description: "返す", inputSchema: { type: "object" } }],
  callTool: async (name, args) => {
    if (name === "echo") return { kind: "result", content: JSON.stringify(args) };
    if (name === "broken") return { kind: "error", content: "失敗しました" };
    return { kind: "invalid_params", message: "知らないツールです" };
  }
};

const call = (body: unknown) => handleJsonRpc(body, handlers);

describe("handleJsonRpc", () => {
  test("initialize は相手の protocolVersion をそのまま返す", async () => {
    for (const version of ["2025-06-18", "2024-11-05"]) {
      const res = await call({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: version, capabilities: {}, clientInfo: { name: "x" } }
      });
      expect(res).toMatchObject({
        jsonrpc: "2.0",
        id: 1,
        result: {
          protocolVersion: version,
          capabilities: { tools: {} },
          serverInfo: { name: "hikidashi", version: "1" },
          instructions: MCP_INSTRUCTIONS
        }
      });
    }
    expect(PROTOCOL_VERSION).toBe("2025-06-18");
  });

  test("protocolVersion が無ければ既定の版を返す", async () => {
    const res = await call({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
    expect(res).toMatchObject({ result: { protocolVersion: PROTOCOL_VERSION } });
  });

  test("通知（id なし）は応答しない", async () => {
    expect(await call({ jsonrpc: "2.0", method: "notifications/initialized" })).toBeNull();
    expect(await call({ jsonrpc: "2.0", method: "知らないメソッド" })).toBeNull();
  });

  test("ping は空の結果", async () => {
    expect(await call({ jsonrpc: "2.0", id: "a", method: "ping" })).toEqual({
      jsonrpc: "2.0",
      id: "a",
      result: {}
    });
  });

  test("tools/list は一覧を返す", async () => {
    const res = await call({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    expect(res).toMatchObject({ result: { tools: [{ name: "echo" }] } });
  });

  test("tools/call は content に文字を入れる", async () => {
    const res = await call({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "echo", arguments: { a: 1 } }
    });
    expect(res).toMatchObject({ result: { content: [{ type: "text", text: '{"a":1}' }] } });
  });

  test("ツールの失敗は isError で返す", async () => {
    const res = await call({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "broken" }
    });
    expect(res).toMatchObject({
      result: { isError: true, content: [{ type: "text", text: "失敗しました" }] }
    });
  });

  test("知らないツールは -32602、名前が無いのも -32602", async () => {
    const unknown = await call({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "nope", arguments: {} }
    });
    expect(unknown).toMatchObject({ error: { code: -32602 } });
    const noName = await call({ jsonrpc: "2.0", id: 6, method: "tools/call", params: {} });
    expect(noName).toMatchObject({ error: { code: -32602 } });
  });

  test("知らないメソッドは -32601", async () => {
    const res = await call({ jsonrpc: "2.0", id: 7, method: "resources/list" });
    expect(res).toMatchObject({ id: 7, error: { code: -32601 } });
  });

  test("壊れた要求は -32600", async () => {
    expect(await call("x")).toMatchObject({ id: null, error: { code: -32600 } });
    expect(await call({ jsonrpc: "1.0", id: 1, method: "ping" })).toMatchObject({
      error: { code: -32600 }
    });
  });
});
