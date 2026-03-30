# Changelog — 2026-03-30

## 1. Product Intro — Startup Pain Point & Customer Testimonial

**Files changed:**
- `docs/RoboHire-产品介绍.md` — Added 7th pain point (小公司没有招聘能力), 4th differentiator (降低专业招聘门槛), startup audience entry, customer testimonial (校招场景)
- `generate_product_intro.py` — Updated pain points (7 items), differentiators (4 items, 2x2 layout), audiences (5 items, 3+2 layout), tightened page 4 spacing
- `frontend/src/pages/ProductIntro.tsx` — Added matching pain point, differentiator, audience, testimonial section, RMB pricing fix
- `docs/RoboHire-产品介绍.pdf` + `.jpg` — Regenerated

## 2. Homepage Redesign — ProductIntro as Homepage

**Files changed:**
- `frontend/src/pages/ProductIntro.tsx` — Added props interface (`showDarkToggle`, `showFAQ`, `seoUrl`, `seoStructuredData`), FAQ import, section id attributes for nav hash links, SEO keywords
- `frontend/src/pages/Landing.tsx` — Rewritten to render `<ProductIntro>` with light mode, FAQ, and WebPage+AggregateOffer JSON-LD schema
- `frontend/src/App.tsx` — `/product-intro` and `/product-info` now redirect to `/`

**SEO/GEO:** Homepage WebPage + SoftwareApplication + AggregateOffer (CNY) + AggregateRating schema. FAQ component's FAQPage JSON-LD merges automatically. hreflang for 8 languages.

## 3. Interview Hub — Candidate Name "Unknown" Fix

**Files changed:**
- `backend/src/routes/gohireInterviews.ts`:
  - `GET /:id` — Backfills candidateName from parsed resume markdown when still "Unknown"
  - `POST /:id/parse-resume` (cached path) — Extracts name from cached markdown `# heading`
  - `POST /:id/parse-resume` (fresh parse) — Uses `structuredData.candidateName` to update DB
  - Both paths return `candidateName` in response
- `frontend/src/pages/product/GoHireEvaluation.tsx` — All 4 parse-resume handlers update interview state with returned candidateName

## 4. Interview Hub — JD Markdown Rendering

**Files changed:**
- `frontend/src/pages/product/GoHireEvaluation.tsx` — JD tab now detects markdown-formatted content (`/^#+\s/m`) and renders via `MarkdownRenderer` instead of `JdRenderer`

## 5. Resume Refine — "Job Not Found" Fix

**Files changed:**
- `backend/src/routes/resumes.ts` — `POST /:id/refine` endpoint now uses `getVisibilityScope()` + `buildUserIdFilter()` for job lookup instead of `userId: req.user.id`, matching the same team visibility rules as the job listing API

## 6. Documentation Hub — 3-Category Restructure

**New files:**
- `frontend/src/pages/docs/DocsHub.tsx` — 3-category landing page (Quick Start / API / Community)
- `frontend/src/pages/docs/DocsProductGuide.tsx` — 8-step product usage guide for HR users
- `frontend/src/pages/docs/DocsCommunity.tsx` — Knowledge hub with search, category filters, and full article rendering

**Modified files:**
- `frontend/src/layouts/DocsLayout.tsx` — Sidebar navigation updated for `/docs/api/*` URL structure
- `frontend/src/App.tsx` — New routes for `/docs` (hub), `/docs/quick-start`, `/docs/community`, `/docs/community/:slug`. API docs moved under `/docs/api/*`. Old URLs redirect.
- `frontend/src/pages/docs/index.ts` — Added exports for new pages

**URL restructure:**
- `/docs` → DocsHub (3-category landing)
- `/docs/quick-start` → Product guide for HR users
- `/docs/community` → Knowledge hub
- `/docs/community/:slug` → Individual article with SEO
- `/docs/api` → API overview (was `/docs/overview`)
- `/docs/api/*` → All API docs (existing, moved under /api/ prefix)
- Old URLs (`/docs/overview`, `/docs/authentication`, etc.) redirect to new paths

## 7. Community Knowledge Hub — 9 Deep Research Articles

**9 articles with full content, each with internet research, data, and actionable advice:**

| # | Title | Category | Read Time |
|---|---|---|---|
| 1 | 如何在 48 小时内完成一轮校招初筛 | 招聘策略 | 12 min |
| 2 | 初创公司招聘的 5 个核心策略 | 招聘策略 | 15 min |
| 3 | 结构化面试设计完全指南 | 招聘策略 | 18 min |
| 4 | 技术岗面试：如何评估候选人的真实编码能力 | 面试技巧 | 16 min |
| 5 | STAR 面试法：行为面试的黄金标准 | 面试技巧 | 15 min |
| 6 | Offer 谈判：如何在预算内拿下心仪候选人 | 谈薪技巧 | 14 min |
| 7 | 2026 年技术岗薪资趋势与对标 | 谈薪技巧 | 14 min |
| 8 | 写出让候选人心动的 JD：7 个实用技巧 | 候选人吸引 | 13 min |
| 9 | 被动候选人触达策略 | 候选人吸引 | 15 min |

## 8. Community Articles — SEO/GEO Standard

**Implementation in `DocsCommunity.tsx`:**

- Each article has `slug` and `datePublished` fields
- Opening an article updates browser URL to `/docs/community/{slug}` via `replaceState`
- Direct navigation to `/docs/community/{slug}` auto-opens the article
- Dynamic `<SEO>` component switches between listing (CollectionPage) and article (Article) meta
- Per-article JSON-LD: `Article` schema (headline, author, publisher, datePublished, keywords, wordCount, timeRequired) + `BreadcrumbList` schema
- Listing page JSON-LD: `CollectionPage` with all articles as `hasPart`
- All articles inherit hreflang for 8 languages via SEO component

## 9. Homepage vs Product Intro Comparison

**New file:** `docs/homepage-vs-product-intro-comparison.md` — Detailed comparison analysis documenting why ProductIntro's content/design is more suitable as homepage.
