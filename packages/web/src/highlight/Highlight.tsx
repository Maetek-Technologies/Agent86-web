import { useEffect, useState, type ReactNode } from "react";

type Engine = typeof import("./engine.ts");

let engine: Engine | undefined;
let loading: Promise<Engine> | undefined;

function loadEngine(): Promise<Engine> {
  loading ??= import("./engine.ts").then((module) => (engine = module));
  return loading;
}

/** Highlighted code: plain text first, then highlighted once the engine has loaded. */
export function Highlight({
  code,
  language,
}: {
  code: string;
  language: string | undefined;
}): ReactNode {
  const [, setReady] = useState(!!engine);
  useEffect(() => {
    if (engine || !language) return;
    let live = true;
    void loadEngine().then(() => live && setReady(true));
    return () => {
      live = false;
    };
  }, [language]);
  return (engine && engine.highlight(code, language)) ?? code;
}
