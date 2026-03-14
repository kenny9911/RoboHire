import { wordDiff, arrayDiff, type DiffSegment } from '../lib/diffUtils';

type TFn = (k: string, f?: any) => string;

interface RefineDiffViewProps {
  original: Record<string, unknown> | null;
  refined: Record<string, unknown>;
  changes: string[];
  matchedSkills: string[];
  emphasizedExperiences: string[];
  t: TFn;
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Flatten skills (array or categorised object) into a flat string array. */
function flattenSkills(skills: unknown): string[] {
  if (Array.isArray(skills)) return skills as string[];
  if (skills && typeof skills === 'object') {
    const out: string[] = [];
    for (const cat of ['technical', 'soft', 'tools', 'frameworks', 'languages', 'other']) {
      const arr = (skills as Record<string, string[]>)[cat];
      if (Array.isArray(arr)) out.push(...arr);
    }
    return out;
  }
  return [];
}

/** Match structured entries between two arrays by a key function. */
function matchEntries<T extends Record<string, any>>(
  origList: T[],
  refList: T[],
  keyFn: (e: T) => string,
): { orig: T | null; ref: T | null }[] {
  const result: { orig: T | null; ref: T | null }[] = [];
  const refMap = new Map<string, T>();
  const refUsed = new Set<number>();

  for (let i = 0; i < refList.length; i++) refMap.set(keyFn(refList[i]).toLowerCase(), refList[i]);

  for (const o of origList) {
    const key = keyFn(o).toLowerCase();
    const r = refMap.get(key);
    if (r) {
      result.push({ orig: o, ref: r });
      refUsed.add(refList.indexOf(r));
    } else {
      result.push({ orig: o, ref: null });
    }
  }
  for (let i = 0; i < refList.length; i++) {
    if (!refUsed.has(i)) result.push({ orig: null, ref: refList[i] });
  }
  return result;
}

// ── Sub-components ───────────────────────────────────────────────────────

function DiffText({ segments, side }: { segments: DiffSegment[]; side: 'left' | 'right' }) {
  return (
    <span>
      {segments.map((seg, i) => {
        if (seg.type === 'equal') return <span key={i}>{seg.text}</span>;
        if (seg.type === 'removed' && side === 'left')
          return <span key={i} className="bg-red-100 text-red-700 line-through decoration-red-400/60">{seg.text}</span>;
        if (seg.type === 'added' && side === 'right')
          return <span key={i} className="bg-emerald-100 text-emerald-800">{seg.text}</span>;
        return null;
      })}
    </span>
  );
}

function DiffSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h4 className="text-xs font-semibold text-gray-900 mb-3 pb-1.5 border-b border-gray-100">{title}</h4>
      <div className="text-sm text-gray-700">{children}</div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────

export default function RefineDiffView({
  original,
  refined,
  changes,
  matchedSkills,
  emphasizedExperiences,
  t,
}: RefineDiffViewProps) {
  const orig = (original || {}) as Record<string, any>;
  const ref = refined as Record<string, any>;

  const origSummary = (orig.summary || '') as string;
  const refSummary = (ref.summary || '') as string;
  const summaryDiff = wordDiff(origSummary, refSummary);

  const origSkills = flattenSkills(orig.skills);
  const refSkills = flattenSkills(ref.skills);
  const skillsDiff = arrayDiff(origSkills, refSkills);

  const origExp = (orig.experience || []) as Record<string, any>[];
  const refExp = (ref.experience || []) as Record<string, any>[];
  const expMatches = matchEntries(origExp, refExp, (e) => `${e.company}|${e.role}`);

  const origEdu = (orig.education || []) as Record<string, any>[];
  const refEdu = (ref.education || []) as Record<string, any>[];
  const eduMatches = matchEntries(origEdu, refEdu, (e) => `${e.institution}|${e.degree}`);

  const origCerts = (orig.certifications || []) as Record<string, any>[];
  const refCerts = (ref.certifications || []) as Record<string, any>[];
  const certMatches = matchEntries(origCerts, refCerts, (c) => c.name || '');

  const origProjects = (orig.projects || []) as Record<string, any>[];
  const refProjects = (ref.projects || []) as Record<string, any>[];
  const projMatches = matchEntries(origProjects, refProjects, (p) => p.name || '');

  return (
    <div className="space-y-4">
      {/* Collapsible summary */}
      <details className="rounded-xl bg-cyan-50 border border-cyan-200 p-4">
        <summary className="text-sm font-semibold text-cyan-800 cursor-pointer select-none">
          {t('resumeLibrary.detail.refine.changesSummary', 'Changes Summary')} ({changes.length})
        </summary>
        <div className="mt-3 space-y-3">
          {changes.length > 0 && (
            <ul className="space-y-1">
              {changes.map((c, i) => (
                <li key={i} className="text-xs text-cyan-700 flex items-start gap-1.5">
                  <span className="text-cyan-400">•</span>{c}
                </li>
              ))}
            </ul>
          )}
          {matchedSkills.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-emerald-700 mb-1.5">{t('resumeLibrary.detail.refine.matchedSkills', 'Matched Skills')}</h4>
              <div className="flex flex-wrap gap-1.5">
                {matchedSkills.map((s, i) => (
                  <span key={i} className="text-[11px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">{s}</span>
                ))}
              </div>
            </div>
          )}
          {emphasizedExperiences.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-blue-700 mb-1.5">{t('resumeLibrary.detail.refine.emphasizedExperiences', 'Emphasized Experiences')}</h4>
              <ul className="space-y-1">
                {emphasizedExperiences.map((e, i) => (
                  <li key={i} className="text-xs text-blue-700 flex items-start gap-1.5">
                    <span className="text-blue-400">•</span>{e}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </details>

      {/* Column headers */}
      <div className="grid grid-cols-2 gap-4">
        <div className="text-xs font-bold text-gray-500 uppercase tracking-wider px-1">
          {t('resumeLibrary.detail.refine.original', 'Original')}
        </div>
        <div className="text-xs font-bold text-emerald-600 uppercase tracking-wider px-1">
          {t('resumeLibrary.detail.refine.refined', 'Refined')}
        </div>
      </div>

      {/* Summary diff */}
      {(origSummary || refSummary) && (
        <div className="grid grid-cols-2 gap-4">
          <DiffSection title={t('resumeLibrary.detail.overview.summary', 'Professional Summary')}>
            <p className="text-xs leading-relaxed">
              <DiffText segments={summaryDiff} side="left" />
            </p>
          </DiffSection>
          <DiffSection title={t('resumeLibrary.detail.overview.summary', 'Professional Summary')}>
            <p className="text-xs leading-relaxed">
              <DiffText segments={summaryDiff} side="right" />
            </p>
          </DiffSection>
        </div>
      )}

      {/* Skills diff */}
      {(origSkills.length > 0 || refSkills.length > 0) && (
        <div className="grid grid-cols-2 gap-4">
          <DiffSection title={t('resumeLibrary.detail.overview.skills', 'Skills')}>
            <div className="flex flex-wrap gap-1.5">
              {skillsDiff.kept.map((s, i) => (
                <span key={`k${i}`} className="text-[11px] bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-full">{s}</span>
              ))}
              {skillsDiff.removed.map((s, i) => (
                <span key={`r${i}`} className="text-[11px] bg-red-50 text-red-500 px-2.5 py-0.5 rounded-full line-through">{s}</span>
              ))}
            </div>
          </DiffSection>
          <DiffSection title={t('resumeLibrary.detail.overview.skills', 'Skills')}>
            <div className="flex flex-wrap gap-1.5">
              {skillsDiff.kept.map((s, i) => (
                <span key={`k${i}`} className="text-[11px] bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-full">{s}</span>
              ))}
              {skillsDiff.added.map((s, i) => (
                <span key={`a${i}`} className="text-[11px] bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full ring-1 ring-emerald-300">{s}</span>
              ))}
            </div>
          </DiffSection>
        </div>
      )}

      {/* Experience diff */}
      {expMatches.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          <DiffSection title={t('resumeLibrary.detail.overview.experience', 'Work Experience')}>
            <div className="space-y-4">
              {expMatches.map((pair, i) => {
                const e = pair.orig;
                if (!e) return <div key={i} className="text-xs text-gray-300 italic">{t('resumeLibrary.detail.refine.noChanges', 'No changes')}</div>;
                const descDiff = pair.ref ? wordDiff(e.description || '', pair.ref.description || '') : null;
                const techDiff = pair.ref ? arrayDiff(e.technologies || [], pair.ref.technologies || []) : null;
                return (
                  <div key={i} className="relative pl-5 border-l-2 border-indigo-200">
                    <div className="absolute -left-[5px] top-1 w-2.5 h-2.5 rounded-full bg-indigo-400" />
                    <div className="flex items-baseline justify-between">
                      <h4 className="text-xs font-semibold text-gray-900">{e.role}</h4>
                      <span className="text-[10px] text-gray-500 ml-2 shrink-0">{e.startDate} — {e.endDate}</span>
                    </div>
                    <p className="text-[10px] text-indigo-600 mb-1">{e.company}{e.location ? ` · ${e.location}` : ''}</p>
                    {descDiff && (
                      <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-line">
                        <DiffText segments={descDiff} side="left" />
                      </p>
                    )}
                    {!descDiff && e.description && (
                      <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-line">{e.description}</p>
                    )}
                    {Array.isArray(e.achievements) && e.achievements.length > 0 && (
                      <ul className="mt-1.5 space-y-0.5">
                        {(e.achievements as string[]).map((a, j) => {
                          const achDiff = pair.ref && Array.isArray(pair.ref.achievements) && pair.ref.achievements[j]
                            ? wordDiff(a, pair.ref.achievements[j])
                            : null;
                          return (
                            <li key={j} className="text-xs text-gray-700 flex items-start gap-1">
                              <span className="text-indigo-400 mt-0.5">•</span>
                              <span>{achDiff ? <DiffText segments={achDiff} side="left" /> : a}</span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {techDiff && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {techDiff.kept.map((tech, j) => (
                          <span key={`k${j}`} className="text-[10px] bg-gray-100 text-gray-700 px-2 py-0.5 rounded">{tech}</span>
                        ))}
                        {techDiff.removed.map((tech, j) => (
                          <span key={`r${j}`} className="text-[10px] bg-red-50 text-red-500 px-2 py-0.5 rounded line-through">{tech}</span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </DiffSection>
          <DiffSection title={t('resumeLibrary.detail.overview.experience', 'Work Experience')}>
            <div className="space-y-4">
              {expMatches.map((pair, i) => {
                const e = pair.ref;
                if (!e) return <div key={i} className="text-xs text-gray-300 italic">{t('resumeLibrary.detail.refine.noChanges', 'No changes')}</div>;
                const descDiff = pair.orig ? wordDiff(pair.orig.description || '', e.description || '') : null;
                const techDiff = pair.orig ? arrayDiff(pair.orig.technologies || [], e.technologies || []) : null;
                return (
                  <div key={i} className="relative pl-5 border-l-2 border-emerald-200">
                    <div className="absolute -left-[5px] top-1 w-2.5 h-2.5 rounded-full bg-emerald-400" />
                    <div className="flex items-baseline justify-between">
                      <h4 className="text-xs font-semibold text-gray-900">{e.role}</h4>
                      <span className="text-[10px] text-gray-500 ml-2 shrink-0">{e.startDate} — {e.endDate}</span>
                    </div>
                    <p className="text-[10px] text-emerald-600 mb-1">{e.company}{e.location ? ` · ${e.location}` : ''}</p>
                    {descDiff && (
                      <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-line">
                        <DiffText segments={descDiff} side="right" />
                      </p>
                    )}
                    {!descDiff && e.description && (
                      <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-line">{e.description}</p>
                    )}
                    {Array.isArray(e.achievements) && e.achievements.length > 0 && (
                      <ul className="mt-1.5 space-y-0.5">
                        {(e.achievements as string[]).map((a, j) => {
                          const achDiff = pair.orig && Array.isArray(pair.orig.achievements) && pair.orig.achievements[j]
                            ? wordDiff(pair.orig.achievements[j], a)
                            : null;
                          return (
                            <li key={j} className="text-xs text-gray-700 flex items-start gap-1">
                              <span className="text-emerald-400 mt-0.5">•</span>
                              <span>{achDiff ? <DiffText segments={achDiff} side="right" /> : <span className="bg-emerald-100 text-emerald-800">{a}</span>}</span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {techDiff && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {techDiff.kept.map((tech, j) => (
                          <span key={`k${j}`} className="text-[10px] bg-gray-100 text-gray-700 px-2 py-0.5 rounded">{tech}</span>
                        ))}
                        {techDiff.added.map((tech, j) => (
                          <span key={`a${j}`} className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded ring-1 ring-emerald-300">{tech}</span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </DiffSection>
        </div>
      )}

      {/* Education diff */}
      {eduMatches.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          {['left', 'right'].map((side) => (
            <DiffSection key={side} title={t('resumeLibrary.detail.overview.education', 'Education')}>
              <div className="space-y-2">
                {eduMatches.map((pair, i) => {
                  const e = side === 'left' ? pair.orig : pair.ref;
                  if (!e) return null;
                  return (
                    <div key={i}>
                      <h4 className="text-xs font-semibold text-gray-900">{e.degree}{e.field ? ` in ${e.field}` : ''}</h4>
                      <p className="text-[10px] text-gray-600">{e.institution}</p>
                      {e.gpa && <p className="text-[10px] text-gray-500">GPA: {e.gpa}</p>}
                    </div>
                  );
                })}
              </div>
            </DiffSection>
          ))}
        </div>
      )}

      {/* Certifications diff */}
      {certMatches.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          {['left', 'right'].map((side) => (
            <DiffSection key={side} title={t('resumeLibrary.detail.overview.certifications', 'Certifications')}>
              <div className="space-y-1.5">
                {certMatches.map((pair, i) => {
                  const c = side === 'left' ? pair.orig : pair.ref;
                  if (!c) return null;
                  return (
                    <div key={i} className="text-xs">
                      <span className="font-medium text-gray-800">{c.name}</span>
                      {c.issuer && <span className="text-gray-600"> — {c.issuer}</span>}
                      {c.date && <span className="text-gray-500 ml-1">({c.date})</span>}
                    </div>
                  );
                })}
              </div>
            </DiffSection>
          ))}
        </div>
      )}

      {/* Projects diff */}
      {projMatches.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          <DiffSection title={t('resumeLibrary.detail.overview.projects', 'Projects')}>
            <div className="space-y-3">
              {projMatches.map((pair, i) => {
                const p = pair.orig;
                if (!p) return <div key={i} className="text-xs text-gray-300 italic">{t('resumeLibrary.detail.refine.noChanges', 'No changes')}</div>;
                const descDiff = pair.ref ? wordDiff(p.description || '', pair.ref.description || '') : null;
                const techDiff = pair.ref ? arrayDiff(p.technologies || [], pair.ref.technologies || []) : null;
                return (
                  <div key={i}>
                    <h4 className="text-xs font-semibold text-gray-900">{p.name}</h4>
                    {descDiff ? (
                      <p className="text-xs text-gray-700 mt-0.5"><DiffText segments={descDiff} side="left" /></p>
                    ) : p.description ? (
                      <p className="text-xs text-gray-700 mt-0.5">{p.description}</p>
                    ) : null}
                    {techDiff && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {techDiff.kept.map((tech, j) => (
                          <span key={`k${j}`} className="text-[10px] bg-gray-100 text-gray-700 px-2 py-0.5 rounded">{tech}</span>
                        ))}
                        {techDiff.removed.map((tech, j) => (
                          <span key={`r${j}`} className="text-[10px] bg-red-50 text-red-500 px-2 py-0.5 rounded line-through">{tech}</span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </DiffSection>
          <DiffSection title={t('resumeLibrary.detail.overview.projects', 'Projects')}>
            <div className="space-y-3">
              {projMatches.map((pair, i) => {
                const p = pair.ref;
                if (!p) return <div key={i} className="text-xs text-gray-300 italic">{t('resumeLibrary.detail.refine.noChanges', 'No changes')}</div>;
                const descDiff = pair.orig ? wordDiff(pair.orig.description || '', p.description || '') : null;
                const techDiff = pair.orig ? arrayDiff(pair.orig.technologies || [], p.technologies || []) : null;
                return (
                  <div key={i}>
                    <h4 className="text-xs font-semibold text-gray-900">{p.name}</h4>
                    {descDiff ? (
                      <p className="text-xs text-gray-700 mt-0.5"><DiffText segments={descDiff} side="right" /></p>
                    ) : p.description ? (
                      <p className="text-xs text-gray-700 mt-0.5">{p.description}</p>
                    ) : null}
                    {techDiff && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {techDiff.kept.map((tech, j) => (
                          <span key={`k${j}`} className="text-[10px] bg-gray-100 text-gray-700 px-2 py-0.5 rounded">{tech}</span>
                        ))}
                        {techDiff.added.map((tech, j) => (
                          <span key={`a${j}`} className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded ring-1 ring-emerald-300">{tech}</span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </DiffSection>
        </div>
      )}
    </div>
  );
}
