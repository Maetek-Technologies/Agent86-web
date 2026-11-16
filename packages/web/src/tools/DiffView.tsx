import type { FileDiff } from "@agent86-web/acp-client";
import { useMemo, useState } from "react";
import { Highlight } from "../highlight/Highlight.tsx";
import { languageForPath } from "../highlight/languages.ts";
import { useThread } from "../thread/ThreadContext.ts";
import { parseUnifiedDiff, type DiffLine, type ParsedDiff } from "./approval.ts";
import { fileDiff } from "./lineDiff.ts";
import { relativePath } from "./paths.ts";

const ROW: Record<DiffLine["kind"], string> = {
  add: "bg-diff-add",
  del: "bg-diff-del",
  context: "",
  hunk: "bg-panel text-muted",
  meta: "text-muted",
};

const SIGN: Record<DiffLine["kind"], string> = {
  add: "+",
  del: "-",
  context: " ",
  hunk: "",
  meta: "",
};

/** Numbered diff lines with colour and syntax highlighting by file type. */
function DiffTable({
  parsed,
  label,
  note,
  action,
}: {
  parsed: ParsedDiff;
  label: string;
  note?: string;
  action?: React.ReactNode;
}) {
  const language = languageForPath(parsed.newPath ?? parsed.oldPath);
  return (
    <div className="overflow-hidden rounded border border-border bg-panel-2" data-testid="diff">
      <div className="flex items-center gap-3 border-b border-border px-3 py-1 font-mono text-xs">
        <span className="truncate" title={parsed.newPath ?? parsed.oldPath}>
          {label}
        </span>
        {note && <span className="shrink-0 font-sans text-muted">{note}</span>}
        <span className="ml-auto text-ok">+{parsed.added}</span>
        <span className="text-error">-{parsed.removed}</span>
        {action}
      </div>
      <div className="max-h-96 overflow-auto">
        <table className="w-full border-collapse font-mono text-xs leading-5">
          <tbody>
            {parsed.lines.map((line, i) => (
              <tr key={i} className={ROW[line.kind]} data-kind={line.kind}>
                <td className="w-10 select-none px-2 text-right text-muted">
                  {line.oldLine ?? ""}
                </td>
                <td className="w-10 select-none px-2 text-right text-muted">
                  {line.newLine ?? ""}
                </td>
                <td className="w-4 select-none text-center text-muted">{SIGN[line.kind]}</td>
                <td className="whitespace-pre pr-3">
                  {line.kind === "hunk" || line.kind === "meta" ? (
                    line.text
                  ) : (
                    <Highlight code={line.text} language={language} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** A unified diff, as agent86 sends it in text. */
export function DiffView({ diff }: { diff: string }) {
  const parsed = parseUnifiedDiff(diff);
  return <DiffTable parsed={parsed} label={parsed.newPath ?? parsed.oldPath ?? ""} />;
}

/**
 * A file change agent86 sent whole (ACP `diff` content), diffed here. Unchanged lines fold into
 * hunks; "whole file" shows them all.
 */
export function FileDiffView({ diff }: { diff: FileDiff }) {
  const { cwd } = useThread();
  const [full, setFull] = useState(false);
  const parsed = useMemo(
    () => fileDiff(diff.path, diff.oldText, diff.newText, { full }),
    [diff, full],
  );
  const unchanged = parsed.added + parsed.removed === 0;
  return (
    <DiffTable
      parsed={parsed}
      label={relativePath(diff.path, cwd)}
      note={diff.oldText === null ? "new file" : unchanged ? "no change" : undefined}
      action={
        diff.oldText !== null && !unchanged ? (
          <button
            type="button"
            aria-pressed={full}
            onClick={() => setFull((v) => !v)}
            className="font-sans text-muted hover:text-text"
          >
            {full ? "changes only" : "whole file"}
          </button>
        ) : undefined
      }
    />
  );
}

/** Several file changes, one after another. */
export function FileDiffs({ diffs }: { diffs: FileDiff[] }) {
  return (
    <div className="space-y-2">
      {diffs.map((diff, i) => (
        <FileDiffView key={`${diff.path}:${i}`} diff={diff} />
      ))}
    </div>
  );
}
