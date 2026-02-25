import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import SEO from '../components/SEO';
import Navbar from '../components/landing/Navbar';
import Hero from '../components/landing/Hero';
import ServiceCards from '../components/landing/ServiceCards';
import HowItWorks from '../components/landing/HowItWorks';
import Features from '../components/landing/Features';
import CTA from '../components/landing/CTA';
import Footer from '../components/landing/Footer';

export default function Landing() {
  const location = useLocation();

  useEffect(() => {
    const hash = (location.state as { scrollTo?: string })?.scrollTo;
    if (hash) {
      setTimeout(() => {
        document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
      window.history.replaceState({}, '');
    }
  }, [location.state]);

  return (
    <>
      <SEO />
      <div className="min-h-screen">
        <Navbar />
        <main>
          <Hero />
          <ServiceCards />
          <HowItWorks />
          <Features />
          <CTA />
        </main>
        <Footer />
      </div>
    </>
  );
}
