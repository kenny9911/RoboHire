# Agent Alex Redesign Brief

**Date**: 2026-04-09
**From**: Kenny

## User Requirements (verbatim)

> as a prompt engineering expert, review the prompt for agent Alex, we want it to be interacting with the user in a native and fluent tone, should be chatting like a human, instead of 使用生硬的语气，use the native language of the user-selected language, rather than using the straight translation. The prompt should also detect the user's intent, and research a better way to research, or implementing a Claude SKILL, or using multiple agents (running in parallel) to provide knowledgeable and insightful recommendation for user to meet their hiring needs.
>
> make sure you ask me questions that you are not sure. and document how agent Alex works, and really challenge to create a recruitment consultant that is better than any professional recruiter.

## Goals

1. **Natural tone**: Chat like a human recruiter, not a robot. Native-sounding language, not stiff machine translation.
2. **Intent detection**: Understand what the user actually wants, not just follow a rigid flow.
3. **Expert insights**: Provide knowledgeable recruitment recommendations (salary benchmarks, market trends, role framing, candidate persona, etc.)
4. **Architecture options**: Explore Claude SKILL, multi-agent parallel execution, or other approaches.
5. **World-class**: Should outperform a professional recruiter in breadth of knowledge and speed of specification drafting.

## Decisions

1. **LLM**: Can use Claude (switching from Gemini is approved)
2. **Latency**: Must be responsive — use complexity-based routing. Simple turns fast, complex analysis can take longer but show progress indicators.
3. **"Claude SKILL"**: Means the Claude Code Skill system — explore if it can run at runtime (likely not directly, but the pattern/architecture is interesting for sub-agent design).
4. **Primary user**: HR recruiters — ranges from experienced to junior. Alex should adapt depth accordingly.
5. **Primary market**: All markets equally. Check user's selected language first, or infer from browser geolocation.
6. **Proactive insights**: YES — Alex should proactively offer market insights, challenge unrealistic requirements, suggest improvements. But if user insists on their choice, respect it and don't force.
7. **Domain data**: If Alex can search the internet, do so (show loading indicator). Otherwise fall back to LLM pre-training knowledge.
8. **Tone**: Casual but professional — like a senior recruiter colleague.
9. **Personality**: Neutral, warm, occasionally humorous. Not robotic, not over-the-top.

## User Prompts (verbatim log)

### Prompt 1 (initial brief)
> as a prompt engineering expert, review the prompt for agent Alex, we want it to be interacting with the user in a native and fluent tone, should be chatting like a human, instead of 使用生硬的语气，use the native language of the user-selected language, rather than using the straight translation. The prompt should also detect the user's intent, and research a better way to research, or implementing a Claude SKILL, or using multiple agents (running in parallel) to provide knowledgeable and insightful recommendation for user to meet their hiring needs.
>
> make sure you ask me questions that you are not sure. and document how agent Alex works, and really challenge to create a recruitment consultant that is better than any professional recruiter.
>
> -- please remember to save all my prompts in a file.

### Prompt 2 (answers)
> 1。you can use Claude.

### Prompt 6 (stop button + thinking indicator)
> Agent Alex should have a stop button to kill the current request. Enhance "Thinking ..." to show what it is doing, using just one line (not showing multiple lines), do you know what i mean. think of how Claude and Gemini do for the thinking progress. think of a better way to show, and let me know if you have questions.

### Prompt 5 (go ahead)
> proceed with this full plan， also check with the UI Design agent /skills to see if UI for Agent Alex can be beautified.

### Prompt 4 (architecture decisions)
> keep Gemini for all of the live voice features. use Opus 4.6 for: user asks something deeply analytical (salary benchmarking, role structuring), and the main conversation, requirement extraction, proactive insights. Sonnet 4.6 for quick acknowledgments, suggestion chips, simple follow-ups. Do not use Haiku.
>
> - Configurable in .env to choose Claude or Gemini for Agent Alex, and also add the configuration in /product/Admin page.
> - implement web search, let me know which web search you recommend. configure in .env to turn on and off the web search.

### Prompt 3 (answers continued)
> 2. depending on the complexity of user's ask or tasks. it should be responsive, since users are generally not patient.
> 3. I mean Claude Code Skill system, if it is possible to run in runtime.
> 4. mostly hiring recruiter, it could be an experienced recruiter or a junior recruiter.
> 5. all markets, so should first check which language user selected, or you can check the geo location from the browser.
> 6. yes, Alex needs to be very knowledgeable, should proactively provide user insights and offer suggestions, but if user insist, then don't force user.
> 7. if Alex can search internet that would be great, (show indidication if doing search), otherwise use LLM-pretraining.
> 8. Casual but professional.
> 9. stay neutral, be warm, and sometimes humor.
>
> -- don't forget to save all my prompts.
