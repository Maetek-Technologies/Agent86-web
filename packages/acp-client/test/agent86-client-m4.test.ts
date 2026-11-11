import { agent, methods, RequestError } from "@agentclientprotocol/sdk";
import { describe, expect, it } from "vitest";
import { Agent86Client, parseUntrusted, TurnRunningError } from "../src/index.ts";
import { streamPair } from "./pair.ts";

const INIT = {
  protocolVersion: 1,
  agentCapabilities: { loadSession: true },
  agentInfo: { name: "agent86", version: "1.0.15" },
};
const OPTIONS = (model: string) => [
  {
    id: "model",
    name: "Model",
    type: "select" as const,
    currentValue: model,
    options: [
      {
        group: "configured",
        name: "Configured",
        options: [
          { value: "a:one", name: "a:one" },
          { value: "a:two", name: "a:two" },
        ],
      },
    ],
  },
];

function scripted({ busyLoads = 0 } = {}) {
  const prompts: unknown[] = [];
  let busy = busyLoads;
  let model = "a:one";
  const app = agent({ name: "scripted" })
    .onRequest(methods.agent.initialize, () => INIT)
    .onRequest(methods.agent.session.new, () => ({
      sessionId: "s1",
      configOptions: OPTIONS(model),
    }))
    .onRequest(methods.agent.session.load, async ({ params, client }) => {
      if (busy-- > 0)
        throw new RequestError(-32600, "A prompt turn is running; wait for its response");
      if (params.sessionId !== "s1") throw new RequestError(-32002, "Unknown session");
      for (const [sessionUpdate, text] of [
        ["user_message_chunk", "earlier question"],
        ["agent_message_chunk", "earlier answer"],
      ] as const) {
        await client.notify(methods.client.session.update, {
          sessionId: "s1",
          update: { sessionUpdate, content: { type: "text", text } },
        });
      }
      return { configOptions: OPTIONS(model) };
    })
    .onRequest(methods.agent.session.setConfigOption, ({ params }) => {
      if (params.value !== "a:one" && params.value !== "a:two") {
        throw new RequestError(-32602, `'${String(params.value)}' is not one of the listed models`);
      }
      model = String(params.value);
      return { configOptions: OPTIONS(model) };
    })
    .onRequest(methods.agent.session.prompt, ({ params }) => {
      prompts.push(params.prompt);
      return { stopReason: "end_turn" as const };
    });
  return { app, prompts };
}

async function setup(options?: { busyLoads?: number }) {
  const pair = streamPair();
  const mock = scripted(options);
  const agentConnection = mock.app.connect(pair.agent);
  const client = await Agent86Client.connect(pair.client);
  return { client, mock, agentConnection, done: () => (client.close(), agentConnection.close()) };
}

describe("loadSession", () => {
  it("replays the saved history and keeps the session's settings", async () => {
    const { client, done } = await setup();
    const session = await client.loadSession("s1", "/work");
    const state = session.getState();
    expect(state.entries.map((e) => [e.kind, "text" in e ? e.text : ""])).toEqual([
      ["user", "earlier question"],
      ["agent", "earlier answer"],
    ]);
    expect(state.configOptions[0]?.currentValue).toBe("a:one");
    done();
  });

  it("waits while a turn from before is still running, then loads once", async () => {
    const { client, done } = await setup({ busyLoads: 2 });
    let waits = 0;
    const session = await client.loadSession("s1", "/work", {
      waitForTurn: true,
      retryMs: 5,
      onWaiting: () => waits++,
    });
    expect(waits).toBe(2);
    // No duplicated history from the refused attempts.
    expect(session.getState().entries).toHaveLength(2);
    done();
  });

  it("reports a running turn without waiting, and other failures as they are", async () => {
    const { client, done } = await setup({ busyLoads: 1 });
    await expect(client.loadSession("s1", "/work")).rejects.toBeInstanceOf(TurnRunningError);
    await expect(client.loadSession("nope", "/work")).rejects.toThrow("Unknown session");
    done();
  });
});

describe("setConfigOption", () => {
  it("switches the model and keeps agent86's answer", async () => {
    const { client, done } = await setup();
    const session = await client.newSession("/work");
    await session.setConfigOption("model", "a:two");
    expect(session.getState().configOptions[0]?.currentValue).toBe("a:two");
    await expect(session.setConfigOption("model", "b:three")).rejects.toThrow(
      "not one of the listed models",
    );
    expect(session.getState().configOptions[0]?.currentValue).toBe("a:two");
    done();
  });
});

describe("prompt with file links", () => {
  it("sends mentioned files as resource links after the text", async () => {
    const { client, mock, done } = await setup();
    const session = await client.newSession("/work");
    await session.prompt("look at @README.md", [
      { name: "README.md", uri: "file:///work/README.md" },
    ]);
    expect(mock.prompts[0]).toEqual([
      { type: "text", text: "look at @README.md" },
      { type: "resource_link", name: "README.md", uri: "file:///work/README.md" },
    ]);
    done();
  });
});

describe("logs", () => {
  it("collects the bridge's stderr notifications, including ones sent before initialize answered", async () => {
    const pair = streamPair();
    const mock = scripted();
    const agentConnection = mock.app.connect(pair.agent);
    // Sent before the client reads: it is delivered once the client connects.
    void agentConnection.client.notify("_agent86web/stderr", { line: "memory: ready" });
    const client = await Agent86Client.connect(pair.client);
    let changes = 0;
    client.subscribeLogs(() => changes++);
    await agentConnection.client.notify("_agent86web/stderr", {
      line: "project config: ignored 2 settings that need trust (mcp.servers.demo.command, guardrails.approval). Start agent86 at a terminal to review the file, or pass --trust-project (or set AGENT86_TRUST_PROJECT=1).",
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(client.getLogs().lines).toHaveLength(2);
    expect(client.getLogs().lines[0]).toBe("memory: ready");
    expect(client.getLogs().untrusted).toEqual({
      count: 2,
      keys: ["mcp.servers.demo.command", "guardrails.approval"],
    });
    expect(changes).toBe(1);
    client.close();
    agentConnection.close();
  });
});

describe("parseUntrusted", () => {
  it("reads agent86's note, singular or plural", () => {
    expect(
      parseUntrusted(
        "project config: ignored 1 setting that needs trust (sandbox.mode). Start agent86 …",
      ),
    ).toEqual({
      count: 1,
      keys: ["sandbox.mode"],
    });
    expect(
      parseUntrusted(
        "project config: ignored 7 settings that need trust (k1, k2, k3, k4, k5, and 2 more). Start …",
      )?.keys,
    ).toEqual(["k1", "k2", "k3", "k4", "k5", "and 2 more"]);
    expect(parseUntrusted("memory: ready")).toBeUndefined();
  });
});
