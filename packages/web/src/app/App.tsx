import { useCallback, useEffect, useRef, useState } from "react";
import type { HubBlockAction } from "@mac/shared";
import { invokeMessage, postMessageAction, streamEchoMessage } from "../api/endpoints";
import { mentionSuggestion, parseMentions } from "../chat/mention";
import { ChatPanel } from "../components/ChatPanel";
import { EvidencePanel } from "../components/EvidencePanel";
import { MissionBoard } from "../components/MissionBoard";
import { SkillsPanel } from "../components/SkillsPanel";
import { ToolsPanel } from "../components/ToolsPanel";
import { ThreadSidebar } from "../components/ThreadSidebar";
import { WriteLanesPanel } from "../components/WriteLanesPanel";
import { useThreadSocket } from "../hooks/useThreadSocket";
import { useWorkspaceData } from "../hooks/useWorkspaceData";

/**
 * Chat shell: wires workspace data, WS bubbles, Mission Hub, skills/tools/Hub-actions.
 * Composition root only — HTTP/WS/routing live in api/ + hooks/ + shared.
 */
export function App() {
  const {
    health,
    cats,
    threads,
    skills,
    skillsBudget,
    selectedSkillId,
    selectedSkillBody,
    selectSkill,
    tools,
    toolAspects,
    selectedToolId,
    selectTool,
    bulletin,
    createMissionFeature,
    advanceMissionFeature,
    bindMissionThread,
    evidenceList,
    evidenceSearchHits,
    refreshEvidence,
    searchEvidenceCue,
    writeEvidence,
    laneDispositions,
    writeLaneProposal,
    activeId,
    setActiveId,
    title,
    setTitle,
    error,
    setError,
    refreshThreads,
    createThread,
    setDefaultCat,
  } = useWorkspaceData();

  const onWsError = useCallback((message: string) => setError(message), [setError]);
  const { messages, wsState } = useThreadSocket(activeId, onWsError);

  const [draft, setDraft] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [missionBusy, setMissionBusy] = useState(false);
  const [evidenceBusy, setEvidenceBusy] = useState(false);
  const [lanesBusy, setLanesBusy] = useState(false);
  const messagesEnd = useRef<HTMLDivElement | null>(null);
  const activeThread = threads.find((t) => t.id === activeId) ?? null;

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /**
   * Insert `@defaultCat ` at the start of the composer when it does not already
   * begin with a mention. Used by the ChatPanel "@" button.
   */
  function insertMention(): void {
    const cat =
      cats.find((c) => c.id === activeThread?.defaultCatId) ?? cats[0] ?? null;
    const prefix = mentionSuggestion(cat);
    if (!prefix) return;
    setDraft((prev) => (prev.startsWith("@") ? prev : `${prefix}${prev}`));
  }

  /**
   * Write back a Hub block action (checklist toggle / decision) for the active thread.
   * @param messageId - Message owning the block
   * @param action - HubBlockAction payload
   */
  async function handleBlockAction(messageId: string, action: HubBlockAction): Promise<void> {
    if (!activeId) return;
    setActionBusy(true);
    setError(null);
    try {
      await postMessageAction(activeId, messageId, action);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionBusy(false);
    }
  }

  /**
   * Send the composer draft: echo streams locally, invoke uses server @mention routing.
   * @param mode - `invoke` runs agent(s); `echo` is the stream demo without an agent
   */
  async function sendMessage(mode: "invoke" | "echo"): Promise<void> {
    if (!activeId || !draft.trim()) return;
    setError(null);

    try {
      if (mode === "echo") {
        await streamEchoMessage(activeId, draft.trim());
        setDraft("");
        await refreshThreads();
        return;
      }

      const preview = parseMentions(draft, cats);
      if (preview.unresolved.length > 0) {
        setError(`Unknown mention: @${preview.unresolved[0]}`);
        return;
      }
      if (preview.targets.length > 0 && !preview.prompt.trim()) {
        setError("Add a message after @cat (e.g. @architect @reviewer design the API)");
        return;
      }

      await invokeMessage(activeId, draft.trim());
      setDraft("");
      await refreshThreads();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <main className="shell app">
      <header className="top">
        <p className="brand">Multi-Agent Cooperation</p>
        <h1 className="page-title">Chat</h1>
        <p className="lede tight">
          Wave 4 — evidence + write lanes (decision / profile / event) with conflict disposition.
        </p>
        <p className="meta">
          health:{" "}
          {health
            ? `${health.status}/${health.store}${health.agent ? `/${health.agent}` : ""}`
            : "…"}{" "}
          · cats: {cats.length} · skills: {skills.length} · tools: {tools.length}
          {bulletin
            ? ` · features: ${bulletin.columns.reduce((n, c) => n + c.features.length, 0)}`
            : ""}
          {` · evidence: ${evidenceList.length}`}
        </p>
        {error ? <p className="err">{error}</p> : null}
      </header>

      <MissionBoard
        bulletin={bulletin}
        cats={cats}
        activeThreadId={activeId}
        busy={missionBusy}
        onCreate={async (input) => {
          setMissionBusy(true);
          try {
            await createMissionFeature(input);
          } finally {
            setMissionBusy(false);
          }
        }}
        onAdvance={async (id, stage) => {
          setMissionBusy(true);
          try {
            await advanceMissionFeature(id, stage);
          } finally {
            setMissionBusy(false);
          }
        }}
        onBindThread={async (id) => {
          setMissionBusy(true);
          try {
            await bindMissionThread(id);
          } finally {
            setMissionBusy(false);
          }
        }}
      />

      <div className="layout layout-with-skills">
        <ThreadSidebar
          threads={threads}
          cats={cats}
          activeId={activeId}
          title={title}
          onTitleChange={setTitle}
          onCreate={() => void createThread()}
          onSelect={setActiveId}
        />

        {!activeThread ? (
          <section className="chat">
            <p className="muted empty">Select or create a thread to start chatting.</p>
          </section>
        ) : (
          <ChatPanel
            thread={activeThread}
            cats={cats}
            messages={messages}
            draft={draft}
            wsState={wsState}
            messagesEndRef={messagesEnd}
            onDraftChange={setDraft}
            onDefaultCatChange={(id) => void setDefaultCat(id)}
            onInsertMention={insertMention}
            onSend={() => void sendMessage("invoke")}
            onEcho={() => void sendMessage("echo")}
            onBlockAction={(id, action) => void handleBlockAction(id, action)}
            actionBusy={actionBusy}
          />
        )}

        <div className="catalog-rail">
          <EvidencePanel
            evidence={evidenceList}
            searchHits={evidenceSearchHits}
            busy={evidenceBusy}
            onRefresh={async () => {
              setEvidenceBusy(true);
              try {
                await refreshEvidence();
              } finally {
                setEvidenceBusy(false);
              }
            }}
            onSearch={async (q) => {
              setEvidenceBusy(true);
              try {
                await searchEvidenceCue(q);
              } finally {
                setEvidenceBusy(false);
              }
            }}
            onCreate={async (input) => {
              setEvidenceBusy(true);
              try {
                await writeEvidence(input);
              } finally {
                setEvidenceBusy(false);
              }
            }}
          />
          <WriteLanesPanel
            dispositions={laneDispositions}
            busy={lanesBusy}
            onWrite={async (input) => {
              setLanesBusy(true);
              try {
                return await writeLaneProposal(input);
              } finally {
                setLanesBusy(false);
              }
            }}
          />
          <SkillsPanel
            skills={skills}
            tokenBudget={skillsBudget}
            selectedId={selectedSkillId}
            detailBody={selectedSkillBody}
            onSelect={(id) => void selectSkill(id)}
          />
          <ToolsPanel
            tools={tools}
            aspects={toolAspects}
            selectedId={selectedToolId}
            onSelect={selectTool}
          />
        </div>
      </div>
    </main>
  );
}
