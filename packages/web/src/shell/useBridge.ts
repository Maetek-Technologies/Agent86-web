// Sign in to the bridge and read its settings, once per page.
import { useCallback, useEffect, useState } from "react";
import { getInfo, signIn, type BridgeInfo } from "../api.ts";

export type BridgeState =
  | { status: "loading" }
  | { status: "ready"; info: BridgeInfo }
  | { status: "failed"; error: string };

export function useBridge(): BridgeState & { retry: () => void } {
  const [state, setState] = useState<BridgeState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    signIn()
      .then(getInfo)
      .then((info) => live && setState({ status: "ready", info }))
      .catch(
        (error: unknown) =>
          live &&
          setState({
            status: "failed",
            error: error instanceof Error ? error.message : String(error),
          }),
      );
    return () => {
      live = false;
    };
  }, [attempt]);
  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  }, []);
  return { ...state, retry };
}
