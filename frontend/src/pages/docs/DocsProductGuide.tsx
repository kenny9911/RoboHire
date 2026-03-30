import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import SEO from '../../components/SEO';
import Navbar from '../../components/landing/Navbar';
import Footer from '../../components/landing/Footer';

export default function DocsProductGuide() {
  const { t } = useTranslation();

  const steps = [
    {
      num: '01',
      color: 'from-emerald-500 to-teal-600',
      iconBg: 'bg-emerald-100 text-emerald-600',
      title: t('docs.guide.step1.title', '注册并登录'),
      text: t('docs.guide.step1.text', '访问 app.robohire.io，使用邮箱注册账号或通过 Google/GitHub 一键登录。新用户可享受 14 天免费试用，无需绑定信用卡。'),
      tip: t('docs.guide.step1.tip', '建议使用公司邮箱注册，方便团队协作。'),
    },
    {
      num: '02',
      color: 'from-sky-500 to-blue-600',
      iconBg: 'bg-sky-100 text-sky-600',
      title: t('docs.guide.step2.title', '告诉 AI 你的招聘需求'),
      text: t('docs.guide.step2.text', '点击"开始招聘"，RoboHire 的 AI 招聘顾问会通过对话式交互帮你梳理岗位需求：职责范围、必备技能、经验要求、薪资预期。AI 会追问模糊的地方，确保需求清晰完整。'),
      tip: t('docs.guide.step2.tip', '你可以直接说"我要招一个高级产品经理"，AI 会引导你完善所有细节。'),
    },
    {
      num: '03',
      color: 'from-blue-500 to-indigo-600',
      iconBg: 'bg-blue-100 text-blue-600',
      title: t('docs.guide.step3.title', '一键创建岗位'),
      text: t('docs.guide.step3.text', 'AI 会根据需求自动生成专业的职位描述（JD），包含岗位职责、任职要求、加分项。你只需确认或微调，点击发布即可。也可以在"岗位管理"页面手动创建。'),
      tip: t('docs.guide.step3.tip', 'AI 生成的 JD 可以直接用于招聘网站发布，节省你从零写 JD 的时间。'),
    },
    {
      num: '04',
      color: 'from-indigo-500 to-violet-600',
      iconBg: 'bg-indigo-100 text-indigo-600',
      title: t('docs.guide.step4.title', '上传候选人简历'),
      text: t('docs.guide.step4.text', '进入"人才库"，批量上传 PDF 简历（支持拖拽上传，一次最多 50 份）。RoboHire 会自动解析简历内容，提取候选人信息、教育背景、工作经历、技能标签等结构化数据。'),
      tip: t('docs.guide.step4.tip', '简历解析支持中英文双语 PDF，AI 会自动识别语言。'),
    },
    {
      num: '05',
      color: 'from-violet-500 to-purple-600',
      iconBg: 'bg-violet-100 text-violet-600',
      title: t('docs.guide.step5.title', 'AI 智能匹配筛选'),
      text: t('docs.guide.step5.text', '在"智能匹配"页面，选择岗位和候选人简历，点击"开始匹配"。AI 会对每份简历进行多维度评分：技能匹配度、经验吻合度、岗位适配分析。几分钟处理 200+ 份简历，给出 Top 候选人排名。'),
      tip: t('docs.guide.step5.tip', '匹配结果会显示每位候选人的优势和不足，帮你快速判断谁值得进入下一轮。'),
    },
    {
      num: '06',
      color: 'from-amber-500 to-orange-600',
      iconBg: 'bg-amber-100 text-amber-600',
      title: t('docs.guide.step6.title', '发送 AI 面试邀请'),
      text: t('docs.guide.step6.text', '选中要面试的候选人，点击"发送面试邀请"。系统自动生成包含专属面试链接和二维码的邀请邮件。候选人无需下载任何软件，点击链接即可在浏览器中随时开始 AI 面试。'),
      tip: t('docs.guide.step6.tip', '候选人可以在任何时间完成面试，不受时区和日程限制。'),
    },
    {
      num: '07',
      color: 'from-rose-500 to-pink-600',
      iconBg: 'bg-rose-100 text-rose-600',
      title: t('docs.guide.step7.title', 'AI 视频面试自动进行'),
      text: t('docs.guide.step7.text', 'AI 面试官会根据岗位要求对候选人进行 20-30 分钟的结构化视频面试。支持语音实时对话、根据回答智能追问、多语言切换（中/英/日/西/法/葡/德）。AI 会记录完整的面试过程和对话内容。'),
      tip: t('docs.guide.step7.tip', '面试过程中 AI 会自动检测候选人是否使用 AI 代答等作弊行为。'),
    },
    {
      num: '08',
      color: 'from-cyan-500 to-teal-600',
      iconBg: 'bg-cyan-100 text-cyan-600',
      title: t('docs.guide.step8.title', '查看评估报告，做出决策'),
      text: t('docs.guide.step8.text', '面试结束后，系统自动生成多维度评估报告：技能匹配度评分、工作经验深度分析、候选人优势与短板、录用建议与风险提示。你只需查看报告，约见排名靠前的候选人做终面决策。'),
      tip: t('docs.guide.step8.tip', '评估报告可以导出分享给用人部门，支持团队协作决策。'),
    },
  ];

  return (
    <>
      <SEO
        title={t('docs.guide.seo.title', 'RoboHire 快速上手指南')}
        description={t('docs.guide.seo.desc', '从注册到完成第一次 AI 面试，手把手带你快速上手 RoboHire 全流程招聘。适合 HR 和招聘负责人。')}
        url="https://robohire.io/docs/quick-start"
        keywords="RoboHire教程,AI招聘教程,招聘系统使用指南,HR工具教程"
      />

      <div className="min-h-screen bg-[#f6fbff]">
        <Navbar />

        <main className="pt-24 lg:pt-28">
          {/* Hero */}
          <section className="relative overflow-hidden pb-12 pt-10 sm:pb-16 sm:pt-16">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.1),transparent_28%),radial-gradient(circle_at_80%_10%,rgba(59,130,246,0.08),transparent_32%)]" />

            <div className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
              <Link to="/docs" className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-sky-700 transition-colors">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                {t('docs.guide.backToDocs', '返回文档中心')}
              </Link>

              <p className="mb-4 inline-flex rounded-full border border-emerald-200 bg-white/90 px-5 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-emerald-700">
                {t('docs.guide.badge', '快速上手')}
              </p>
              <h1 className="landing-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl">
                {t('docs.guide.title', '8 步开启 AI 智能招聘')}
              </h1>
              <p className="mt-5 max-w-2xl text-lg text-slate-600">
                {t('docs.guide.subtitle', '无需技术背景，跟着这个指南，你可以在 10 分钟内完成从注册到发出第一份 AI 面试邀请的全过程。')}
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  to="/agent-alex"
                  state={{ fresh: true }}
                  className="rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 px-6 py-3 text-sm font-semibold text-white shadow-[0_16px_40px_-16px_rgba(16,185,129,0.5)] transition-all hover:-translate-y-0.5"
                >
                  {t('docs.guide.ctaPrimary', '立即开始招聘')}
                </Link>
                <Link
                  to="/request-demo"
                  className="rounded-full border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition-all hover:border-emerald-300 hover:text-emerald-700"
                >
                  {t('docs.guide.ctaSecondary', '预约产品演示')}
                </Link>
              </div>
            </div>
          </section>

          {/* Steps */}
          <section className="pb-24 sm:pb-32">
            <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
              <div className="relative">
                {/* Vertical connector line */}
                <div className="absolute left-[27px] top-8 bottom-8 w-px bg-gradient-to-b from-emerald-200 via-blue-200 to-cyan-200 hidden sm:block" />

                <div className="space-y-8">
                  {steps.map((step) => (
                    <div key={step.num} className="relative flex gap-6">
                      {/* Step number circle */}
                      <div className={`relative z-10 flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${step.color} text-lg font-bold text-white shadow-lg`}>
                        {step.num}
                      </div>

                      {/* Content card */}
                      <div className="flex-1 rounded-[20px] border border-slate-200/80 bg-white p-6 shadow-[0_16px_48px_-32px_rgba(37,99,235,0.12)] transition-all duration-300 hover:shadow-[0_24px_60px_-36px_rgba(37,99,235,0.2)]">
                        <h3 className="mb-2 text-lg font-bold text-slate-900">{step.title}</h3>
                        <p className="mb-4 text-sm leading-relaxed text-slate-600">{step.text}</p>

                        {/* Tip box */}
                        <div className="rounded-xl border border-amber-200/80 bg-amber-50/80 px-4 py-3">
                          <p className="text-xs text-amber-800">
                            <span className="mr-1.5 font-semibold">💡 {t('docs.guide.tipLabel', '小贴士')}:</span>
                            {step.tip}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bottom CTA */}
              <div className="mt-16 rounded-[24px] border border-sky-200 bg-gradient-to-r from-sky-50 via-white to-indigo-50 p-8 text-center sm:p-10">
                <h2 className="text-2xl font-bold text-slate-900">
                  {t('docs.guide.bottomCta.title', '准备好了吗？')}
                </h2>
                <p className="mx-auto mt-3 max-w-lg text-sm text-slate-600">
                  {t('docs.guide.bottomCta.text', '从需求到录用，过去需要 42 天，现在只要几天。开始你的第一次 AI 智能招聘吧。')}
                </p>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
                  <Link
                    to="/agent-alex"
                    state={{ fresh: true }}
                    className="rounded-full bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-600 px-8 py-3.5 text-sm font-semibold text-white shadow-[0_20px_48px_-20px_rgba(59,130,246,0.5)] transition-all hover:-translate-y-0.5"
                  >
                    {t('docs.guide.bottomCta.cta', '免费开始使用')}
                  </Link>
                  <Link to="/docs" className="text-sm font-semibold text-sky-700 hover:text-sky-900 transition-colors">
                    {t('docs.guide.bottomCta.back', '← 返回文档中心')}
                  </Link>
                </div>
              </div>
            </div>
          </section>
        </main>

        <Footer />
      </div>
    </>
  );
}
