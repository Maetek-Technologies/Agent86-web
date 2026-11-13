import { agent, methods } from "@agentclientprotocol/sdk";
import { describe, expect, it } from "vitest";
import { Agent86Client } from "../src/index.ts";
import { streamPair } from "./pair.ts";

/** An agent that answers `/rename` as agent86 1.0.17 does: a reply, then the new title. */
function renamer() {
  const prompts: string[] = [];
  const app = agent({ name: "renamer" })
    .onRequest(methods.agent.initialize, () => ({
      protocolVersion: 1,
      agentCapabilities: { loadSession: true },
      agentInfo: { name: "agent86", version: "1.0.17" },
    }))
    .onRequest(methods.agent.session.new, async ({ client }) => {
      setTimeout(() => {
        void client.notify(methods.client.session.update, {
          sessionId: "s1",
          update: {
            sessionUpdate: "available_commands_update",
            availableCommands: [{ name: "rename", description: "Rename this session" }],
          },
        });
      }, 0);
      return { sessionId: "s1" };
    })
    .onRequest(methods.agent.session.prompt, async ({ params, client }) => {
      const text = params.prompt.map((b) => (b.type === "text" ? b.text : "")).join("");
      prompts.push(text);
      const title = /^\/rename (.+)$/.exec(text)?.[1];
      const reply = title ? `renamed to ${title}` : `You said: ${text}`;
      await client.notify(methods.client.session.update, {
        sessionId: "s1",
        update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: reply } },
      });
      if (title) {
        await client.notify(methods.client.session.update, {
          sessionId: "s1",
          update: { sessionUpdate: "session_info_update", title },
        });
      }
      return { stopReason: "end_turn" as const };
    });
  return { app, prompts };
}

async function setup() {
  const pair = streamPair();
  const mock = renamer();
  const agentConnection = mock.app.connect(pair.agent);
  const client = await Agent86Client.connect(pair.client);
  const session = await client.newSession("/work");
  await new Promise((resolve) => setTimeout(resolve, 10));
  return { client, session, mock, done: () => (client.close(), agentConnection.close()) };
}

describe("quiet commands", () => {
  it("runs /rename without a transcript entry, and takes the announced title", async () => {
    const { session, mock, done } = await setup();
    expect(session.hasCommand("rename")).toBe(true);
    expect(session.hasCommand("nope")).toBe(false);
    const reply = await session.command("/rename Release prep");
    expect(reply).toBe("renamed to Release prep");
    expect(mock.prompts).toEqual(["/rename Release prep"]);
    expect(session.getState().entries).toEqual([]);
    expect(session.getState().title).toBe("Release prep");
    expect(session.getState().turn.running).toBe(false);
    done();
  });

  it("shows ordinary prompts after a command as usual", async () => {
    const { session, done } = await setup();
    const command = session.command("/rename A");
    const prompt = session.prompt("hello");
    await Promise.all([command, prompt]);
    const kinds = session.getState().entries.map((e) => e.kind);
    expect(kinds).toEqual(["user", "agent", "turn-end"]);
    done();
  });

  it("refuses a command while a turn runs", async () => {
    const { session, done } = await setup();
    const prompt = session.prompt("hello");
    await expect(session.command("/rename B")).rejects.toThrow(/busy/);
    await prompt;
    done();
  });
});

describe("notes", () => {
  it("adds the client's own lines to the logs", async () => {
    const { client, done } = await setup();
    client.note("[agent86-web] connected");
    expect(client.getLogs().lines).toContain("[agent86-web] connected");
    done();
  });
});
