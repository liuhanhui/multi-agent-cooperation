import { useCallback, useEffect, useRef, useState } from "react";
import type { HubBlockAction } from "@mac/shared";
import { invokeMessage, postMessageAction, streamEchoMessage } from "../api/endpoints";
import { avatarInitials, avatarTone } from "../chat/avatar";
import { mentionSuggestion, parseMentions } from "../chat/mention";
import { ChatPanel } from "../components/ChatPanel";
import { EvidencePanel } from "../components/EvidencePanel";
import { MissionBoard } from "../components/MissionBoard";
import { SkillsPanel } from "../components/SkillsPanel";
import { ToolsPanel } from "../components/ToolsPanel";
import { ThreadSidebar } from "../components/ThreadSidebar";
import { WriteLanesPanel } from "../components/WriteLanesPanel";
import { ReceiptsPanel } from "../components/ReceiptsPanel";
import { BallCustodyPanel } from "../components/BallCustodyPanel";
import { ApprovalPanel } from "../components/ApprovalPanel";
import { SettingsPanel } from "../components/SettingsPanel";
import { useThreadSocket } from "../hooks/useThreadSocket";
import { useWorkspaceData } from "../hooks/useWorkspaceData";

type CatalogTab =
  | "approvals"
  | "ball"
  | "evidence"
  | "lanes"
  | "receipts"
  | "settings"
  | "skills"
  | "tools";

/**
 * Chat shell: warm three-cat lounge layout over workspace data + WS bubbles.
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
    receiptBatches,
    refreshReceipts,
    supplementReceipt,
    ackTargetReceipt,
    custodyProjections,
    refreshCustody,
    holdThreadBall,
    waitThreadBall,
    wakeBallAwait,
    cancelBallAwait,
    approvalProducers,
    pendingApprovals,
    approvalLedger,
    refreshApprovals,
    submitDemoApproval,
    decideHubApproval,
    hubSettings,
    refreshSettings,
    patchHubRouting,
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
  const [receiptsBusy, setReceiptsBusy] = useState(false);
  const [custodyBusy, setCustodyBusy] = useState(false);
  const [approvalsBusy, setApprovalsBusy] = useState(false);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [catalogTab, setCatalogTab] = useState<CatalogTab>("approvals");
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
      void refreshReceipts();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const featureCount = bulletin
    ? bulletin.columns.reduce((n, c) => n + c.features.length, 0)
    : 0;
  const receiptCount = receiptBatches.reduce((n, b) => n + b.receipts.length, 0);

  return (
    <main className="shell app">
      <header className="top">
        <div className="brand-row">
          <div className="brand-block">
            <div className="brand-wrap">
              <span className="brand-face" aria-hidden="true">
                <span className="brand-eye left" />
                <span className="brand-eye right" />
                <span className="brand-nose" />
              </span>
              <p className="brand">Cat Lounge</p>
            </div>
            <h1 className="page-title">Three cats · one warm desk</h1>
            <p className="lede tight">
              Architect, Reviewer, and Builder share this room — mention who should speak,
              or let the default cat take the first paw.
            </p>
          </div>
          <div className="crew" aria-label="Crew">
            {cats.map((c) => (
              <span key={c.id} className="crew-chip" data-cat={c.id}>
                <span className="crew-dot" style={{ background: avatarTone(c.id) }}>
                  {avatarInitials(c.displayName)}
                </span>
                {c.displayName}
              </span>
            ))}
          </div>
        </div>

        <div className="status-bar" aria-label="Workspace status">
          <span className={`pill${health?.status === "ok" ? " ok" : ""}`}>
            health <strong>{health?.status ?? "…"}</strong>
            {health?.agent ? ` · ${health.agent}` : ""}
          </span>
          <span className="pill">
            threads <strong>{threads.length}</strong>
          </span>
          <span className="pill">
            missions <strong>{featureCount}</strong>
          </span>
          <span className="pill">
            evidence <strong>{evidenceList.length}</strong>
          </span>
          <span className="pill">
            receipts <strong>{receiptCount}</strong>
          </span>
          <span className="pill">
            ball{" "}
            <strong>
              {custodyProjections.find((p) => p.mode !== "idle")?.holderId ??
                custodyProjections[0]?.holderId ??
                "—"}
            </strong>
          </span>
          <span className="pill">
            approvals <strong>{pendingApprovals.length}</strong>
          </span>
          <span className="pill">
            ws <strong>{wsState}</strong>
          </span>
        </div>
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
            <div className="empty">
              <div className="paw-trail" aria-hidden="true">
                <span className="paw soft lg" />
                <span className="paw mint" />
                <span className="paw soft" />
              </div>
              <p className="chat-empty-title">The lounge is quiet</p>
              <p className="muted tight">
                Pick a thread on the left, or start a new one — the cats are ready when you are.
              </p>
            </div>
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

        <aside className="catalog-rail" aria-label="Desk shelf">
          <div className="catalog-tabs" role="tablist" aria-label="Shelf tabs">
            {(
              [
                ["approvals", "Approvals"],
                ["ball", "Ball"],
                ["evidence", "Memory"],
                ["lanes", "Lanes"],
                ["receipts", "Receipts"],
                ["settings", "Settings"],
                ["skills", "Skills"],
                ["tools", "Tools"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={catalogTab === id}
                className={`catalog-tab${catalogTab === id ? " active" : ""}`}
                onClick={() => setCatalogTab(id)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="catalog-pane" role="tabpanel">
            {catalogTab === "approvals" ? (
              <ApprovalPanel
                producers={approvalProducers}
                pending={pendingApprovals}
                ledger={approvalLedger}
                busy={approvalsBusy}
                onRefresh={async () => {
                  setApprovalsBusy(true);
                  try {
                    await refreshApprovals();
                  } finally {
                    setApprovalsBusy(false);
                  }
                }}
                onSubmitDemo={async (producerId) => {
                  setApprovalsBusy(true);
                  try {
                    await submitDemoApproval(producerId);
                  } finally {
                    setApprovalsBusy(false);
                  }
                }}
                onDecide={async (input) => {
                  setApprovalsBusy(true);
                  try {
                    await decideHubApproval(input);
                  } finally {
                    setApprovalsBusy(false);
                  }
                }}
              />
            ) : null}

            {catalogTab === "ball" ? (
              <BallCustodyPanel
                projections={custodyProjections}
                cats={cats}
                activeThreadId={activeId}
                busy={custodyBusy}
                onRefresh={async () => {
                  setCustodyBusy(true);
                  try {
                    await refreshCustody();
                  } finally {
                    setCustodyBusy(false);
                  }
                }}
                onHold={async (input) => {
                  setCustodyBusy(true);
                  try {
                    await holdThreadBall(input);
                  } finally {
                    setCustodyBusy(false);
                  }
                }}
                onWait={async (input) => {
                  setCustodyBusy(true);
                  try {
                    await waitThreadBall(input);
                  } finally {
                    setCustodyBusy(false);
                  }
                }}
                onWake={async (awaitId) => {
                  setCustodyBusy(true);
                  try {
                    await wakeBallAwait(awaitId);
                  } finally {
                    setCustodyBusy(false);
                  }
                }}
                onCancel={async (awaitId) => {
                  setCustodyBusy(true);
                  try {
                    await cancelBallAwait(awaitId);
                  } finally {
                    setCustodyBusy(false);
                  }
                }}
              />
            ) : null}

            {catalogTab === "evidence" ? (
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
            ) : null}

            {catalogTab === "lanes" ? (
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
            ) : null}

            {catalogTab === "receipts" ? (
              <ReceiptsPanel
                batches={receiptBatches}
                busy={receiptsBusy}
                onRefresh={async () => {
                  setReceiptsBusy(true);
                  try {
                    await refreshReceipts();
                  } finally {
                    setReceiptsBusy(false);
                  }
                }}
                onSupplement={async (receiptId, content) => {
                  setReceiptsBusy(true);
                  try {
                    await supplementReceipt(receiptId, content);
                  } finally {
                    setReceiptsBusy(false);
                  }
                }}
                onAck={async (receiptId) => {
                  setReceiptsBusy(true);
                  try {
                    await ackTargetReceipt(receiptId);
                  } finally {
                    setReceiptsBusy(false);
                  }
                }}
              />
            ) : null}

            {catalogTab === "settings" ? (
              <SettingsPanel
                settings={hubSettings}
                busy={settingsBusy}
                onRefresh={async () => {
                  setSettingsBusy(true);
                  try {
                    await refreshSettings();
                  } finally {
                    setSettingsBusy(false);
                  }
                }}
                onPatchRouting={async (patch) => {
                  setSettingsBusy(true);
                  try {
                    await patchHubRouting(patch);
                  } finally {
                    setSettingsBusy(false);
                  }
                }}
              />
            ) : null}

            {catalogTab === "skills" ? (
              <SkillsPanel
                skills={skills}
                tokenBudget={skillsBudget}
                selectedId={selectedSkillId}
                detailBody={selectedSkillBody}
                onSelect={(id) => void selectSkill(id)}
              />
            ) : null}

            {catalogTab === "tools" ? (
              <ToolsPanel
                tools={tools}
                aspects={toolAspects}
                selectedId={selectedToolId}
                onSelect={selectTool}
              />
            ) : null}
          </div>
        </aside>
      </div>
    </main>
  );
}
