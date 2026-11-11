// Loaded on demand (see highlight.tsx): lowlight's common languages, rendered as React elements
// through hast, so highlighted code never goes through innerHTML (docs/SECURITY.md T10).
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import { common, createLowlight } from "lowlight";
import type { ReactNode } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";

const lowlight = createLowlight(common);

export function highlight(code: string, language: string | undefined): ReactNode | undefined {
  if (!language || !lowlight.registered(language)) return undefined;
  try {
    const tree = lowlight.highlight(language, code);
    return toJsxRuntime(tree, { Fragment, jsx, jsxs });
  } catch {
    return undefined;
  }
}
