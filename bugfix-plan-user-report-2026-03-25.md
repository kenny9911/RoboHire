# User Bug Report Plan - 2026-03-25

## Plain-Language Understanding

### Bug 1: Hiring project numbers do not match job numbers
- The user sees inconsistent counts between `招聘项目` and `职位`.
- In some screenshots, one side shows data while the other side shows `0`.
- The practical user impact is that recruiters cannot trust the pipeline numbers shown in the product.

### Bug 2: Some AI summaries in Talent Hub are obviously wrong
- Most candidate summaries look useful.
- A few summaries only show one sentence copied from the resume template or a decorative slogan.
- The practical user impact is that the AI summary becomes misleading and low value.

### Bug 3: "View Recording" opens a browser security warning
- Clicking `查看录像` opens a browser warning page first.
- After the recruiter clicks through, the video still plays.
- The practical user impact is broken trust and a bad UX on the interview review flow.

## Troubleshooting Summary

### Bug 1
- Hiring project data uses `candidate` and `resumeJobFit`.
- Job data uses `jobMatch` and `interview.jobId`.
- These are different pipelines, so linked records can drift or show zero on one side.

### Bug 2
- Resume summary generation trusted `parsed.summary` whenever it was long enough.
- Some resumes store a template slogan or self-evaluation sentence in `parsed.summary`.
- That bad field then gets surfaced directly into Talent Hub.

### Bug 3
- The frontend opened `interview.recordingUrl` directly in a new tab.
- That URL is a third-party storage/video URL outside the RoboHire domain.
- Browser trust/certificate/interstitial issues on that external host are exposed directly to the user.

## Independent Review

- A second agent independently reviewed the same report and reached the same three root-cause directions:
  - mixed stats models for hiring vs jobs
  - low-quality `parsed.summary` being reused as a trusted AI summary
  - raw third-party video URL being opened directly by the browser

## Solution Design

### Bug 1
- Standardize visible stats around the active hiring pipeline.
- For linked jobs, reconcile direct `jobMatch/jobId` counts with `resumeJobFit/hiringRequestId` counts.
- For hiring request list cards, expose a normalized `stats` object so the UI no longer depends on mixed legacy counters.

### Bug 2
- Add a summary quality gate before reusing `parsed.summary`.
- Reject obvious slogans, decorative template text, and low-signal generic self-evaluations.
- Fall back to regenerated summary content instead of trusting a bad parsed summary.
- Add a frontend guard so clearly bad summaries are not shown even before all old records are regenerated.

### Bug 3
- Add a same-origin backend recording proxy.
- Return a RoboHire-hosted recording viewer URL in interview payloads.
- Update the AI Interview page to open the proxy URL instead of the raw third-party link.

## Implementation Tasks

1. Fix job stats aggregation for linked hiring-request jobs.
2. Normalize hiring request card stats for candidates, matches, and interviews.
3. Normalize hiring dashboard aggregate stats where the old candidate table lags the active pipeline.
4. Add summary quality validation on the backend before trusting `parsed.summary`.
5. Add frontend fallback to suppress obviously bad Talent Hub summaries.
6. Add a protected recording proxy endpoint under `/api/v1/interviews/:id/recording-file`.
7. Update AI Interview UI to use the same-origin recording link.
8. Build and verify backend and frontend after the patch set.

## Current Fix Status

- In progress.
