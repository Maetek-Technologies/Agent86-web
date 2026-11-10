import {
  agent,
  methods,
  type InitializeRequest,
  type InitializeResponse,
} from "@agentclientprotocol/sdk";
import { describe, expect, it } from "vitest";
import {
  CLIENT_CAPABILITIES,
  checkCompatibility,
  compareVersions,
  connectAndInitialize,
} from "../src/index.ts";
import { streamPair } from "./pair.ts";

/** What agent86 1.0.15 answers to `initialize`, recorded from the real binary. */
const AGENT86_INIT = {
  protocolVersion: 1,
  agentCapabilities: {
    loadSession: true,
    sessionCapabilities: { list: {} },
    promptCapabilities: { image: false, audio: false, embeddedContext: false },
    mcpCapabilities: { http: true, sse: true },
  },
  agentInfo: { name: "agent86", title: "agent86", version: "1.0.15" },
  authMethods: [
    {
      id: "terminal-setup",
      name: "Set up a provider and API key",
      description: "Choose a model provider and store its API key in the OS keyring.",
      type: "terminal",
      args: ["auth"],
    },
  ],
} as InitializeResponse;

describe("compareVersions", () => {
  it.each([
    ["1.0.15", "1.0.15", 0],
    ["1.0.16", "1.0.15", 1],
    ["1.0.9", "1.0.15", -1],
    ["2.0.0", "1.99.99", 1],
    ["1.0.15-beta.1", "1.0.15", 0],
    ["1.1", "1.0.15", 1],
  ])("%s vs %s", (a, b, expected) => {
    expect(compareVersions(a, b)).toBe(expected);
  });
});

describe("checkCompatibility", () => {
  it("accepts agent86 1.0.15", () => {
    expect(checkCompatibility(AGENT86_INIT)).toEqual({ ok: true, problems: [] });
  });

  it("refuses an older agent86 and says how to update", () => {
    const result = checkCompatibility({
      ...AGENT86_INIT,
      agentInfo: { name: "agent86", version: "1.0.14" },
    });
    expect(result.ok).toBe(false);
    expect(result.problems.join()).toContain("npm install -g agent86@latest");
  });

  it("refuses an agent that is not agent86", () => {
    const result = checkCompatibility({
      ...AGENT86_INIT,
      agentInfo: { name: "other", version: "9" },
    });
    expect(result.problems).toEqual(['The agent is "other", not agent86.']);
  });

  it("refuses another protocol version and a missing loadSession", () => {
    const result = checkCompatibility({
      ...AGENT86_INIT,
      protocolVersion: 2,
      agentCapabilities: {},
    });
    expect(result.problems).toHaveLength(2);
  });
});

describe("connectAndInitialize", () => {
  it("sends agent86-web's identity and capabilities, and returns the answer", async () => {
    const { client, agent: agentEnd } = streamPair();
    let received: InitializeRequest | undefined;
    const agentConnection = agent({ name: "test-agent" })
      .onRequest(methods.agent.initialize, ({ params }) => {
        received = params;
        return AGENT86_INIT;
      })
      .connect(agentEnd);

    const handshake = await connectAndInitialize(client);

    expect(received?.protocolVersion).toBe(1);
    expect(received?.clientCapabilities).toMatchObject(CLIENT_CAPABILITIES);
    expect(received?.clientInfo?.name).toBe("agent86-web");
    expect(handshake.init.agentInfo?.version).toBe("1.0.15");
    expect(handshake.compatibility.ok).toBe(true);

    handshake.connection.close();
    agentConnection.close();
  });

  it("rejects when the agent answers with an error", async () => {
    const { client, agent: agentEnd } = streamPair();
    const agentConnection = agent()
      .onRequest(methods.agent.initialize, () => {
        throw new Error("boom");
      })
      .connect(agentEnd);

    await expect(connectAndInitialize(client)).rejects.toThrow();
    agentConnection.close();
  });
});
