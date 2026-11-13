import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { compareVersions } from "@agent86-web/acp-client";
import { shutdown, type BridgeInfo } from "./api.ts";
import { Sidebar } from "./shell/Sidebar.tsx";
import { Tabs } from "./shell/Tabs.tsx";
import { useBridge } from "./shell/useBridge.ts";
import { WorkspacePicker } from "./shell/WorkspacePicker.tsx";
import { ThreadManager } from "./threads/manager.ts";
import {
  KEYS,
  load,
  loadPreferences,
  loadSidebar,
  save,
  savePreferences,
  saveSidebar,
  type ModePreference,
  type SidebarLayout,
} from "./threads/storage.ts";
import { ThreadView } from "./threads/ThreadView.tsx";
import { TrustedProjects } from "./trust/TrustedProjects.tsx";

function CopyText({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title={`Copy ${label}`}
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="rounded px-1 font-mono hover:bg-panel-2"
    >
      {copied ? "copied" : text}
    </button>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-4 py-1 text-sm">
      <dt className="w-44 shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 break-all font-mono">{children}</dd>
    </div>
  );
}

/** Newer releases, with how to install them (the bridge checks npm once a day). */
function UpdateNotes({ info }: { info: BridgeInfo }) {
  const updates = info.updates ?? {};
  const notes = [
    updates.agent86 && {
      name: "agent86",
      version: updates.agent86,
      command: "npm install -g agent86@latest",
    },
    updates.agent86Web && {
      name: "agent86-web",
      version: updates.agent86Web,
      command: "npm install -g agent86-web@latest",
    },
  ].filter(Boolean) as { name: string; version: string; command: string }[];
  if (notes.length === 0) return null;
  return (
    <section
      aria-label="Updates"
      className="mt-4 rounded border border-accent/50 bg-panel p-3 text-sm"
    >
      {notes.map((note) => (
        <p key={note.name}>
          {note.name} {note.version} is available:{" "}
          <code className="rounded bg-panel-2 px-1 font-mono text-xs">{note.command}</code>
        </p>
      ))}
    </section>
  );
}

/** agent86 1.0.17 added `/rename` and per-directory session lists. */
const RENAME_VERSION = "1.0.17";

const MODE_CHOICES: { value: ModePreference; label: string }[] = [
  { value: "default", label: "agent86's default" },
  { value: "ask", label: "ask: confirm each change" },
  { value: "auto", label: "auto: run without asking" },
  { value: "deny", label: "deny: refuse changes" },
];

/** Per-browser settings: the approval mode new threads start in. */
function Settings() {
  const [prefs, setPrefs] = useState(loadPreferences);
  const [confirmAuto, setConfirmAuto] = useState(false);
  const choose = (mode: ModePreference) => {
    const next = { ...prefs, mode };
    setPrefs(next);
    savePreferences(next);
  };
  return (
    <section aria-label="Settings" className="mt-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">Settings</h3>
      <label className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 py-1 text-sm">
        <span className="w-44 shrink-0 text-muted">Approval mode for new threads</span>
        <select
          value={prefs.mode}
          onChange={(event) => {
            const mode = event.target.value as ModePreference;
            if (mode === "auto") setConfirmAuto(true);
            else {
              setConfirmAuto(false);
              choose(mode);
            }
          }}
          className="rounded border border-border bg-panel px-1.5 py-0.5 font-mono text-xs"
        >
          {MODE_CHOICES.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
      </label>
      {confirmAuto && (
        <div
          role="alertdialog"
          aria-label="Confirm auto mode"
          className="mt-1 rounded border border-warn bg-warn/10 p-2 text-sm"
        >
          <p>
            In <span className="font-mono">auto</span> mode, agent86 edits files and runs commands
            without asking. Every thread you open for the first time in this browser will start that
            way.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              autoFocus
              onClick={() => setConfirmAuto(false)}
              className="rounded border border-border px-2 py-0.5 hover:border-accent"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmAuto(false);
                choose("auto");
              }}
              className="rounded border border-warn px-2 py-0.5 font-medium text-warn hover:bg-warn/10"
            >
              Use auto
            </button>
          </div>
        </div>
      )}
      <p className="text-xs text-muted">
        Applied once, when a thread is first opened here. Change a thread's mode in its header.
      </p>
    </section>
  );
}

function Details({ info, onClose }: { info: BridgeInfo; onClose: () => void }) {
  const old = compareVersions(info.agent86.version, RENAME_VERSION) < 0;
  return (
    <div className="border-b border-border bg-panel-2">
      <div className="mx-auto max-w-3xl px-4 py-4">
        <div className="mb-2 flex items-center">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            Settings &amp; about
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto text-sm text-muted hover:text-text"
          >
            Close
          </button>
        </div>
        <dl>
          <Row label="agent86">{info.agent86.version}</Row>
          <Row label="agent86 command">{info.agent86.command}</Row>
          <Row label="agent86-web">{info.bridge.version}</Row>
          <Row label="Allowed roots">{info.roots.join(", ")}</Row>
        </dl>
        {old && (
          <p className="mt-2 text-sm text-muted">
            agent86 {RENAME_VERSION} or later keeps thread names you give here, and lists each
            workspace's own sessions. With {info.agent86.version}, names stay in this browser and
            sessions started at a terminal are listed under every workspace.
          </p>
        )}
        <UpdateNotes info={info} />
        <Settings />
        <TrustedProjects />
        <p className="mt-3 text-xs text-muted">
          agent86-web, a browser interface for{" "}
          <a
            className="underline"
            href="https://github.com/Maetek-Technologies/agent86"
            target="_blank"
            rel="noopener noreferrer"
          >
            agent86
          </a>
          . © 2026 Maetek Technologies.
        </p>
      </div>
    </div>
  );
}

function Header({
  info,
  sessionId,
  onShowDetails,
  onQuit,
}: {
  info: BridgeInfo | undefined;
  sessionId: string | undefined;
  onShowDetails: () => void;
  onQuit?: () => void;
}) {
  return (
    <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-border bg-panel px-4">
      <img src="/agent86-logo.png" alt="" width={32} height={32} className="rounded-full" />
      <div className="font-mono text-lg font-bold tracking-widest">
        AGENT86{" "}
        <span className="font-sans text-sm font-normal tracking-normal text-muted">web</span>
      </div>
      <div className="ml-auto flex min-w-0 items-center gap-3 text-xs text-muted">
        {sessionId && (
          <span
            className="hidden truncate sm:inline"
            title={`Continue at a terminal: agent86 --resume ${sessionId}`}
          >
            session <CopyText text={sessionId} label="session id" />
          </span>
        )}
        {info && (
          <button type="button" onClick={onShowDetails} className="font-mono hover:text-text">
            agent86 {info.agent86.version}
            {(info.updates?.agent86 || info.updates?.agent86Web) && (
              <span className="ml-1.5 rounded bg-accent px-1 font-sans text-[10px] font-semibold text-bg">
                update
              </span>
            )}
          </button>
        )}
        {onQuit && (
          <button
            type="button"
            onClick={onQuit}
            aria-label="Quit agent86-web"
            title="Quit agent86-web"
            className="rounded px-1.5 py-0.5 text-base leading-none hover:bg-panel-2 hover:text-error"
          >
            ⏻
          </button>
        )}
      </div>
    </header>
  );
}

/** Confirm stopping agent86-web, saying what is still going on. */
function QuitDialog({
  working,
  waiting,
  onCancel,
  onQuit,
}: {
  working: number;
  waiting: number;
  onCancel: () => void;
  onQuit: () => Promise<void>;
}) {
  const [error, setError] = useState<string | undefined>(undefined);
  const [stopping, setStopping] = useState(false);
  const busy = [
    working > 0 && `${working} thread${working === 1 ? " is" : "s are"} working`,
    waiting > 0 && `${waiting} thread${waiting === 1 ? " is" : "s are"} waiting for your approval`,
  ].filter(Boolean);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/70 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="quit-title"
        onKeyDown={(event) => event.key === "Escape" && onCancel()}
        className="w-full max-w-md rounded-lg border border-border bg-panel p-4 shadow-xl"
      >
        <h2 id="quit-title" className="font-semibold">
          Quit agent86-web?
        </h2>
        <p className="mt-2 text-sm text-muted">
          This stops agent86-web and every agent86 it started. Your sessions are saved; run
          agent86-web again to come back to them.
        </p>
        {busy.length > 0 && (
          <p className="mt-2 text-sm text-warn">
            {busy.join(", and ")}. Quitting stops {working + waiting === 1 ? "it" : "them"}.
          </p>
        )}
        {error && (
          <p role="alert" className="mt-2 text-sm text-error">
            {error}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            autoFocus
            onClick={onCancel}
            className="rounded border border-border px-3 py-1 text-sm hover:border-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={stopping}
            onClick={() => {
              setStopping(true);
              setError(undefined);
              onQuit().catch((e: unknown) => {
                setStopping(false);
                setError(e instanceof Error ? e.message : String(e));
              });
            }}
            className="rounded border border-error px-3 py-1 text-sm font-medium text-error hover:bg-error/10 disabled:opacity-50"
          >
            {stopping ? "Quitting…" : "Quit"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Shown once agent86-web has stopped and the browser would not let the page close its tab. */
function Stopped() {
  return (
    <div className="min-h-screen">
      <Header info={undefined} sessionId={undefined} onShowDetails={() => undefined} />
      <main className="mx-auto max-w-2xl px-4 py-16 text-center">
        <img
          src="/agent86-logo.png"
          alt=""
          width={96}
          height={96}
          className="mx-auto mb-4 rounded-full"
        />
        <h1 className="text-xl font-semibold">agent86-web has stopped</h1>
        <p className="mt-2 text-sm text-muted">
          You can close this tab. Run <span className="font-mono">agent86-web</span> again to
          continue; your sessions are saved.
        </p>
      </main>
    </div>
  );
}

/** Tells the app's other tabs that agent86-web was stopped from this one. */
const CHANNEL = "agent86-web";

function Home({
  info,
  onNew,
  onChoose,
}: {
  info: BridgeInfo;
  onNew: (workspace: string) => void;
  onChoose: () => void;
}) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center">
      <img
        src="/agent86-logo.png"
        alt=""
        width={96}
        height={96}
        className="mx-auto mb-4 rounded-full"
      />
      <h1 className="text-xl font-semibold">What should agent86 work on?</h1>
      <p className="mt-2 text-sm text-muted">
        Start a thread in a workspace, or reopen a saved session from the list. Sessions started at
        a terminal are listed too.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={() => onNew(info.defaultWorkspace)}
          className="rounded bg-accent px-4 py-2 font-medium text-bg"
        >
          New thread in {info.defaultWorkspace.split(/[\\/]/).pop() || info.defaultWorkspace}
        </button>
        <button
          type="button"
          onClick={onChoose}
          className="rounded border border-border px-4 py-2 hover:border-accent"
        >
          Choose a workspace…
        </button>
      </div>
    </div>
  );
}

/** The signed-in app: sessions on the left, open threads in tabs (docs/UI_DESIGN.md §2). */
function Shell({ info, onStopped }: { info: BridgeInfo; onStopped: () => void }) {
  const manager = useMemo(() => new ThreadManager(), []);
  const snapshot = useSyncExternalStore(manager.subscribe, manager.getSnapshot);
  const [picking, setPicking] = useState(false);
  const [details, setDetails] = useState(false);
  const [quitting, setQuitting] = useState(false);
  const [layout, setLayout] = useState(loadSidebar);
  const changeLayout = useCallback((next: Partial<SidebarLayout>) => {
    setLayout((current) => {
      const updated = { ...current, ...next };
      saveSidebar(updated);
      return updated;
    });
  }, []);
  const [refresh, setRefresh] = useState(0);
  const [recent, setRecent] = useState<string[]>(() =>
    load<string[]>(KEYS.workspaces, []).filter((w) =>
      info.roots.some((root) => w === root || w.startsWith(root)),
    ),
  );

  useEffect(() => {
    manager.restore();
    return () => manager.closeAll();
  }, [manager]);

  const remember = useCallback((workspace: string) => {
    setRecent((list) => {
      const next = [workspace, ...list.filter((w) => w !== workspace)].slice(0, 8);
      save(KEYS.workspaces, next);
      return next;
    });
  }, []);

  const active = snapshot.threads.find((t) => t.meta.id === snapshot.activeId);
  const currentWorkspace = active?.meta.workspace ?? recent[0] ?? info.defaultWorkspace;
  const openNew = useCallback(
    (workspace: string) => {
      remember(workspace);
      manager.openNew(workspace);
    },
    [manager, remember],
  );

  // Alt+N: a new thread in the current workspace.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        openNew(currentWorkspace);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openNew, currentWorkspace]);

  const workspaces = useMemo(() => {
    const list = [
      ...new Set([
        ...snapshot.threads.map((t) => t.meta.workspace),
        ...recent,
        info.defaultWorkspace,
      ]),
    ];
    return list;
  }, [snapshot.threads, recent, info.defaultWorkspace]);
  const openSessionIds = useMemo(
    () => new Set(snapshot.threads.map((t) => t.meta.sessionId).filter(Boolean) as string[]),
    [snapshot.threads],
  );

  /** Threads with a turn running, and threads waiting for an approval, for the quit dialog. */
  const activity = () => {
    let working = 0;
    let waiting = 0;
    for (const thread of snapshot.threads) {
      const state = thread.session?.getState();
      if (state?.permissions.length) waiting++;
      else if (state?.turn.running) working++;
    }
    return { working, waiting };
  };

  const quit = async () => {
    await shutdown();
    manager.closeAll();
    try {
      new BroadcastChannel(CHANNEL).postMessage("stopped");
    } catch {
      // Other tabs find out when their connections fail.
    }
    // Allowed for the tab agent86-web opened (one history entry); otherwise the page says so.
    window.close();
    onStopped();
  };

  return (
    <div className="flex h-screen flex-col">
      <Header
        info={info}
        sessionId={active?.meta.sessionId}
        onShowDetails={() => setDetails((d) => !d)}
        onQuit={() => setQuitting(true)}
      />
      {details && <Details info={info} onClose={() => setDetails(false)} />}
      <div className="flex min-h-0 flex-1">
        {layout.shown && (
          <Sidebar
            workspaces={workspaces}
            openSessionIds={openSessionIds}
            refresh={refresh}
            width={layout.width}
            onResize={(width) => changeLayout({ width })}
            onOpen={(workspace, s, title) => {
              remember(workspace);
              manager.openSession(workspace, s.sessionId, title);
            }}
            onRename={(sessionId, title) => manager.renameSession(sessionId, title)}
            onNew={openNew}
            onChooseWorkspace={() => setPicking(true)}
          />
        )}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-stretch">
            <button
              type="button"
              onClick={() => changeLayout({ shown: !layout.shown })}
              aria-label={layout.shown ? "Hide sessions" : "Show sessions"}
              className="border-r border-b border-border bg-panel px-2 text-muted hover:text-text"
            >
              {layout.shown ? "‹" : "›"}
            </button>
            <div className="min-w-0 flex-1">
              <Tabs
                threads={snapshot.threads}
                activeId={snapshot.activeId}
                onActivate={(id) => manager.activate(id)}
                onClose={(id) => manager.closeThread(id)}
                onRename={(id, title) => manager.rename(id, title)}
                onNew={() => openNew(currentWorkspace)}
              />
            </div>
          </div>
          <div className="min-h-0 flex-1">
            {snapshot.threads.length === 0 && (
              <Home info={info} onNew={openNew} onChoose={() => setPicking(true)} />
            )}
            {snapshot.threads.map((thread) => {
              const handle = manager.handle(thread.meta.id);
              if (!handle) return null;
              const isActive = thread.meta.id === snapshot.activeId;
              return (
                <div
                  key={thread.meta.id}
                  className={isActive ? "h-full" : "hidden"}
                  role="tabpanel"
                  aria-label={thread.meta.title}
                >
                  <ThreadView
                    thread={thread}
                    handle={handle}
                    active={isActive}
                    onSessionsChanged={() => setRefresh((n) => n + 1)}
                  />
                </div>
              );
            })}
          </div>
        </main>
      </div>
      {picking && (
        <WorkspacePicker
          initial={currentWorkspace}
          onCancel={() => setPicking(false)}
          onChoose={(path) => {
            setPicking(false);
            openNew(path);
          }}
        />
      )}
      {quitting && <QuitDialog {...activity()} onCancel={() => setQuitting(false)} onQuit={quit} />}
    </div>
  );
}

export function App() {
  const bridge = useBridge();
  const [stopped, setStopped] = useState(false);
  useEffect(() => {
    let channel: BroadcastChannel | undefined;
    try {
      channel = new BroadcastChannel(CHANNEL);
      channel.onmessage = (event) => event.data === "stopped" && setStopped(true);
    } catch {
      // No BroadcastChannel: this tab learns from its failing connections.
    }
    return () => channel?.close();
  }, []);
  if (stopped) return <Stopped />;
  if (bridge.status === "ready")
    return <Shell info={bridge.info} onStopped={() => setStopped(true)} />;
  return (
    <div className="min-h-screen">
      <Header info={undefined} sessionId={undefined} onShowDetails={() => undefined} />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <section className="rounded-lg border border-border bg-panel p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
            Connecting
          </h2>
          {bridge.status === "failed" ? (
            <div role="alert" className="space-y-3">
              <p className="text-error">{bridge.error}</p>
              <button
                type="button"
                onClick={bridge.retry}
                className="rounded border border-border bg-panel-2 px-3 py-1 text-sm hover:border-accent"
              >
                Try again
              </button>
            </div>
          ) : (
            <p className="text-sm text-muted">Signing in to the bridge…</p>
          )}
        </section>
      </main>
    </div>
  );
}
