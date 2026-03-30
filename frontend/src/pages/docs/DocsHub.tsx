import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import SEO from '../../components/SEO';
import Navbar from '../../components/landing/Navbar';
import Footer from '../../components/landing/Footer';

const IconRocket = () => (
  <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.58-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
  </svg>
);

const IconCode = () => (
  <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
  </svg>
);

const IconUsers = () => (
  <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
  </svg>
);

const IconArrow = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
  </svg>
);

export default function DocsHub() {
  const { t } = useTranslation();

  const categories = [
    {
      icon: <IconRocket />,
      color: 'from-emerald-500 to-teal-600',
      iconBg: 'bg-emerald-100 text-emerald-600',
      title: t('docs.hub.quickStart.title', '快速上手指南'),
      description: t('docs.hub.quickStart.desc', '从注册到完成第一次 AI 面试，手把手带你快速上手 RoboHire 的全流程招聘能力。适合 HR 和招聘负责人。'),
      cta: t('docs.hub.quickStart.cta', '开始使用'),
      href: '/docs/quick-start',
      badge: t('docs.hub.quickStart.badge', '推荐新用户'),
    },
    {
      icon: <IconCode />,
      color: 'from-blue-500 to-indigo-600',
      iconBg: 'bg-blue-100 text-blue-600',
      title: t('docs.hub.api.title', 'API 开发文档'),
      description: t('docs.hub.api.desc', 'RESTful API 参考文档，包含简历解析、智能匹配、面试邀约、面试评估等接口。支持 Webhook 和 ATS 集成。'),
      cta: t('docs.hub.api.cta', '查看 API 文档'),
      href: '/docs/api',
      badge: t('docs.hub.api.badge', '开发者'),
    },
    {
      icon: <IconUsers />,
      color: 'from-violet-500 to-purple-600',
      iconBg: 'bg-violet-100 text-violet-600',
      title: t('docs.hub.community.title', '招聘知识社区'),
      description: t('docs.hub.community.desc', '招聘策略、面试技巧、谈薪话术、候选人吸引、市场动态分析。帮助 HR 团队提升专业招聘能力。'),
      cta: t('docs.hub.community.cta', '探索社区'),
      href: '/docs/community',
      badge: t('docs.hub.community.badge', '学习成长'),
    },
  ];

  return (
    <>
      <SEO
        title={t('docs.hub.seo.title', 'RoboHire 文档中心')}
        description={t('docs.hub.seo.desc', '快速上手指南、API 开发文档、招聘知识社区 — 一站式获取 RoboHire 的所有使用帮助和招聘专业知识。')}
        url="https://robohire.io/docs"
        keywords="RoboHire文档,API文档,招聘指南,AI招聘教程,HR知识库"
      />

      <div className="min-h-screen bg-[#f6fbff]">
        <Navbar />

        <main className="pt-24 lg:pt-28">
          {/* Hero */}
          <section className="relative overflow-hidden pb-16 pt-10 sm:pb-20 sm:pt-16">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.12),transparent_28%),radial-gradient(circle_at_82%_10%,rgba(59,130,246,0.1),transparent_32%)]" />

            <div className="relative mx-auto max-w-5xl px-4 text-center sm:px-6 lg:px-8">
              <p className="mb-4 inline-flex rounded-full border border-sky-200 bg-white/90 px-5 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-sky-700">
                {t('docs.hub.badge', 'Documentation')}
              </p>
              <h1 className="landing-display text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
                {t('docs.hub.title', 'RoboHire 文档中心')}
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">
                {t('docs.hub.subtitle', '无论你是第一次使用的 HR，还是需要 API 集成的开发者，或是想提升招聘能力的专业人士 — 这里都有你需要的内容。')}
              </p>
            </div>
          </section>

          {/* 3 Category Cards */}
          <section className="pb-24 sm:pb-32">
            <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
              <div className="grid gap-8 lg:grid-cols-3">
                {categories.map((cat) => (
                  <Link
                    key={cat.href}
                    to={cat.href}
                    className="group relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-white p-8 shadow-[0_24px_60px_-42px_rgba(37,99,235,0.18)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_32px_80px_-40px_rgba(37,99,235,0.28)]"
                  >
                    {/* Top accent bar */}
                    <div className={`absolute left-6 right-6 top-0 h-1 rounded-b-full bg-gradient-to-r ${cat.color}`} />

                    {/* Badge */}
                    <span className="mb-4 inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      {cat.badge}
                    </span>

                    {/* Icon */}
                    <div className={`mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl ${cat.iconBg}`}>
                      {cat.icon}
                    </div>

                    <h2 className="mb-3 text-xl font-bold text-slate-900">{cat.title}</h2>
                    <p className="mb-6 text-sm leading-relaxed text-slate-600">{cat.description}</p>

                    <span className={`inline-flex items-center gap-2 text-sm font-semibold bg-gradient-to-r ${cat.color} bg-clip-text text-transparent transition-all group-hover:gap-3`}>
                      {cat.cta}
                      <IconArrow />
                    </span>
                  </Link>
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
