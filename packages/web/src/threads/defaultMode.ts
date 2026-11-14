// The approval mode new threads start in, kept by the bridge (~/.agent86-web/settings.json).
import { createContext, useContext } from "react";

export interface DefaultModeValue {
  /** The chosen default; undefined leaves it to agent86 (`[guardrails] approval`, else ask). */
  mode: string | undefined;
  /** Save a new default (`null`: agent86's own). Absent where it cannot be changed. */
  set?: (mode: string | null) => Promise<void>;
}

export const DefaultModeContext = createContext<DefaultModeValue>({ mode: undefined });

export const useDefaultMode = () => useContext(DefaultModeContext);
