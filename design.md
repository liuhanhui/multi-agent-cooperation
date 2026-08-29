# Project implementation steps
_Exported on 8/29/2026 at 17:43:59 GMT+8 from Cursor (3.8.11)_



**结论：别按这个仓库的 300+ feature 去抄。做「类似产品」建议压成 8 个大阶段；若要可排期的实施清单，约 12–15 步。**

## 这个项目本质是什么

Clowder AI 不是「又一个多模型聊天框」，而是 **Agent CLI 之上的协作平台层**：

| 层 | 干什么 |
|---|---|
| Model | 推理 |
| Agent CLI（Claude/Codex/Gemini…） | 工具、改文件、跑命令 |
| **平台（Clowder）** | 身份、路由、记忆、纪律、审计 |

差异化在：**持久身份 + @mention/A2A + 跨模型 review + 共享记忆 + SOP 门禁**，不是模型本身。

现状体量：monorepo（api / web / mcp / shared / desktop）、约 **30 个架构 cell**、**300+ feature**——那是多年演进结果，不是起步蓝图。

---

## 推荐拆法：8 个大阶段

按「每阶段都能独立演示价值」切：

| 阶段 | 目标 | 验收标准（能 demo） |
|---|---|---|
| **0. 产品定界** | 明确「像 Clowder」的哪一层 | 一页愿景：只做协作平台？还是也要记忆/SOP/桌面？ |
| **1. 壳 + 单 Agent** | 线程聊天 + 接 1 个 CLI | 用户发消息 → 一个 agent 流式回复 |
| **2. 多身份 + 路由** | 2+ agent、@mention、线程隔离 | `@A` 架构、`@B` review，上下文不串 |
| **3. 调用与队列** | 排队、忙闲、取消、失败可见 | agent 忙时消息入队，重启不丢关键状态 |
| **4. A2A 协作** | agent 互传、结构化交接 | A 写完 @B review，有明确 handoff |
| **5. Skills / 工具面** | 按需技能 + MCP/工具共享 | 同一套工具多模型可用 |
| **6. 记忆底座** | 证据库 + 可检索 | 跨 session 能想起决策/教训 |
| **7. 纪律层** | 轻量 SOP：design → review → merge | 流程可观测，不是纯文档 |
| **8. 产品化** | Hub、账号、安装器/桌面、渠道 | 非开发者也能配 key 用起来 |

**第 1–4 步 = MVP**（「多猫能一起干活」）。  
5–7 是护城河；8 是分发。游戏夜、可见猫咖、肢体插件等可后置。

---

## 若拆成可排期步骤：约 12–15 步

在 8 阶段上再细一点（适合写计划/估工期）：

1. 愿景与非目标（砍掉什么）  
2. Monorepo / API+Web 骨架 + 持久化选型  
3. Thread / Message 模型 + WebSocket 流式  
4. 第一个 Agent adapter（统一消息协议）  
5. Cat 身份配置（角色/人格/模型绑定）  
6. @mention 路由 + 多 agent 串/并行  
7. Invocation 队列 + 取消/重试  
8. A2A 消息 + handoff 五件套  
9. Skills manifest（按需加载）  
10. MCP / callback 工具桥  
11. 记忆：写入 + 检索（先简后深）  
12. 跨模型 review 协议（最小可用）  
13. Hub：账号、配额、能力面板  
14. （可选）SOP/feature 生命周期  
15. （可选）桌面安装 / IM 渠道  

---

## 怎么选步数

| 你的目标 | 建议步数 |
|---|---|
| 验证「多模型协作」 | **4 步**（壳 → 单 agent → 多 agent 路由 → A2A） |
| 可自用的同类产品 | **8 阶段**（上表） |
| 要对齐 Clowder 主航道 | **12–15 步**，然后按 feature 增量，不要一次性复刻 300 个 Fxxx |
| 要「几乎完整复刻」 | 不现实一次性规划；按他们的 ownership cell 逐年叠 |

---

## 最重要的一条建议

先写死一句话：

> **我要建的是「平台层」，还是「更好用的多模型 Chat」？**

若是前者，**第 2–4 阶段（身份/路由/队列/A2A）必须先做扎实**，记忆和 SOP 可以后补。  
若是后者，8 阶段里很多可以砍掉，**3–5 步就够**。

如果你说一下目标更接近「自用 MVP」还是「对标开源完整度」，我可以把上面压成一份带依赖关系的实施计划（含每步大概该有哪些模块）。

---

**User**

对标开源完整度

---

**Cursor**

对标完整开源面，我会按架构 cell 和产品表面把复刻路径压成可排期的阶段清单。

**对标开源完整度：按 6 波约 24 个里程碑做，不要按 300+ feature 做。**

「完整」应对齐他们 README / Hub / Mission Hub 能对外交付的产品面 + 架构 ownership map 里的主航道 cell；不是每个 Fxxx 都复刻。

---

## 完整度怎么定义（验收尺子）

一个外部用户能做到这些，才算「开源完整度」：

1. 装起来就能用（源码/桌面安装器 + 配账号）
2. 多 CLI 家族进同一对话（Claude / Codex / Gemini 级至少各 1）
3. `@mention` 路由、线程隔离、流式气泡
4. Agent 互传 + 跨模型 review 能跑通
5. Skills + MCP 工具面可用
6. 记忆能跨 session 检索与注入
7. Hub：账号 / 能力 / 配额 / 路由策略
8. Mission / SOP：feature 从想法到 merge 可追踪
9. 至少 1 条外部通道（IM 或 GitHub）
10. 有治理与安全底线（Iron Laws 级：不自毁数据、config 不可被 agent 乱改）

下面 6 波覆盖这 10 条；陪伴向（可见猫咖、Present Loop）放最后一波，不影响「协作平台」完整度。

---

## 6 波 × ~24 里程碑

### Wave 0 — 地基（2 步）
产品边界、技术栈、Iron Laws、monorepo（api / web / shared）、Redis/SQLite 选型、启动脚本。  
**对标 cell：** 无（脚手架）

### Wave 1 — 能聊、能跑（4 步）≈ 最小可演示
1. Thread + Message + WebSocket 流式  
2. 第一个 Agent adapter（统一消息协议）  
3. Cat 身份配置（角色 / 模型 / 人格）  
4. Chat UI + 基础气泡  

**对标 cell：** `identity-session`（薄）、`bubble-pipeline`（薄）、`transport`（本机）

### Wave 2 — 多猫协作主航道（5 步）≈ 产品差异化起点
5. `@mention` 路由 + 多目标  
6. Dispatch / 队列 / 取消 / busy gate  
7. A2A + 结构化 handoff  
8. Callback auth（agent 回平台的凭证）  
9. 第 2、第 3 个 CLI adapter  

**对标 cell：** `dispatch`、`callback-auth`、`routing-context`（初版）  
**这是核心护城河，不能跳。**

### Wave 3 — 工具与纪律（4 步）
10. Skills manifest（按需加载）  
11. MCP server + tool governance  
12. Rich blocks / Hub action（diff、清单、决策卡）  
13. 轻量 SOP + Mission Hub（feature 生命周期）  

**对标 cell：** `mcp-surface-governance`、`hub-action-surface`、`portable-governance`（初版）

### Wave 4 — 记忆与契约（5 步）≈ 开源「认真」线
14. Evidence store + 检索注入  
15. Profile / 决策日志等写入车道（先 2–3 条 lane）  
16. 消息回执 + freshness（别人说完你才接）  
17. Ball custody / 等待契约（球在谁手上）  
18. Approval Hub（人只拍需要人拍的板）  

**对标 cell：** `memory`、`ball-custody`、`approval-index`、`managed-work`  
协作文档 v2 说的「契约化 + 控制面化」就在这波。

### Wave 5 — 开放拓扑与分发（4 步）≈ README 级完整产品
19. 账号体系 / 多 provider / Hub Settings 全套  
20. IM connector 或 GitHub signals（先做 1 条）  
21. Plugin 框架（可扩展，不必先做肢体）  
22. 桌面安装器 / 一键安装 / 文档与 Bootcamp  

**对标 cell：** `transport`（外通道）、`plugin`、`github-signals` / `signal-intake`、`thread-navigation`

### Wave 6 — 完整度「溢价层」（可选但开源明星项目常有）（4 步）
23. Harness / friction / eval 闭环（系统能自检）  
24. Concierge + 引导 onboarding  
25. Present loop / 关系记忆深化  
26. Visible Café 等体验面  

**对标 cell：** `harness-eval`、`concierge-surface`、`proactive-relationship-loop`、`visible-cafe-render`

到 **Wave 5 结束** ≈ 对标开源完整度；Wave 6 是「灵魂与护城河加深」。

---

## 步数怎么记

| 粒度 | 数量 | 用途 |
|---|---|---|
| Wave | **6** | 融资/对外叙事、大版本 |
| Milestone | **~24** | 季度排期、PR 合入节奏 |
| Feature | 之后按需开，对齐他们 cell，不预开 300 个 | 增量演进 |

经验上：Wave 1–2 决定能不能活；Wave 4 决定像不像 Clowder；Wave 5 决定能不能当开源产品发版。

---

## 硬依赖（别乱序）

```
W0 → W1 → W2 ─┬→ W3 → W5
               └→ W4 ─┘
                    └→ W6
```

- W3（Skills/MCP）可与 W4 前半并行，但 **队列/A2A（W2）必须先硬**  
- Approval / Ball custody 依赖 dispatch 稳定  
- Desktop（W5）可提前做壳，但能力要以 W2–W4 为准  

---

## 明确不要第一年就对标的

这些在他们仓库里很重，但对「开源完整产品」可后置：

- 物理 limb / BLE  
- 企微 Action Plane 全家桶  
- Convention Graph 全套  
- Eval 哲学级闭环的每一个公理  
- Community Ops 全状态机  
- 云端猫 / 个人 Chrome host  

先留 plugin / signal-intake 扩展点即可。

---

## 一句话建议

**按 6 波、约 24 个里程碑对标开源完整度；Wave 5 为 v1.0 发版线，Wave 6 为差异化。**

若你要下一步落到可执行文档，我可以直接按这 24 步扩成：每步交付物、对标 cell、建议技术切片、以及「什么叫 Done」验收清单。

---

**User**

可以的

---

**Cursor**

按你确认的方向，我把 24 个里程碑扩成可执行计划（交付物、对标 cell、Done 标准）。先读写作规范再落文档。

已写好可执行计划：[`docs/perspectives/2026-08-29-opensource-parity-build-plan.md`](docs/perspectives/2026-08-29-opensource-parity-build-plan.md)

文档里包含：

- **终局 B + 非目标 + v1.0 验收总尺子（AC-P1–P11）**
- **M01–M24**：每步交付物、对标 ownership cell、技术切片、Done
- **有生命周期对象的强制三件套**（队列 / 球权 / 气泡等）
- **依赖图、Wave Demo 门禁、复制用工程 checklist**
- **粗排期（约 7–12 个月到 v1.0）与分 Wave 读书单**
- **开工前 5 个必须钉死的决策**

Wave 5（M24）= 开源完整度发版线；Wave 6 = 溢价层。

下一步你可以：把 M01 那 5 个决策答掉，或指定从 **M02 脚手架**还是 **直接按 Wave 在新仓库开工**——我可以按该计划拆出第一个可提交的实现切片。

