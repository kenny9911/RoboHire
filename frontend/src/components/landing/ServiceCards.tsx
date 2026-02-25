import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function ServiceCards() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const services = [
    {
      id: 'start-hiring',
      title: t('landing.services.hiring.title', 'Start Hiring'),
      subtitle: t('landing.services.hiring.subtitle', 'AI Hiring Agent'),
      description: t('landing.services.hiring.description', 'Let AI handle the heavy lifting. Our hiring agent screens resumes, conducts interviews, and delivers evaluation reports automatically.'),
      features: [
        t('landing.services.hiring.feature1', 'Automated resume screening'),
        t('landing.services.hiring.feature2', 'AI-powered interviews'),
        t('landing.services.hiring.feature3', 'Comprehensive evaluation reports'),
        t('landing.services.hiring.feature4', 'Webhook integration'),
      ],
      cta: t('landing.services.hiring.cta', 'Start Hiring Now'),
      href: '/start-hiring',
      accentColor: 'indigo',
      badge: t('landing.services.hiring.badge', 'Most Popular'),
    },
    {
      id: 'api',
      title: t('landing.services.api.title', 'RoboHire API'),
      subtitle: t('landing.services.api.subtitle', 'For Developers'),
      description: t('landing.services.api.description', 'Integrate powerful AI recruitment capabilities into your existing systems. Parse resumes, match candidates, and evaluate interviews.'),
      features: [
        t('landing.services.api.feature1', 'Resume & JD parsing'),
        t('landing.services.api.feature2', 'AI candidate matching'),
        t('landing.services.api.feature3', 'Interview evaluation'),
        t('landing.services.api.feature4', 'RESTful API endpoints'),
      ],
      cta: t('landing.services.api.cta', 'Explore API'),
      href: '/developers',
      accentColor: 'emerald',
      badge: null,
    },
  ];

  return (
    <section id="services" className="py-24 lg:py-32 bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
            {t('landing.services.title', 'Two Powerful Ways to Hire')}
          </h2>
          <p className="text-lg text-gray-500">
            {t('landing.services.subtitle', 'Choose the solution that fits your needs.')}
          </p>
        </div>

        {/* Service Cards - Minimalist Design */}
        <div className="grid md:grid-cols-2 gap-6 lg:gap-8">
          {services.map((service) => (
            <div
              key={service.id}
              className="group relative bg-white rounded-2xl p-8 lg:p-10 transition-all duration-300 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)]"
            >
              {/* Badge */}
              {service.badge && (
                <span className="absolute top-6 right-6 text-xs font-medium text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">
                  {service.badge}
                </span>
              )}

              {/* Content */}
              <div className="mb-8">
                <p className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-2">
                  {service.subtitle}
                </p>
                <h3 className="text-2xl font-semibold text-gray-900 mb-3">
                  {service.title}
                </h3>
                <p className="text-gray-500 leading-relaxed">
                  {service.description}
                </p>
              </div>

              {/* Features - Simple list */}
              <ul className="space-y-3 mb-8">
                {service.features.map((feature, index) => (
                  <li key={index} className="flex items-center gap-3 text-gray-600 text-sm">
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      service.accentColor === 'indigo' ? 'bg-indigo-500' : 'bg-emerald-500'
                    }`} />
                    {feature}
                  </li>
                ))}
              </ul>

              {/* CTA - Minimalist button */}
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  navigate(service.href);
                }}
                type="button"
                className={`inline-flex items-center gap-2 text-lg font-semibold transition-all duration-200 ${
                  service.accentColor === 'indigo'
                    ? 'text-indigo-600 hover:text-indigo-700'
                    : 'text-emerald-600 hover:text-emerald-700'
                }`}
              >
                {service.cta}
                <svg 
                  className="w-5 h-5 transition-transform group-hover:translate-x-1" 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </button>

              {/* Subtle bottom accent line */}
              <div className={`absolute bottom-0 left-8 right-8 h-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity ${
                service.accentColor === 'indigo' ? 'bg-indigo-500' : 'bg-emerald-500'
              }`} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
