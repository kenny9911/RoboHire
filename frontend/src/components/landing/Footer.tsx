import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from '../LanguageSwitcher';

export default function Footer() {
  const { t } = useTranslation();

  const footerLinks = {
    product: {
      title: t('landing.footer.product', 'Product'),
      links: [
        { label: t('landing.footer.startHiring', 'Start Hiring'), href: '/start-hiring' },
        { label: t('landing.footer.api', 'API'), href: '/developers' },
        { label: t('landing.footer.playground', 'Playground'), href: '/api-playground' },
        { label: t('landing.footer.pricing', 'Pricing'), href: '/pricing' },
      ],
    },
    developers: {
      title: t('landing.footer.developers', 'Developers'),
      links: [
        { label: t('landing.footer.docs', 'Documentation'), href: '/docs' },
        { label: t('landing.footer.apiReference', 'API Reference'), href: '/docs/api/match-resume' },
        { label: t('landing.footer.quickStart', 'Quick Start'), href: '/docs/quick-start' },
        { label: t('landing.footer.apiKeys', 'API Keys'), href: '/dashboard/api-keys' },
      ],
    },
    company: {
      title: t('landing.footer.company', 'Company'),
      links: [
        { label: t('landing.footer.about', 'About Us'), href: '/about' },
        { label: t('landing.footer.blog', 'Blog'), href: '/blog' },
        { label: t('landing.footer.careers', 'Careers'), href: '/careers' },
        { label: t('landing.footer.contact', 'Contact'), href: '/contact' },
      ],
    },
    legal: {
      title: t('landing.footer.legal', 'Legal'),
      links: [
        { label: t('landing.footer.privacy', 'Privacy Policy'), href: '/privacy' },
        { label: t('landing.footer.terms', 'Terms of Service'), href: '/terms' },
        { label: t('landing.footer.cookies', 'Cookie Policy'), href: '/cookies' },
        { label: t('landing.footer.security', 'Security'), href: '/security' },
      ],
    },
  };

  return (
    <footer className="relative overflow-hidden bg-slate-950 text-slate-300">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_80%_at_10%_0%,rgba(37,99,235,0.22),transparent_70%),radial-gradient(45%_70%_at_92%_8%,rgba(8,145,178,0.18),transparent_74%)]" />

      <div className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-16">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-3 lg:grid-cols-6 lg:gap-12">
          <div className="col-span-2 md:col-span-3 lg:col-span-2">
            <Link to="/" className="flex items-center gap-2 text-xl font-semibold text-white">
              <svg className="h-8 w-8 text-blue-400" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="landing-display">RoboHire</span>
            </Link>

            <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-400">
              {t('landing.footer.tagline', 'AI-powered hiring platform that helps you find and hire elite candidates before others.')}
            </p>

            <div className="mt-6">
              <LanguageSwitcher
                className="w-52"
                selectClassName="border-slate-700 bg-slate-900 text-slate-200 focus:border-blue-400"
              />
            </div>

            <div className="mt-6 flex gap-3">
              <a
                href="https://twitter.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-700 text-slate-400 transition-colors hover:border-slate-500 hover:text-white"
              >
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84" />
                </svg>
              </a>
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-700 text-slate-400 transition-colors hover:border-slate-500 hover:text-white"
              >
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                </svg>
              </a>
              <a
                href="https://linkedin.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-700 text-slate-400 transition-colors hover:border-slate-500 hover:text-white"
              >
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
              </a>
            </div>
          </div>

          {Object.entries(footerLinks).map(([key, section]) => (
            <div key={key}>
              <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-100">{section.title}</h3>
              <ul className="mt-4 space-y-3">
                {section.links.map((link) => (
                  <li key={link.href}>
                    {link.href.startsWith('#') || link.href.startsWith('http') ? (
                      <a href={link.href} className="text-sm text-slate-400 transition-colors hover:text-white">
                        {link.label}
                      </a>
                    ) : (
                      <Link to={link.href} className="text-sm text-slate-400 transition-colors hover:text-white">
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-slate-800 pt-7 sm:flex-row">
          <p className="text-sm text-slate-500">
            © {new Date().getFullYear()} RoboHire. {t('landing.footer.rights', 'All rights reserved.')}
          </p>
          <div className="flex items-center gap-6 text-sm text-slate-500">
            <Link to="/privacy" className="transition-colors hover:text-white">
              {t('landing.footer.privacy', 'Privacy')}
            </Link>
            <Link to="/terms" className="transition-colors hover:text-white">
              {t('landing.footer.terms', 'Terms')}
            </Link>
            <Link to="/cookies" className="transition-colors hover:text-white">
              {t('landing.footer.cookies', 'Cookies')}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
