import type { AgentSession, PendingPermission } from "@agent86-web/acp-client";
import { createContext, useContext } from "react";

export interface ThreadContextValue {
  /** Answers permission requests; absent in tests that render only the transcript. */
  session?: AgentSession;
  permissions: PendingPermission[];
  /** Ctrl+O: show every tool card's arguments and result. */
  expandAll: boolean;
}

export const ThreadContext = createContext<ThreadContextValue>({
  permissions: [],
  expandAll: false,
});

export const useThread = () => useContext(ThreadContext);
