import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { readLaunchToken } from "./token.ts";
import "./styles.css";

// A new launch link opened in this tab (agent86-web restarted on the same port) changes only the
// fragment, which does not reload the page. Reload, so the page signs in with the new token.
window.addEventListener("hashchange", () => {
  if (readLaunchToken(window.location.hash)) window.location.reload();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
