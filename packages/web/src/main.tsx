import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { newLaunchLink } from "./api.ts";
import { readLaunchToken } from "./token.ts";
import "./styles.css";

// A new launch link opened in this tab (agent86-web restarted on the same port) changes only the
// fragment, which does not reload the page. Sign in with the new token: in place once signed in,
// so the open threads keep what they show and resume; by reloading otherwise.
window.addEventListener("hashchange", () => {
  if (readLaunchToken(window.location.hash)) newLaunchLink();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
