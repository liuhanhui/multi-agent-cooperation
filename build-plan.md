# Open-Source Parity Build Plan — 对标 Clowder AI 完整度

**Goal:** 从零建设一个与 Clowder AI **开源产品面**同级的多 Agent 协作平台（非 300+ feature 逐一复刻）。  
**Finish line (B):** 外部用户可安装 → 配置多模型账号 → 多 CLI 家族同对话协作 → Skills/MCP → 跨 session 记忆 → Hub/Mission → 至少一条外部通道 → 满足 Iron Laws 级安全底线。  
**NOT building (首年):** 物理 limb/BLE、企微 Action 全家桶、Convention Graph 全量、Community Ops 全状态机、云端猫/Chrome host、Eval 哲学级全公理落地。  
**Architecture map:** 对齐 `docs/architecture/ownership/` 的 cell；本计划按 cell 建骨架，按 milestone 交付。  
**Map delta:** new cell required（你的新项目需自建 ownership map；本文件只映射 Clowder 参照坐标）  
**Tech stack (建议):** Node 20+ · TypeScript · pnpm monorepo · Redis（运行态）· SQLite（证据）· WebSocket · Fastify/类似 · React 前端 · MCP  
**前端验证:** Yes — 每个 Wave 至少一条 Playwright/手测 demo 路径  

**步数:** 6 Wave · 24 Milestone（M01–M24）· Wave 5 = v1.0 发版线 · Wave 6 = 溢价层  

**依赖总图:**

```
W0 → W1 → W2 ─┬→ W3 → W5 → (v1.0)
               └→ W4 ─┘
                        └→ W6 (可选溢价)
```

---

## 验收总尺子（v1.0 必须全部打勾）

- [ ] AC-P1 源码或安装器可冷启动；健康检查可用
- [ ] AC-P2 ≥3 个 Agent CLI/adapter 家族可注册并对话
- [ ] AC-P3 @mention 路由 + 线程隔离；上下文不串线
- [ ] AC-P4 Dispatch 队列：忙闲、取消、失败可见；重启不丢关键 in-flight 语义（至少有明确策略）
- [ ] AC-P5 A2A handoff + 跨模型 review 端到端可跑
- [ ] AC-P6 Skills 按需加载 + MCP 工具面可用且有治理入口
- [ ] AC-P7 记忆：写入证据 → 检索 → 注入下一轮 prompt
- [ ] AC-P8 Hub：账号 / 能力 / 配额或用量 / 路由策略
- [ ] AC-P9 Mission/SOP：feature 从 idea→done 可追踪
- [ ] AC-P10 ≥1 外部通道（IM 或 GitHub signals）
- [ ] AC-P11 Iron Laws：agent 不可删库 / 不可杀父进程 / 不可改运行时 config / 不可越界端口

---

## Wave 0 — 地基

### M01 — 产品定界与铁律

| 项 | 内容 |
|---|---|
| **交付物** | 一页 Vision；Non-goals；Iron Laws（提示词 + 代码 hook 双层）；风险矩阵 |
| **对标 cell** | （无）→ 建立你的 `ownership/README` 空壳 |
| **技术切片** | `AGENTS.md` / `CLAUDE.md` 等价物；启动禁止列表；config 只读策略草案 |
| **Done** | 书面确认：平台层 vs Chat 壳；四条铁律有可执行检查点（哪怕先是 lint/guard 脚本） |

### M02 — Monorepo 与运行时骨架

| 项 | 内容 |
|---|---|
| **交付物** | `packages/api` · `packages/web` · `packages/shared` · 可选 `mcp-server`；`pnpm start`；`.env.example` |
| **对标 cell** | 脚手架；预留 Redis / SQLite 端口约定 |
| **技术切片** | workspace；health `GET /health`；共享 types 包；Biome/ESLint；一条 CI lint |
| **Done** | 冷启动 API+Web；health 200；shared 类型可被两端引用 |

---

## Wave 1 — 能聊、能跑（最小可演示）

### M03 — Thread / Message / 流式传输

| 项 | 内容 |
|---|---|
| **交付物** | Thread CRUD；Message append；WebSocket（或 SSE）流式事件契约 |
| **对标 cell** | `transport`（本机）、`bubble-pipeline`（薄） |
| **技术切片** | `ThreadStore` / `MessageStore` port + Redis 实现；事件：`message.delta` / `message.completed`；前端订阅 |
| **状态对象（必做三件套）** | Thread、Message、WS 订阅 — 转移表 + 不变量 + crash 恢复测试 |
| **Done** | 两个客户端同线程看到一致历史；断线重连可 hydration |

### M04 — 第一个 Agent Adapter

| 项 | 内容 |
|---|---|
| **交付物** | 统一 `AgentProvider` 接口；1 个真实 CLI（建议 Claude Code 或 Codex） |
| **对标 cell** | `identity-session`（invocation 侧）、`cli-integration` 文档等价 |
| **技术切片** | spawn/stdio 或 ACP；stdout 规范化 → 平台事件；超时/退出码映射 |
| **Done** | 用户一句话 → agent 流式回复落库；provider 崩溃有可见错误气泡 |

### M05 — Cat 身份配置

| 项 | 内容 |
|---|---|
| **交付物** | Cat 注册表（id、显示名、角色、默认 model、system 片段）；线程成员绑定 |
| **对标 cell** | `identity-session` |
| **技术切片** | `cat-config` 只读加载；线程级 member list；禁止 runtime 写死密钥进 config |
| **Done** | 可配置 ≥2 只猫；切换默认协作者影响下一轮 invocation |

### M06 — Chat UI + 基础气泡

| 项 | 内容 |
|---|---|
| **交付物** | 侧栏线程列表 + 主聊天区 + 输入框；气泡 identity 稳定 |
| **对标 cell** | `bubble-pipeline`、`thread-navigation`（薄） |
| **技术切片** | bubble reducer single-writer；streaming 合并；作者/猫头像 |
| **Done** | 手测：新建线程 → @默认猫 → 流式完成 → 刷新不丢；气泡 id 不抖动 |

**Wave 1 Demo 门禁:** 「一个人、一只猫、一个线程，完整回合。」

---

## Wave 2 — 多猫协作主航道（护城河）

### M07 — @mention 路由

| 项 | 内容 |
|---|---|
| **交付物** | 解析 `@cat`；单目标 / 多目标；未提及走默认路由策略 |
| **对标 cell** | `routing-context`（初版）、`dispatch` 入口 |
| **技术切片** | mention parser；routing policy 配置；串行 vs 并行策略枚举（先串行） |
| **Done** | `@A` 只唤 A；`@A @B` 按策略执行；无 mention 走默认猫 |

### M08 — Dispatch / 队列 / 取消

| 项 | 内容 |
|---|---|
| **交付物** | InvocationQueue；busy gate；cancel；per-target attempt 记录 |
| **对标 cell** | `dispatch` |
| **技术切片** | queue processor；fairness 简单 FIFO+优先级可选；`TurnExecutionStore`；启动 reconciler |
| **状态对象** | QueueEntry、TurnExecution、CancelToken — 完整三件套 |
| **Done** | 猫忙时消息入队；取消停止当前；进程重启后 in-flight 有明确终态（complete/fail/orphan-recover） |

### M09 — A2A + 结构化 Handoff

| 项 | 内容 |
|---|---|
| **交付物** | agent→agent 消息；handoff 五件套（What/Why/Tradeoff/Open/Next）；review 请求模板 |
| **对标 cell** | `dispatch` + messaging；参照 F002/F055 精神 |
| **技术切片** | A2A trigger callback；目标线程/同线程投递；禁止裸字符串当唯一契约 |
| **Done** | A 完成后自动或显式 @B review；B 能看到结构化上下文；回执至少「已接收」 |

### M10 — Callback Auth

| 项 | 内容 |
|---|---|
| **交付物** | invocation 凭证；agent 回调平台的鉴权；失败可见 |
| **对标 cell** | `callback-auth` |
| **技术切片** | short-lived invocation token 或 agent-key；callback prehandler；telemetry |
| **Done** | 无凭证回调 401；过期可观测；合法回调写入正确 thread |

### M11 — 第 2、第 3 个 CLI Adapter

| 项 | 内容 |
|---|---|
| **交付物** | 再接 2 个家族（如 Codex + Gemini/Antigravity/opencode） |
| **对标 cell** | `identity-session`、`routing-context` |
| **技术切片** | 输出格式适配器表（stream-json / json / ndjson / plain）；能力差异声明 |
| **Done** | 三只猫同线程；跨家族 review 真实跑通一次 |

**Wave 2 Demo 门禁:** 「@架构猫写方案 → @评审猫挑刺 → 人只看结论。」

---

## Wave 3 — 工具与纪律

### M12 — Skills Manifest

| 项 | 内容 |
|---|---|
| **交付物** | skills 目录 + manifest；按需注入；Hub 可浏览 |
| **对标 cell** | `hub-action-surface`（skills 面）、mcp 相邻 |
| **技术切片** | SKILL.md 发现；触发条件/描述；token 预算上限 |
| **Done** | 至少 TDD / request-review / debugging 三类技能可加载；未命中不注入 |

### M13 — MCP Server + 治理

| 项 | 内容 |
|---|---|
| **交付物** | 一等 MCP server；tool 注册；暴露分级；切面清单 |
| **对标 cell** | `mcp-surface-governance` |
| **技术切片** | canonical tool registry；annotation；禁止双暴露同一语义；callback bridge（非 Claude 也能用工具） |
| **Done** | 两家族经 MCP 调同一「发消息到线程」类工具；Hub 能看到 tool 目录 |

### M14 — Rich Blocks / Hub Actions

| 项 | 内容 |
|---|---|
| **交付物** | 结构化块：diff、checklist、decision、card；前端渲染器 |
| **对标 cell** | `hub-action-surface` |
| **技术切片** | shared schema；消息 content blocks；action callback（勾选/决策） |
| **Done** | agent 发 checklist → 用户勾选回写 → 下一轮猫可见结果 |

### M15 — 轻量 SOP + Mission Hub

| 项 | 内容 |
|---|---|
| **交付物** | feature 对象（idea→spec→wip→review→done）；公告板；阶段与持球人 |
| **对标 cell** | `portable-governance`（初版）、`managed-work`（薄） |
| **技术切片** | FeatureStore；SOP yaml 或等价；Bulletin 投影；禁止一上来 Risk-Routed 全套 |
| **Done** | 创建一个 feature → 推进阶段 → Hub 可见；与至少一个 thread 绑定 |

**Wave 3 Demo 门禁:** 「技能+工具+一张功能看板，团队开始像团队。」

---

## Wave 4 — 记忆与契约（「认真」线）

### M16 — Evidence Store + 检索注入

| 项 | 内容 |
|---|---|
| **交付物** | SQLite（或等价）证据库；索引；召回；prompt 注入通道 |
| **对标 cell** | `memory` |
| **技术切片** | Evidence 写入 API；BM25 或向量二选一先落地；cue/注入预算；provenance 字段强制 |
| **Done** | 跨 session：问「上次为什么选 X」能检索到证据并注入；无证据时不装熟 |

### M17 — 写入车道（先 2–3 条）

| 项 | 内容 |
|---|---|
| **交付物** | 建议先做：Decision/Lesson、Profile 片段、Event 摘要 |
| **对标 cell** | `memory` write lanes |
| **技术切片** | lane = trigger → validation → consumption；每 lane 单一 writer |
| **Done** | 每条 lane 有写入测试 + 消费测试；冲突有显式 disposition（接受/拒绝） |

### M18 — 回执 + Freshness

| 项 | 内容 |
|---|---|
| **交付物** | per-target receipt；completed 原文立即交付；supplement 可追加 |
| **对标 cell** | `bubble-pipeline`、`dispatch`（F264/F254 精神） |
| **技术切片** | receipt store；freshness policy：过期输出不可当权威 |
| **Done** | 多目标消息每人有回执状态；迟到 supplement 不覆盖原 completed |

### M19 — Ball Custody / 等待契约

| 项 | 内容 |
|---|---|
| **交付物** | 「球在谁手上」投影；hold/wait；到期/取消；唤醒续跑 |
| **对标 cell** | `ball-custody` |
| **技术切片** | 纯投影优先；AwaitState 生命周期；禁止用「定时任务 UI」冒充条件等待 |
| **状态对象** | BallCustodyProjection、AwaitState — 强制三件套 |
| **Done** | Hub/侧栏能回答「球在哪」；等待 GitHub/人审批可唤醒（可先 mock 信号） |

### M20 — Approval Hub

| 项 | 内容 |
|---|---|
| **交付物** | 统一审批入口；producer catalog；通过/拒绝落账 |
| **对标 cell** | `approval-index`、`human-disposition-feedback`（薄） |
| **技术切片** | ApprovalIngress；各 producer adapter（handoff、记忆写入、调度变更…先 2 个） |
| **Done** | 人只在 Approval 面板拍板；决策可追溯到 subject |

**Wave 4 Demo 门禁:** 「人消失两天回来，仍知球在谁手、记忆还在、只批该批的。」

---

## Wave 5 — 开放拓扑与分发（v1.0）

### M21 — Hub Settings 产品面

| 项 | 内容 |
|---|---|
| **交付物** | members / accounts / skills / mcp / system / rules / ops（可子集） |
| **对标 cell** | `hub-action-surface`、`routing-context`、`identity-session` |
| **技术切片** | settings 导航树；密钥只进密钥存储；配额/用量面板 |
| **Done** | 非开发者按文档配齐 3 个 provider；路由策略可改并立即生效 |

### M22 — 第一条外部通道

| 项 | 内容 |
|---|---|
| **交付物** | 二选一深做：IM（飞书/Telegram…）**或** GitHub PR/issue 信号 |
| **对标 cell** | `transport` / `github-signals` / `signal-ingress` |
| **技术切片** | ConnectorRouter；thread binding；outbound formatter；入站鉴权 |
| **Done** | 外部一条消息进正确线程并唤猫；猫回复回到外部（或 GitHub wait→唤醒） |

### M23 — Plugin 框架（扩展点）

| 项 | 内容 |
|---|---|
| **交付物** | plugin manifest；激活；host 能力白名单；官方 catalog 空壳 |
| **对标 cell** | `plugin` |
| **技术切片** | 进程监督 stdio；grant；durable call settlement（可先简化） |
| **Done** | 示例插件可装/卸；无 grant 不能碰敏感能力 |

### M24 — 安装器、文档、Bootcamp

| 项 | 内容 |
|---|---|
| **交付物** | 桌面或一键脚本；SETUP；3–5 分钟 walkthrough；operator Bootcamp 最小版 |
| **对标 cell** | `concierge-surface`（可薄）、分发工程 |
| **技术切片** | 打包 Node+Redis 或文档化依赖；`--memory` 降级；版本钉扎 |
| **Done** | 陌生用户按 README 30 分钟内完成 AC-P1–P11 中可测项的冒烟 |

**Wave 5 = v1.0 发版。** 打完上方「验收总尺子」。

---

## Wave 6 — 溢价层（完整度之上的灵魂）

> 不挡 v1.0。做则按序，仍要对齐 cell。

| ID | 主题 | 对标 cell | Done（一句话） |
|---|---|---|---|
| M25 | Harness / friction / eval 最小闭环 | `harness-eval` | 摩擦可采集 → verdict → owner 响应可追踪 |
| M26 | Concierge + 引导 | `concierge-surface` | 新用户有常驻入口与一条完整引导流 |
| M27 | Present / 关系循环 | `proactive-relationship-loop`、`cat-life-settings` | 猫可在预算内主动出现且可关闭 |
| M28 | Visible Café（可选） | `visible-cafe-render` | 纯前端呈现运行态，不发明第二套真相 |

---

## 每 Milestone 的工程检查清单（复制用）

```markdown
### Mxx — {name}
- [ ] 类型/契约进 shared（终态 schema，不写用完就扔的脚手架）
- [ ] Store port + 至少一种持久化实现
- [ ] 单元测试覆盖不变量 INV-*
- [ ] 若有生命周期对象：状态×事件表 + 对抗场景测试
- [ ] API 路由 + 鉴权边界
- [ ] 前端可见（或明确「纯后端里程碑」）
- [ ] Demo 脚本 / 手测步骤写进 PR 描述
- [ ] 更新你的 ownership cell 文档
- [ ] 对照本计划 Non-goals：没有偷加 limb/eval 全家桶等
```

---

## 建议排期（一人全职粗估）

| Wave | 里程碑 | 粗估 |
|---|---|---|
| W0 | M01–M02 | 1–2 周 |
| W1 | M03–M06 | 3–5 周 |
| W2 | M07–M11 | 6–10 周 |
| W3 | M12–M15 | 4–6 周 |
| W4 | M16–M20 | 8–12 周 |
| W5 | M21–M24 | 4–8 周 |
| **→ v1.0** | | **约 7–12 个月**（视团队规模与 adapter 难度） |
| W6 | M25–M28 | 另计 2–4 个月 |

小团队（2–3 人）可 W3∥W4 前半并行；**不可**跳过 W2。

---

## 与 Clowder 参照路径（读书单）

按 Wave 读，避免一上来淹没在 300 docs：

| Wave | 先读 |
|---|---|
| W0–W1 | `README.md` Architecture；`docs/architecture/cli-integration.md` |
| W2 | `docs/architecture/at-mention-routing-system.md`；`ownership/cells/dispatch.md`；`message-delivery-handling-handoff-audit.md` |
| W3 | `ownership/cells/mcp-surface-governance.md`；`hub-action-surface.md`；`docs/SOP.md` 前半 |
| W4 | `memory-system-overview.md`；`ownership/cells/memory.md`；`ball-custody.md`；`approval-index.md`；`collaboration-landscape.md` v2 契约段 |
| W5 | `feature-placement.md`；`ownership/cells/transport.md`；`plugin.md`；`SETUP.md` |
| W6 | `cat-pack-manifesto.md`；`eval-system-overview.md`；`concierge-surface.md` |

Ownership 总图：`docs/architecture/ownership/README.md`

---

## 决策记录（开工前钉死）

**已钉死（2026-08-30）→ [`docs/DECISIONS.md`](./docs/DECISIONS.md)**

1. Redis 可选降级：是（默认 `MAC_STORE=memory`）
2. Adapter 顺序：Claude Code → Codex → opencode
3. 首发外部通道：GitHub signals
4. 桌面：不进 v1.0 阻断线
5. 记忆一期：Evidence + 检索；Profile 在 M17

---

## Changelog

- 2026-09-03：M06 — Chat UI（侧栏/气泡/头像）、bubble reducer、@默认猫 mention、刷新恢复 active thread。
- 2026-09-02：M05 — Cat 注册表只读加载、线程 member/defaultCat、invoke 绑定 systemSnippet。
- 2026-09-01：M04 — AgentProvider + Claude Code adapter；`POST .../messages/invoke`；fake provider 测试；失败气泡。
- 2026-08-30：M03 — Thread CRUD、Message append、WS hydrate/`message.delta`/`message.completed`、memory+redis store port、web 双端订阅 demo。
- 2026-08-30：M01/M02 开工 — monorepo scaffold + 决策钉死。
- 2026-08-29：初版 — 6 Wave / 24 Milestone，对标 Clowder 开源完整度（参照 ownership cells，非 Fxxx 逐条复刻）。
