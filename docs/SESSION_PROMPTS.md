# Session Prompts Log — 2026-04-05/06

## 1. Design Documentation

> describe the design style and ui style of the Contacts page and Pipeline page, and overall design style and write them to DESIGN.MD

## 2. Contacts API — Database Table Missing

> fail in creating contacts
>
> (Screenshots: 500 Internal Server Error on `/api/v1/contacts`, Prisma error `The table 'public.Contact' does not exist in the current database`)

## 3. Talent Hub Card Alignment

> in the card of the /product/talent main page, different blocks of data inside the card should align across cards

## 4. Resume Parsing Troubleshooting — 王嘉成

> '/Users/kenny/Downloads/4.3反馈相关简历/【ZZK22_AI应用工程师 _ AI Agent开发-校招_北京 20-40K】王嘉成 2年.pdf', cannot parse the data and extract properly, the parsed data is in the database. please troubleshoot the resume parse code

## 5. Resume Reupload — 404 Error

> failed in uploading resume in http://localhost:3607/product/talent/cmninzbkd03dhfx1becx10bqn
>
> (Screenshots: "Replace Resume File" dialog showing "Resume not found", 404 on `/api/v1/resumes/...ecx10bqn/reupload`)

## 6. Quick Invite — Restore Feature

> 之前有 '一件邀约'的页面/功能，能不能找回来。你看下 quick-invite?

## 7. Quick Invite — Add Entry Points

> 把 /quick-invite 加到 home page, 也加到 /product/ 下面。对于用户来说他们的需求是，手上已经有了一个简历，马上就可以邀约面试，那么就不要再走繁琐流程了。也加一个"一键邀约" button 在 agent Alex 上面。你先设计一下

## 8. Quick Invite Label Rename

> rename "quick invite" label to say "Instant Invite", would this be better and sound better to the user?

## 9. Sidebar Nav — AI Prefix Renaming

> left nav 的 "面试" 改为 "AI 面试"， "评估" 改为 "AI 评估"， "智能匹配" 改为 "AI 筛选匹配"， detail pages 的 title 也要改。 其他语言也改。

## 10. Homepage Menu — Label Fixes

> in homepage menu item, "智能代理" 改为 "AI Agent", "简历筛选" 改为"AI 筛选匹配"， "智能评估" 改为 "AI 评估"。 另外， menu 加上 "一键邀约"

## 11. Interview Hub — Separate Video from Resume

> in this page, separate the video from the resume, divide into two rounded blocks.
>
> (Screenshot: `/product/interview-hub/:id` page with video and resume/JD/transcript tabs in one card)

## 12. Homepage Menu — Duplicate Label Bug

> there is a bug in the menu items, there are two "AI 筛选匹配"， 第一个 "AI 筛选匹配" 应该是 "人才库"。

## 13. Two Bugs — Email + Currency + Agent Alex Search

> 1.目前邀约有两个渠道，一种是可以点击"人才库"中邀约按钮。还有一种是在"AI 面试"中点击"安排面试"。今天在 "候选人偏好" 中更改了邮箱信息， 在用到第一种方式发送邀约的时候发现邮箱信息还是修改前的。用第二种方发送邀约的话就是修改后的邮箱。
>
> 2. 现在创建完职位后的默认货币还是为美元
>
> 3.在和"招聘项目"中的 AI 招聘助手交互过程中，它有建议我可以直接从人才库里搜索匹配的候选人，在输出指令后发现这个功能不能使用
>
> There are two bugs here, 请了解image 和 pasted text 里面的 bug 的内容，分析根本原因。仔细做好计划，再 fix bugs.

## 14. Homepage — Missing Quick Invite Button

> still not seeing "一件邀约" button on homepage !! please check if you modify the right place. and not seeing the button on Agent Alex either.
>
> (Screenshot: homepage at localhost:3607 showing "免费开始" and "预约演示" buttons only, no quick invite)

## 15. Resume Parsing — 王祥雨

> resume parsing error for this resume -> '/Users/kenny/Downloads/4.3反馈相关简历/【ZZK23_AI应用开发工程师（校招方向）_北京 20-40K】王祥雨 25年应届生.pdf'
>
> (Screenshot: "Resume parsing needs review" warning, summary shows "Unable to parse resume")

## 16. Agent Alex — Design Documentation

> create the complete design and implementation documentation for agent Alex

## 17. Resume Parsing — 沈裕超

> this resume did not get parsed --> '/Users/kenny/Downloads/4.3反馈相关简历/【ZZK22_AI应用工程师 _ AI Agent开发-校招_北京 20-40K】沈裕超 26年应届生.pdf'
>
> (Screenshot: detail page showing only name + email, no structured sections)

## 18. Resume Parsing — 孙梅

> this resume did not parse completely --> '/Users/kenny/Downloads/4.2反馈相关简历/【ZZK23_AI应用开发工程师（校招方向）_北京 20-40K】孙梅 25年应届生.pdf'
>
> (Screenshot: name shows as "Unknown", summary shows "孙 梅" with watermark space)

## 19. Build Error Fix

> build errors:
>
> (Screenshot: `TS6133: 'startDraggingRow' is declared but its value is never read` in GoHireEvaluation.tsx:560)

## 20. Search Button i18n

> make the search button in Talent hub i18n.
>
> (Screenshot: "Search" button not translated)

## 21. Resume Parsing — Design Documentation

> create complete design and implementation document for resume parsing modules, detailed and with diagrams, should also including the watermark parsing guideline and tips. we will use this as a design document for follow.

## 22. Job Detail — AI Insights Tab

> add the "生成报告" 功能 to job detail page, add it as a tab called "AI 洞察"
>
> (Screenshot: IntelligenceReportPanel empty state with "招聘智能分析报告" title and "生成报告" button)

## 23. Save Prompts

> save all my prompts into a markdown doc
