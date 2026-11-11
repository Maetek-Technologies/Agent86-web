import { Highlight } from "../highlight/Highlight.tsx";
import { languageForPath } from "../highlight/languages.ts";
import { parseUnifiedDiff, type DiffLine } from "./approval.ts";

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

/** A unified diff with line numbers, colour, and syntax highlighting by file type. */
export function DiffView({ diff }: { diff: string }) {
  const parsed = parseUnifiedDiff(diff);
  const language = languageForPath(parsed.newPath ?? parsed.oldPath);
  return (
    <div className="overflow-hidden rounded border border-border bg-panel-2" data-testid="diff">
      <div className="flex items-center gap-3 border-b border-border px-3 py-1 font-mono text-xs">
        <span className="truncate">{parsed.newPath ?? parsed.oldPath}</span>
        <span className="ml-auto text-ok">+{parsed.added}</span>
        <span className="text-error">-{parsed.removed}</span>
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
