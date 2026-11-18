/**
 * agent86 answers `/tools`, `/skills` and `/agents` with plain text laid out for a terminal: a
 * comma-separated list, or names with indented details. As Markdown that runs together into one
 * paragraph, so the transcript reads these replies into lists and shows them as such. Anything
 * that does not have the expected shape stays `undefined`, and is shown as Markdown as before.
 */

export interface ToolGroup {
  /** `undefined` for agent86's own tools; otherwise the MCP server the tools come from. */
  server: string | undefined;
  tools: string[];
}

export interface SkillItem {
  name: string;
  description: string;
  tools: string[];
}

export interface AgentItem {
  name: string;
  /** Where the sub-agent comes from, as agent86 labels it: "built-in", "project", "user"… */
  source: string | undefined;
  description: string;
}

export type CommandOutput =
  | { command: "tools"; groups: ToolGroup[] }
  | { command: "skills"; skills: SkillItem[]; hint: string | undefined }
  | { command: "agents"; agents: AgentItem[]; hint: string | undefined };

const COMMANDS = ["tools", "skills", "agents"] as const;
type Command = (typeof COMMANDS)[number];

/** The listing command a prompt is, if it is exactly one of them. */
export function listingCommand(prompt: string): Command | undefined {
  const match = /^\/(\w+)$/.exec(prompt.trim());
  return COMMANDS.find((command) => command === match?.[1]);
}

const MCP_TOOL = /^mcp__(.+?)__(.+)$/;

export function parseTools(text: string): ToolGroup[] | undefined {
  const match = /^tools:\s*(.+)$/s.exec(text.trim());
  if (!match) return undefined;
  const names = match[1]!
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  if (names.length === 0) return undefined;
  const builtIn: string[] = [];
  const servers = new Map<string, string[]>();
  for (const name of names) {
    const mcp = MCP_TOOL.exec(name);
    if (!mcp) {
      builtIn.push(name);
      continue;
    }
    const tools = servers.get(mcp[1]!) ?? [];
    tools.push(mcp[2]!);
    servers.set(mcp[1]!, tools);
  }
  const groups: ToolGroup[] = [];
  if (builtIn.length > 0) groups.push({ server: undefined, tools: builtIn });
  for (const [server, tools] of servers) groups.push({ server, tools });
  return groups;
}

const TOOLS_WHILE_ACTIVE = /^tools while active:\s*(.*)$/;

export function parseSkills(
  text: string,
): { skills: SkillItem[]; hint: string | undefined } | undefined {
  const lines = text.replace(/\r\n/g, "\n").trimEnd().split("\n");
  const skills: SkillItem[] = [];
  let hint: string | undefined;
  for (const line of lines) {
    if (line.trim() === "") continue;
    if (/^\s/.test(line)) {
      const skill = skills.at(-1);
      if (!skill) return undefined;
      const detail = line.trim();
      const tools = TOOLS_WHILE_ACTIVE.exec(detail);
      if (tools) {
        skill.tools = tools[1]!
          .split(",")
          .map((name) => name.trim())
          .filter(Boolean);
      } else {
        skill.description = skill.description ? `${skill.description} ${detail}` : detail;
      }
    } else if (/^run one with /.test(line)) {
      hint = line.trim();
    } else if (/^\S+$/.test(line)) {
      skills.push({ name: line, description: "", tools: [] });
    } else {
      return undefined;
    }
  }
  return skills.length > 0 ? { skills, hint } : undefined;
}

const AGENT_LINE = /^\s+(\S+)(?:\s+\[([^\]]+)\])?\s+(.*)$/;

export function parseAgents(
  text: string,
): { agents: AgentItem[]; hint: string | undefined } | undefined {
  const lines = text.replace(/\r\n/g, "\n").trimEnd().split("\n");
  const header = lines.shift() ?? "";
  if (!/:\s*$/.test(header)) return undefined;
  const agents: AgentItem[] = [];
  for (const line of lines) {
    if (line.trim() === "") continue;
    const match = AGENT_LINE.exec(line);
    if (match) {
      agents.push({ name: match[1]!, source: match[2], description: match[3]!.trim() });
    } else if (/^\s/.test(line) && agents.length > 0) {
      const agent = agents.at(-1)!;
      agent.description = `${agent.description} ${line.trim()}`;
    } else {
      return undefined;
    }
  }
  if (agents.length === 0) return undefined;
  // "specialist sub-agents (/agent <name> <task> runs one):" → "/agent <name> <task> runs one"
  const hint = /\(([^)]+)\)\s*:\s*$/.exec(header)?.[1];
  return { agents, hint };
}

/** The reply to a listing command, read into lists; `undefined` when it is not in the usual form. */
export function parseCommandOutput(command: Command, text: string): CommandOutput | undefined {
  switch (command) {
    case "tools": {
      const groups = parseTools(text);
      return groups && { command, groups };
    }
    case "skills": {
      const parsed = parseSkills(text);
      return parsed && { command, ...parsed };
    }
    case "agents": {
      const parsed = parseAgents(text);
      return parsed && { command, ...parsed };
    }
  }
}
