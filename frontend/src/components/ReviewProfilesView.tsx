import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from '../lib/axios';
import { useCandidateInteractionTracker } from '../hooks/useCandidateInteractionTracker';
import type {
  ParsedEducation,
  ParsedExperience,
  ParsedResumeData,
  ParsedSkills,
  RunCandidate,
} from '../hooks/useAgentRunStream';
import AgentCriteriaModal, { type AgentCriterion } from './AgentCriteriaModal';

interface Props {
  agentId: string;
  candidates: RunCandidate[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onBack: () => void;
  onDone: () => void;
}

type ProfileTab = 'experience' | 'education' | 'skills';

export default function ReviewProfilesView({ agentId, candidates, onApprove, onReject, onBack, onDone }: Props) {
  const { t } = useTranslation();

  // Phase 7b — track implicit signals (profile expansions, dwell time on
  // the detail view) for the memory synthesis worker to consume later.
  const tracker = useCandidateInteractionTracker({ agentId });

  // Only candidates that are still pending are reviewable. Once all pending are
  // acted upon, show the completion screen and let the user return to the list.
  const pending = useMemo(() => candidates.filter((c) => c.status === 'pending'), [candidates]);
  const [index, setIndex] = useState(0);
  const [tab, setTab] = useState<ProfileTab>('experience');
  const [criteriaOpen, setCriteriaOpen] = useState(false);
  const [criteria, setCriteria] = useState<AgentCriterion[]>([]);
  // parsedData is lazy-loaded per candidate — the SSE stream omits it to
  // keep the drawer open time small. Values: undefined = not fetched,
  // null = fetched but empty, object = loaded.
  const [parsedById, setParsedById] = useState<Record<string, ParsedResumeData | null>>({});

  // Dwell tracking — record time spent viewing each candidate's profile.
  // When the user navigates to a new profile, emit a `dwell` event for the
  // previous one with the elapsed ms. On unmount, flush the current card.
  const dwellStartRef = useRef<number>(Date.now());
  const dwellCandidateRef = useRef<string | null>(null);

  // Load the agent's stored criteria the first time the user opens the modal.
  const openCriteria = useCallback(async () => {
    try {
      const res = await axios.get(`/api/v1/agents/${agentId}`);
      const config = res.data.data?.config as { criteria?: AgentCriterion[] } | null;
      setCriteria(config?.criteria ?? []);
    } catch {
      setCriteria([]);
    }
    setCriteriaOpen(true);
  }, [agentId]);

  // Clamp index when the pending list shrinks from underneath us
  useEffect(() => {
    if (index >= pending.length && pending.length > 0) {
      setIndex(pending.length - 1);
    }
  }, [index, pending.length]);

  const current = pending[index];

  // Fetch parsedData on demand for the current (and next) card so the
  // recruiter never sees an empty profile while paging through reviews.
  useEffect(() => {
    const targets = [pending[index], pending[index + 1]].filter(
      (c): c is RunCandidate => !!c && parsedById[c.id] === undefined,
    );
    if (targets.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const c of targets) {
        try {
          const res = await axios.get(`/api/v1/agents/${agentId}/candidates/${c.id}/details`);
          if (cancelled) return;
          const parsedData = (res.data?.data?.resume?.parsedData ?? null) as ParsedResumeData | null;
          setParsedById((prev) => ({ ...prev, [c.id]: parsedData }));
        } catch {
          if (cancelled) return;
          setParsedById((prev) => ({ ...prev, [c.id]: null }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agentId, index, pending, parsedById]);

  // Emit an `expanded` event when the viewed candidate changes, and emit a
  // `dwell` event for the previous one with elapsed time since last change.
  useEffect(() => {
    if (!current) return;
    const prevCandidateId = dwellCandidateRef.current;
    const prevStart = dwellStartRef.current;
    if (prevCandidateId && prevCandidateId !== current.id) {
      const elapsed = Date.now() - prevStart;
      if (elapsed > 500) {
        tracker.trackDwell(prevCandidateId, elapsed, current.resumeId ?? undefined);
      }
    }
    dwellCandidateRef.current = current.id;
    dwellStartRef.current = Date.now();
    tracker.trackExpanded(current.id, current.resumeId ?? undefined);
  }, [current, tracker]);

  // Flush the current dwell when the view unmounts
  useEffect(() => {
    return () => {
      const id = dwellCandidateRef.current;
      if (id) {
        const elapsed = Date.now() - dwellStartRef.current;
        if (elapsed > 500) {
          tracker.trackDwell(id, elapsed);
        }
      }
      void tracker.flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const advance = useCallback(() => {
    if (pending.length <= 1) {
      // That was the last pending profile.
      return;
    }
    // After an action, the current candidate drops out of `pending`, so the
    // next candidate shifts into position `index`. Only advance if we're at
    // the end.
    if (index >= pending.length - 1) setIndex(Math.max(0, pending.length - 2));
  }, [index, pending.length]);

  const handleApprove = useCallback(() => {
    if (!current) return;
    onApprove(current.id);
    advance();
  }, [current, onApprove, advance]);

  const handleReject = useCallback(() => {
    if (!current) return;
    onReject(current.id);
    advance();
  }, [current, onReject, advance]);

  const handlePrev = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
    setTab('experience');
  }, []);

  const handleNext = useCallback(() => {
    setIndex((i) => Math.min(pending.length - 1, i + 1));
    setTab('experience');
  }, [pending.length]);

  // Keyboard shortcuts: A=approve, R=reject, arrows=navigate
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ignore when typing in inputs
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        handleApprove();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        handleReject();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onBack();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleApprove, handleReject, handlePrev, handleNext, onBack]);

  // Completion state
  if (pending.length === 0) {
    return (
      <div className="flex h-full flex-col bg-white">
        <Header onBack={onBack} title={t('agents.workbench.review.title', 'Review Profiles')} />
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
          <div className="mb-4 rounded-2xl bg-green-50 p-4">
            <svg className="h-10 w-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-slate-900">
            {t('agents.workbench.review.doneTitle', 'All profiles reviewed')}
          </h3>
          <p className="mt-2 max-w-md text-sm text-slate-500">
            {t('agents.workbench.review.doneDesc', 'Your feedback has been recorded. Return to the list to take action on approved profiles.')}
          </p>
          <button
            onClick={onDone}
            className="mt-6 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-700"
          >
            {t('agents.workbench.review.backToList', 'Back to results')}
          </button>
        </div>
      </div>
    );
  }

  const resume = current.resume ?? null;
  const parsed = parsedById[current.id] ?? resume?.parsedData ?? null;
  const location = parsed?.address ?? '';

  return (
    <div className="flex h-full flex-col bg-white">
      <Header onBack={onBack} title={t('agents.workbench.review.title', 'Review Profiles')} />

      {/* Body: 2 columns (profile + sidebar) */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: profile detail — scrollable */}
        <div className="flex-1 overflow-y-auto border-r border-slate-200 px-8 py-6">
          {/* Candidate header */}
          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold text-slate-900">{current.name}</h1>
                {resume && (
                  <a
                    href={`/product/resumes/${resume.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-violet-600 hover:underline"
                  >
                    {t('agents.workbench.review.fullProfile', 'Full profile')}
                  </a>
                )}
                {typeof current.matchScore === 'number' && (
                  <span className="rounded-md bg-slate-900 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                    {Math.round(current.matchScore)}
                  </span>
                )}
              </div>
              {location && <p className="mt-1 text-sm text-slate-500">{location}</p>}
              {!location && current.headline && <p className="mt-1 text-sm text-slate-500">{current.headline}</p>}
            </div>
            <SocialLinks parsed={parsed} />
          </div>

          {/* Profile tabs */}
          <div className="mb-4 border-b border-slate-200">
            <div className="flex gap-4">
              {(['experience', 'education', 'skills'] as ProfileTab[]).map((key) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`relative py-2 text-sm font-medium transition-colors ${
                    tab === key ? 'text-violet-700' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {t(`agents.workbench.review.tabs.${key}`, key)}
                  {tab === key && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t bg-violet-600" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {tab === 'experience' && <ExperienceList items={parsed?.experience ?? []} />}
          {tab === 'education' && <EducationList items={parsed?.education ?? []} />}
          {tab === 'skills' && <SkillsMap skills={parsed?.skills} tags={resume?.tags ?? []} />}
        </div>

        {/* Right: calibration sidebar */}
        <aside className="flex w-64 flex-none flex-col bg-slate-50 px-5 py-6">
          <button
            onClick={openCriteria}
            className="mb-5 inline-flex items-center gap-1.5 self-start text-sm font-medium text-violet-700 hover:text-violet-800"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            {t('agents.workbench.review.addCriteria', 'Add Criteria')}
          </button>
          <div className="mb-5 flex items-center justify-between">
            <button
              onClick={handlePrev}
              disabled={index === 0}
              className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-40"
              aria-label={t('agents.workbench.review.prev', 'Previous')}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-sm font-medium text-slate-700">
              {t('agents.workbench.review.counter', 'Profile {{current}}/{{total}}', {
                current: index + 1,
                total: pending.length,
              })}
            </span>
            <button
              onClick={handleNext}
              disabled={index >= pending.length - 1}
              className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-40"
              aria-label={t('agents.workbench.review.next', 'Next')}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          <button
            onClick={handleApprove}
            className="mb-3 flex items-center justify-center gap-2 rounded-xl border-2 border-green-200 bg-green-50 px-5 py-3 text-sm font-semibold text-green-700 transition-colors hover:border-green-300 hover:bg-green-100"
          >
            {t('agents.workbench.review.approve', 'Approve')}
            <kbd className="rounded border border-green-300 bg-white px-1.5 py-0.5 text-[10px] text-green-700">A</kbd>
          </button>
          <button
            onClick={handleReject}
            className="mb-4 flex items-center justify-center gap-2 rounded-xl border-2 border-red-200 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700 transition-colors hover:border-red-300 hover:bg-red-100"
          >
            {t('agents.workbench.review.reject', 'Reject')}
            <kbd className="rounded border border-red-300 bg-white px-1.5 py-0.5 text-[10px] text-red-700">R</kbd>
          </button>
          <p className="text-xs leading-relaxed text-slate-500">
            {t('agents.workbench.review.helpText', 'This only calibrates the agent and does not send emails.')}
          </p>

          <div className="mt-auto rounded-xl border border-slate-200 bg-white p-3 text-xs leading-relaxed text-slate-500">
            <p>
              {t(
                'agents.workbench.review.editCriteriaHint',
                'Pin criteria as mandatory or re-order by importance using ',
              )}
              <button onClick={openCriteria} className="font-medium text-violet-700 hover:underline">
                {t('agents.workbench.review.editCriteria', 'Edit Criteria')}
              </button>
              .
            </p>
            <p className="mt-1.5 text-[10px] text-slate-400">
              {t('agents.workbench.review.criteriaHint', 'Use ← → to navigate and Esc to return.')}
            </p>
          </div>
        </aside>
      </div>

      {/* Edit Criteria modal */}
      {criteriaOpen && (
        <AgentCriteriaModal
          agentId={agentId}
          initial={criteria}
          onClose={() => setCriteriaOpen(false)}
          onSaved={(saved) => setCriteria(saved)}
        />
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function Header({ onBack, title }: { onBack: () => void; title: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-slate-200 px-6 py-4">
      <button
        onClick={onBack}
        className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
        aria-label="Back"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
    </div>
  );
}

function SocialLinks({ parsed }: { parsed: ParsedResumeData | null }) {
  const links = [
    { url: parsed?.linkedin, label: 'LinkedIn', icon: LinkedInIcon },
    { url: parsed?.github, label: 'GitHub', icon: GitHubIcon },
    { url: parsed?.portfolio, label: 'Portfolio', icon: LinkIcon },
  ].filter((l): l is { url: string; label: string; icon: typeof LinkIcon } => Boolean(l.url));

  if (links.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5">
      {links.map((l) => (
        <a
          key={l.label}
          href={l.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
          aria-label={l.label}
        >
          <l.icon />
        </a>
      ))}
    </div>
  );
}

function ExperienceList({ items }: { items: ParsedExperience[] }) {
  const { t } = useTranslation();
  if (items.length === 0) {
    return <EmptyState message={t('agents.workbench.review.noExperience', 'No experience data parsed from this resume.')} />;
  }

  // Group by company
  const groups = new Map<string, ParsedExperience[]>();
  for (const item of items) {
    const key = item.company ?? t('agents.workbench.review.unknownCompany', 'Unknown');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }

  return (
    <div className="space-y-6">
      {Array.from(groups.entries()).map(([company, roles]) => (
        <div key={company}>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-500">
              {company.slice(0, 2).toUpperCase()}
            </span>
            {company}
          </h3>
          <ol className="ml-10 space-y-3 border-l-2 border-slate-100 pl-4">
            {roles.map((role, i) => (
              <li key={i}>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-slate-900">{role.role ?? '—'}</p>
                  {role.location && (
                    <span className="text-xs text-slate-500">· {role.location}</span>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  {[role.startDate, role.endDate].filter(Boolean).join(' — ')}
                  {role.duration ? ` · ${role.duration}` : ''}
                </p>
                {role.achievements && role.achievements.length > 0 && (
                  <ul className="mt-1.5 space-y-1 text-xs text-slate-600">
                    {role.achievements.slice(0, 3).map((a, j) => (
                      <li key={j} className="leading-snug">• {a}</li>
                    ))}
                  </ul>
                )}
                {(!role.achievements || role.achievements.length === 0) && role.description && (
                  <p className="mt-1.5 whitespace-pre-line text-xs leading-snug text-slate-600 line-clamp-4">
                    {role.description}
                  </p>
                )}
                {role.technologies && role.technologies.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {role.technologies.slice(0, 8).map((tech) => (
                      <span key={tech} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                        {tech}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

function EducationList({ items }: { items: ParsedEducation[] }) {
  const { t } = useTranslation();
  if (items.length === 0) {
    return <EmptyState message={t('agents.workbench.review.noEducation', 'No education data parsed from this resume.')} />;
  }
  return (
    <div className="space-y-4">
      {items.map((e, i) => (
        <div key={i} className="flex gap-3">
          <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-500">
            {(e.institution ?? '—').slice(0, 2).toUpperCase()}
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-900">{e.institution ?? '—'}</p>
            <p className="text-xs text-slate-600">
              {[e.degree, e.field].filter(Boolean).join(' · ')}
            </p>
            <p className="text-xs text-slate-500">
              {[e.startDate, e.endDate].filter(Boolean).join(' — ')}
              {e.gpa ? ` · ${e.gpa}` : ''}
            </p>
            {e.achievements && e.achievements.length > 0 && (
              <ul className="mt-1.5 space-y-0.5 text-xs text-slate-600">
                {e.achievements.slice(0, 3).map((a, j) => (
                  <li key={j}>• {a}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function SkillsMap({ skills, tags }: { skills: ParsedSkills | string[] | undefined; tags: string[] }) {
  const { t } = useTranslation();

  const groups: Array<{ label: string; items: string[] }> = [];
  if (Array.isArray(skills)) {
    if (skills.length > 0) groups.push({ label: t('agents.workbench.review.skillGroups.all', 'Skills'), items: skills });
  } else if (skills && typeof skills === 'object') {
    if (skills.technical?.length) groups.push({ label: t('agents.workbench.review.skillGroups.technical', 'Technical'), items: skills.technical });
    if (skills.languages?.length) groups.push({ label: t('agents.workbench.review.skillGroups.languages', 'Languages'), items: skills.languages });
    if (skills.frameworks?.length) groups.push({ label: t('agents.workbench.review.skillGroups.frameworks', 'Frameworks'), items: skills.frameworks });
    if (skills.tools?.length) groups.push({ label: t('agents.workbench.review.skillGroups.tools', 'Tools'), items: skills.tools });
    if (skills.soft?.length) groups.push({ label: t('agents.workbench.review.skillGroups.soft', 'Soft Skills'), items: skills.soft });
    if (skills.other?.length) groups.push({ label: t('agents.workbench.review.skillGroups.other', 'Other'), items: skills.other });
  }
  if (groups.length === 0 && tags.length > 0) {
    groups.push({ label: t('agents.workbench.review.skillGroups.tags', 'Tags'), items: tags });
  }
  if (groups.length === 0) {
    return <EmptyState message={t('agents.workbench.review.noSkills', 'No skills data parsed from this resume.')} />;
  }

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <div key={group.label}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{group.label}</h3>
          <div className="flex flex-wrap gap-1.5">
            {group.items.map((skill) => (
              <span
                key={skill}
                className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700"
              >
                {skill}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
      {message}
    </div>
  );
}

// ── Icons (inline SVG to avoid extra deps) ──────────────────────────────────

function LinkedInIcon() {
  return (
    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
    </svg>
  );
}
function GitHubIcon() {
  return (
    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}
function LinkIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  );
}
