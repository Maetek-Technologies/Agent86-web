// Milestone M1: sign in, read the bridge's info, open one thread's ACP channel, and initialize.
import { connectAndInitialize, webSocketStream, type Handshake } from "@agent86-web/acp-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { acpUrl, getInfo, signIn, type BridgeInfo } from "./api.ts";
import { newThreadId } from "./token.ts";

export type Step =
  "signing-in" | "reading-info" | "connecting" | "initializing" | "ready" | "failed";

export interface HandshakeState {
  step: Step;
  info?: BridgeInfo;
  handshake?: Pick<Handshake, "init" | "compatibility">;
  error?: string;
  closed?: string;
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

export function useHandshake(): HandshakeState & { retry: () => void } {
  const [state, setState] = useState<HandshakeState>({ step: "signing-in" });
  const [attempt, setAttempt] = useState(0);
  const socketRef = useRef<WebSocket | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const update = (next: Partial<HandshakeState>) => {
      if (!cancelled) setState((prev) => ({ ...prev, ...next }));
    };

    void (async () => {
      try {
        update({ step: "signing-in", error: undefined, closed: undefined, handshake: undefined });
        await signIn();
        update({ step: "reading-info" });
        const info = await getInfo();
        update({ info, step: "connecting" });
        const socket = await openSocket(acpUrl(newThreadId(), info.defaultWorkspace));
        if (cancelled) {
          socket.close(1000, "page closed");
          return;
        }
        socketRef.current = socket;
        socket.addEventListener("close", (event) =>
          update({ closed: event.reason || `The connection closed (code ${event.code}).` }),
        );
        update({ step: "initializing" });
        const { init, compatibility } = await connectAndInitialize(webSocketStream(socket));
        update({ step: "ready", handshake: { init, compatibility } });
      } catch (error) {
        update({ step: "failed", error: error instanceof Error ? error.message : String(error) });
      }
    })();

    return () => {
      cancelled = true;
      socketRef.current?.close(1000, "page closed");
      socketRef.current = undefined;
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, retry };
}
