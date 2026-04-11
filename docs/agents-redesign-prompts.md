# Agents Redesign — User Prompts Log

Append-only log of all user prompts driving the Agents page redesign. Newest at the bottom. Do not edit prior entries — add new ones only.

---

## 2026-04-11 — Initial redesign brief

> [Image #1] ，创建 agent，用户只能选择自己创建的岗位，Admin role 的用户则可以选任何 recruiter/user 的岗位。"搜索条件" 和 "指令" 的text box 需要能 auto grow, resizable.
>
> ----------
>
> [Image #2] , redesign agents page, it needs to show the execution result of the agent, for example:
> 1. for search candidates, it needs to show the search results.
> 2. for match resumes, it needs to show the match results.
> -- user can click Like or Dislike, then discard the discarded items.
> -- user can take actions on the Like resumes, Invite to Interview, Contact in Email, Send Message.
> ---- Invite to Inerview, then use the invite api used in the talent hub detail to send the invitation automatically, then keep the invitation records, as well as link to the interview record when interview is completed.
> ---- Contact in email, allow user to compose a message to send to the candidate, the system will provide 5 templates for the user to choose, and then LLM will automatically generate the email content for the user to edit, save as draft, and send.
> ----- Send Message, allow user to send instant message to the candidate, Agent will call an Api to send to the remote OpenClaw agent which has a channel to the user for communication.
>
> -----
>
> As the product designer and the best software architect and Agentic tecnology expert, you will understand my prompt above, then rewrite the prompt with your understanding, if you have questions, ask me to clarify. You are designing the most important feature of RoboHire, The AI Agent is for the user (recruiter) to hire the agent to perform the tasks for them, right now, we know there are two tasks: Search candidate, and Resume Matching, soon, we will expand to many other tasks to automate the entire recruitment workflow and achieve the hiring in 100% automation by the agents, wich are backed by remote OpenClaw instances.
>
> Plan very detailedly, design the architecture, especiall the UI that can be used by both human user and agents, and then write the product spec, before you start the implementation.
> Also write up the product spec in markdown file.
>
> and save my prompts in a prompt file, all of my prompts! thanks!

---

## 2026-04-11 — Answers to clarifying questions (round 1)

> 1. currently in services.
> 2. using http, we wrapped the chat in a http call.
> 3. there will be three sources, 1: current InstantSearchMatchService behavior; 2: internal resume repository (in MinIO); 3: external resources (via api). we need to design the configuration for this (in admin page).
> 4. yes.
> 5. scheduled runs in v1. design an agent table in Neon database, create a complete record, with status, activities, errors, logs, and the external OpenClaw will also update the database for the agent activities and status.
> 6. you proposed the template set, not limited to 5 templates, can be more, see how other AI recruitment startups are doing.

---

## 2026-04-11 — Round 2 clarifying questions (Phase 1 readiness)

> 1. what do I need to provide for OpenClaw filename (blocks Phase 7 only)?
> 2. what is this? Any schema objections before you push. I ran `npm run db:push --workspace=backend` already.
> 3. is it ready for you to start Phase 1?

---

## 2026-04-11 — Review Profiles screen designs + score floor 60

> [Image #2], [Image #4], [Image #5], [Image #6], [Image #3], [Image #7], besides showing the results in list and card view, these are the screens for the agent's result window, for user to approve or reject. Only provide the matching score higher than 60.
>
> (Images were screenshots of juicebox-style Review Profiles UI with Approve/Reject sidebar, Experience/Education/Skills tabs, keyboard shortcuts A/R, "Profile 1/3" counter, "+ Add Criteria" affordance, and Criteria modal with pinned Most Important / Least Important sections.)

---

## 2026-04-11 — Phase 3 before 2c

> do Phase 3 first, then 2c.

---

## 2026-04-11 — Batch ship: fix limitations + Phase 4 + Phase 5 (going to bed)

> 1. please tackle the known limitations first, good idea.
> 2. Then you can start Phase 4.
> 3. please also implement the extensive and comprehensive log for the agent run, including (but not limited to) token usage (input/output), costs, latency, time taken, total time, call sequences, etc.), and a realtime terminal window showing all the progress (only Admin Role user can acees this realtime terminal window).
>
> ---
> as usual, please document all of these, and save all my prompts, and the tech and deisng spec. I am going to bed, please launch many agents to design, build, and test without me. Thanks!

---

## 2026-04-12 — Running-run rich card + speed up activity log + agent name on rows

> [Image #8], when agent is running, show more information about running activities. in [Image #9], 活动日志需要 show/log the agent name, and speed p the display of the 【活动日志】, index the database table, or something.
>
> (Drove: the rich LiveRunCard with elapsed timer + last activity + metric grid + token line; the SSE-fed activity stream replacing one-shot REST; agent name on every activity row; payload-size trimming with errorStack excluded from list responses.)

---

## 2026-04-12 — Tokens/cost bug + admin-only gating + run summary section

> [Image #10], why the token usage and the costs in the log are all 0? token usage and costs should only be available to see for admin role users.
> 2. each agent run should have a summary section (summary data and summarized result)
>
> (Drove: root-causing the `logger.startRequest()` missing-context bug that silently dropped per-call LLM records; admin-only scrubbing helpers on six endpoints; `GET /agents/:id/runs/:runId/summary` endpoint; `RunSummaryCard` with top candidates / common strengths / common gaps / admin-only LLM stats; conditional frontend rendering gated on `user.role === 'admin'`.)

---

## 2026-04-12 — "Find more" + criteria suggestions + fix stuck running display + DOCUMENT EVERYTHING

> [Image #11], this is still showing "运行中", and the result shows 5 matches. allow user to click on find more, or run again, then the agent will continue to search and match candidates to match the job and requirements, but don't match the ones the agent already had matched, make sure to keep a matched list. you should design the feature for the recruiter, if recruiter does not like any of the candidates the agent searched, then RoboHire agent can make some suggestions in the criteria and requirements.
>
> also,, i want you to document your deisng, what you have done so far for the agent feature, including all the rundown for all phases and fixes. please do that before it gets lost, it is important.

---

## 2026-04-12 — Ideal Candidate Profile (ICP) + 硬性条件 + smart agent that learns

> [Image #12], after user accepts / rejects the search match results, design an agent using LLM to generate an ideal canidate profile, which will be used to run the future search and match, save this as a record for the user / agent. implement Run Again / More that will use the ideal candidate profile to do the searches, but exclue the ones that the agent already matched.
>
> - In Criteria, and creating agents, editing agent, editing filter, add a "硬性条件" to filter out the candidate.
>
> -- Please thing again, and learn from what we are trying to achieve to implement the smart and intelligent agent which also learn from user's likes and dislikes, and not just keywork match.
> -- Also optimize our prompts for the agent to provide the smart feature by taking the ideal candidate profile and user's 硬性条件。
>
> ------ save all my prompts, create design docs, and tasks, then go ahead and implement. launch designer agent, product spec agent, architect agent, and 2 coding agents, and one test agents, and one the doc agent to document everything again.

---

## 2026-04-12 — Context engineering / mem0 discussion

> make sure you document everything, and my prompts.
>
> also, I thought about one thing, should you implement mem0, I mean, implement context engineering so that, the idea candidate profile, and maybe the user's preference, and click history can be used to learn to enhance future search and match to further improve the accuracy of the search and match to meet user's needs, with better understanding of user?

---

## 2026-04-12 — Phase 7 green-light: Context engineering / memory layer

> yes, please 7a/b/c/d.
> 1. write the Phase 7 design doc now, and start actually implement now.
> 2. Study Mem0, learn from it, and you decide how to build, evaluate mem0's API, spawn a research agent for that in parallel.
> 3. Sure, the memory should have an expiration, and be hiring requirements aware. knowing the preference is for a particular or for the company who owns the hiring job company-wide.
> 4. yes, per-user, per-team, or per-workspace. and yes, opt-in team sharing.
> ---- go ahead and write the design doc first, and save my prompts, and start implementation. Thanks

---

## 2026-04-12 — Memory Manager for Admin role

> For admin role users, how can admin see all the memory files, and can modify them? please design and implement a Memory Manager for Admin.

---

## 2026-04-12 — End-user guide (recruiters, 中文)

> please write up a user guide for the end-user to use the Agent functionaly, user is recruiter. use 中文。

---

## 2026-04-12 — Documentation catch-up pass

> please insure everything is documented so far

---

## 2026-04-12 — Prompts log double-check (pre-restart)

> also have you saved all my prompts? please double check again, i am about to restart the computer.
