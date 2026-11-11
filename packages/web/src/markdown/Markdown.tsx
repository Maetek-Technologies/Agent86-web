import { memo, useMemo, useState, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Highlight } from "../highlight/Highlight.tsx";
import { normalizeLanguage } from "../highlight/languages.ts";
import { safeUrl, splitBlocks } from "./blocks.ts";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="rounded px-1.5 py-0.5 text-xs text-muted hover:bg-panel hover:text-text"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function CodeBlock({ language, code }: { language: string | undefined; code: string }) {
  return (
    <div className="my-3 overflow-hidden rounded-md border border-border bg-panel-2">
      <div className="flex items-center justify-between border-b border-border px-3 py-1 font-mono text-xs text-muted">
        <span>{language ?? "text"}</span>
        <CopyButton text={code} />
      </div>
      <pre className="overflow-x-auto p-3 text-sm leading-relaxed">
        <code>
          <Highlight code={code} language={normalizeLanguage(language)} />
        </code>
      </pre>
    </div>
  );
}

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (node && typeof node === "object" && "props" in node) {
    return textOf((node.props as { children?: ReactNode }).children);
  }
  return "";
}

const components: Components = {
  a({ href, children }) {
    const url = href ? safeUrl(href) : undefined;
    if (!url) return <span className="underline decoration-dotted">{children}</span>;
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="text-accent underline"
      >
        {children}
      </a>
    );
  },
  // Images are never loaded: a model could use one to send data to a server (docs/SECURITY.md T10).
  img({ src, alt }) {
    const url = typeof src === "string" ? safeUrl(src) : undefined;
    const label = `image: ${alt || "untitled"}`;
    return url ? (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="text-accent underline"
      >
        [{label}]
      </a>
    ) : (
      <span className="text-muted">[{label}]</span>
    );
  },
  pre({ children }) {
    const child = Array.isArray(children) ? children[0] : children;
    const className =
      child && typeof child === "object" && "props" in child
        ? ((child.props as { className?: string }).className ?? "")
        : "";
    const language = /language-([\w+-]+)/.exec(className)?.[1];
    return <CodeBlock language={language} code={textOf(children).replace(/\n$/, "")} />;
  },
  code({ children }) {
    return (
      <code className="rounded bg-panel-2 px-1 py-0.5 font-mono text-[0.9em]">{children}</code>
    );
  },
  table({ children }) {
    return (
      <div className="my-3 overflow-x-auto">
        <table className="border-collapse text-sm">{children}</table>
      </div>
    );
  },
};

const Block = memo(function Block({ source }: { source: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} skipHtml>
      {source}
    </ReactMarkdown>
  );
});

/**
 * Markdown from the model, rendered as React elements: raw HTML is skipped, links are limited to
 * http, https, and mailto, and images are shown as links. Finished blocks are memoized, so a
 * streaming reply only re-parses its last block.
 */
export function Markdown({ text }: { text: string }) {
  const blocks = useMemo(() => splitBlocks(text), [text]);
  return (
    <div className="md">
      {blocks.map((block, i) => (
        <Block key={i} source={block} />
      ))}
    </div>
  );
}
