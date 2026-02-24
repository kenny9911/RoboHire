import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import SEO from '../components/SEO';
import Navbar from '../components/landing/Navbar';
import Footer from '../components/landing/Footer';
import { API_BASE } from '../config';

interface FormData {
  name: string;
  email: string;
  company: string;
  teamSize: string;
  source: string;
  message: string;
}

export default function RequestDemo() {
  const { t } = useTranslation();
  const [form, setForm] = useState<FormData>({
    name: '',
    email: '',
    company: '',
    teamSize: '',
    source: '',
    message: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const teamSizeOptions = [
    { value: '', label: t('demo.teamSize.placeholder', 'How many open roles do you have?') },
    { value: '1-5', label: '1-5' },
    { value: '6-20', label: '6-20' },
    { value: '21-50', label: '21-50' },
    { value: '50+', label: '50+' },
  ];

  const sourceOptions = [
    { value: '', label: t('demo.source.placeholder', 'Where did you hear about us?') },
    { value: 'google', label: t('demo.source.google', 'Google Search') },
    { value: 'linkedin', label: t('demo.source.linkedin', 'LinkedIn') },
    { value: 'referral', label: t('demo.source.referral', 'Referral') },
    { value: 'social', label: t('demo.source.social', 'Social Media') },
    { value: 'blog', label: t('demo.source.blog', 'Blog / Article') },
    { value: 'other', label: t('demo.source.other', 'Other') },
  ];

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    if (error) setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) {
      setError(t('demo.error.required', 'Name and email are required.'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/api/v1/request-demo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (data.success) {
        setSubmitted(true);
      } else {
        setError(data.error || t('demo.error.generic', 'Something went wrong. Please try again.'));
      }
    } catch {
      setError(t('demo.error.generic', 'Something went wrong. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = 'w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors';
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1.5';

  return (
    <>
      <SEO
        title={t('demo.seo.title', 'Request a Demo - AI-Powered Hiring Platform')}
        description={t('demo.seo.desc', 'Schedule a demo with RoboHire. See how AI can automate resume screening, conduct interviews, and evaluate candidates for your team.')}
        url="https://robohire.io/request-demo"
      />

      <div className="min-h-screen bg-white">
        <Navbar />

        <main className="pt-24 lg:pt-28 pb-0">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-20 items-center min-h-[calc(100vh-200px)]">
              {/* Left Column -- Hero */}
              <div className="py-12 lg:py-20">
                <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] font-bold text-gray-900 tracking-tight leading-[1.1] mb-6">
                  {t('demo.headline1', 'Never miss a')}<br />
                  {t('demo.headline2', 'top candidate.')}<br />
                  <span className="text-indigo-600">{t('demo.headline3', 'Hire with AI.')}</span>
                </h1>
                <p className="text-lg text-gray-500 leading-relaxed max-w-md mb-10">
                  {t('demo.subtitle', 'Experience seamless interviews, instant feedback, and intelligent screening — all powered by natural-sounding AI.')}
                </p>

                {/* Trust indicators */}
                <div className="flex items-center gap-3">
                  <div className="flex -space-x-3">
                    {['bg-indigo-200', 'bg-emerald-200', 'bg-amber-200', 'bg-pink-200', 'bg-blue-200'].map((bg, i) => (
                      <div
                        key={i}
                        className={`w-10 h-10 rounded-full ${bg} border-2 border-white flex items-center justify-center`}
                      >
                        <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                    ))}
                  </div>
                  <p className="text-sm text-gray-500">
                    {t('demo.trust', 'Trusted by 500+ hiring teams')}
                  </p>
                </div>
              </div>

              {/* Right Column -- Form Card */}
              <div className="py-12 lg:py-20">
                <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8 sm:p-10">
                  {submitted ? (
                    <div className="text-center py-12">
                      <div className="w-16 h-16 mx-auto mb-6 bg-emerald-100 rounded-full flex items-center justify-center">
                        <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <h2 className="text-2xl font-semibold text-gray-900 mb-3">
                        {t('demo.success.title', 'Thank you!')}
                      </h2>
                      <p className="text-gray-600">
                        {t('demo.success.message', "We'll be in touch within 24 hours. Check your email for a confirmation.")}
                      </p>
                    </div>
                  ) : (
                    <>
                      <h2 className="text-2xl font-semibold text-gray-900 text-center mb-2">
                        {t('demo.form.title', 'Request a demo')}
                      </h2>
                      <p className="text-sm text-gray-500 text-center mb-8">
                        {t('demo.form.subtitle', 'Connect with our sales team to see how RoboHire can help you hire at any scale.')}
                      </p>

                      <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                          <label htmlFor="name" className={labelClass}>
                            {t('demo.form.name', 'Name')}
                          </label>
                          <input
                            id="name"
                            name="name"
                            type="text"
                            value={form.name}
                            onChange={handleChange}
                            placeholder={t('demo.form.namePlaceholder', 'John Smith')}
                            className={inputClass}
                            required
                          />
                        </div>

                        <div>
                          <label htmlFor="email" className={labelClass}>
                            {t('demo.form.email', 'Work Email')}
                          </label>
                          <input
                            id="email"
                            name="email"
                            type="email"
                            value={form.email}
                            onChange={handleChange}
                            placeholder={t('demo.form.emailPlaceholder', 'your@email.com')}
                            className={inputClass}
                            required
                          />
                        </div>

                        <div>
                          <label htmlFor="company" className={labelClass}>
                            {t('demo.form.company', 'Company Name')}
                          </label>
                          <input
                            id="company"
                            name="company"
                            type="text"
                            value={form.company}
                            onChange={handleChange}
                            placeholder={t('demo.form.companyPlaceholder', 'Your company')}
                            className={inputClass}
                          />
                        </div>

                        <div>
                          <label htmlFor="teamSize" className={labelClass}>
                            {t('demo.form.teamSize', 'How many roles are you hiring for?')}
                          </label>
                          <select
                            id="teamSize"
                            name="teamSize"
                            value={form.teamSize}
                            onChange={handleChange}
                            className={`${inputClass} appearance-none bg-[url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20fill%3D%27none%27%20viewBox%3D%270%200%2024%2024%27%20stroke%3D%27%239CA3AF%27%20stroke-width%3D%272%27%3E%3Cpath%20stroke-linecap%3D%27round%27%20stroke-linejoin%3D%27round%27%20d%3D%27M19%209l-7%207-7-7%27%2F%3E%3C%2Fsvg%3E")] bg-[length:20px] bg-[right_12px_center] bg-no-repeat pr-10`}
                          >
                            {teamSizeOptions.map((opt) => (
                              <option key={opt.value} value={opt.value} disabled={opt.value === ''}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label htmlFor="source" className={labelClass}>
                            {t('demo.form.source', 'Where did you hear about us?')}
                          </label>
                          <select
                            id="source"
                            name="source"
                            value={form.source}
                            onChange={handleChange}
                            className={`${inputClass} appearance-none bg-[url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20fill%3D%27none%27%20viewBox%3D%270%200%2024%2024%27%20stroke%3D%27%239CA3AF%27%20stroke-width%3D%272%27%3E%3Cpath%20stroke-linecap%3D%27round%27%20stroke-linejoin%3D%27round%27%20d%3D%27M19%209l-7%207-7-7%27%2F%3E%3C%2Fsvg%3E")] bg-[length:20px] bg-[right_12px_center] bg-no-repeat pr-10`}
                          >
                            {sourceOptions.map((opt) => (
                              <option key={opt.value} value={opt.value} disabled={opt.value === ''}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label htmlFor="message" className={labelClass}>
                            {t('demo.form.message', 'Tell us more')}
                          </label>
                          <textarea
                            id="message"
                            name="message"
                            value={form.message}
                            onChange={handleChange}
                            placeholder={t('demo.form.messagePlaceholder', 'Tell us more about your use case')}
                            rows={3}
                            className={`${inputClass} resize-none`}
                          />
                        </div>

                        {error && (
                          <p className="text-sm text-red-600">{error}</p>
                        )}

                        <button
                          type="submit"
                          disabled={submitting}
                          className="w-full py-3.5 bg-gray-900 text-white font-semibold rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {submitting
                            ? t('demo.form.submitting', 'Submitting...')
                            : t('demo.form.submit', 'Submit')}
                        </button>
                      </form>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </main>

        <Footer />
      </div>
    </>
  );
}
