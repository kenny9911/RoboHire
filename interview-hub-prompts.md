# Interview Hub Feature — Conversation Prompts

A chronological log of every user prompt during the build-out of the GoHire CSV import pipeline, scan-and-select feature, backfill, and detailed reporting in `/product/interview-hub`.

---

## 1. Initial CSV import requirements (rewrite request)

> in /product/interview-hub page, when running "导入 CSV", after loading the interview records, need to
>
> 1. import the resume into "人才库"， and need to create and update records in the database propery, and parse the resume described in '简历下载地址' column and upload to the database. Make sure to capture recruiter name, company, candidate preference, and all the records in the csv file properly into the database.
> 2. create or update the Job in the database, if the Job is not existent already.
> 3. design and create a candidate user management, for each user imported or invite to the interview, need to create a user id (use gohire_user_name and gohire_user_id columns) for that user, so that the user can log into the system later to see the candidate part (we will design the candidate system later).
>
> I may have missed something here, you are the product archtect and product design of RoboHire, you tell me if anything else is missing and let's add it in. ---> rewrite my prompt first (as I think it was poorly written, thanks)

---

## 2. Move to implementation planning

> move to implementation planning, (fill in candidate preference based on the fields you find in the csv)

---

## 3. Recruiter association

> can you make sure that each candidate is associated with the recruiter?

---

## 4. Show recruiter name in interview detail

> in 面试库 detail, also show the recruiter name
> please continue

---

## 5. Continue / status check

> please continue, are you working?

> continue

> are you done with all phases?

---

## 6. Resume backfill scanner (initial)

> write code to Run a complete check for all the interview records in 面试库，check if the resume exists in talent hub, if not, create a new record in talent hub with proper recruiter associated with it. for example, '韩彦博' has an interview record in 面试库 but does not have a resume in Talent hub (candidates/resumes).

---

## 7. Never overwrite existing resumes

> make a modification: in /backfill-resumes, if the resume already exists in the Talent hub, then do not overwrite, just write to a log and create a status report showing the complete log, separate successful and unsuccessful ones. DO NOT OVERWRITE the resume that is already existent !!!! REMEMBER.

---

## 8. Detailed progress + graceful stop

> implement a detailed progress bar and progression information for the resume sync, also implement a stop button to gracefully stop the entire sync batch but finish the current resume that is in proces. Check the progress sofar, closing the current resume, and close the batch gracefully, in the end show user the completely detailed report on the screen.

---

## 9. Bug report — 500 errors in interview-hub

> error in interview-hub, [screenshot of multiple 500 errors on `/api/v1/tasks/stats`, `/api/v1/tasks/notifications`, `/api/v1/gohire-interviews?...`]

---

## 10. Scan & Select (preview before sync)

> In interview-hub, in addition to the resume sync batch process, now as a product architect and software engineer, design and implement a function which will do a check for all the interviews' resume that do not exist in the talent hub, jist list the information of these on the screen, without doing the sync and parsing. and let users select ones they want to create to the talent hub. please do think thoroughly on the function, we cannot mess up the resume database.

---

## 11. Add duration, time, recruiter to scan list

> 在 '缺少简历的面试'页面上，also 列出 面试长短（分钟），若小于9分钟的可以忽略。除了面试日期，也列出面试时间， 列出 recruiter 名字。

---

## 12. Restrict admin-only buttons

> '同步简历'，'扫描并选择'，'导入CSV'， 这三个功能只能给 Admin role 的用户使用，一般用户不能使用，也要隐藏，让他们看不到。

---

## 13. Unselect all + duration formula fix

> [screenshot of scan modal]
>
> 加一个'Unselect all" / "取消全选"。 '面试时长'='面试结束时间'-'gohire_interview_datetime'。 请改一下

---

## 14. Debug — 龙正潇 already exists but scan didn't detect it

> 你 debug 一下， "龙正潇" 已经存在 talent hub, 为何"扫描并选择"说没有存在？
>
> [screenshots: scan modal showing 龙正潇 with `创建用户+简历` action; talent hub showing 龙正潇's existing resume]

---

## 15. Original resume viewer bug — store the PDF

> there is a bug in viewing original resume, this is what it shows [screenshot of garbage parsed-text PDF view], it should be [screenshot of real PDF with photo and formatting], please investigate, (1) are you parsing it when import or getting the original resume? . you should store the original pdf file, here is the link for this case, https://report-agent.gohire.top/gohire-data/gohire/godown/download/YjJhNjdlMTUtNTYwNS00ZGVjLTkzZGItMDNkNTgyNGU4Y2Fk, this is coming from the imported csv file.

---

## 16. CSV import — detailed report with clickable links

> [screenshot of basic import results modal with only summary counts]
>
> 导入过程，要显示more information, 也要一个导入报告，哪些成功，哪些失败，失败的理由，要能点链接看原始档案，和导入好的 data, not just a summary like this [screenshot]

---

## 17. Mobile-friendly detail page with Evaluation as 4th tab

> make /product/interview-hub detail page mobile-friendly, when in mobile mode, add the Evaluation panel to the forth tab of the resume, make sure that user can view the entire tab content. add this prompt to the prompt file

---

## 18. Bump CSV import concurrency to 10

> for improting csv to interview-hub, maximize the number of agents to 10 agents to run in parallel, instead of 3.

---

## 19. Mobile view — tab content not visible

> [screenshot of mobile view showing empty gray area below tab buttons]
>
> cannot see the resume, job description, and transcript in mobile view. please optimize the ui when in mobile mode. keep the desktop mode as is.

---

## 20. Mobile view — Evaluation panel pushed below

> [screenshot of mobile view showing evaluation panel below empty tab area]
>
> in mobile view, the Evaluation panel is pushed down blow, please re-adujust the ui and code

---

## 21. Remove /product/hiring page (Pipeline/Project)

> /product/hiring, this page is redundant in the new prcess, where we generate JD directly from Agent Alex, or from scratch, really no need to the "Pipeline" or "Project" phase. pleas remove this from the web app.

---

## 22. Move Tasks to top-right, gate Client Management by agency role

> Move "任务" to the right upper icon, left to "notifications" icon, make the "Client Management" section, only available to the user of "agency" user role. add a user role type "agency" to the user management.

---

## 23. Resume sync errors — race condition + 404

> [screenshot of failed entries: 陈姓威 with HTTP 404 and Prisma unique constraint errors]
>
> errors in syncing resumes from interview-hub to talent-hub.

---

## 24. Live progress updates during resume sync

> [screenshot of progress UI showing 0/35 while tasks are actively processing]
>
> it needs to update the completed numbers when the batch is in progress, rather than wait till the end and show the numbers.

---

## 25. Support legacy .doc files

> [screenshot of failed entry: 朱凤至 — "Legacy .doc files are not supported yet. Please save the Word document as .docx and upload again."]
>
> can we support the legacy word doc?
