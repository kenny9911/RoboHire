import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
}

export default function DocsCommunity() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');

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
      tags: ['校招', 'AI筛选', '效率提升'], icon: '📋', readTime: '5 min',
    },
    {
      id: 'strategy-2', category: 'strategy',
      categoryLabel: t('docs.community.cat.strategy', '招聘策略'),
      title: t('docs.community.articles.s2.title', '初创公司招聘的 5 个核心策略'),
      excerpt: t('docs.community.articles.s2.excerpt', '没有专职 HR 的初创团队如何高效招聘？从雇主品牌建设、岗位描述优化、候选人渠道拓展、面试流程设计到 offer 谈判，5 个策略帮你从零搭建招聘体系。'),
      tags: ['初创公司', '招聘体系', '雇主品牌'], icon: '🚀', readTime: '8 min',
    },
    {
      id: 'strategy-3', category: 'strategy',
      categoryLabel: t('docs.community.cat.strategy', '招聘策略'),
      title: t('docs.community.articles.s3.title', '结构化面试设计完全指南'),
      excerpt: t('docs.community.articles.s3.excerpt', '为什么你的面试总是问不出候选人的真实水平？本文教你如何设计结构化面试问题库，确保每位面试官都能一致、公平地评估候选人。'),
      tags: ['结构化面试', '面试设计', '评估标准'], icon: '🎯', readTime: '10 min',
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

          {/* Articles grid */}
          <section className="py-10 sm:py-14">
            <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
              {filtered.length === 0 ? (
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
                      className="group rounded-[20px] border border-slate-200/80 bg-white p-6 shadow-[0_16px_48px_-32px_rgba(37,99,235,0.1)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_60px_-36px_rgba(37,99,235,0.2)]"
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

                      <div className="flex flex-wrap gap-1.5">
                        {article.tags.map((tag) => (
                          <span
                            key={tag}
                            onClick={() => setSearch(tag)}
                            className="cursor-pointer rounded-md bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700 transition-colors hover:bg-sky-100"
                          >
                            {tag}
                          </span>
                        ))}
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
