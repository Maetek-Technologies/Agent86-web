import { Highlight } from "../highlight/Highlight.tsx";
import { languageForPath } from "../highlight/languages.ts";
import type { Detail } from "./approval.ts";
import { DiffView } from "./DiffView.tsx";

function CodeBox({
  label,
  code,
  language,
}: {
  label: string;
  code: string;
  language: string | undefined;
}) {
  return (
    <div className="overflow-hidden rounded border border-border bg-panel-2">
      <div className="border-b border-border px-3 py-1 font-mono text-xs text-muted">{label}</div>
      <pre className="max-h-96 overflow-auto p-3 font-mono text-xs leading-5">
        <code>
          <Highlight code={code} language={language} />
        </code>
      </pre>
    </div>
  );
}

/** What a call would do: a diff, a new file, a command or code, or plain text. */
export function DetailView({ detail }: { detail: Detail }) {
  switch (detail.type) {
    case "diff":
      return <DiffView diff={detail.diff} />;
    case "new-file":
      return (
        <CodeBox
          label={`new file: ${detail.path} (${detail.lines} line${detail.lines === 1 ? "" : "s"})`}
          code={detail.content}
          language={languageForPath(detail.path)}
        />
      );
    case "code":
      return (
        <CodeBox
          label={detail.language === "bash" ? "command" : detail.language}
          code={detail.code}
          language={detail.language}
        />
      );
    case "text":
      return (
        <pre className="max-h-96 overflow-auto rounded border border-border bg-panel-2 p-3 font-mono text-xs whitespace-pre-wrap">
          {detail.text}
        </pre>
      );
  }
}
