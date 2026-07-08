import type { ReactNode } from 'react';
import { SiteHeader } from './components/SiteHeader';
import { Hero } from './components/Hero';
import { SiteFooter } from './components/SiteFooter';
import { MonitoringSection } from './sections/MonitoringSection';
import { LightingSection } from './sections/LightingSection';
import { CoolingSection } from './sections/CoolingSection';
import { RemoteSection } from './sections/RemoteSection';
import { MoreSection } from './sections/MoreSection';
import { DownloadSection } from './sections/DownloadSection';
import { AboutSection } from './sections/AboutSection';
import { useInViewport } from './hooks/useInViewport';
import styles from './site.module.scss';

// Latching fade/rise reveal; sections keep their own in-viewport gating for
// tickers, this one only drives the entrance transition.
function Reveal({ children }: { children: ReactNode }) {
  const [ref, shown] = useInViewport<HTMLDivElement>({ threshold: 0.08, once: true });
  return (
    <div ref={ref} className={styles.reveal} data-shown={shown ? 'true' : 'false'}>
      {children}
    </div>
  );
}

export function SiteApp() {
  return (
    <div className={styles.page}>
      <SiteHeader />
      <main>
        <Hero />
        <Reveal><MonitoringSection /></Reveal>
        <Reveal><LightingSection /></Reveal>
        <Reveal><CoolingSection /></Reveal>
        <Reveal><RemoteSection /></Reveal>
        <Reveal><MoreSection /></Reveal>
        <Reveal><DownloadSection /></Reveal>
        <Reveal><AboutSection /></Reveal>
      </main>
      <SiteFooter />
    </div>
  );
}
