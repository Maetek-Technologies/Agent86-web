import { secretProblem, type AgentSession, type SecretList } from "@agent86-web/acp-client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { SecretInput, takeValue } from "./SecretInput.tsx";

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The secrets this thread's session holds (agent86 1.0.23): names only, with a badge for those
 * remembered for the project, a masked entry to add one, and forget. agent86 refuses these while a
 * turn runs, so the panel waits. A secret held for the session only is gone once agent86 restarts
 * (agent86-web stops an idle agent86), so remembering is offered when there is a keyring.
 */
export function SecretsPanel({
  session,
  busy,
  note,
  onClose,
  className = "",
}: {
  session: AgentSession;
  /** A turn is running (or the connection is closed). */
  busy: boolean;
  /** Why the panel was opened, such as a value typed after /secret in the message box. */
  note?: string;
  onClose: () => void;
  className?: string;
}) {
  const [list, setList] = useState<SecretList | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [warning, setWarning] = useState<string | undefined>(undefined);
  const [working, setWorking] = useState(false);
  const [name, setName] = useState("");
  const [remember, setRemember] = useState(false);
  const [confirming, setConfirming] = useState<string | undefined>(undefined);
  const value = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      setList(await session.listSecrets());
      setError(undefined);
    } catch (e) {
      setError(message(e));
    }
  }, [session]);

  // The list, once open and whenever a turn ends (agent86 refuses during one).
  useEffect(() => {
    if (busy) return;
    let live = true;
    session.listSecrets().then(
      (secrets) => {
        if (!live) return;
        setList(secrets);
        setError(undefined);
      },
      (e: unknown) => live && setError(message(e)),
    );
    return () => {
      live = false;
    };
  }, [session, busy]);

  async function add(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    // A bad name is reported before the value is touched, so it need not be typed again.
    const nameProblem = secretProblem(trimmed, "______");
    if (nameProblem) {
      setError(nameProblem);
      return;
    }
    // Read and clear the masked entry at once; the value is only ever in this local.
    const typed = takeValue(value.current);
    const problem = secretProblem(trimmed, typed);
    if (problem) {
      setError(problem);
      return;
    }
    setWorking(true);
    setWarning(undefined);
    try {
      const result = await session.setSecret(trimmed, typed, !!list?.canRemember && remember);
      setWarning(result.warning);
      setName("");
      setRemember(false);
      setError(undefined);
      await refresh();
    } catch (e) {
      setError(message(e));
    } finally {
      setWorking(false);
    }
  }

  async function forget(target: string) {
    setConfirming(undefined);
    setWorking(true);
    setWarning(undefined);
    try {
      const result = await session.forgetSecret(target);
      setWarning(result.warning ?? (result.forgotten ? undefined : `${target} was not held.`));
      setError(undefined);
      await refresh();
    } catch (e) {
      setError(message(e));
    } finally {
      setWorking(false);
    }
  }

  const disabled = busy || working;

  return (
    <aside
      aria-label="Secrets"
      data-testid="secrets-panel"
      className={`bg-panel text-sm ${className}`}
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2 font-semibold">
        <span aria-hidden>🔑</span>
        <span>Secrets</span>
        <button
          type="button"
          aria-label="Close secrets"
          onClick={onClose}
          className="ml-auto rounded px-1 text-muted hover:text-text"
        >
          ✕
        </button>
      </div>
      <div className="space-y-3 px-3 py-2">
        {note && (
          <p role="note" className="rounded border border-warn bg-warn/10 p-2 text-xs">
            {note}
          </p>
        )}
        {busy && (
          <p className="text-xs text-muted" data-testid="secrets-busy">
            agent86 is busy with a turn; secrets can be changed when it ends.
          </p>
        )}
        <p className="text-xs text-muted">
          The model sees only the names: it uses a secret as{" "}
          <span className="font-mono">$NAME</span> in commands and{" "}
          <span className="font-mono">{"${secret:NAME}"}</span> in files, and anything that would
          show the value shows that placeholder.
        </p>
        {list && list.secrets.length === 0 && (
          <p className="text-xs text-muted">This session holds no secrets.</p>
        )}
        {list && list.secrets.length > 0 && (
          <ul
            className="divide-y divide-border rounded border border-border"
            data-testid="secrets-list"
          >
            {list.secrets.map((secret) => (
              <li
                key={secret.name}
                data-testid="secret-item"
                data-name={secret.name}
                className="flex flex-wrap items-center gap-2 px-2 py-1.5"
              >
                <span className="font-mono">{secret.name}</span>
                {secret.remembered && (
                  <span
                    className="rounded bg-accent/20 px-1.5 text-xs text-accent"
                    title="Kept in the OS keyring for this project, so later sessions have it"
                  >
                    remembered
                  </span>
                )}
                {confirming === secret.name ? (
                  <span
                    role="alertdialog"
                    aria-label={`Forget ${secret.name}?`}
                    className="ml-auto flex items-center gap-1 text-xs"
                  >
                    Forget{secret.remembered ? " (and remove from the keyring)" : ""}?
                    <button
                      type="button"
                      onClick={() => setConfirming(undefined)}
                      className="rounded border border-border px-1.5 hover:border-accent"
                    >
                      Keep
                    </button>
                    <button
                      type="button"
                      onClick={() => void forget(secret.name)}
                      className="rounded border border-error px-1.5 text-error hover:bg-error/10"
                    >
                      Forget
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => setConfirming(secret.name)}
                    className="ml-auto rounded px-1.5 text-xs text-muted hover:text-error disabled:opacity-50"
                  >
                    forget
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <form
          onSubmit={(event) => void add(event)}
          autoComplete="off"
          className="space-y-2"
          aria-label="Add a secret"
        >
          <input
            aria-label="Secret name"
            placeholder="NAME (e.g. STRIPE_KEY)"
            value={name}
            disabled={disabled}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => setName(event.target.value)}
            className="w-full rounded border border-border bg-panel-2 px-2 py-1 font-mono text-sm disabled:opacity-50"
          />
          <SecretInput
            ref={value}
            id="secrets-panel-value"
            label="Secret value"
            disabled={disabled}
          />
          {list?.canRemember && (
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={remember}
                disabled={disabled}
                onChange={(event) => setRemember(event.target.checked)}
              />
              Remember it for this project (in the OS keyring)
            </label>
          )}
          <button
            type="submit"
            disabled={disabled || !name.trim()}
            className="rounded bg-accent px-3 py-1 text-xs font-medium text-bg hover:opacity-90 disabled:opacity-50"
          >
            Set secret
          </button>
          {list && !list.canRemember && (
            <p className="text-xs text-muted">
              No keyring is available: a secret is held for this session only, and is gone when
              agent86 restarts.
            </p>
          )}
          {list?.canRemember && (
            <p className="text-xs text-muted">
              Not remembered, a secret is held for this session only and is gone when agent86
              restarts (agent86-web stops an idle agent86). Setting a remembered name again without
              remembering takes it out of the keyring.
            </p>
          )}
        </form>
        {warning && (
          <p
            role="status"
            data-testid="secrets-warning"
            className="rounded border border-warn bg-warn/10 p-2 text-xs"
          >
            {warning}
          </p>
        )}
        {error && (
          <p role="alert" className="text-xs text-error">
            {error}
          </p>
        )}
      </div>
    </aside>
  );
}
