import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import axios from '../lib/axios';

interface ResumeUploadModalProps {
  open: boolean;
  onClose: () => void;
  onUploaded: () => void;
  batch?: boolean;
  replaceResumeId?: string;
  preselectedJobId?: string;
}

type JobOption = { id: string; title: string; status?: string };

const MAX_BATCH_FILES = 20;

type FileResult = { name: string; success: boolean; error?: string; duplicate?: boolean };
type FileStatus = 'pending' | 'uploading' | 'done' | 'error';
type ProcessingMetrics = {
  durationMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  totalCost: number;
  model: string | null;
  provider: string | null;
  llmCalls: number;
};

type PersonDuplicate = {
  file: File;
  existingResume: {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    currentRole?: string | null;
    experienceYears?: string | null;
    fileName?: string | null;
    updatedAt?: string;
    parsedData?: any;
  };
  newParsed: {
    name: string;
    email?: string | null;
    phone?: string | null;
    currentRole?: string | null;
    experienceYears?: string | null;
    parsedData?: any;
    fileName?: string | null;
  };
  metrics?: ProcessingMetrics;
};

export default function ResumeUploadModal({ open, onClose, onUploaded, batch = false, replaceResumeId, preselectedJobId }: ResumeUploadModalProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropTimeRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [results, setResults] = useState<FileResult[]>([]);
  const [fileStatuses, setFileStatuses] = useState<Map<number, FileStatus>>(new Map());
  const [metrics, setMetrics] = useState<ProcessingMetrics | null>(null);
  const [personDuplicates, setPersonDuplicates] = useState<PersonDuplicate[]>([]);
  const [resolvingDuplicate, setResolvingDuplicate] = useState(false);
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>(preselectedJobId || '');
  const isReplaceMode = Boolean(replaceResumeId);
  const effectiveBatch = batch && !isReplaceMode;

  // Fetch available jobs for the selector
  useEffect(() => {
    if (!open || isReplaceMode) return;
    axios.get('/api/v1/jobs', { params: { status: 'open', limit: 100 } })
      .then(res => setJobs(res.data.data || []))
      .catch(() => {});
  }, [open, isReplaceMode]);

  // Sync preselectedJobId when it changes
  useEffect(() => {
    if (preselectedJobId) setSelectedJobId(preselectedJobId);
  }, [preselectedJobId]);

  if (!open) return null;

  const acceptedTypes = '.pdf,.docx,.doc,.xlsx,.xls,.txt,.md,.json';

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const arr = Array.from(files).slice(0, effectiveBatch ? MAX_BATCH_FILES : 1);
    setSelectedFiles(arr);
    setResults([]);
    setFileStatuses(new Map());
    setMetrics(null);
    setPersonDuplicates([]);
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dropTimeRef.current = Date.now();
    handleFiles(e.dataTransfer.files);
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;
    if (isReplaceMode) {
      const confirmed = window.confirm(
        t(
          'resumeLibrary.uploadModal.replaceConfirm',
          'This will overwrite the current resume and clear existing AI insights and job fit results. Continue?',
        ),
      );
      if (!confirmed) return;
    }

    setUploading(true);
    setResults([]);

    const statuses = new Map<number, FileStatus>();
    selectedFiles.forEach((_, i) => statuses.set(i, 'uploading'));
    setFileStatuses(new Map(statuses));

    let uploaded = false;
    const pendingDuplicates: PersonDuplicate[] = [];

    try {
      if (isReplaceMode) {
        const formData = new FormData();
        formData.append('file', selectedFiles[0]);
        const res = await axios.post(`/api/v1/resumes/${replaceResumeId}/reupload`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        if (res.data.success) {
          setResults([{ name: selectedFiles[0].name, success: true }]);
          setFileStatuses(new Map([[0, 'done']]));
          if (res.data.metrics) setMetrics(res.data.metrics);
          uploaded = true;
        }
      } else if (effectiveBatch && selectedFiles.length > 1) {
        const formData = new FormData();
        selectedFiles.forEach(f => formData.append('files', f));
        if (selectedJobId) formData.append('jobId', selectedJobId);
        const res = await axios.post('/api/v1/resumes/upload-batch', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        if (res.data.success) {
          const fileResults: FileResult[] = [];
          const doneStatuses = new Map<number, FileStatus>();

          res.data.data.forEach((r: any, i: number) => {
            if (r.personDuplicate) {
              pendingDuplicates.push({
                file: selectedFiles[i],
                existingResume: r.existingResume,
                newParsed: r.newParsed,
              });
              fileResults.push({ name: r.fileName, success: true, duplicate: true });
              doneStatuses.set(i, 'done');
            } else {
              fileResults.push({
                name: r.fileName,
                success: r.success,
                error: r.error,
                duplicate: r.duplicate,
              });
              doneStatuses.set(i, r.success ? 'done' : 'error');
            }
          });

          setResults(fileResults);
          setFileStatuses(doneStatuses);
          if (res.data.metrics) setMetrics(res.data.metrics);
          uploaded = true;
        }
      } else {
        const formData = new FormData();
        formData.append('file', selectedFiles[0]);
        if (selectedJobId) formData.append('jobId', selectedJobId);
        const res = await axios.post('/api/v1/resumes/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        if (res.data.success) {
          if (res.data.personDuplicate) {
            pendingDuplicates.push({
              file: selectedFiles[0],
              existingResume: res.data.existingResume,
              newParsed: res.data.newParsed,
              metrics: res.data.metrics,
            });
            setResults([{ name: selectedFiles[0].name, success: true, duplicate: true }]);
            setFileStatuses(new Map([[0, 'done']]));
          } else {
            setResults([{ name: selectedFiles[0].name, success: true, duplicate: res.data.duplicate }]);
            setFileStatuses(new Map([[0, 'done']]));
          }
          if (res.data.metrics) setMetrics(res.data.metrics);
          uploaded = true;
        }
      }

      if (pendingDuplicates.length > 0) {
        setPersonDuplicates(pendingDuplicates);
      }

      if (uploaded && pendingDuplicates.length === 0) onUploaded();
    } catch (err) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.error || err.message : 'Upload failed';
      setResults(selectedFiles.map(f => ({ name: f.name, success: false, error: msg })));
      const errorStatuses = new Map<number, FileStatus>();
      selectedFiles.forEach((_, i) => errorStatuses.set(i, 'error'));
      setFileStatuses(errorStatuses);
    } finally {
      setUploading(false);
    }
  };

  const handleDuplicateAction = async (action: 'overwrite' | 'skip') => {
    if (personDuplicates.length === 0) return;
    const current = personDuplicates[0];
    setResolvingDuplicate(true);

    try {
      if (action === 'overwrite') {
        const formData = new FormData();
        formData.append('file', current.file);
        await axios.post(`/api/v1/resumes/${current.existingResume.id}/reupload`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      // 'skip' → do nothing
    } catch (err) {
      console.error('Failed to resolve person duplicate:', err);
    } finally {
      setResolvingDuplicate(false);
      const remaining = personDuplicates.slice(1);
      setPersonDuplicates(remaining);
      if (remaining.length === 0) {
        onUploaded();
      }
    }
  };

  const allDone = results.length > 0 && personDuplicates.length === 0;
  const successCount = results.filter(r => r.success && !r.duplicate).length;
  const duplicateCount = results.filter(r => r.duplicate).length;
  const failCount = results.filter(r => !r.success).length;

  // Helper to extract top skills from parsedData
  const getSkills = (parsedData: any): string[] => {
    if (!parsedData?.skills) return [];
    const skills = Array.isArray(parsedData.skills) ? parsedData.skills : [];
    return skills.slice(0, 6).map((s: any) => typeof s === 'string' ? s : s.name || s.skill || '').filter(Boolean);
  };

  // ─── Person duplicate comparison dialog ──────────────────────────
  if (personDuplicates.length > 0) {
    const dup = personDuplicates[0];
    const existingSkills = getSkills(dup.existingResume.parsedData);
    const newSkills = getSkills(dup.newParsed.parsedData);

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 p-6" onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-bold text-gray-900">
              {t('resumeLibrary.uploadModal.personDuplicate.title', 'Duplicate Candidate Found')}
            </h3>
            {personDuplicates.length > 1 && (
              <span className="text-xs text-gray-500">
                1 {t('resumeLibrary.uploadModal.personDuplicate.of', 'of')} {personDuplicates.length}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 mb-4">
            {t('resumeLibrary.uploadModal.personDuplicate.description', 'A resume with the same name and contact info already exists.')}
          </p>

          {/* Side-by-side comparison */}
          <div className="grid grid-cols-2 gap-4">
            {/* Existing resume */}
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                {t('resumeLibrary.uploadModal.personDuplicate.existing', 'Existing Resume')}
              </p>
              <div className="space-y-2 text-sm">
                <div className="font-semibold text-gray-900 text-base">{dup.existingResume.name}</div>
                {dup.existingResume.phone && <div className="text-gray-600">{dup.existingResume.phone}</div>}
                {dup.existingResume.email && <div className="text-gray-600 truncate">{dup.existingResume.email}</div>}
                {dup.existingResume.currentRole && (
                  <div className="text-gray-700">
                    <span className="text-gray-400 text-xs">{t('resumeLibrary.uploadModal.personDuplicate.role', 'Role')}: </span>
                    {dup.existingResume.currentRole}
                  </div>
                )}
                {dup.existingResume.experienceYears && (
                  <div className="text-gray-700">
                    <span className="text-gray-400 text-xs">{t('resumeLibrary.uploadModal.personDuplicate.experience', 'Exp')}: </span>
                    {dup.existingResume.experienceYears}
                  </div>
                )}
                {existingSkills.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {existingSkills.map((s, i) => (
                      <span key={i} className="px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded text-xs">{s}</span>
                    ))}
                  </div>
                )}
                <div className="pt-2 border-t border-gray-200 text-xs text-gray-400">
                  {dup.existingResume.fileName && <div className="truncate">{dup.existingResume.fileName}</div>}
                  {dup.existingResume.updatedAt && (
                    <div>
                      {t('resumeLibrary.uploadModal.personDuplicate.uploadedAt', 'Uploaded')}: {new Date(dup.existingResume.updatedAt).toLocaleDateString()}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* New resume */}
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-3">
                {t('resumeLibrary.uploadModal.personDuplicate.new', 'New Resume')}
              </p>
              <div className="space-y-2 text-sm">
                <div className="font-semibold text-gray-900 text-base">{dup.newParsed.name}</div>
                {dup.newParsed.phone && <div className="text-gray-600">{dup.newParsed.phone}</div>}
                {dup.newParsed.email && <div className="text-gray-600 truncate">{dup.newParsed.email}</div>}
                {dup.newParsed.currentRole && (
                  <div className="text-gray-700">
                    <span className="text-blue-400 text-xs">{t('resumeLibrary.uploadModal.personDuplicate.role', 'Role')}: </span>
                    {dup.newParsed.currentRole}
                  </div>
                )}
                {dup.newParsed.experienceYears && (
                  <div className="text-gray-700">
                    <span className="text-blue-400 text-xs">{t('resumeLibrary.uploadModal.personDuplicate.experience', 'Exp')}: </span>
                    {dup.newParsed.experienceYears}
                  </div>
                )}
                {newSkills.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {newSkills.map((s, i) => (
                      <span key={i} className="px-1.5 py-0.5 bg-blue-200 text-blue-700 rounded text-xs">{s}</span>
                    ))}
                  </div>
                )}
                <div className="pt-2 border-t border-blue-200 text-xs text-gray-400">
                  {dup.newParsed.fileName && <div className="truncate">{dup.newParsed.fileName}</div>}
                  <div>{dup.file.name}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-5 flex justify-end gap-3">
            <button
              onClick={() => handleDuplicateAction('skip')}
              disabled={resolvingDuplicate}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50"
            >
              {t('actions.cancel', 'Cancel')}
            </button>
            <button
              onClick={() => handleDuplicateAction('overwrite')}
              disabled={resolvingDuplicate}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {resolvingDuplicate ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent" />
                  ...
                </span>
              ) : (
                t('resumeLibrary.uploadModal.personDuplicate.overwrite', 'Overwrite')
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Normal upload UI ───────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">
            {isReplaceMode
              ? t('resumeLibrary.uploadModal.replaceTitle', 'Replace Resume File')
              : effectiveBatch
                ? t('resumeLibrary.uploadModal.batchTitle', 'Batch Upload Resumes')
                : t('resumeLibrary.uploadModal.title', 'Upload Resume')}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>

        {isReplaceMode && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-xs text-amber-700">
              {t('resumeLibrary.uploadModal.replaceHint', 'Replacing will overwrite this resume and reset existing AI insights/job fit data.')}
            </p>
          </div>
        )}

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => { if (Date.now() - dropTimeRef.current > 300) fileInputRef.current?.click(); }}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
            isDragging ? 'border-indigo-400 bg-indigo-50' : 'border-gray-300 hover:border-indigo-300 hover:bg-gray-50'
          }`}
        >
          <svg className="w-10 h-10 mx-auto text-gray-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p className="text-sm text-gray-600 mb-1">
            {isReplaceMode
              ? t('resumeLibrary.uploadModal.replaceDragDrop', 'Drag & drop a new resume file here')
              : t('resumeLibrary.uploadModal.dragDrop', 'Drag & drop resume files here')}
          </p>
          <p className="text-xs text-gray-400">{t('resumeLibrary.uploadModal.formats', 'Supported: PDF, DOCX, XLSX, TXT, MD, JSON')}</p>
          {effectiveBatch && (
            <p className="text-xs text-gray-400 mt-1">
              {t('resumeLibrary.uploadModal.maxFiles', 'Up to {{count}} files at once', { count: MAX_BATCH_FILES })}
            </p>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept={acceptedTypes}
            multiple={effectiveBatch}
            className="hidden"
            onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
          />
        </div>

        {/* Job selector (optional) */}
        {!isReplaceMode && jobs.length > 0 && (
          <div className="mt-4">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              {t('resumeLibrary.uploadModal.applyToJob', 'Apply to Job (optional)')}
            </label>
            <select
              value={selectedJobId}
              onChange={(e) => setSelectedJobId(e.target.value)}
              disabled={uploading}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 disabled:opacity-50"
            >
              <option value="">{t('resumeLibrary.uploadModal.noJobSelected', '— None —')}</option>
              {jobs.map(j => (
                <option key={j.id} value={j.id}>{j.title}</option>
              ))}
            </select>
          </div>
        )}

        {/* Selected files / progress */}
        {selectedFiles.length > 0 && (
          <div className="mt-4 max-h-60 overflow-y-auto space-y-1">
            {selectedFiles.map((f, i) => {
              const status = fileStatuses.get(i);
              const result = results[i];

              let rowClass = 'bg-gray-50 text-gray-700';
              if (result?.success) rowClass = 'bg-emerald-50 text-emerald-700';
              else if (result && !result.success) rowClass = 'bg-red-50 text-red-700';
              else if (status === 'uploading') rowClass = 'bg-blue-50 text-blue-700';

              return (
                <div key={i} className={`flex items-center gap-2 text-sm rounded-lg px-3 py-2 ${rowClass}`}>
                  {status === 'uploading' && !result ? (
                    <div className="w-4 h-4 flex-shrink-0 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                  ) : result?.success ? (
                    <svg className="w-4 h-4 flex-shrink-0 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  ) : result && !result.success ? (
                    <svg className="w-4 h-4 flex-shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  ) : (
                    <svg className="w-4 h-4 text-indigo-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  )}

                  <span className="truncate flex-1">{f.name}</span>

                  {result?.duplicate && <span className="text-xs text-amber-600 shrink-0">{t('resumeLibrary.uploadModal.duplicate', 'Duplicate')}</span>}
                  {result?.error && <span className="text-xs shrink-0">{result.error}</span>}
                  {!result && !uploading && (
                    <>
                      <span className="text-xs text-gray-400 shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRemoveFile(i); }}
                        className="p-0.5 rounded text-gray-400 hover:text-red-500 shrink-0"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Summary after completion */}
        {allDone && (
          <div className="mt-3 text-xs text-gray-500 flex items-center gap-3">
            {successCount > 0 && <span className="text-emerald-600">{t('resumeLibrary.uploadModal.successCount', '{{count}} uploaded', { count: successCount })}</span>}
            {duplicateCount > 0 && <span className="text-amber-600">{t('resumeLibrary.uploadModal.duplicateCount', '{{count}} duplicate', { count: duplicateCount })}</span>}
            {failCount > 0 && <span className="text-red-600">{t('resumeLibrary.uploadModal.failCount', '{{count}} failed', { count: failCount })}</span>}
          </div>
        )}

        {/* Processing Metrics */}
        {metrics && (
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
            <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1.5">
              {t('resumeLibrary.uploadModal.metrics.title', 'Processing Details')}
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">{t('resumeLibrary.uploadModal.metrics.time', 'Time')}</span>
                <span className="font-mono text-slate-700">
                  {metrics.durationMs < 1000
                    ? `${metrics.durationMs}ms`
                    : `${(metrics.durationMs / 1000).toFixed(1)}s`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('resumeLibrary.uploadModal.metrics.cost', 'Cost')}</span>
                <span className="font-mono text-slate-700">${metrics.totalCost.toFixed(4)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('resumeLibrary.uploadModal.metrics.tokens', 'Tokens')}</span>
                <span className="font-mono text-slate-700">{metrics.totalTokens.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('resumeLibrary.uploadModal.metrics.llmCalls', 'LLM Calls')}</span>
                <span className="font-mono text-slate-700">{metrics.llmCalls}</span>
              </div>
              {metrics.model && (
                <div className="col-span-2 flex justify-between">
                  <span className="text-slate-500">{t('resumeLibrary.uploadModal.metrics.model', 'Model')}</span>
                  <span className="font-mono text-slate-700 truncate ml-2">{metrics.model}</span>
                </div>
              )}
              <div className="col-span-2 flex justify-between text-[10px] text-slate-400 mt-0.5">
                <span>{t('resumeLibrary.uploadModal.metrics.inputOutput', 'Input / Output')}</span>
                <span className="font-mono">{metrics.promptTokens.toLocaleString()} / {metrics.completionTokens.toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
            {allDone ? t('actions.close', 'Close') : t('actions.cancel', 'Cancel')}
          </button>
          {!allDone && (
            <button
              onClick={handleUpload}
              disabled={selectedFiles.length === 0 || uploading}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {uploading && <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />}
              {uploading
                ? t('resumeLibrary.uploadModal.uploading', 'Processing...')
                : isReplaceMode
                  ? t('resumeLibrary.uploadModal.replaceAction', 'Overwrite Resume')
                  : effectiveBatch && selectedFiles.length > 1
                    ? t('resumeLibrary.uploadModal.uploadCount', 'Upload {{count}} Resumes', { count: selectedFiles.length })
                    : t('resumeLibrary.upload', 'Upload')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
