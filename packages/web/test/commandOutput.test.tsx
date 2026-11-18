// @vitest-environment jsdom
import type { Entry } from "@agent86-web/acp-client";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  listingCommand,
  parseAgents,
  parseSkills,
  parseTools,
} from "../src/thread/commandOutput.ts";
import { Transcript } from "../src/thread/Transcript.tsx";

afterEach(cleanup);

// As agent86 1.0.23 answers these commands over ACP.
const TOOLS =
  "tools: delegate, edit_file, read_file, mcp__firecrawl__firecrawl_search, mcp__firecrawl__firecrawl_scrape, mcp__my_server__ping, write_file";

const SKILLS = [
  "code-reviewer",
  "  Review code for security vulnerabilities and best practices.",
  "  tools while active: read_file, list_dir",
  "google-stitch",
  "  Converts Google Stitch exports into components.",
  "",
  "run one with /<name> [task] or /skill <name> [task]",
].join("\n");

const AGENTS = [
  "specialist sub-agents (/agent <name> <task> runs one):",
  "  researcher [built-in] Finds and reads the information a question needs. Read-only.",
  "  writer [user] Writes files only.",
].join("\n");

describe("listing commands", () => {
  it("knows the bare commands only", () => {
    expect(listingCommand("/tools")).toBe("tools");
    expect(listingCommand("  /skills \n")).toBe("skills");
    expect(listingCommand("/agents")).toBe("agents");
    expect(listingCommand("/agent reviewer look")).toBeUndefined();
    expect(listingCommand("/model")).toBeUndefined();
    expect(listingCommand("what /tools do you have?")).toBeUndefined();
  });

  it("groups tools: agent86's own, then each MCP server's", () => {
    expect(parseTools(TOOLS)).toEqual([
      { server: undefined, tools: ["delegate", "edit_file", "read_file", "write_file"] },
      { server: "firecrawl", tools: ["firecrawl_search", "firecrawl_scrape"] },
      { server: "my_server", tools: ["ping"] },
    ]);
    expect(parseTools("no tools")).toBeUndefined();
  });

  it("reads skills with their descriptions and tools", () => {
    expect(parseSkills(SKILLS)).toEqual({
      skills: [
        {
          name: "code-reviewer",
          description: "Review code for security vulnerabilities and best practices.",
          tools: ["read_file", "list_dir"],
        },
        {
          name: "google-stitch",
          description: "Converts Google Stitch exports into components.",
          tools: [],
        },
      ],
      hint: "run one with /<name> [task] or /skill <name> [task]",
    });
    expect(parseSkills("no skills discovered")).toBeUndefined();
  });

  it("reads sub-agents with where they come from", () => {
    expect(parseAgents(AGENTS)).toEqual({
      agents: [
        {
          name: "researcher",
          source: "built-in",
          description: "Finds and reads the information a question needs. Read-only.",
        },
        { name: "writer", source: "user", description: "Writes files only." },
      ],
      hint: "/agent <name> <task> runs one",
    });
    expect(parseAgents("no specialist sub-agents")).toBeUndefined();
  });

  it("shows the replies as lists in the transcript", () => {
    const entries: Entry[] = [
      { kind: "user", id: 1, text: "/tools" },
      { kind: "agent", id: 2, text: TOOLS },
      { kind: "user", id: 3, text: "/skills" },
      { kind: "agent", id: 4, text: SKILLS },
      { kind: "user", id: 5, text: "/agents" },
      { kind: "agent", id: 6, text: AGENTS },
    ];
    render(<Transcript entries={entries} />);

    const tools = screen.getByRole("region", { name: "Tools" });
    expect(within(tools).getByText("firecrawl")).toBeTruthy();
    expect(within(tools).getByText("firecrawl_search")).toBeTruthy();
    expect(within(tools).getByText("Built-in")).toBeTruthy();

    const skills = screen.getByRole("region", { name: "Skills" });
    expect(within(skills).getAllByRole("listitem")).toHaveLength(2);
    expect(within(skills).getByText("code-reviewer")).toBeTruthy();

    const agents = screen.getByRole("region", { name: "Sub-agents" });
    expect(within(agents).getByText("built-in")).toBeTruthy();
    expect(within(agents).getByText("/agent <name> <task> runs one")).toBeTruthy();
  });

  it("leaves other replies, and replies it cannot read, as Markdown", () => {
    const entries: Entry[] = [
      { kind: "user", id: 1, text: "list tools" },
      { kind: "agent", id: 2, text: TOOLS },
      { kind: "user", id: 3, text: "/skills" },
      { kind: "agent", id: 4, text: "no skills discovered" },
    ];
    render(<Transcript entries={entries} />);
    expect(screen.queryByTestId("command-output")).toBeNull();
    expect(screen.getByText("no skills discovered")).toBeTruthy();
  });
});
