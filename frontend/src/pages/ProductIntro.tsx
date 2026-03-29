import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import SEO from '../components/SEO';
import Navbar from '../components/landing/Navbar';
import Footer from '../components/landing/Footer';

/* ── SVG icon helpers (inline to avoid extra dependencies) ── */
const IconChat = () => (
  <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
);
const IconDoc = () => (
  <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
);
const IconFilter = () => (
  <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
);
const IconSend = () => (
  <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
);
const IconVideo = () => (
  <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
);
const IconChart = () => (
  <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
);
const IconCheck = () => (
  <svg className="h-5 w-5 text-blue-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M5 13l4 4L19 7" /></svg>
);
const IconX = () => (
  <svg className="h-5 w-5 text-slate-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
);
const IconArrow = () => (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
);

export default function ProductIntro() {
  const { t } = useTranslation();

  const painPoints = [
    {
      icon: '📋',
      title: t('productIntro.pain.unclear.title', '需求不清，反复沟通'),
      text: t('productIntro.pain.unclear.text', '用人部门一句"招个厉害的人"，HR 要来回确认岗位职责、硬性要求、团队偏好，需求澄清本身就耗掉好几天'),
    },
    {
      icon: '📄',
      title: t('productIntro.pain.resumes.title', '简历堆积如山'),
      text: t('productIntro.pain.resumes.text', '一个岗位收到 200+ 份简历，逐份看完要花一整周，但真正匹配的可能只有 10 个人'),
    },
    {
      icon: '📅',
      title: t('productIntro.pain.scheduling.title', '面试安排是噩梦'),
      text: t('productIntro.pain.scheduling.text', '协调候选人、面试官、会议室，一轮下来两周过去了，优秀候选人早已被竞争对手抢走'),
    },
    {
      icon: '🎯',
      title: t('productIntro.pain.evaluation.title', '评估全靠"感觉"'),
      text: t('productIntro.pain.evaluation.text', '不同面试官标准不一，主观判断多，事后复盘缺乏数据支撑，难以做出客观的录用决策'),
    },
    {
      icon: '🔁',
      title: t('productIntro.pain.repetitive.title', '重复劳动消耗精力'),
      text: t('productIntro.pain.repetitive.text', '80% 的时间花在筛选不合适的人，只有 20% 留给真正重要的沟通和决策'),
    },
    {
      icon: '🌍',
      title: t('productIntro.pain.language.title', '跨语言招聘更难'),
      text: t('productIntro.pain.language.text', '全球化团队需要多语言面试能力，传统方式根本无法覆盖不同语言和时区的候选人'),
    },
    {
      icon: '🏠',
      title: t('productIntro.pain.nohr.title', '小公司没有招聘能力'),
      text: t('productIntro.pain.nohr.text', '初创团队和成长型小微企业没有专职 HR、没有合格的面试官，无力配备专业招聘角色，却同样需要找到优秀人才'),
    },
  ];

  const steps = [
    {
      num: '01',
      icon: <IconChat />,
      color: 'from-violet-500 to-purple-600',
      bg: 'bg-violet-100',
      iconColor: 'text-violet-600',
      title: t('productIntro.steps.clarify.title', '需求澄清与梳理'),
      subtitle: t('productIntro.steps.clarify.subtitle', 'AI Recruiting Consultant'),
      text: t('productIntro.steps.clarify.text', 'AI 招聘顾问通过对话式交互，帮你快速梳理岗位需求：职责范围、必备技能、经验要求、薪资预期。AI 会追问模糊的地方，确保需求清晰完整，10 分钟输出结构化岗位画像。'),
    },
    {
      num: '02',
      icon: <IconDoc />,
      color: 'from-blue-500 to-cyan-500',
      bg: 'bg-blue-100',
      iconColor: 'text-blue-600',
      title: t('productIntro.steps.create.title', '一键创建岗位'),
      subtitle: t('productIntro.steps.create.subtitle', 'AI JD Generator'),
      text: t('productIntro.steps.create.text', '基于梳理好的需求，AI 自动生成专业的职位描述（JD），包含岗位职责、任职要求、加分项等完整结构。你只需确认或微调，一键发布。告别从零写 JD 的痛苦。'),
    },
    {
      num: '03',
      icon: <IconFilter />,
      color: 'from-emerald-500 to-teal-500',
      bg: 'bg-emerald-100',
      iconColor: 'text-emerald-600',
      title: t('productIntro.steps.screen.title', 'AI 智能简历筛选'),
      subtitle: t('productIntro.steps.screen.subtitle', 'AI Resume Screening Agent'),
      text: t('productIntro.steps.screen.text', '上传简历（支持批量），AI Agents 立即启动。不是关键词匹配 — AI 真正理解上下文，精准识别必备技能匹配度、经验缺口和潜力亮点，每份简历给出量化评分。几分钟处理 200+ 份简历。'),
    },
    {
      num: '04',
      icon: <IconSend />,
      color: 'from-amber-500 to-orange-500',
      bg: 'bg-amber-100',
      iconColor: 'text-amber-600',
      title: t('productIntro.steps.invite.title', '自动邀约面试'),
      subtitle: t('productIntro.steps.invite.subtitle', 'Auto Interview Invitation'),
      text: t('productIntro.steps.invite.text', '筛选出的候选人，AI 自动发送面试邀请 — 包含专属面试链接和二维码。候选人无需下载任何软件，点击链接即可开始。你不需要协调任何人的日程。'),
    },
    {
      num: '05',
      icon: <IconVideo />,
      color: 'from-rose-500 to-pink-500',
      bg: 'bg-rose-100',
      iconColor: 'text-rose-600',
      title: t('productIntro.steps.interview.title', 'AI 视频面试'),
      subtitle: t('productIntro.steps.interview.subtitle', 'AI Video Interview'),
      text: t('productIntro.steps.interview.text', 'AI 面试官 7×24 小时在线，对每位候选人进行结构化视频面试。支持语音实时对话、根据回答智能追问、多语言切换（中/英/日/西/法/葡/德）。'),
    },
    {
      num: '06',
      icon: <IconChart />,
      color: 'from-blue-600 to-indigo-600',
      bg: 'bg-indigo-100',
      iconColor: 'text-indigo-600',
      title: t('productIntro.steps.evaluate.title', '面试评估与决策'),
      subtitle: t('productIntro.steps.evaluate.subtitle', 'Multi-Agent Evaluation'),
      text: t('productIntro.steps.evaluate.text', '面试结束后自动生成多维度评估报告：技能匹配度、经验深度分析、优势与短板、录用建议与风险提示，以及 AI 作弊检测。你只需查看报告，约见最优候选人。'),
    },
  ];

  const comparisonRows = [
    {
      feature: t('productIntro.compare.row.clarify', '需求梳理'),
      old: t('productIntro.compare.old.clarify', '多轮会议，邮件往返'),
      robo: t('productIntro.compare.robo.clarify', 'AI 对话式澄清，10 分钟输出岗位画像'),
    },
    {
      feature: t('productIntro.compare.row.jd', '写 JD'),
      old: t('productIntro.compare.old.jd', 'HR 手写，反复修改'),
      robo: t('productIntro.compare.robo.jd', 'AI 自动生成，确认即发布'),
    },
    {
      feature: t('productIntro.compare.row.screen', '筛选 200 份简历'),
      old: t('productIntro.compare.old.screen', '3–5 天，逐一阅读'),
      robo: t('productIntro.compare.robo.screen', '几分钟，AI 自动匹配排序'),
    },
    {
      feature: t('productIntro.compare.row.invite', '面试邀约'),
      old: t('productIntro.compare.old.invite', '逐个联系，协调排期'),
      robo: t('productIntro.compare.robo.invite', 'AI 自动发送，候选人自助完成'),
    },
    {
      feature: t('productIntro.compare.row.interview', '初轮面试'),
      old: t('productIntro.compare.old.interview', '2 周排期，面试官逐个面'),
      robo: t('productIntro.compare.robo.interview', '48 小时内，AI 完成全部初面'),
    },
    {
      feature: t('productIntro.compare.row.eval', '评估一致性'),
      old: t('productIntro.compare.old.eval', '不同面试官标准不同'),
      robo: t('productIntro.compare.robo.eval', '统一 AI 标准，每人维度相同'),
    },
    {
      feature: t('productIntro.compare.row.timezone', '覆盖时区'),
      old: t('productIntro.compare.old.timezone', '仅限工作时间'),
      robo: t('productIntro.compare.robo.timezone', '7×24 小时，全球随时面试'),
    },
    {
      feature: t('productIntro.compare.row.language', '语言能力'),
      old: t('productIntro.compare.old.language', '受限于面试官语言'),
      robo: t('productIntro.compare.robo.language', '支持 7 种语言'),
    },
    {
      feature: t('productIntro.compare.row.data', '数据沉淀'),
      old: t('productIntro.compare.old.data', '散落在邮件和表格中'),
      robo: t('productIntro.compare.robo.data', '统一人才库，智能标签，可检索可复用'),
    },
    {
      feature: t('productIntro.compare.row.cost', '综合成本'),
      old: t('productIntro.compare.old.cost', '高人力 + 猎头费用'),
      robo: t('productIntro.compare.robo.cost', '从 ¥199/月 起'),
    },
  ];

  const differentiators = [
    {
      title: t('productIntro.diff.agents.title', '不是工具，是 AI 招聘团队'),
      text: t('productIntro.diff.agents.text', '传统软件只帮你管信息 — 存简历、排日程、发邮件。RoboHire 的 AI Agents 真正替你"干活"：从需求梳理到面试评估，全流程自动驱动。你不是在用一个软件，而是拥有了一支不知疲倦的 AI 招聘团队。'),
      icon: '🤖',
    },
    {
      title: t('productIntro.diff.semantic.title', '深度理解，不是表面匹配'),
      text: t('productIntro.diff.semantic.text', '普通工具做"关键词匹配" — 简历里有 Python 就通过，没有就淘汰。RoboHire 的 AI 真正理解语义：它能识别"3 年机器学习项目经验"和"精通 TensorFlow"之间的关联，能在面试中根据回答做实时追问，评估真实能力。'),
      icon: '🧠',
    },
    {
      title: t('productIntro.diff.fair.title', '公平、一致、可追溯'),
      text: t('productIntro.diff.fair.text', '每位候选人接受相同标准的评估。没有"面试官心情不好"的变量，没有无意识偏见。所有评估数据可追溯，满足合规审计要求。让招聘决策经得起检验。'),
      icon: '⚖️',
    },
    {
      title: t('productIntro.diff.barrier.title', '大大降低专业招聘门槛'),
      text: t('productIntro.diff.barrier.text', '不需要专职 HR，不需要专业面试官，不需要猎头预算。初创团队和小微企业以极低成本拥有完整的 AI 招聘能力。过去只有大公司才负担得起的专业招聘流程，现在人人都能用。'),
      icon: '🌱',
    },
  ];

  const audiences = [
    {
      title: t('productIntro.audience.startup.title', '初创公司与创业团队'),
      text: t('productIntro.audience.startup.text', '没有专职 HR，没有合格面试官，RoboHire 让你以极低成本拥有专业级 AI 招聘能力'),
      icon: '🌱',
    },
    {
      title: t('productIntro.audience.tech.title', '快速成长的科技公司'),
      text: t('productIntro.audience.tech.text', '同时开 10+ 岗位，HR 团队人手不够，需要规模化筛选和面试'),
      icon: '🚀',
    },
    {
      title: t('productIntro.audience.global.title', '跨国企业'),
      text: t('productIntro.audience.global.text', '全球招聘，需要多语言面试能力和统一的评估标准'),
      icon: '🌐',
    },
    {
      title: t('productIntro.audience.agency.title', '猎头与 RPO'),
      text: t('productIntro.audience.agency.text', '大量候选人初筛，提高人效比，缩短交付周期'),
      icon: '🏢',
    },
    {
      title: t('productIntro.audience.smb.title', '中小企业'),
      text: t('productIntro.audience.smb.text', '没有专职 HR 团队，需要低成本、高质量的专业招聘方案'),
      icon: '💼',
    },
  ];

  return (
    <>
      <SEO
        title="RoboHire — AI 驱动的智能招聘平台"
        description="AI 筛选简历、AI 面试候选人、自动生成评估报告。从需求梳理到录用决策，全流程 AI 自动化，帮助企业将招聘周期从 42 天缩短到 3 天。"
        url="https://robohire.io/product-intro"
      />

      <div className="min-h-screen bg-white">
        <Navbar />

        <main className="pt-24 lg:pt-28">

          {/* ═══════════════════ HERO ═══════════════════ */}
          <section className="relative overflow-hidden pb-20 pt-10 sm:pb-28 sm:pt-16 lg:pb-32 lg:pt-20">
            {/* Background decorations */}
            <div className="absolute inset-0 bg-gradient-to-b from-slate-50 via-white to-white" />
            <div className="absolute left-1/2 top-0 -translate-x-1/2 blur-[120px] opacity-30 w-[800px] h-[500px] bg-gradient-to-br from-blue-400 to-cyan-300 rounded-full" />

            <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
              <p className="inline-flex rounded-full border border-blue-100 bg-blue-50 px-5 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-blue-700 mb-6">
                AI Recruiting Agents
              </p>

              <h1 className="landing-display text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl lg:text-[3.5rem] lg:leading-[1.1]">
                {t('productIntro.hero.title1', '从需求到录用')}<br />
                <span className="bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
                  {t('productIntro.hero.title2', '全流程 AI 自动化')}
                </span>
              </h1>

              <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-600 sm:text-xl">
                {t('productIntro.hero.subtitle', 'RoboHire 用 AI Agents 驱动招聘全流程 — 需求澄清、简历筛选、自动邀约、AI 面试、评估决策。过去需要 42 天的招聘周期，现在只要几天。')}
              </p>

              <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Link
                  to="/start-hiring"
                  state={{ fresh: true }}
                  className="w-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-600 px-8 py-4 text-base font-semibold text-white shadow-[0_20px_35px_-20px_rgba(37,99,235,0.95)] transition-all hover:-translate-y-0.5 sm:w-auto"
                >
                  {t('productIntro.hero.cta1', '免费开始使用')}
                </Link>
                <Link
                  to="/request-demo"
                  className="w-full rounded-full border border-slate-200 bg-white px-8 py-4 text-base font-semibold text-slate-700 transition-all hover:border-blue-300 hover:text-blue-700 sm:w-auto"
                >
                  {t('productIntro.hero.cta2', '预约产品演示')}
                </Link>
              </div>

              {/* Stats row */}
              <div className="mx-auto mt-14 grid max-w-2xl grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                  { value: '90%', label: t('productIntro.stats.time', '时间节省') },
                  { value: '7×24', label: t('productIntro.stats.avail', '全天候服务') },
                  { value: '7', label: t('productIntro.stats.lang', '种语言支持') },
                  { value: '500+', label: t('productIntro.stats.companies', '企业客户') },
                ].map((s) => (
                  <div key={s.label} className="rounded-2xl border border-slate-100 bg-white/80 px-4 py-4 backdrop-blur-sm">
                    <div className="text-2xl font-bold text-blue-600 sm:text-3xl">{s.value}</div>
                    <div className="mt-1 text-xs font-medium text-slate-500">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ═══════════════════ PAIN POINTS ═══════════════════ */}
          <section className="bg-slate-50 py-20 sm:py-24">
            <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
              <div className="mx-auto mb-14 max-w-3xl text-center">
                <h2 className="landing-display text-3xl font-bold text-slate-900 sm:text-4xl">
                  {t('productIntro.pain.title', '招聘，不该这么难')}
                </h2>
                <p className="mt-4 text-lg text-slate-600">
                  {t('productIntro.pain.subtitle', '招到一个合适的人，平均需要 42 天。招聘成本居高不下，HR 团队疲于奔命，而小微企业甚至连开始专业招聘的门槛都迈不过去。')}
                </p>
              </div>

              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {painPoints.map((p) => (
                  <div
                    key={p.title}
                    className="rounded-2xl border border-slate-200/80 bg-white p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_34px_-28px_rgba(15,23,42,0.5)]"
                  >
                    <div className="mb-3 text-2xl">{p.icon}</div>
                    <h3 className="mb-2 text-base font-semibold text-slate-900">{p.title}</h3>
                    <p className="text-sm leading-relaxed text-slate-600">{p.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ═══════════════════ FULL-FLOW STEPS ═══════════════════ */}
          <section className="py-20 sm:py-28">
            <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
              <div className="mx-auto mb-16 max-w-3xl text-center">
                <p className="inline-flex rounded-full border border-cyan-100 bg-cyan-50 px-5 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700 mb-5">
                  {t('productIntro.steps.badge', '全流程自动化')}
                </p>
                <h2 className="landing-display text-3xl font-bold text-slate-900 sm:text-4xl lg:text-5xl">
                  {t('productIntro.steps.title', '六大环节，一键启动')}
                </h2>
                <p className="mt-4 text-lg text-slate-600">
                  {t('productIntro.steps.subtitle', 'RoboHire 的 AI 招聘代理自动驱动每一个环节，你只需做最终决定。')}
                </p>
              </div>

              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {steps.map((step) => (
                  <div
                    key={step.num}
                    className="landing-gradient-stroke group relative rounded-[28px] bg-white p-7 shadow-[0_18px_34px_-28px_rgba(15,23,42,0.75)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_28px_52px_-36px_rgba(15,23,42,0.6)]"
                  >
                    {/* Top accent bar */}
                    <div className={`absolute left-6 right-6 top-0 h-1 rounded-b-full bg-gradient-to-r ${step.color}`} />

                    {/* Step number */}
                    <div className="absolute right-6 top-6 text-[3rem] font-bold leading-none text-slate-100 select-none">
                      {step.num}
                    </div>

                    {/* Icon */}
                    <div className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl ${step.bg} ${step.iconColor}`}>
                      {step.icon}
                    </div>

                    <h3 className="mb-1 text-lg font-bold text-slate-900">{step.title}</h3>
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">{step.subtitle}</p>
                    <p className="text-sm leading-relaxed text-slate-600">{step.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ═══════════════════ SCENARIO ═══════════════════ */}
          <section className="bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 py-20 sm:py-24">
            <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
              <div className="text-center">
                <p className="inline-flex rounded-full border border-blue-500/30 bg-blue-500/10 px-5 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-blue-300 mb-6">
                  {t('productIntro.scenario.badge', '真实场景')}
                </p>
                <h2 className="landing-display text-3xl font-bold text-white sm:text-4xl">
                  {t('productIntro.scenario.title', '从 150 人到 4 人，3 天完成')}
                </h2>
              </div>

              <div className="mt-12 rounded-[28px] border border-slate-700/50 bg-slate-800/50 p-8 backdrop-blur-sm sm:p-10">
                <div className="space-y-6 text-base leading-relaxed text-slate-300">
                  <p>
                    <span className="font-semibold text-blue-400">{t('productIntro.scenario.day1label', '周一上午')}</span>{t('productIntro.scenario.day1', '，你告诉 AI 招聘顾问"我们需要招一个高级产品经理"。AI 通过几轮对话帮你梳理清楚岗位要求，自动生成 JD 并发布。你上传了 150 份候选人简历，午饭前 AI 已完成全部筛选，给出 Top 15 的匹配排名和详细分析。')}
                  </p>
                  <p>
                    <span className="font-semibold text-cyan-400">{t('productIntro.scenario.day1pmlabel', '周一下午')}</span>{t('productIntro.scenario.day1pm', '，AI 自动向 15 位候选人发送面试邀请，每人收到专属面试链接和二维码。')}
                  </p>
                  <p>
                    <span className="font-semibold text-emerald-400">{t('productIntro.scenario.day3label', '周三')}</span>{t('productIntro.scenario.day3', '，12 人完成了 AI 视频面试，每人都有一份包含技能评估、经验分析、优劣势和录用建议的完整报告。你只需要花半天时间，约见最终的 3-4 位候选人做终面。')}
                  </p>
                </div>

                <div className="mt-8 flex items-center justify-between rounded-2xl bg-gradient-to-r from-blue-600/20 to-cyan-600/20 border border-blue-500/20 px-6 py-5">
                  <div>
                    <p className="text-sm text-slate-400">{t('productIntro.scenario.before', '传统方式')}</p>
                    <p className="text-2xl font-bold text-slate-400 line-through">3 {t('productIntro.scenario.weeks', '周')}</p>
                  </div>
                  <div className="text-slate-500">
                    <IconArrow />
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-blue-300">{t('productIntro.scenario.after', '使用 RoboHire')}</p>
                    <p className="text-2xl font-bold text-white">3 {t('productIntro.scenario.days', '天')}</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ═══════════════════ COMPARISON TABLE ═══════════════════ */}
          <section className="py-20 sm:py-24">
            <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
              <div className="mx-auto mb-14 max-w-3xl text-center">
                <h2 className="landing-display text-3xl font-bold text-slate-900 sm:text-4xl">
                  {t('productIntro.compare.title', '为什么选择 RoboHire？')}
                </h2>
                <p className="mt-4 text-lg text-slate-600">
                  {t('productIntro.compare.subtitle', '全流程对比，差距一目了然。')}
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse">
                  <thead>
                    <tr>
                      <th className="px-5 py-4 text-left text-sm font-semibold text-slate-500">{t('productIntro.compare.header.feature', '环节')}</th>
                      <th className="px-5 py-4 text-left text-sm font-semibold text-slate-500">{t('productIntro.compare.header.old', '传统招聘')}</th>
                      <th className="rounded-t-2xl bg-blue-600 px-5 py-4 text-left text-sm font-semibold text-white">RoboHire</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {comparisonRows.map((row) => (
                      <tr key={row.feature} className="transition-colors hover:bg-slate-50">
                        <td className="px-5 py-4 text-sm font-medium text-slate-900">{row.feature}</td>
                        <td className="px-5 py-4 text-sm text-slate-500">
                          <span className="inline-flex items-center gap-1.5"><IconX />{row.old}</span>
                        </td>
                        <td className="bg-blue-50 px-5 py-4 text-sm font-medium text-blue-700">
                          <span className="inline-flex items-center gap-1.5"><IconCheck />{row.robo}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* ═══════════════════ DIFFERENTIATORS ═══════════════════ */}
          <section className="bg-slate-50 py-20 sm:py-24">
            <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
              <div className="mx-auto mb-14 max-w-3xl text-center">
                <h2 className="landing-display text-3xl font-bold text-slate-900 sm:text-4xl">
                  {t('productIntro.diff.title', '四个关键差异')}
                </h2>
              </div>

              <div className="grid gap-8 sm:grid-cols-2">
                {differentiators.map((d) => (
                  <div
                    key={d.title}
                    className="landing-gradient-stroke rounded-[28px] bg-white p-8 shadow-[0_28px_52px_-40px_rgba(15,23,42,0.62)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_34px_66px_-38px_rgba(15,23,42,0.6)]"
                  >
                    <div className="mb-4 text-3xl">{d.icon}</div>
                    <h3 className="mb-3 text-xl font-bold text-slate-900">{d.title}</h3>
                    <p className="text-sm leading-relaxed text-slate-600">{d.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ═══════════════════ AUDIENCE ═══════════════════ */}
          <section className="py-20 sm:py-24">
            <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
              <div className="mx-auto mb-14 max-w-3xl text-center">
                <h2 className="landing-display text-3xl font-bold text-slate-900 sm:text-4xl">
                  {t('productIntro.audience.title', '谁在用 RoboHire？')}
                </h2>
              </div>

              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {audiences.map((a) => (
                  <div
                    key={a.title}
                    className="rounded-2xl border border-slate-200/80 bg-white p-6 text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_34px_-28px_rgba(15,23,42,0.5)]"
                  >
                    <div className="mb-3 text-3xl">{a.icon}</div>
                    <h3 className="mb-2 text-base font-bold text-slate-900">{a.title}</h3>
                    <p className="text-sm leading-relaxed text-slate-600">{a.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ═══════════════════ PRICING PREVIEW ═══════════════════ */}
          <section className="bg-slate-50 py-20 sm:py-24">
            <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
              <div className="mx-auto mb-14 max-w-3xl text-center">
                <h2 className="landing-display text-3xl font-bold text-slate-900 sm:text-4xl">
                  {t('productIntro.pricing.title', '灵活定价，按需选择')}
                </h2>
                <p className="mt-4 text-lg text-slate-600">
                  {t('productIntro.pricing.subtitle', '14 天免费试用，无需信用卡。')}
                </p>
              </div>

              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { name: 'Starter', price: '¥199', period: t('productIntro.pricing.mo', '/月'), desc: t('productIntro.pricing.starter', '小团队起步'), highlight: false },
                  { name: 'Growth', price: '¥1,399', period: t('productIntro.pricing.mo', '/月'), desc: t('productIntro.pricing.growth', '成长期团队'), highlight: false },
                  { name: 'Business', price: '¥2,799', period: t('productIntro.pricing.mo', '/月'), desc: t('productIntro.pricing.business', '规模化招聘'), highlight: true },
                  { name: 'Enterprise', price: t('productIntro.pricing.custom', '定制'), period: '', desc: t('productIntro.pricing.enterprise', '大型企业'), highlight: false },
                ].map((plan) => (
                  <div
                    key={plan.name}
                    className={`rounded-2xl p-6 text-center transition-all duration-300 hover:-translate-y-1 ${
                      plan.highlight
                        ? 'bg-gradient-to-b from-blue-600 to-blue-700 text-white shadow-[0_28px_52px_-20px_rgba(37,99,235,0.5)]'
                        : 'border border-slate-200/80 bg-white hover:shadow-[0_18px_34px_-28px_rgba(15,23,42,0.5)]'
                    }`}
                  >
                    {plan.highlight && (
                      <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-blue-200">{t('productIntro.pricing.popular', 'Most Popular')}</p>
                    )}
                    <h3 className={`text-sm font-semibold ${plan.highlight ? 'text-blue-100' : 'text-slate-500'}`}>{plan.name}</h3>
                    <div className={`mt-2 text-3xl font-bold ${plan.highlight ? 'text-white' : 'text-slate-900'}`}>
                      {plan.price}<span className={`text-base font-medium ${plan.highlight ? 'text-blue-200' : 'text-slate-400'}`}>{plan.period}</span>
                    </div>
                    <p className={`mt-2 text-sm ${plan.highlight ? 'text-blue-100' : 'text-slate-600'}`}>{plan.desc}</p>
                  </div>
                ))}
              </div>

              <div className="mt-8 text-center">
                <Link
                  to="/pricing"
                  className="inline-flex items-center gap-2 text-base font-semibold text-blue-600 transition-colors hover:text-blue-800"
                >
                  {t('productIntro.pricing.viewAll', '查看完整定价方案')}
                  <IconArrow />
                </Link>
              </div>
            </div>
          </section>

          {/* ═══════════════════ BOTTOM CTA ═══════════════════ */}
          <section className="relative overflow-hidden bg-slate-950 py-24 sm:py-28">
            <div className="absolute inset-0">
              <div className="absolute left-1/4 top-0 h-[500px] w-[500px] rounded-full bg-blue-600/10 blur-[120px]" />
              <div className="absolute bottom-0 right-1/4 h-[400px] w-[400px] rounded-full bg-cyan-500/10 blur-[120px]" />
            </div>

            <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
              <h2 className="landing-display text-3xl font-bold text-white sm:text-4xl lg:text-5xl">
                {t('productIntro.cta.title', '让 AI 处理 80% 的重复工作')}
              </h2>
              <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-400">
                {t('productIntro.cta.subtitle', '你的团队专注于最有价值的 20% — 识别文化契合、做最终的录用决策。')}
              </p>

              <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Link
                  to="/start-hiring"
                  state={{ fresh: true }}
                  className="w-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-600 px-8 py-4 text-base font-semibold text-white shadow-[0_20px_35px_-20px_rgba(37,99,235,0.95)] transition-all hover:-translate-y-0.5 sm:w-auto"
                >
                  {t('productIntro.cta.primary', '免费开始使用')}
                </Link>
                <Link
                  to="/request-demo"
                  className="w-full rounded-full border border-slate-600 px-8 py-4 text-center font-semibold text-white transition-colors hover:bg-white/10 sm:w-auto"
                >
                  {t('productIntro.cta.secondary', '预约产品演示')}
                </Link>
              </div>

              <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
                {[
                  t('productIntro.cta.pill1', '14 天免费试用'),
                  t('productIntro.cta.pill2', '无需信用卡'),
                  t('productIntro.cta.pill3', '即刻开始'),
                ].map((pill) => (
                  <span key={pill} className="rounded-full border border-slate-700 px-4 py-1.5 text-xs font-medium text-slate-400">
                    {pill}
                  </span>
                ))}
              </div>
            </div>
          </section>

        </main>

        <Footer />
      </div>
    </>
  );
}
