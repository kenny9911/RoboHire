import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

export type RejectionTag =
  | 'wrong_industry'
  | 'wrong_location'
  | 'too_junior'
  | 'too_senior'
  | 'missing_key_skill'
  | 'wrong_background'
  | 'culture_mismatch'
  | 'other';

const TAGS: RejectionTag[] = [
  'wrong_industry',
  'wrong_location',
  'too_junior',
  'too_senior',
  'missing_key_skill',
  'wrong_background',
  'culture_mismatch',
  'other',
];

interface Props {
  candidateName: string;
  open: boolean;
  submitting?: boolean;
  onCancel: () => void;
  onSubmit: (payload: { tags: RejectionTag[]; reason: string }) => void;
}

export default function RejectionReasonModal({ candidateName, open, submitting, onCancel, onSubmit }: Props) {
  const { t } = useTranslation();
  const [tags, setTags] = useState<RejectionTag[]>([]);
  const [reason, setReason] = useState('');

  // Reset form whenever the modal re-opens for a new candidate
  useEffect(() => {
    if (open) {
      setTags([]);
      setReason('');
    }
  }, [open]);

  // Esc closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const toggleTag = (tag: RejectionTag) => {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t_) => t_ !== tag) : [...prev, tag]));
  };

  const canSubmit = tags.length > 0 || reason.trim().length >= 10;

  const handleSubmit = () => {
    if (!canSubmit || submitting) return;
    onSubmit({ tags, reason: reason.trim() });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
        <div className="border-b border-slate-200 px-6 py-5">
          <h2 className="text-lg font-semibold text-slate-900">
            {t('agents.rejection.title', "Help Alex learn — why isn't this a fit?")}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {t('agents.rejection.subtitle', 'The more detail you share, the smarter the next batch.')}
          </p>
          {candidateName && (
            <p className="mt-1 text-xs text-slate-400">
              {t('agents.rejection.about', 'Skipping {{name}}', { name: candidateName })}
            </p>
          )}
        </div>

        <div className="space-y-5 px-6 py-5">
          {/* Tag chips */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t('agents.rejection.tagsLabel', 'Pick all that apply')}
            </p>
            <div className="flex flex-wrap gap-2">
              {TAGS.map((tag) => {
                const selected = tags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      selected
                        ? 'border-violet-500 bg-violet-50 text-violet-700'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {t(`agents.rejection.tags.${tag}`, defaultTagLabel(tag))}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Free text */}
          <div>
            <label htmlFor="rejection-reason" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t('agents.rejection.reasonLabel', 'Tell us more')}
            </label>
            <textarea
              id="rejection-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              placeholder={t(
                'agents.rejection.reasonPlaceholder',
                "What's missing or off? E.g., they have HVAC experience but only residential — we need commercial.",
              )}
              className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              {t(
                'agents.rejection.hint',
                'Pick at least one tag, or write 10+ characters of feedback.',
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            {t('common.cancel', 'Cancel')}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting && (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            )}
            {t('agents.rejection.submit', 'Skip Profile')}
          </button>
        </div>
      </div>
    </div>
  );
}

function defaultTagLabel(tag: RejectionTag): string {
  switch (tag) {
    case 'wrong_industry':
      return 'Wrong industry';
    case 'wrong_location':
      return 'Wrong location';
    case 'too_junior':
      return 'Too junior';
    case 'too_senior':
      return 'Too senior';
    case 'missing_key_skill':
      return 'Missing key skill';
    case 'wrong_background':
      return 'Wrong background';
    case 'culture_mismatch':
      return 'Culture mismatch';
    case 'other':
      return 'Other';
  }
}
