// Sign in, read the bridge's info, open one thread's ACP channel, initialize, and start a session.
import { Agent86Client, webSocketStream, type AgentSession } from "@agent86-web/acp-client";
import { useCallback, useEffect, useState } from "react";
import { acpUrl, getInfo, signIn, type BridgeInfo } from "./api.ts";
import { newThreadId } from "./token.ts";

export type Step =
  | "signing-in"
  | "reading-info"
  | "connecting"
  | "initializing"
  | "starting-session"
  | "ready"
  | "failed";

export interface AgentState {
  step: Step;
  /** The step that failed, when `step` is "failed". */
  failedAt?: Step;
  info?: BridgeInfo;
  client?: Agent86Client;
  session?: AgentSession;
  error?: string;
}

function openSocket(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.addEventListener("open", () => resolve(socket), { once: true });
    socket.addEventListener(
      "close",
      () =>
        reject(
          new Error(
            "The bridge refused the connection. If agent86-web was restarted, open its new link.",
          ),
        ),
      { once: true },
    );
  });
}

export function useAgent(): AgentState & { restart: () => void } {
  const [state, setState] = useState<AgentState>({ step: "signing-in" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let client: Agent86Client | undefined;
    let socket: WebSocket | undefined;
    const update = (next: Partial<AgentState>) => {
      if (!cancelled) setState((prev) => ({ ...prev, ...next }));
    };

    let current: Step = "signing-in";
    const advance = (step: Step, next: Partial<AgentState> = {}) => {
      current = step;
      update({ ...next, step });
    };

    void (async () => {
      try {
        advance("signing-in", {
          error: undefined,
          failedAt: undefined,
          client: undefined,
          session: undefined,
        });
        await signIn();
        advance("reading-info");
        const info = await getInfo();
        advance("connecting", { info });
        socket = await openSocket(acpUrl(newThreadId(), info.defaultWorkspace));
        if (cancelled) return socket.close(1000, "page closed");
        advance("initializing");
        client = await Agent86Client.connect(webSocketStream(socket));
        if (cancelled) return client.close();
        if (!client.compatibility.ok) {
          update({
            client,
            step: "failed",
            failedAt: current,
            error: client.compatibility.problems.join(" "),
          });
          return;
        }
        advance("starting-session", { client });
        const session = await client.newSession(info.defaultWorkspace);
        update({ session, step: "ready" });
      } catch (error) {
        update({
          step: "failed",
          failedAt: current,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })();

    return () => {
      cancelled = true;
      client?.close();
      socket?.close(1000, "page closed");
    };
  }, [attempt]);

  const restart = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, restart };
}
