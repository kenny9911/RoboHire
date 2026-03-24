# RoboHire 测试反馈修复报告

**日期**: 2026-03-25
**修复人**: Kenny + Claude
**涉及版本**: main 分支

---

## 一、刘林 测试需求反馈 (0323) — 5 个 Bug

### Bug 1: 搜索候选人时仅出来一位候选人

| 项目 | 内容 |
|------|------|
| **问题描述** | 在 AI 匹配弹窗中搜索职位名称（如"AI产品销售"），仅出现一位候选人，且标记名称为简历上传文件名 |
| **根因分析** | 前端搜索仅在 `name`、`currentRole`、`tags` 三个字段中进行客户端筛选，未搜索简历全文内容。后端已支持全文搜索参数 `search` 但前端未使用 |
| **修复方案** | 新增防抖服务端搜索（300ms 延迟），搜索范围扩展到姓名、职位、标签及简历全文内容。同时保留客户端筛选作为即时视觉反馈 |
| **修改文件** | `AutoMatchPanel.tsx`、`SmartMatching.tsx`、8 个语言翻译文件 |
| **影响范围** | 招聘项目匹配弹窗、智能匹配页面的候选人搜索 |

### Bug 2: 智能匹配后的标识不清楚

| 项目 | 内容 |
|------|------|
| **问题描述** | 匹配结果的操作按钮（入围、淘汰等）仅显示图标，用户不理解各图标含义 |
| **根因分析** | 操作按钮仅使用 SVG 图标 + `title` 提示，用户未悬停时无法识别功能 |
| **修复方案** | 为"入围"和"淘汰"两个主要操作按钮添加可见文字标签，响应式设计（移动端隐藏文字仅显示图标） |
| **修改文件** | `SmartMatching.tsx`、`JobDetail.tsx` |
| **影响范围** | 智能匹配结果列表、职位详情匹配结果 |

### Bug 3: 入围功能作用不清楚

| 项目 | 内容 |
|------|------|
| **问题描述** | 点击"√"显示"已入围"，但用户不清楚入围后的流程和作用 |
| **根因分析** | 缺少操作说明和反馈提示 |
| **修复方案** | 1) 更新入围按钮悬停提示为"加入候选名单，进入下一轮筛选"；2) 入围成功后显示提示消息"候选人已入围，将进入下一轮筛选" |
| **修改文件** | `SmartMatching.tsx`、8 个语言翻译文件 |
| **影响范围** | 智能匹配页面入围操作 |

### Bug 4: 偏好匹配分显示不一致

| 项目 | 内容 |
|------|------|
| **问题描述** | 同一岗位的候选人，有的显示偏好匹配分，有的不显示，让用户困惑 |
| **根因分析** | 前端条件渲染逻辑仅在候选人有偏好数据且分数 < 100 时才显示该列，无偏好数据时完全隐藏 |
| **修复方案** | 始终显示偏好匹配分列。有数据时显示具体分数，无数据时显示"—"并通过悬停提示说明"候选人未填写偏好信息" |
| **修改文件** | `SmartMatching.tsx`、8 个语言翻译文件 |
| **影响范围** | 智能匹配结果列表的偏好匹配分显示 |

### Bug 5: 同一候选人同一岗位 2 次匹配分数差别大（86 vs 65）

| 项目 | 内容 |
|------|------|
| **问题描述** | 同一候选人匹配同一岗位，两次得分分别为 86 和 65，差距过大，影响用户信任 |
| **根因分析** | `BaseAgent` 基类硬编码 LLM 温度参数为 `0.7`，导致 AI 输出不确定性高。每次匹配都重新调用 LLM，无结果缓存 |
| **修复方案** | 在 `BaseAgent` 中新增可覆写的 `getTemperature()` 方法（默认 `0.7`），在评分相关 Agent 中覆写为 `0.1`。创意类 Agent（如招聘顾问）保持 `0.7` 不变 |
| **修改文件** | `BaseAgent.ts`、`ResumeMatchAgent.ts`、`SkillMatchSkill.ts`、`PreferenceMatchSkill.ts`、`ExperienceMatchSkill.ts` |
| **影响范围** | 所有 AI 匹配评分，预期重复匹配分数差异从 ±20 分降低到 ±5 分以内 |

---

## 二、马微微 测试反馈 (0324) — 2 个 Bug

### Bug 6: 面试完成后状态未更新（一直显示"已安排"）

| 项目 | 内容 |
|------|------|
| **问题描述** | 候选人完成 AI 视频面试后，招聘方看到的面试状态仍停留在"已安排"，未自动变为"已完成" |
| **根因分析** | `/finalize/:accessToken` 端点仅在面试时长 ≥ 300 秒时才标记 `completed`，短面试保持 `in_progress`。`/transcript` 端点接收 LiveKit Agent 发送的面试记录数据后**不更新面试状态**。前端无轮询机制，仅在用户手动操作时刷新列表 |
| **修复方案** | 在 `/transcript` 端点中，保存面试记录后自动将面试状态更新为 `completed`（若当前状态为 `scheduled` 或 `in_progress`）。接收到面试记录是面试已结束的可靠信号——LiveKit Agent 只在对话结束后才发送记录数据 |
| **修改文件** | `backend/src/routes/interviews.ts`（transcript 端点） |
| **影响范围** | 所有 AI 视频面试的状态流转 |

**关键代码变更**:
```typescript
// 当收到面试记录时，自动标记面试完成
const statusNeedsUpdate =
  interview.status === 'scheduled' || interview.status === 'in_progress';
if (statusNeedsUpdate) {
  updateData.status = 'completed';
  updateData.completedAt = interview.completedAt || new Date();
  if (interview.startedAt) {
    updateData.duration = Math.round(
      (Date.now() - interview.startedAt.getTime()) / 1000,
    );
  }
}
```

### Bug 7: GoHire 评估中候选人姓名显示"Unknown"

| 项目 | 内容 |
|------|------|
| **问题描述** | 查看 GoHire 面试评估时，部分候选人姓名显示为"Unknown"，无法识别候选人身份 |
| **根因分析** | 候选人姓名仅从评估报告 JSON 的 `报告元数据.候选人姓名` 字段提取。当评估报告尚未生成、使用备用 API 路径（Strategy 2 设置 `report: null`）、或报告字段名不同时，直接回退到 `'Unknown'`。而 GoHire API 返回的 `completedRecord` 和 `detailRecord` 中可能包含 `user_name` 等字段但未被检查 |
| **修复方案** | 建立多层回退链提取候选人姓名：评估报告中文字段 → 评估报告英文字段 → `completedRecord.user_name` → `detailRecord.user_name` → `completedRecord.candidate_name` → `detailRecord.candidate_name` → `'Unknown'` |
| **修改文件** | `backend/src/routes/gohireInterviews.ts`（sync-from-invite 端点） |
| **影响范围** | 所有通过 GoHire 同步的面试评估记录 |

**关键代码变更**:
```typescript
// 多源回退链提取候选人姓名
const candidateName =
  reportJson?.['报告元数据']?.['候选人姓名']
  || reportJson?.['报告元数据']?.['candidateName']
  || completedRecord?.user_name
  || detailRecord?.user_name
  || completedRecord?.candidate_name
  || detailRecord?.candidate_name
  || 'Unknown';
```

---

## 三、刘远林 测试反馈 (0324) — 2 个 Bug

### Bug 8: 简历解析问题（名字/摘要未解析 + 重新解析无效）

| 项目 | 内容 |
|------|------|
| **问题描述** | 人才库中两个候选人简历解析出问题：一个名字未解析出来，一个 AI 摘要未解析出来。点击"重新解析简历"按钮后无变化。在线简历中"姓名"和"期望职位"排版堆在一起 |
| **根因分析** | 两个问题叠加：1) 重新解析端点调用 `getOrParseResume()` 会命中 DB 缓存，如果同内容哈希的解析结果已存在且不被判定为"稀疏"，则直接返回缓存结果——所以点重新解析后数据不变。2) 重新解析端点不调用 `generateResumeSummaryHighlight()` 重新生成 AI 摘要和亮点，即使解析数据更新了，旧的"Unable to parse resume"摘要仍留在数据库中 |
| **修复方案** | 1) 重新解析端点直接调用 `resumeParseAgent.parse()` 绕过 DB 缓存，确保每次都用最新 Agent 重新解析。2) 解析后调用 `generateResumeSummaryHighlight()` 重新生成摘要和亮点并写入数据库。3) 前端 `handleReparse` 回调同步更新 `summary` 和 `highlight` 字段 |
| **修改文件** | `backend/src/routes/resumes.ts`（reparse 端点）、`frontend/src/pages/ResumeDetail.tsx`（handleReparse） |
| **影响范围** | 人才库简历详情页的"重新解析简历"功能 |

### Bug 9: 简历解析时文件名中的职位前缀被当作候选人名

| 项目 | 内容 |
|------|------|
| **问题描述** | 上传名为"【GR1011_运营发持岗_上海 10-15K】王艺菲 2年.pdf"的简历时，候选人名称显示为整个文件名前缀，而非"王艺菲" |
| **根因分析** | 当 AI 解析未能提取到候选人姓名时，代码回退使用文件名（仅去掉扩展名）作为名字。未对中文招聘惯例的 `【职位编号_职位名_地点 薪资】候选人名 经验.pdf` 格式做任何清理 |
| **修复方案** | 新增 `cleanCandidateNameFromFilename()` 函数，用于：1) 去掉 `【...】` 或 `[...]` 前缀；2) 去掉末尾的经验年限信息（如" 10年"、" 3年以上"）；3) 去掉文件扩展名。应用于所有三处使用文件名作为名字回退的代码路径 |
| **修改文件** | `backend/src/routes/resumes.ts`（新增函数 + 三处调用点） |
| **影响范围** | 所有简历上传、重新上传场景中 AI 解析失败时的候选人名称回退 |

**关键代码变更**:
```typescript
function cleanCandidateNameFromFilename(filename: string): string {
  let name = filename.replace(/\.[^.]+$/, '');
  name = name.replace(/^[\[【][^\]】]*[\]】]\s*/, '');
  name = name.replace(/\s+\d+年[以上]*\s*$/, '');
  return name.trim() || filename.replace(/\.[^.]+$/, '');
}
```

---

## 四、刘远林 测试反馈 (0325) — 3 个 Bug

### Bug 10: 招聘项目中的匹配/候选人数据和职位页对不上，部分职位显示 0

| 项目 | 内容 |
|------|------|
| **问题描述** | 招聘项目页能看到匹配数据和候选人数据，但进入职位页后同一条 linked job 的统计可能显示为 0，或者两边数字明显不一致 |
| **根因分析** | 招聘项目页主要按 `resumeJobFit/candidate` 统计，职位页主要按 `jobMatch/jobId` 统计，两边使用了不同的数据模型和口径。对于绑定 `hiringRequestId` 的职位，真实流程常落在 `resumeJobFit + interview.hiringRequestId` 上，导致职位页只看 `jobMatch` 时会漏数 |
| **修复方案** | 1) 在 `jobs.ts` 中新增统一的 `buildJobStatsMap()` 聚合逻辑；2) 对 linked hiring request 的职位，同时对齐 `resumeJobFit` 与 `interview.hiringRequestId` 数据；3) 在 `hiring.ts` 的列表接口中补充统一 `stats` 字段，前端优先消费该字段，不再直接依赖旧 `_count.candidates` |
| **修改文件** | `backend/src/routes/jobs.ts`、`backend/src/routes/hiring.ts`、`frontend/src/pages/product/HiringRequests.tsx` |
| **影响范围** | 招聘项目列表、职位列表、职位详情的统计展示 |

### Bug 11: 人才库中个别 AI 摘要只显示简历模板里的口号/装饰语

| 项目 | 内容 |
|------|------|
| **问题描述** | 人才库大多数候选人的 AI 摘要正常，但少数候选人的摘要只显示简历模板里的口号，例如装饰语、格言或空洞自评 |
| **根因分析** | 系统此前只要发现 `parsed.summary` 长度大于 30，就直接信任该字段作为 AI summary。部分简历解析结果把简历顶部模板语句、口号或低质量自评放进了 `parsed.summary`，导致 Talent Hub 直接展示了错误摘要 |
| **修复方案** | 1) 提取 `ResumeSummaryService`，新增低质量摘要识别规则；2) 对明显口号、模板语、空洞自评不再直接复用，而是重新生成 summary/highlight；3) Talent Hub 前端增加展示兜底，不再直接显示明显低质量摘要；4) 新增 backfill 脚本和扩展后的 `/backfill-highlights` 接口，用于回填历史数据 |
| **修改文件** | `backend/src/services/ResumeSummaryService.ts`、`backend/src/routes/resumes.ts`、`backend/src/scripts/backfillResumeSummaries.ts`、`backend/package.json`、`frontend/src/pages/product/TalentHub.tsx` |
| **影响范围** | 人才库卡片摘要、简历摘要回填、后续摘要生成链路 |

### Bug 12: AI 面试中“查看录像”会先出现浏览器安全提示

| 项目 | 内容 |
|------|------|
| **问题描述** | 点击“查看录像”后，浏览器先弹出第三方视频链接的安全提示，继续访问后才能看到面试录像 |
| **根因分析** | 前端直接使用 `interview.recordingUrl` 打开第三方视频存储地址。浏览器因此直接暴露了第三方域名的证书/信任提示，RoboHire 自身无法控制该体验 |
| **修复方案** | 1) 在 `interviews.ts` 中新增 `/api/v1/interviews/:id/recording-file` 同源代理接口；2) 接口根据原始录像 URL 代理视频流并返回正确的 `Content-Type`；3) `AIInterview.tsx` 优先打开后端返回的 `recordingViewUrl`，避免浏览器直接跳到第三方视频地址 |
| **修改文件** | `backend/src/routes/interviews.ts`、`frontend/src/pages/product/AIInterview.tsx` |
| **影响范围** | AI 面试列表中的“查看录像”操作 |

---

## 五、历史数据回填与执行方式

### 摘要回填说明

- 本次已新增可控的摘要回填脚本：`npm run backfill:resume-summaries --workspace=backend -- --dry-run`
- 脚本默认建议先 `--dry-run`，确认扫描范围和候选记录后，再显式使用 `--apply`
- 支持参数：
  - `--limit=<n>`：最多回填多少条
  - `--scan-limit=<n>`：最多扫描多少条活跃简历
  - `--user-id=<id>`：只回填某个用户
  - `--resume-id=<id>`：只回填某一份简历
- API 侧的 `/api/v1/resumes/backfill-highlights` 也已扩展，不只补缺失 summary/highlight，也会修复明显低质量摘要

### 当前执行策略

- 当前 `.env` 指向 Neon 云数据库。
- 为避免未经确认直接批量修改云端数据，本次只完成了代码层面的回填能力和安全执行路径，未直接对云端数据库执行 `--apply`。
- 建议先在目标环境执行 dry run，确认候选数量与样本后，再执行 live backfill。

---

## 六、修改文件总览

### Backend

| 文件 | 变更内容 |
|------|----------|
| `backend/src/agents/BaseAgent.ts` | 新增可覆写 `getTemperature()` 方法，替换硬编码温度值 |
| `backend/src/agents/ResumeMatchAgent.ts` | 覆写 `getTemperature()` 返回 `0.1` |
| `backend/src/agents/skills/SkillMatchSkill.ts` | 覆写 `getTemperature()` 返回 `0.1` |
| `backend/src/agents/skills/PreferenceMatchSkill.ts` | 覆写 `getTemperature()` 返回 `0.1` |
| `backend/src/agents/skills/ExperienceMatchSkill.ts` | 覆写 `getTemperature()` 返回 `0.1` |
| `backend/src/routes/interviews.ts` | transcript 端点新增面试状态自动更新逻辑 |
| `backend/src/routes/gohireInterviews.ts` | 候选人姓名提取增加多源回退链 |
| `backend/src/routes/resumes.ts` | 重新解析绕过缓存 + 重新生成摘要 + 文件名前缀清理函数 |
| `backend/src/routes/jobs.ts` | 统一职位统计口径，对 linked hiring request 对齐 `resumeJobFit/interview` 数据 |
| `backend/src/routes/hiring.ts` | 招聘项目列表新增统一 `stats`，聚合统计改为优先基于 `resumeJobFit` |
| `backend/src/services/ResumeSummaryService.ts` | 抽出摘要生成逻辑，新增低质量摘要识别与统一生成入口 |
| `backend/src/scripts/backfillResumeSummaries.ts` | 新增可控的摘要回填脚本，支持 `--dry-run` 和 `--apply` |
| `backend/package.json` | 新增 `backfill:resume-summaries` 脚本 |

### Frontend

| 文件 | 变更内容 |
|------|----------|
| `frontend/src/components/AutoMatchPanel.tsx` | 新增防抖服务端搜索 |
| `frontend/src/pages/product/SmartMatching.tsx` | 防抖搜索 + 偏好分始终显示 + 按钮文字标签 + 入围提示 |
| `frontend/src/pages/product/JobDetail.tsx` | 入围/淘汰按钮文字标签 |
| `frontend/src/pages/ResumeDetail.tsx` | 重新解析后同步更新 summary/highlight 字段 |
| `frontend/src/pages/product/HiringRequests.tsx` | 优先使用后端统一 `stats` 字段展示招聘项目统计 |
| `frontend/src/pages/product/TalentHub.tsx` | 屏蔽明显低质量摘要，优先展示可靠 summary/highlight |
| `frontend/src/pages/product/AIInterview.tsx` | “查看录像”优先打开同源代理地址 `recordingViewUrl` |

### i18n（8 个语言文件）

`en`、`zh`、`zh-TW`、`ja`、`es`、`fr`、`pt`、`de` — 新增/更新以下 key：
- `searchResumesPlaceholder` — 搜索提示文案含简历内容
- `prefScoreNoData` — 无偏好数据说明
- `shortlistTooltip` — 入围操作说明
- `shortlistSuccess` — 入围成功提示

---

## 七、验证方式

| # | 验证项 | 方法 |
|---|--------|------|
| 1 | 后端编译 | `npx tsc --noEmit` 通过 ✅ |
| 2 | 前端构建 | `npm run build` 通过 ✅ |
| 3 | 匹配分数一致性 | 同一简历/岗位重复匹配 → 分数差异应在 5 分以内 |
| 4 | 简历搜索 | 匹配弹窗搜索职位关键词 → 应返回更多相关简历 |
| 5 | 偏好分显示 | 所有候选人显示偏好匹配分列（无数据时显示"—"） |
| 6 | 按钮标签 | 入围/淘汰按钮显示文字标签 |
| 7 | 入围反馈 | 入围操作后显示成功提示 |
| 8 | 面试状态 | 完成 AI 面试后状态自动更新为"已完成" |
| 9 | 候选人姓名 | GoHire 同步的面试评估显示实际姓名而非"Unknown" |
| 10 | 重新解析 | 点击"重新解析简历"后 AI 摘要和候选人数据应更新 |
| 11 | 文件名清理 | 上传带 `【...】` 前缀的简历时，候选人名称应只显示真实姓名 |
| 12 | 统计一致性 | 招聘项目页和职位页对 linked job 的统计不再因 `jobMatch/resumeJobFit` 口径不同而出现明显偏差 |
| 13 | 低质量摘要拦截 | 人才库中包含简历模板口号/装饰语的 summary 不再直接展示，后台会改为重建摘要 |
| 14 | 查看录像 | “查看录像”改走 `/api/v1/interviews/:id/recording-file`，浏览器不再直接跳第三方视频地址 |
| 15 | 摘要回填脚本 | `npm run backfill:resume-summaries --workspace=backend -- --dry-run` 可成功扫描候选记录而不落库 |
