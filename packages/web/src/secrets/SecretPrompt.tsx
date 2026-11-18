import type { PendingSecret } from "@agent86-web/acp-client";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { SecretInput, takeValue } from "./SecretInput.tsx";

/** The masked entry's id, so the approval inbox can bring it to the front. */
export const SECRET_PROMPT_INPUT = "secret-prompt-input";

/** Focus the open secret prompt, if there is one. */
export function focusSecretPrompt(): void {
  document.getElementById(SECRET_PROMPT_INPUT)?.focus();
}

/**
 * The model asks for a secret (agent86 1.0.23's `secret/request`): a masked entry over the
 * conversation (Stop and the approval inbox stay in reach).
 * agent86-web promised agent86 that what is typed here stays out of the thread, the browser's
 * history and storage, and its logs, so the input is uncontrolled (the value is never React
 * state), read once when sent, and cleared at once. Enter sends; Decline, Esc, and the close button
 * decline, and so does anything else that ends the request (Stop, the turn ending, the connection
 * closing), which the session handles.
 */
export function SecretPrompt({
  request,
  onEnter,
  onDecline,
}: {
  request: PendingSecret;
  onEnter: (value: string, remember: boolean) => void;
  onDecline: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [remember, setRemember] = useState(request.remembered);
  const [empty, setEmpty] = useState(false);

  useEffect(() => {
    input.current?.focus();
  }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = takeValue(input.current);
    if (!value) {
      setEmpty(true);
      input.current?.focus();
      return;
    }
    onEnter(value, request.canRemember && remember);
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (input.current) input.current.value = "";
      onDecline();
    }
  }

  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center overflow-y-auto bg-bg/70 p-4"
      data-testid="secret-prompt-backdrop"
    >
      <form
        role="dialog"
        aria-label={`Agent 86 asks for the secret ${request.name}`}
        onSubmit={submit}
        onKeyDown={onKeyDown}
        // Submitting is always caught (`submit`), and no field has a `name`, so even a submit the
        // page did not catch would carry no value into the URL or the browser's history.
        autoComplete="off"
        className="w-full max-w-md space-y-3 rounded-md border-2 border-warn bg-panel p-4 shadow-xl"
      >
        <div className="flex items-start gap-2">
          <span aria-hidden className="text-warn">
            🔑
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">
              Agent 86 asks for the secret{" "}
              <span className="font-mono" data-testid="secret-prompt-name">
                {request.name}
              </span>
            </h2>
            {request.reason && (
              <p className="mt-1 text-sm break-words" data-testid="secret-prompt-reason">
                {request.reason}
              </p>
            )}
          </div>
          <button
            type="button"
            aria-label="Close and decline"
            onClick={() => {
              if (input.current) input.current.value = "";
              onDecline();
            }}
            className="rounded px-1 text-muted hover:text-text"
          >
            ✕
          </button>
        </div>
        {request.replacing && (
          <p role="note" className="rounded border border-border bg-panel-2 p-2 text-xs">
            A value is already held as <span className="font-mono">{request.name}</span>; what you
            enter replaces it.
          </p>
        )}
        <SecretInput
          ref={input}
          id={SECRET_PROMPT_INPUT}
          label={`Value for ${request.name}`}
          onInput={() => setEmpty(false)}
        />
        {empty && (
          <p role="alert" className="text-xs text-error">
            Type a value, or decline.
          </p>
        )}
        {request.canRemember && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
            />
            Remember it for this project (in the OS keyring)
          </label>
        )}
        <p className="text-xs text-muted">
          The model only ever sees the name. The value goes straight to Agent 86 and is not kept in
          this thread, its history, or the logs.
          {!request.canRemember && " No keyring is available, so it is held for this session only."}
        </p>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              if (input.current) input.current.value = "";
              onDecline();
            }}
            className="rounded border border-border px-3 py-1 text-sm hover:border-error hover:text-error"
          >
            Decline
          </button>
          <button
            type="submit"
            className="rounded bg-accent px-3 py-1 text-sm font-medium text-bg hover:opacity-90"
          >
            Enter
          </button>
        </div>
      </form>
    </div>
  );
}
