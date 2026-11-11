import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { BridgeInfo } from "./api.ts";
import { Sidebar } from "./shell/Sidebar.tsx";
import { Tabs } from "./shell/Tabs.tsx";
import { useBridge } from "./shell/useBridge.ts";
import { WorkspacePicker } from "./shell/WorkspacePicker.tsx";
import { ThreadManager } from "./threads/manager.ts";
import { KEYS, load, save } from "./threads/storage.ts";
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

function Details({ info, onClose }: { info: BridgeInfo; onClose: () => void }) {
  return (
    <div className="border-b border-border bg-panel-2">
      <div className="mx-auto max-w-3xl px-4 py-4">
        <div className="mb-2 flex items-center">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">About</h2>
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
        <TrustedProjects />
        <p className="mt-3 text-xs text-muted">
          A browser interface for{" "}
          <a
            className="underline"
            href="https://github.com/Maetek-Technologies/agent86"
            target="_blank"
            rel="noopener noreferrer"
          >
            agent86
          </a>{" "}
          by Maetek Technologies.
        </p>
      </div>
    </div>
  );
}

function Header({
  info,
  sessionId,
  onShowDetails,
}: {
  info: BridgeInfo | undefined;
  sessionId: string | undefined;
  onShowDetails: () => void;
}) {
  return (
    <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-border bg-panel px-4">
      <img src="/agent86-logo.png" alt="" width={32} height={32} className="rounded-full" />
      <div className="font-mono text-lg font-bold tracking-widest">
        AGENT 86{" "}
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
          </button>
        )}
      </div>
    </header>
  );
}

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
function Shell({ info }: { info: BridgeInfo }) {
  const manager = useMemo(() => new ThreadManager(), []);
  const snapshot = useSyncExternalStore(manager.subscribe, manager.getSnapshot);
  const [picking, setPicking] = useState(false);
  const [details, setDetails] = useState(false);
  const [sidebar, setSidebar] = useState(true);
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

  return (
    <div className="flex h-screen flex-col">
      <Header
        info={info}
        sessionId={active?.meta.sessionId}
        onShowDetails={() => setDetails((d) => !d)}
      />
      {details && <Details info={info} onClose={() => setDetails(false)} />}
      <div className="flex min-h-0 flex-1">
        {sidebar && (
          <Sidebar
            workspaces={workspaces}
            openSessionIds={openSessionIds}
            refresh={refresh}
            onOpen={(workspace, s) => {
              remember(workspace);
              manager.openSession(workspace, s.sessionId, s.title || s.sessionId);
            }}
            onNew={openNew}
            onChooseWorkspace={() => setPicking(true)}
          />
        )}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-stretch">
            <button
              type="button"
              onClick={() => setSidebar((v) => !v)}
              aria-label={sidebar ? "Hide sessions" : "Show sessions"}
              className="border-r border-b border-border bg-panel px-2 text-muted hover:text-text"
            >
              {sidebar ? "‹" : "›"}
            </button>
            <div className="min-w-0 flex-1">
              <Tabs
                threads={snapshot.threads}
                activeId={snapshot.activeId}
                onActivate={(id) => manager.activate(id)}
                onClose={(id) => manager.closeThread(id)}
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
    </div>
  );
}

export function App() {
  const bridge = useBridge();
  if (bridge.status === "ready") return <Shell info={bridge.info} />;
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
