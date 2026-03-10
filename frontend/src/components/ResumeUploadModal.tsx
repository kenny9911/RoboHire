import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import axios from '../lib/axios';

interface ResumeUploadModalProps {
  open: boolean;
  onClose: () => void;
  onUploaded: () => void;
  batch?: boolean;
  replaceResumeId?: string;
}

export default function ResumeUploadModal({ open, onClose, onUploaded, batch = false, replaceResumeId }: ResumeUploadModalProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [results, setResults] = useState<Array<{ name: string; success: boolean; error?: string; duplicate?: boolean }>>([]);
  const isReplaceMode = Boolean(replaceResumeId);
  const effectiveBatch = batch && !isReplaceMode;

  if (!open) return null;

  const acceptedTypes = '.pdf,.docx,.doc,.txt,.md,.json';

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const arr = Array.from(files).slice(0, effectiveBatch ? 10 : 1);
    setSelectedFiles(arr);
    setResults([]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
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
    let uploaded = false;

    try {
      if (isReplaceMode) {
        const formData = new FormData();
        formData.append('file', selectedFiles[0]);
        const res = await axios.post(`/api/v1/resumes/${replaceResumeId}/reupload`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        if (res.data.success) {
          setResults([{ name: selectedFiles[0].name, success: true }]);
          uploaded = true;
        }
      } else if (effectiveBatch && selectedFiles.length > 1) {
        const formData = new FormData();
        selectedFiles.forEach(f => formData.append('files', f));
        const res = await axios.post('/api/v1/resumes/upload-batch', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        if (res.data.success) {
          setResults(res.data.data.map((r: { fileName: string; success: boolean; error?: string; duplicate?: boolean }) => ({
            name: r.fileName,
            success: r.success,
            error: r.error,
            duplicate: r.duplicate,
          })));
          uploaded = true;
        }
      } else {
        const formData = new FormData();
        formData.append('file', selectedFiles[0]);
        const res = await axios.post('/api/v1/resumes/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        if (res.data.success) {
          setResults([{ name: selectedFiles[0].name, success: true, duplicate: res.data.duplicate }]);
          uploaded = true;
        }
      }
      if (uploaded) onUploaded();
    } catch (err) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.error || err.message : 'Upload failed';
      setResults(selectedFiles.map(f => ({ name: f.name, success: false, error: msg })));
    } finally {
      setUploading(false);
    }
  };

  const allDone = results.length > 0;

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
          onClick={() => fileInputRef.current?.click()}
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
          <p className="text-xs text-gray-400">{t('resumeLibrary.uploadModal.formats', 'Supported: PDF, DOCX, TXT, MD, JSON')}</p>
          {effectiveBatch && <p className="text-xs text-gray-400 mt-1">{t('resumeLibrary.uploadModal.maxFiles', 'Up to 10 files at once')}</p>}
          <input
            ref={fileInputRef}
            type="file"
            accept={acceptedTypes}
            multiple={effectiveBatch}
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>

        {/* Selected files */}
        {selectedFiles.length > 0 && !allDone && (
          <div className="mt-4 space-y-1">
            {selectedFiles.map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2">
                <svg className="w-4 h-4 text-indigo-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="truncate">{f.name}</span>
                <span className="text-xs text-gray-400 ml-auto">{(f.size / 1024).toFixed(0)} KB</span>
              </div>
            ))}
          </div>
        )}

        {/* Results */}
        {allDone && (
          <div className="mt-4 space-y-1">
            {results.map((r, i) => (
              <div key={i} className={`flex items-center gap-2 text-sm rounded-lg px-3 py-2 ${r.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                {r.success ? (
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                ) : (
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                )}
                <span className="truncate">{r.name}</span>
                {r.duplicate && <span className="text-xs text-amber-600 ml-auto">{t('resumeLibrary.uploadModal.duplicate', 'Duplicate')}</span>}
                {r.error && <span className="text-xs ml-auto">{r.error}</span>}
              </div>
            ))}
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
                  : t('resumeLibrary.upload', 'Upload')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
