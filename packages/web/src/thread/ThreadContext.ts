import type { AgentSession, PendingPermission, SubagentInfo } from "@agent86-web/acp-client";
import { createContext, useContext } from "react";

export interface ThreadContextValue {
  /** Answers permission requests; absent in tests that render only the transcript. */
  session?: AgentSession;
  permissions: PendingPermission[];
  /** Ctrl+O: show every tool card's arguments and result. */
  expandAll: boolean;
  /** The thread's workspace, so paths can be shown relative to it. */
  cwd?: string;
  /** Sub-agent runs by delegation card, when agent86 sends its state events. */
  subagents?: Record<string, SubagentInfo>;
  /** Send a prompt, as the input box does (the "continue" after an interrupted turn uses it). */
  send?: (text: string) => void;
  /** A turn is running, or the connection is closed: nothing can be sent now. */
  busy?: boolean;
}

export const ThreadContext = createContext<ThreadContextValue>({
  permissions: [],
  expandAll: false,
});

export const useThread = () => useContext(ThreadContext);
