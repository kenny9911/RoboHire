# Bug Fix Report: Arrange Interview Resume Parsing

Date: 2026-03-25
Status: Fixed
Owner: Codex

## Summary

The "Arrange Interview" flow was sending raw `resumeText` directly to the GoHire invitation API. This meant GoHire was free-parsing the resume again during interview invitation, instead of reusing RoboHire's locally parsed `parsedData`.

This caused inconsistent resume understanding between:

- resume upload / resume library parsing
- arrange interview / send invitation parsing

The fix changes the invitation flow to prefer locally parsed `parsedData` and only fall back to raw `resumeText` when the local parse is missing or too incomplete.

## Bug Description

Observed problem:

- Resume parsing in the "Arrange Interview" flow was sometimes incorrect.
- The invitation result could differ from the parsed resume already visible inside RoboHire.

User impact:

- Candidate details interpreted differently at invitation time
- Potential mismatch in role, experience, skills, or contact understanding
- Reduced trust in the interview arrangement workflow

## Root Cause

Before the fix:

1. Frontend arrange interview pages fetched candidate `resumeText`.
2. Backend invitation routes passed that raw text into `inviteAgent.generateInvitation(...)`.
3. `InviteAgent` sent the raw text as `resume_text` to GoHire.
4. RoboHire's existing local `parsedData` was not used as the primary source for invitation payload generation.

As a result, the invitation flow and the upload flow were using different effective parsing paths:

- Upload flow: RoboHire local parsing via `getOrParseResume()` and `ResumeParseAgent`
- Invitation flow: GoHire parsing from raw resume text

## Fix Implemented

Added a new backend service:

- `backend/src/services/InvitationResumeService.ts`

This service:

1. Tries to use locally available `parsedData`
2. Formats that structured data into a stable invitation-ready resume text
3. Checks whether the local parse is too sparse
4. Falls back to raw `resumeText` only when necessary

## Changed Code Paths

Updated:

- `backend/src/routes/api.ts`
- `backend/src/routes/hiring.ts`
- `backend/src/services/InvitationResumeService.ts`

Affected endpoints:

- `POST /api/v1/invite-candidate`
- `POST /api/v1/batch-invite`
- `POST /api/v1/hiring-requests/:id/batch-invite-from-library`

## New Runtime Behavior

After the fix:

1. Invitation routes first resolve an invitation resume payload from local parsed data.
2. If a complete local parse exists, RoboHire sends a structured, normalized resume text to GoHire.
3. If local parsed data is missing or judged incomplete, RoboHire falls back to raw `resumeText`.

This keeps the invitation flow aligned with the resume data already parsed and stored inside RoboHire.

## Why This Fix Is Safer

- Reduces re-parsing drift between upload and invitation flows
- Makes invitation input more deterministic
- Reuses RoboHire's validation logic for sparse parse detection
- Preserves fallback behavior so invitations still work when local parsed data is unavailable

## Validation

Verification completed:

- Backend TypeScript build passed
- Command used: `npm run build --workspace=backend`

## Files Added or Modified

Added:

- `bugfix-report-arrange-interview-resume-parsing.md`
- `backend/src/services/InvitationResumeService.ts`

Modified:

- `backend/src/routes/api.ts`
- `backend/src/routes/hiring.ts`

## Remaining Risks

- If a resume enters the invitation flow without previously stored local `parsedData`, the system still falls back to raw `resumeText`.
- If stored `parsedData` is technically valid but semantically weak, the invitation payload may still inherit that weakness.
- No end-to-end automated test was added in this change.

## Recommended Follow-ups

1. Add request logging for `invitationResumeSource` to measure how often the system uses local parsed data vs raw fallback.
2. Add an integration test covering:
   - uploaded resume with parsed data
   - arrange interview invite
   - payload source selection
3. Consider adding a recruiter-visible warning when invitation had to fall back to raw resume text.

## Final Outcome

The arrange interview flow now prioritizes RoboHire's local parsed resume data instead of letting GoHire freely re-parse the original resume text in the normal case.
