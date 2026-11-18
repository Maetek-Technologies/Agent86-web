import type { ReactNode } from "react";
import type { AgentItem, CommandOutput, SkillItem, ToolGroup } from "./commandOutput.ts";

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded border border-border bg-panel-2 px-1.5 py-0.5 font-mono text-xs">
      {children}
    </span>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded bg-panel-2 px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-muted">
      {children}
    </span>
  );
}

function Panel({
  title,
  count,
  hint,
  children,
}: {
  title: string;
  count: number;
  hint?: string | undefined;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="overflow-hidden rounded-lg border border-border bg-panel"
      data-testid="command-output"
    >
      <header className="flex items-baseline gap-2 border-b border-border px-3 py-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-xs text-muted">{count}</span>
      </header>
      {children}
      {hint && (
        <footer className="border-t border-border px-3 py-1.5 font-mono text-xs text-muted">
          {hint}
        </footer>
      )}
    </section>
  );
}

function Tools({ groups }: { groups: ToolGroup[] }) {
  const count = groups.reduce((sum, group) => sum + group.tools.length, 0);
  return (
    <Panel title="Tools" count={count}>
      <div className="divide-y divide-border">
        {groups.map((group) => (
          <div key={group.server ?? ""} className="px-3 py-2">
            <div className="mb-1.5 flex items-center gap-2 text-xs text-muted">
              <span className="font-medium text-text">{group.server ?? "Built-in"}</span>
              {group.server && <Badge>MCP</Badge>}
              <span>{group.tools.length}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {group.tools.map((tool) => (
                <Chip key={tool}>{tool}</Chip>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function Skills({ skills, hint }: { skills: SkillItem[]; hint: string | undefined }) {
  return (
    <Panel title="Skills" count={skills.length} hint={hint}>
      <ul className="divide-y divide-border">
        {skills.map((skill) => (
          <li key={skill.name} className="px-3 py-2">
            <div className="font-mono text-sm font-semibold text-accent">{skill.name}</div>
            {skill.description && <p className="mt-0.5 text-sm">{skill.description}</p>}
            {skill.tools.length > 0 && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted">Tools while active</span>
                {skill.tools.map((tool) => (
                  <Chip key={tool}>{tool}</Chip>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Agents({ agents, hint }: { agents: AgentItem[]; hint: string | undefined }) {
  return (
    <Panel title="Sub-agents" count={agents.length} hint={hint}>
      <ul className="divide-y divide-border">
        {agents.map((agent) => (
          <li key={agent.name} className="px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-semibold text-accent">{agent.name}</span>
              {agent.source && <Badge>{agent.source}</Badge>}
            </div>
            {agent.description && <p className="mt-0.5 text-sm">{agent.description}</p>}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** agent86's reply to `/tools`, `/skills` or `/agents`, as a list rather than a paragraph. */
export function CommandOutputView({ output }: { output: CommandOutput }) {
  switch (output.command) {
    case "tools":
      return <Tools groups={output.groups} />;
    case "skills":
      return <Skills skills={output.skills} hint={output.hint} />;
    case "agents":
      return <Agents agents={output.agents} hint={output.hint} />;
  }
}
