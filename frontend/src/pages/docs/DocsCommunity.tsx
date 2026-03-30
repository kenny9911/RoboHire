import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import SEO from '../../components/SEO';
import Navbar from '../../components/landing/Navbar';
import Footer from '../../components/landing/Footer';

interface Article {
  id: string;
  category: string;
  categoryLabel: string;
  title: string;
  excerpt: string;
  tags: string[];
  icon: string;
  readTime: string;
  content?: string;
}

export default function DocsCommunity() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [activeArticle, setActiveArticle] = useState<string | null>(null);

  useEffect(() => {
    if (activeArticle) window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeArticle]);

  const categories = [
    { key: 'all', label: t('docs.community.cat.all', '全部') },
    { key: 'strategy', label: t('docs.community.cat.strategy', '招聘策略') },
    { key: 'interview', label: t('docs.community.cat.interview', '面试技巧') },
    { key: 'salary', label: t('docs.community.cat.salary', '谈薪技巧') },
    { key: 'attract', label: t('docs.community.cat.attract', '候选人吸引') },
    { key: 'market', label: t('docs.community.cat.market', '市场动态') },
    { key: 'faq', label: t('docs.community.cat.faq', '常见问答') },
  ];

  const articles: Article[] = [
    // 招聘策略
    {
      id: 'strategy-1', category: 'strategy',
      categoryLabel: t('docs.community.cat.strategy', '招聘策略'),
      title: t('docs.community.articles.s1.title', '如何在 48 小时内完成一轮校招初筛'),
      excerpt: t('docs.community.articles.s1.excerpt', '校招季简历量巨大，传统逐份筛选效率低下。本文分享如何利用 AI 简历匹配 + AI 面试，在 48 小时内完成 500+ 份简历的初筛和初面，效率提升 10 倍。'),
      tags: ['校招', 'AI筛选', '效率提升'], icon: '📋', readTime: '12 min',
      content: `## 为什么是 48 小时？

2025 届高校毕业生达 **1222 万人**，校招简历量屡创新高。一个热门岗位轻松收到 2000+ 份简历，而数据显示超过 **60% 的优秀候选人** 会因为招聘流程太慢而放弃——好的候选人体验能将 offer 接受率提高 30% 以上。

速度，已经不仅仅是效率问题，它是抢人的核心武器。

---

## 第一阶段：开始前的准备（T-7 到 T-0）

### 1. 建立筛选标准矩阵

在简历涌入之前，必须先定义清晰的筛选标准：

**硬性条件（一票否决）：**
- 学历层次（本科/硕士/博士）
- 目标院校（985/211/双一流）
- 专业方向匹配度
- 毕业年份

**软性条件（加权评分）：**
| 维度 | 权重建议 | 评估方式 |
|---|---|---|
| 实习经历 | 30% | 实习公司知名度、职责深度 |
| 项目经历 | 25% | 项目复杂度、个人贡献 |
| 技能匹配 | 25% | 岗位关键技能命中率 |
| 获奖/论文 | 10% | 含金量和相关性 |
| 学业成绩 | 10% | GPA/排名（仅作参考） |

### 2. 倒推招聘漏斗

从最终录用人数倒推每一轮需要的候选人数量：

\`\`\`
目标录用 10 人
  ← 约 13 份 offer（80% 接受率）
  ← 约 16 人终面（80% 通过率）
  ← 约 50 人初面/笔试（30% 通过率）
  ← 约 150 份有效简历（35% 初筛通过率）
  ← 约 500+ 份投递简历
\`\`\`

### 3. 组建筛选团队并校准标准

- 指定系统管理员、AI 审核员、各部门人工复核负责人
- **关键动作**：在正式筛选前，团队一起审阅 20-30 份样本简历，对齐评分标准
- 建立实时沟通群（飞书/钉钉），处理边界案例

---

## 第二阶段：48 小时执行方案

### Hour 0-2：系统启动 & AI 初筛

将所有简历导入招聘管理系统，启动 AI 筛选引擎。

AI 三层校验：
1. **硬性条件快筛**（10秒/份）：学历、专业、毕业年份
2. **经历深度分析**：职业路径逻辑、量化成果
3. **核心能力语义匹配**：生成 0-100 匹配分

> 💡 以 RoboHire 为例，1000 份简历约 20 分钟完成初筛，相比人工 8 小时，**效率提升 96%**。

**产出**：简历自动分为 通过 / 待定 / 淘汰 三档，附评分和理由。

### Hour 2-8：人工复核 AI 结果

把人工精力集中在"待定"区间——这是 AI 与人工判断分歧最大的区域。

- 目标：AI-人工一致率达到 **90%** 以上
- 抽检"淘汰"堆中的样本，防止漏人（AI 可将误淘率从 25% 降至 8%）
- 典型分布：5000 份简历 → AI 自动通过 ~500，自动淘汰 ~3500，~1000 进入人工复核

### Hour 8-16：深度筛选 & 交叉审核

- 8-10 人团队分工审阅待定简历（约 6 分钟/份）
- 使用统一的结构化评估模板
- 边界简历由 2 位审核员交叉复核，确保公平性
- 实时看板追踪进度

### Hour 16-24：汇总 & 质量检查

- 合并所有筛选决定
- 运行多样性和偏见检查（建议盲筛：隐藏性别、姓名、院校）
- 核对各岗位/部门的通过人数是否符合漏斗目标

### Hour 24-36：与用人部门对齐

- 将候选人短名单共享给业务 Leader 快速确认
- 识别分歧点，针对性二次审阅

### Hour 36-48：候选人沟通

- **所有候选人**都应在 48 小时内收到结果通知
- 通过者：个性化邮件 + 下一轮安排
- 待定者：告知等待时间线
- 淘汰者：礼貌的感谢邮件

> Z 世代候选人对效率和透明度要求极高。48 小时内回复，候选人体验分立刻拉满。

---

## 让 48 小时成为可能的 AI 工具

当前市场数据显示，**77% 的企业** 已在春招中使用 AI（同比增长 34%），超半数用于简历筛选。

### AI 简历筛选

| 工具 | 核心能力 | 数据 |
|---|---|---|
| RoboHire | 语义匹配 + 多维评分 + AI 面试 | 200+ 简历/分钟 |
| Moka Eva | 简历转化率优化 | 转化率提升 70% |
| 牛客 | 校招专用 + AI 面试 | 1000 份/20 分钟 |
| 北森 | 胜任力模型 + AI 面试官 | 86 个数据点/人 |

### 人机协同模式

1. **试点期**：AI 处理 30%，人工验证全部 AI 决策
2. **规模期**：AI 处理 70%，人工专注边界案例
3. **优化期**：AI 全面初筛，人工仅做终面和潜力评估

---

## 常见陷阱

| 陷阱 | 解决方案 |
|---|---|
| 过度依赖硬性条件 | 加权"学习能力"和"创新思维"——研究显示这些占成功预测因子的 55% |
| AI 偏见 | 季度审计 AI 决策；要求可解释的评分理由 |
| 忽视候选人体验 | 每阶段自动通知；48 小时内回复 |
| 团队疲劳 | 轮班制；让 AI 处理大量重复工作 |
| 标准不一致 | 筛选前校准会议 + 结构化模板 + 交叉复核 |

---

## 成功指标

- ✅ 48 小时内完成全部初筛
- ✅ AI-人工一致率 ≥ 90%
- ✅ 误淘率 < 8%
- ✅ 候选人通知时间 ≤ 48 小时
- ✅ 各环节转化率达到漏斗目标

---

## 结语

48 小时初筛不再是奢望——它正在成为头部企业的标配。当 1222 万毕业生涌入市场，当 77% 的企业已经在用 AI，问题不是"要不要用"，而是"你能多快跑起来"。

预建标准 + AI 批量处理 + 结构化人工复核 + 透明的候选人沟通 = 从两周压缩到两天，质量不降反升。`,
    },
    {
      id: 'strategy-2', category: 'strategy',
      categoryLabel: t('docs.community.cat.strategy', '招聘策略'),
      title: t('docs.community.articles.s2.title', '初创公司招聘的 5 个核心策略'),
      excerpt: t('docs.community.articles.s2.excerpt', '没有专职 HR 的初创团队如何高效招聘？从雇主品牌建设、岗位描述优化、候选人渠道拓展、面试流程设计到 offer 谈判，5 个策略帮你从零搭建招聘体系。'),
      tags: ['初创公司', '招聘体系', '雇主品牌'], icon: '🚀', readTime: '15 min',
      content: `## 初创公司招聘的核心矛盾

没有专职 HR、预算有限、品牌认知为零——但你需要和大厂抢同一批人才。这是每一个创始人都面临的招聘困境。

好消息是：初创公司有大厂不具备的武器——**决策速度、成长空间和使命感**。把这些武器用对了，你不需要 HR 团队也能招到对的人。

---

## 策略一：创始人亲自下场，建立"全员招聘"文化

早期创业公司的 CEO 必须亲自提升"看人"能力——不能完全依赖外部。

**内推是 ROI 最高的渠道：**
- 内推简历仅占总量的 7%，却贡献了 **40% 的入职**
- 推荐入职的员工比外部招聘 **快 55%**

**可操作建议：**
- 设置分阶段内推奖励（通过面试发一半，试用期满再发一半）
- 设立"推荐之星"月度榜单，提高团队参与度
- 早期阶段候选人接触量要翻倍——品牌认知低，需要用数量弥补

**准备三个故事（5分钟内讲清楚）：**
1. **技术故事**：产品做什么，技术挑战是什么
2. **业务故事**：市场多大，竞争格局如何
3. **人和团队故事**：创业初心，团队背景

> 字节跳动早期创始团队不足 10 人，张一鸣亲自面试每一个候选人，确立了"只招聪明人"的选人标准。

---

## 策略二：用雇主品牌替代高薪

初创公司无法在薪资上和大厂正面竞争。但你可以用 **使命感、成长空间和文化吸引力** 弥补。

**打造 EVP（雇主价值主张）：**

领英数据显示，强雇主品牌可以：
- 降低 **28%** 离职率
- 减少 **50%** 招聘成本
- 增加 **50%+** 合格申请人

**新媒体传播（低成本高回报）：**
- 创始人每周花 1 小时在社交媒体分享创业日常/行业见解
- 利用公众号、抖音、B站展示真实的团队文化
- 比付费招聘广告更有效

**准备"公司白皮书"：**
- 公司白皮书：愿景/市场/融资情况
- 产品白皮书：技术方向/用户价值
- 创始人白皮书：个人经历/创业动机

像销售产品一样"卖"公司。关键岗位可能需要 6 个月以上的持续跟进。

---

## 策略三：多渠道组合拳，低成本最大化触达

不要只依赖一个平台。渠道优先级排序：

| 优先级 | 渠道 | 特点 |
|---|---|---|
| ⭐⭐⭐ | 内推 | 成本最低、质量最高，51% 企业的第一选择 |
| ⭐⭐⭐ | 社交招聘 | LinkedIn/脉脉/Boss 直聘，覆盖广 |
| ⭐⭐ | 技术社区 | GitHub/SegmentFault/掘金，精准触达 |
| ⭐⭐ | 高校合作 | 校招成本低，培养潜力大 |
| ⭐ | 招聘网站 | 按需使用，避免长期订阅 |
| ⭐ | 猎头 | 仅用于关键高管，费用为年薪 20-30% |

**AI 工具降本增效：**
- AI 可在 20 分钟内完成 1000 份简历初筛（效率提升 96%）
- 与人工筛选一致性达 90%
- RoboHire、Moka 等平台支持 SaaS 按需付费，适合初创公司

> ⚠️ 产品还没上线或用户量极低时，外部渠道招人概率接近零。这个阶段主要靠合伙人拉熟人。

---

## 策略四：精简高效的面试流程——2-3 轮定生死

资源有限的初创公司必须快速决策，同时不降低选人标准。

**推荐流程（2-3轮）：**

1. **电话/视频初筛**（30分钟）：基本匹配度 + 动机
2. **技术/专业能力面试**（1小时）：含实操测试或 Case Study
3. **创始人面试**（45分钟）：文化契合度评估

**文化契合度评估方法：**
- "你如何看待快速变化和不确定性？"
- "描述一次你在资源有限情况下完成目标的经历"
- "你理想中的工作节奏是什么样的？"

**快速决策是你的核心优势：**
- 大厂审批流程动辄数周，初创公司可以 **48 小时内发 offer**
- "当天面试，当天给结果"——这是大厂做不到的

> 💡 邀请外部顾问或投资人参与关键岗位面试，提供第三方视角。

---

## 策略五：巧用薪酬组合拳

不要试图在现金上匹配大厂，设计有竞争力的 **总包方案**。

**薪酬结构原则：**
- 基本工资保持市场竞争力（不能过分压低）
- 期权/股权应在 **90th 百分位**，比你觉得应该给的更慷慨
- 创业公司通常预留 **13%-20%** 的股权池

**超越薪酬的竞争武器：**

| 维度 | 大厂 | 初创公司 |
|---|---|---|
| 成长速度 | 3年一次晋升 | 3年获得大厂10年的成长 |
| 决策权 | 层层审批 | 直接影响产品方向 |
| 职责范围 | 螺丝钉 | 独当一面 |
| 工作自主权 | 流程驱动 | 扁平管理 |

**Offer 谈判关键：**

候选人在评估你的三个维度：
1. **钱**：资金稳定吗？投资人是谁？
2. **人**：创始团队背景如何？
3. **项目**：商业模式和行业壁垒是什么？

> 期权是对应创业公司高强度、高风险而本该给的福利——不是用来替代合理薪资的工具。

---

## 总结

初创公司招聘的本质不是"找人"，而是"卖梦想"——用创始人的热情、清晰的愿景、公平的回报机制和高效的决策速度，吸引那些愿意用确定性换取可能性的优秀人才。

**五大策略速记：**
1. 🎯 创始人亲自招 + 全员内推
2. 🏷️ 雇主品牌 > 高薪
3. 📢 多渠道组合 + AI提效
4. ⚡ 2-3轮面试 + 48小时决策
5. 💎 薪酬组合拳（现金+期权+成长空间）`,
    },
    {
      id: 'strategy-3', category: 'strategy',
      categoryLabel: t('docs.community.cat.strategy', '招聘策略'),
      title: t('docs.community.articles.s3.title', '结构化面试设计完全指南'),
      excerpt: t('docs.community.articles.s3.excerpt', '为什么你的面试总是问不出候选人的真实水平？本文教你如何设计结构化面试问题库，确保每位面试官都能一致、公平地评估候选人。'),
      tags: ['结构化面试', '面试设计', '评估标准'], icon: '🎯', readTime: '18 min',
      content: `## 什么是结构化面试？

结构化面试是一种标准化的面试评估方法，核心特征包括：

- **统一的问题集**：每位候选人被问同一组预先设计的问题
- **固定的顺序**：按预定顺序提出
- **标准化的评分**：使用评分标准（rubric）和等级量表评估
- **一致的流程**：所有面试官遵循相同规则

### 为什么结构化面试至关重要？

**预测效度对比：**

| 面试类型 | 预测效度系数 |
|---|---|
| 非结构化面试 | r = 0.19 - 0.33 |
| 半结构化面试 | r = 0.35 - 0.44 |
| 结构化面试 | r = 0.42 - 0.57 |

> 结构化面试的预测效度是非结构化面试的 **2 倍以上**（Schmidt & Hunter, 1998 元分析）。

**关键数据：**
- 仅有 **24%** 的公司使用完全结构化面试
- **48%** 的 HR 承认无意识偏见影响了选择
- 结构化面试将评估偏见降低约 **61%**
- 错误招聘的成本在 **$17,000 - $50,000** 以上

---

## 第一步：岗位分析与胜任力建模

### 构建胜任力模型

每个岗位选择 **5-8 项核心胜任力**，并分配权重：

**示例：软件工程师**

| 胜任力 | 权重 | 说明 |
|---|---|---|
| 问题解决能力 | 25% | 分析复杂问题、设计技术方案 |
| 代码质量 | 20% | 编写可维护、可测试代码 |
| 系统设计 | 20% | 架构权衡、技术决策 |
| 协作沟通 | 15% | 团队沟通、代码评审 |
| 学习能力 | 10% | 快速掌握新技术 |
| 主动性 | 10% | 主动发现并解决问题 |

---

## 第二步：设计面试问题

### 三种问题类型

**1. 行为性问题（评估过去经验）**
- 格式："请描述一个你 [特定情境] 的经历"
- 示例："请描述你解决过的最复杂的技术 bug，你的调试过程是怎样的？"

**2. 情境性问题（评估思维方式）**
- 格式："如果你遇到 [特定情境]，你会怎么做？"
- 示例："如果线上系统有严重 bug，但修复可能影响其他功能，你会如何处理？"

**3. 技术/专业问题（评估硬技能）**
- 示例："请解释 RESTful API 设计中的幂等性原则"

### 问题排序原则

1. 导入性问题（热身）→ 2. 行为性问题 → 3. 情境性问题 → 4. 技术问题 → 5. 意愿性问题

### 为每个问题准备追问

- "当时还有哪些人参与？你具体负责哪部分？"
- "结果如何？如果重来一次你会改变什么？"
- "你是如何衡量成功的？"

---

## 第三步：STAR 行为面试框架

| 要素 | 含义 | 面试官关注 |
|---|---|---|
| **S**ituation | 情境 | 能否清晰描述背景和挑战？ |
| **T**ask | 任务 | 承担了什么具体责任？ |
| **A**ction | 行动 | 采取了哪些具体行动？（重点是"我"做了什么） |
| **R**esult | 结果 | 可量化的结果是什么？ |

**使用技巧：**
- 关注候选人是否区分了个人贡献 vs 团队行为
- 追问具体数字、时间线、可衡量结果
- 每个 STAR 回答控制在 1-2 分钟
- 如果回答笼统，用追问引导回到 STAR

---

## 第四步：评分标准设计（BARS 量表）

### 5 级行为锚定评分量表

| 等级 | 含义 |
|---|---|
| 1 - 不达标 | 无法展示相关能力 |
| 2 - 部分达标 | 有相关能力但有明显不足 |
| 3 - 达标 | 基本满足岗位要求 |
| 4 - 超出预期 | 展示了较强能力 |
| 5 - 卓越 | 专家级水平 |

### BARS 示例：问题解决能力（软件工程师）

**问题**："请描述你解决过的最复杂的技术 bug"

| 等级 | 行为描述 |
|---|---|
| 1 | 无法描述系统性调试方法；随机尝试或依赖他人 |
| 2 | 能描述基本调试步骤，但缺乏系统性 |
| 3 | 展示了结构化调试方法（复现、隔离变量、日志分析），最终解决问题 |
| 4 | 高效缩小问题范围，修复 bug 并分析根本原因 |
| 5 | 专家级调试 + 建立预防机制（监控、自动化测试）+ 分享经验 |

---

## 第五步：面试评分卡模板

\`\`\`
┌──────────────┬──────┬──────┬────────────────────┐
│   胜任力      │ 权重  │ 评分  │ 行为证据记录         │
├──────────────┼──────┼──────┼────────────────────┤
│ 问题解决能力   │ 25%  │ __   │                    │
│ 沟通表达能力   │ 20%  │ __   │                    │
│ 团队协作      │ 15%  │ __   │                    │
│ 专业技能      │ 25%  │ __   │                    │
│ 学习成长能力   │ 15%  │ __   │                    │
├──────────────┼──────┼──────┼────────────────────┤
│ 加权总分      │ 100% │ __   │                    │
└──────────────┴──────┴──────┴────────────────────┘

总体评价：□ 强烈推荐  □ 推荐  □ 有保留推荐  □ 不推荐
\`\`\`

### 评分最佳实践

- **即时评分**：每个问题回答后立即打分，不要等面试结束
- **独立评分**：多位面试官独立打分后再讨论
- **记录证据**：每个评分附具体行为证据，而非主观感受
- **校准会议**：定期对齐评分标准
- **控制场次**：每天面试不超过 4 场，避免评分漂移

---

## 分角色面试题库

### 软件工程师

1. "请描述你解决过的最复杂的技术 bug。你的调试过程是怎样的？"
2. "请分享一次你需要在不熟悉的技术栈中快速交付的经历。"
3. "请描述一次你做出重要技术架构决策的经历，你权衡了哪些因素？"
4. "请描述一次你与产品经理在技术方案上产生分歧的经历。"

### 产品经理

1. "请描述一次你在多个产品方向间做优先级排序的经历。"
2. "请分享一个你主导的从 0 到 1 的产品功能全过程。"
3. "请描述一次你用数据推翻了团队最初假设的经历。"
4. "请描述一次你协调工程、设计和业务多团队完成项目的经历。"

### 销售/客户经理

1. "请描述一次你需要与难以沟通的高管客户建立关系的经历。"
2. "请分享一次高风险的商务谈判，你如何准备的？"
3. "请描述一次你未完成销售目标的经历，你从中学到了什么？"
4. "请分享一次你在不降价情况下说服客户签约的经历。"

---

## 非结构化面试的常见错误

| 错误 | 后果 |
|---|---|
| 凭"直觉"决定 | 决策在前 5 分钟就做出，剩余时间只在确认偏见 |
| 问题不一致 | 不同候选人问不同问题，无法公平比较 |
| 无意识偏见 | 亲和性偏见、光环效应、刻板印象影响判断 |
| 评估"面试表现"而非"工作能力" | 口才好的人占优势，真正有能力的人被忽视 |
| 缺乏追问 | 候选人给出表面回答就被放过 |
| 团队讨论无数据 | 变成"声音最大的人获胜" |

---

## 实施清单

1. ✅ 与用人经理确认岗位成功标准
2. ✅ 建立 5-8 项胜任力模型并分配权重
3. ✅ 设计 5 级 BARS 评分量表
4. ✅ 每项胜任力准备 2+ 道行为性/情境性问题
5. ✅ 用近期入职员工回测评分标准有效性
6. ✅ 培训面试官（评分锚定 + 追问技巧 + 偏见防范）
7. ✅ 面试中即时评分、独立打分
8. ✅ 每季度审查新员工绩效与面试评分相关性

---

## 结语

结构化面试不是"限制"面试官的创造力，而是用科学方法提升招聘决策质量。数十年研究一致表明：

- 预测效度是非结构化面试的 **2 倍以上**
- 评估偏见降低约 **61%**
- 预测准确性提升 **50% 以上**

投入时间设计胜任力模型、题库和评分标准，是任何组织能做出的 **投入产出比最高的招聘改进措施**。`,
    },
    // 面试技巧
    {
      id: 'interview-1', category: 'interview',
      categoryLabel: t('docs.community.cat.interview', '面试技巧'),
      title: t('docs.community.articles.i1.title', '技术岗面试：如何评估候选人的真实编码能力'),
      excerpt: t('docs.community.articles.i1.excerpt', '简历上写着"精通 Python"不代表真的精通。分享 5 种有效的技术面试方法：代码 Review、系统设计、场景模拟、项目深挖、算法思维，帮你找到真正的技术人才。'),
      tags: ['技术面试', '编码能力', '评估方法'], icon: '💻', readTime: '7 min',
    },
    {
      id: 'interview-2', category: 'interview',
      categoryLabel: t('docs.community.cat.interview', '面试技巧'),
      title: t('docs.community.articles.i2.title', 'STAR 面试法：行为面试的黄金标准'),
      excerpt: t('docs.community.articles.i2.excerpt', '用 STAR（情境-任务-行动-结果）框架提问，让候选人用具体案例展示能力。附带 20 个常用 STAR 面试问题模板，覆盖领导力、团队协作、问题解决等维度。'),
      tags: ['STAR面试', '行为面试', '问题模板'], icon: '⭐', readTime: '6 min',
    },
    // 谈薪技巧
    {
      id: 'salary-1', category: 'salary',
      categoryLabel: t('docs.community.cat.salary', '谈薪技巧'),
      title: t('docs.community.articles.sal1.title', 'Offer 谈判：如何在预算内拿下心仪候选人'),
      excerpt: t('docs.community.articles.sal1.excerpt', '当候选人的期望薪资超出预算时怎么办？从了解候选人真实诉求、展示非现金价值、灵活运用期权/奖金/福利包，到把控谈判节奏，分享实战谈薪话术。'),
      tags: ['薪资谈判', 'Offer管理', '话术'], icon: '💰', readTime: '6 min',
    },
    {
      id: 'salary-2', category: 'salary',
      categoryLabel: t('docs.community.cat.salary', '谈薪技巧'),
      title: t('docs.community.articles.sal2.title', '2026 年技术岗薪资趋势与对标'),
      excerpt: t('docs.community.articles.sal2.excerpt', 'AI、大模型、全栈工程师的市场薪资区间是多少？一线城市 vs 新一线 vs 远程薪资差异如何？基于最新市场数据的薪资对标参考。'),
      tags: ['薪资趋势', '市场行情', '技术岗'], icon: '📊', readTime: '5 min',
    },
    // 候选人吸引
    {
      id: 'attract-1', category: 'attract',
      categoryLabel: t('docs.community.cat.attract', '候选人吸引'),
      title: t('docs.community.articles.a1.title', '写出让候选人心动的 JD：7 个实用技巧'),
      excerpt: t('docs.community.articles.a1.excerpt', '为什么你的 JD 发了一个月却收不到几份简历？问题可能出在 JD 本身。从标题吸引力、职责清晰度、成长空间描述、薪资透明度等 7 个维度优化你的岗位描述。'),
      tags: ['JD优化', '雇主品牌', '候选人体验'], icon: '✍️', readTime: '5 min',
    },
    {
      id: 'attract-2', category: 'attract',
      categoryLabel: t('docs.community.cat.attract', '候选人吸引'),
      title: t('docs.community.articles.a2.title', '被动候选人触达策略：从不主动找工作的人手中挖人'),
      excerpt: t('docs.community.articles.a2.excerpt', '最优秀的人才往往不在投简历。如何通过技术社区、行业活动、内推网络、社交媒体精准触达被动候选人？分享猎头级别的人才挖掘方法论。'),
      tags: ['被动候选人', '人才挖掘', '触达策略'], icon: '🎣', readTime: '7 min',
    },
    // 市场动态
    {
      id: 'market-1', category: 'market',
      categoryLabel: t('docs.community.cat.market', '市场动态'),
      title: t('docs.community.articles.m1.title', 'AI 如何重塑招聘行业：2026 趋势报告'),
      excerpt: t('docs.community.articles.m1.excerpt', 'AI 面试官、自动化简历筛选、智能人才匹配 — AI 正在从根本上改变招聘的每一个环节。深度分析 AI 招聘的现状、趋势和对 HR 从业者的影响。'),
      tags: ['AI趋势', '行业报告', '招聘未来'], icon: '🤖', readTime: '10 min',
    },
    {
      id: 'market-2', category: 'market',
      categoryLabel: t('docs.community.cat.market', '市场动态'),
      title: t('docs.community.articles.m2.title', '远程招聘的最佳实践'),
      excerpt: t('docs.community.articles.m2.excerpt', '远程/混合办公已成为新常态。如何评估候选人的远程工作能力？如何设计远程面试流程？如何确保跨时区团队的文化契合？'),
      tags: ['远程办公', '跨时区', '文化契合'], icon: '🌍', readTime: '6 min',
    },
    // 常见问答
    {
      id: 'faq-1', category: 'faq',
      categoryLabel: t('docs.community.cat.faq', '常见问答'),
      title: t('docs.community.articles.f1.title', 'RoboHire AI 面试的安全性和公平性'),
      excerpt: t('docs.community.articles.f1.excerpt', '候选人数据如何保护？AI 面试是否存在偏见？评估标准是否经过验证？本文回答关于 AI 面试安全性、公平性、合规性的常见问题。'),
      tags: ['数据安全', 'AI公平', '合规'], icon: '🔒', readTime: '4 min',
    },
    {
      id: 'faq-2', category: 'faq',
      categoryLabel: t('docs.community.cat.faq', '常见问答'),
      title: t('docs.community.articles.f2.title', '如何提高 AI 面试的候选人完成率'),
      excerpt: t('docs.community.articles.f2.excerpt', '候选人收到 AI 面试邀请后不愿意做怎么办？从邀请话术、面试说明、候选人体验优化到跟进策略，提升完成率的实用建议。'),
      tags: ['完成率', '候选人体验', '邀请话术'], icon: '📈', readTime: '5 min',
    },
  ];

  const filtered = useMemo(() => {
    let list = articles;
    if (activeCategory !== 'all') {
      list = list.filter((a) => a.category === activeCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.excerpt.toLowerCase().includes(q) ||
          a.tags.some((tag) => tag.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [activeCategory, search, articles]);

  return (
    <>
      <SEO
        title={t('docs.community.seo.title', 'RoboHire 招聘知识社区')}
        description={t('docs.community.seo.desc', '招聘策略、面试技巧、谈薪话术、候选人吸引、市场动态 — 帮助 HR 团队提升专业招聘能力的知识库。')}
        url="https://robohire.io/docs/community"
        keywords="招聘知识,面试技巧,HR学习,招聘策略,谈薪技巧,人力资源"
      />

      <div className="min-h-screen bg-[#f6fbff]">
        <Navbar />

        <main className="pt-24 lg:pt-28">
          {/* Hero */}
          <section className="relative overflow-hidden pb-8 pt-10 sm:pb-12 sm:pt-16">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(139,92,246,0.08),transparent_28%),radial-gradient(circle_at_80%_10%,rgba(59,130,246,0.07),transparent_32%)]" />

            <div className="relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
              <Link to="/docs" className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-sky-700 transition-colors">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                {t('docs.community.backToDocs', '返回文档中心')}
              </Link>

              <p className="mb-4 inline-flex rounded-full border border-violet-200 bg-white/90 px-5 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-violet-700">
                {t('docs.community.badge', '知识社区')}
              </p>
              <h1 className="landing-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl">
                {t('docs.community.title', '招聘知识社区')}
              </h1>
              <p className="mt-4 max-w-2xl text-lg text-slate-600">
                {t('docs.community.subtitle', '招聘策略、面试技巧、谈薪话术、市场洞察 — 持续提升你的专业招聘能力。')}
              </p>

              {/* Search */}
              <div className="mt-8 max-w-xl">
                <div className="relative">
                  <svg className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t('docs.community.searchPlaceholder', '搜索文章、关键词或标签...')}
                    className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 pl-12 pr-4 text-sm text-slate-900 placeholder-slate-400 shadow-[0_12px_36px_-24px_rgba(37,99,235,0.15)] outline-none transition-all focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Category filter tabs */}
          <section className="sticky top-16 z-20 border-b border-slate-200/80 bg-[#f6fbff]/95 backdrop-blur-sm">
            <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
              <div className="flex gap-1 overflow-x-auto py-3 scrollbar-hide">
                {categories.map((cat) => (
                  <button
                    key={cat.key}
                    onClick={() => setActiveCategory(cat.key)}
                    className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-all ${
                      activeCategory === cat.key
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'text-slate-600 hover:bg-white hover:text-slate-900'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Article detail view OR grid */}
          <section className="py-10 sm:py-14">
            <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
              {activeArticle ? (() => {
                const article = articles.find((a) => a.id === activeArticle);
                if (!article?.content) return null;
                return (
                  <div>
                    <button
                      onClick={() => setActiveArticle(null)}
                      className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-sky-700 transition-colors"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                      {t('docs.community.backToArticles', '返回文章列表')}
                    </button>

                    <div className="rounded-[24px] border border-slate-200/80 bg-white p-8 shadow-[0_20px_60px_-40px_rgba(37,99,235,0.14)] sm:p-10 lg:p-12">
                      <div className="mb-6 flex flex-wrap items-center gap-3">
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                          {article.categoryLabel}
                        </span>
                        <span className="text-xs text-slate-400">{article.readTime}</span>
                      </div>

                      <h1 className="mb-4 text-2xl font-bold text-slate-900 sm:text-3xl">{article.title}</h1>

                      <div className="mb-8 flex flex-wrap gap-2">
                        {article.tags.map((tag) => (
                          <span key={tag} className="rounded-md bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700">{tag}</span>
                        ))}
                      </div>

                      <div className="prose prose-slate max-w-none prose-headings:text-slate-900 prose-h2:text-xl prose-h2:mt-10 prose-h2:mb-4 prose-h3:text-lg prose-h3:mt-8 prose-h3:mb-3 prose-p:text-slate-600 prose-p:leading-relaxed prose-strong:text-slate-800 prose-table:text-sm prose-th:bg-slate-50 prose-th:px-4 prose-th:py-2.5 prose-td:px-4 prose-td:py-2 prose-blockquote:border-sky-300 prose-blockquote:text-slate-600 prose-code:text-sky-700 prose-code:bg-sky-50 prose-code:rounded prose-code:px-1.5 prose-code:py-0.5 prose-code:before:content-none prose-code:after:content-none">
                        <ReactMarkdown>{article.content}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                );
              })() : filtered.length === 0 ? (
                <div className="py-20 text-center">
                  <p className="text-lg text-slate-400">{t('docs.community.noResults', '没有找到匹配的文章')}</p>
                  <button
                    onClick={() => { setSearch(''); setActiveCategory('all'); }}
                    className="mt-3 text-sm font-medium text-sky-600 hover:text-sky-800"
                  >
                    {t('docs.community.clearFilters', '清除筛选条件')}
                  </button>
                </div>
              ) : (
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {filtered.map((article) => (
                    <div
                      key={article.id}
                      onClick={article.content ? () => setActiveArticle(article.id) : undefined}
                      className={`group rounded-[20px] border border-slate-200/80 bg-white p-6 shadow-[0_16px_48px_-32px_rgba(37,99,235,0.1)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_60px_-36px_rgba(37,99,235,0.2)] ${article.content ? 'cursor-pointer' : ''}`}
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                          {article.categoryLabel}
                        </span>
                        <span className="text-xs text-slate-400">{article.readTime}</span>
                      </div>

                      <div className="mb-3 text-2xl">{article.icon}</div>
                      <h3 className="mb-2 text-base font-bold text-slate-900 leading-snug">{article.title}</h3>
                      <p className="mb-4 text-sm leading-relaxed text-slate-600 line-clamp-3">{article.excerpt}</p>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {article.tags.map((tag) => (
                          <span
                            key={tag}
                            onClick={(e) => { e.stopPropagation(); setSearch(tag); setActiveArticle(null); }}
                            className="cursor-pointer rounded-md bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700 transition-colors hover:bg-sky-100"
                          >
                            {tag}
                          </span>
                        ))}
                        {article.content && (
                          <span className="ml-auto text-xs font-medium text-sky-600">
                            {t('docs.community.readMore', '阅读全文 →')}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Coming soon note */}
              <div className="mt-16 rounded-[20px] border border-slate-200/80 bg-white p-8 text-center shadow-sm">
                <p className="text-2xl mb-3">🚧</p>
                <h3 className="text-lg font-bold text-slate-900">
                  {t('docs.community.comingSoon.title', '更多内容持续更新中')}
                </h3>
                <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
                  {t('docs.community.comingSoon.text', '我们正在持续添加更多招聘知识文章、视频教程和实战案例。如果你有想看的主题，欢迎告诉我们。')}
                </p>
                <a
                  href="mailto:support@robohire.io"
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-sky-700 hover:text-sky-900 transition-colors"
                >
                  {t('docs.community.comingSoon.cta', '提交你感兴趣的主题')}
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                </a>
              </div>
            </div>
          </section>
        </main>

        <Footer />
      </div>
    </>
  );
}
