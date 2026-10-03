import type { ReactNode } from 'react';
import {
  Activity, AppWindow, CalendarRange, ChartLine, ChartSpline, Cpu, Fan, Gauge, HardDrive, Layers,
  LayoutDashboard, Lightbulb, MemoryStick, Monitor, Music, Palette, ShieldCheck, SlidersHorizontal,
  Sparkles, Stethoscope, Thermometer, TriangleAlert,
} from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { ScreenTimeIcon } from '../../../panel/widgets/screentime/screentimeIcon';
import { NexusMark } from '../../icons/NexusBrand';
import { EmptyState } from '../EmptyState/EmptyState';

export type PageHeroKey = 'monitoring' | 'lighting' | 'cooling' | 'diagnostics' | 'benchmark' | 'screentime' | 'nexus';

interface PageHeroDef {
  icon: ReactNode;
  titleKey: string;
  hintKey: string;
  points: { icon: ReactNode; textKey: string }[];
}

// One intro per page. The same hero shows whatever the page's state adds
// below it (service offline, Nexus not found on my., feature switched off),
// so a copy or icon change here lands on every surface at once.
const PAGE_HEROES: Record<PageHeroKey, PageHeroDef> = {
  monitoring: {
    icon: <Activity />,
    titleKey: 'pageHero.monitoring.title',
    hintKey: 'pageHero.monitoring.hint',
    points: [
      { icon: <Gauge />, textKey: 'pageHero.monitoring.point1' },
      { icon: <ChartLine />, textKey: 'pageHero.monitoring.point2' },
      { icon: <AppWindow />, textKey: 'pageHero.monitoring.point3' },
    ],
  },
  lighting: {
    icon: <Lightbulb />,
    titleKey: 'pageHero.lighting.title',
    hintKey: 'pageHero.lighting.hint',
    points: [
      { icon: <Sparkles />, textKey: 'pageHero.lighting.point1' },
      { icon: <Palette />, textKey: 'pageHero.lighting.point2' },
      { icon: <Music />, textKey: 'pageHero.lighting.point3' },
    ],
  },
  cooling: {
    icon: <Fan />,
    titleKey: 'pageHero.cooling.title',
    hintKey: 'pageHero.cooling.hint',
    points: [
      { icon: <ChartSpline />, textKey: 'pageHero.cooling.point1' },
      { icon: <SlidersHorizontal />, textKey: 'pageHero.cooling.point2' },
      { icon: <Layers />, textKey: 'pageHero.cooling.point3' },
    ],
  },
  diagnostics: {
    icon: <Stethoscope />,
    titleKey: 'pageHero.diagnostics.title',
    hintKey: 'pageHero.diagnostics.hint',
    points: [
      { icon: <ShieldCheck />, textKey: 'pageHero.diagnostics.point1' },
      { icon: <Thermometer />, textKey: 'pageHero.diagnostics.point2' },
      { icon: <TriangleAlert />, textKey: 'pageHero.diagnostics.point3' },
    ],
  },
  benchmark: {
    icon: <Gauge />,
    titleKey: 'benchmark.results.introTitle',
    hintKey: 'benchmark.results.introBody',
    points: [
      { icon: <Cpu />, textKey: 'benchmark.phase.cpu' },
      { icon: <Monitor />, textKey: 'benchmark.phase.gpu' },
      { icon: <MemoryStick />, textKey: 'benchmark.phase.ram' },
      { icon: <HardDrive />, textKey: 'benchmark.phase.storage' },
    ],
  },
  screentime: {
    icon: <ScreenTimeIcon />,
    titleKey: 'screentime.intro.title',
    hintKey: 'screentime.intro.body',
    points: [
      { icon: <AppWindow />, textKey: 'screentime.intro.pointApps' },
      { icon: <CalendarRange />, textKey: 'screentime.intro.pointViews' },
      { icon: <LayoutDashboard />, textKey: 'screentime.intro.pointWidget' },
    ],
  },
  nexus: {
    icon: <NexusMark />,
    titleKey: 'pageHero.nexus.title',
    hintKey: 'pageHero.nexus.hint',
    points: [
      { icon: <Activity />, textKey: 'nav.monitoring' },
      { icon: <Lightbulb />, textKey: 'lighting.title' },
      { icon: <Fan />, textKey: 'cooling.title' },
      { icon: <Gauge />, textKey: 'benchmark.title' },
    ],
  },
};

const VIEW_HEROES: Partial<Record<string, PageHeroKey>> = {
  monitoring: 'monitoring',
  lighting: 'lighting',
  cooling: 'cooling',
  diagnostics: 'diagnostics',
  benchmark: 'benchmark',
  screentime: 'screentime',
};

/** The hero for a routed view; views without their own intro share the Nexus one. */
export function heroForView(view: string | null | undefined): PageHeroKey {
  return (view && VIEW_HEROES[view]) || 'nexus';
}

interface PageHeroProps {
  page: PageHeroKey;
  /** The state's add-on under the points: a launch card, a switch, a start button. */
  action?: ReactNode;
  className?: string;
}

export function PageHero({ page, action, className }: PageHeroProps) {
  const { t } = useTranslation();
  const def = PAGE_HEROES[page];
  return (
    <EmptyState
      hero
      className={className}
      icon={def.icon}
      title={t(def.titleKey)}
      hint={t(def.hintKey)}
      points={def.points.map(p => ({ icon: p.icon, text: t(p.textKey) }))}
      action={action}
    />
  );
}
