import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function ServiceCards() {
  const { t } = useTranslation();

  const services = [
    {
      id: 'start-hiring',
      icon: (
        <svg className="w-12 h-12" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="4" y="8" width="40" height="32" rx="4" className="fill-indigo-100" />
          <circle cx="24" cy="20" r="6" className="fill-indigo-600" />
          <path d="M14 36c0-5.523 4.477-10 10-10s10 4.477 10 10" className="stroke-indigo-600" strokeWidth="2" strokeLinecap="round" />
          <path d="M34 14l4 4-4 4" className="stroke-indigo-400" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M30 18h8" className="stroke-indigo-400" strokeWidth="2" strokeLinecap="round" />
        </svg>
      ),
      title: t('landing.services.hiring.title', 'Start Hiring'),
      subtitle: t('landing.services.hiring.subtitle', 'AI Hiring Agent'),
      description: t('landing.services.hiring.description', 'Let AI handle the heavy lifting. Our hiring agent screens resumes, conducts interviews, and delivers evaluation reports automatically. Focus on what matters - meeting great candidates.'),
      features: [
        t('landing.services.hiring.feature1', 'Automated resume screening'),
        t('landing.services.hiring.feature2', 'AI-powered interviews'),
        t('landing.services.hiring.feature3', 'Comprehensive evaluation reports'),
        t('landing.services.hiring.feature4', 'Webhook integration'),
      ],
      cta: t('landing.services.hiring.cta', 'Start Hiring Now'),
      href: '/start-hiring',
      gradient: 'from-indigo-500 to-purple-600',
      badge: t('landing.services.hiring.badge', 'Most Popular'),
    },
    {
      id: 'api',
      icon: (
        <svg className="w-12 h-12" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="6" y="10" width="36" height="28" rx="4" className="fill-emerald-100" />
          <path d="M14 20l4 4-4 4" className="stroke-emerald-600" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M22 28h12" className="stroke-emerald-600" strokeWidth="2" strokeLinecap="round" />
          <path d="M22 24h8" className="stroke-emerald-400" strokeWidth="2" strokeLinecap="round" />
        </svg>
      ),
      title: t('landing.services.api.title', 'RoboHire API'),
      subtitle: t('landing.services.api.subtitle', 'For Developers'),
      description: t('landing.services.api.description', 'Integrate powerful AI recruitment capabilities into your existing systems. Parse resumes, match candidates, evaluate interviews, and more with our comprehensive API suite.'),
      features: [
        t('landing.services.api.feature1', 'Resume & JD parsing'),
        t('landing.services.api.feature2', 'AI candidate matching'),
        t('landing.services.api.feature3', 'Interview evaluation'),
        t('landing.services.api.feature4', 'RESTful API endpoints'),
      ],
      cta: t('landing.services.api.cta', 'Explore API'),
      href: '/api-playground',
      gradient: 'from-emerald-500 to-teal-600',
      badge: null,
    },
  ];

  return (
    <section id="services" className="py-20 lg:py-32 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
            {t('landing.services.title', 'Two Powerful Ways to Hire')}
          </h2>
          <p className="text-xl text-gray-600">
            {t('landing.services.subtitle', 'Choose the solution that fits your needs - or use both for maximum efficiency.')}
          </p>
        </div>

        {/* Service Cards */}
        <div className="grid md:grid-cols-2 gap-8 lg:gap-12">
          {services.map((service) => (
            <div
              key={service.id}
              className="relative group bg-white rounded-2xl border border-gray-200 p-8 lg:p-10 hover:border-gray-300 hover:shadow-xl transition-all duration-300"
            >
              {/* Badge */}
              {service.badge && (
                <div className="absolute -top-3 left-8 px-4 py-1 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-medium rounded-full">
                  {service.badge}
                </div>
              )}

              {/* Icon */}
              <div className="mb-6">{service.icon}</div>

              {/* Content */}
              <div className="mb-6">
                <div className="text-sm font-medium text-gray-500 mb-1">{service.subtitle}</div>
                <h3 className="text-2xl font-bold text-gray-900 mb-4">{service.title}</h3>
                <p className="text-gray-600 leading-relaxed">{service.description}</p>
              </div>

              {/* Features */}
              <ul className="space-y-3 mb-8">
                {service.features.map((feature, index) => (
                  <li key={index} className="flex items-center gap-3 text-gray-700">
                    <svg className="w-5 h-5 text-emerald-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <Link
                to={service.href}
                className={`inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r ${service.gradient} text-white font-semibold rounded-lg transition-all hover:shadow-lg hover:-translate-y-0.5`}
              >
                {service.cta}
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
