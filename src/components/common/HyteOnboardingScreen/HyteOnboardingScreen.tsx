import { ArrowLeft, CloudUpload, Plug, SlidersHorizontal, type LucideIcon } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { Overlay } from '../Overlay/Overlay';
import { Button } from '../Button/Button';
import { SkipOnboardingButton } from '../SkipOnboardingButton/SkipOnboardingButton';
import { PanelPageIndicator } from '../../../panel/chrome/PanelPageIndicator';
import styles from './HyteOnboardingScreen.module.scss';

const HYTE_MARK = '/assets/devices/hyte.svg';

/** Welcome, this step, Features, Import, Conflicts, Lighting. */
const STEP_COUNT = 6;
const STEP_INDEX = 1;

export interface HyteOnboardingScreenProps {
  open: boolean;
  onContinue: () => void;
  /** Steps back to the welcome screen; the Back button only renders when provided. */
  onBack?: () => void;
  /** Skips every remaining onboarding step; renders the top-right escape hatch when provided. */
  onSkipOnboarding?: () => void;
}

const CARDS: { key: string; Icon?: LucideIcon }[] = [
  { key: 'hyte' },
  { key: 'devices', Icon: Plug },
  { key: 'backup', Icon: CloudUpload },
  { key: 'choice', Icon: SlidersHorizontal },
];

/**
 * Informational onboarding step for people who still have HYTE Nexus 2
 * installed: thanks them, says what the new app adds, and offers no choices.
 */
export function HyteOnboardingScreen({ open, onContinue, onBack, onSkipOnboarding }: HyteOnboardingScreenProps) {
  const { t } = useTranslation();
  if (!open) return null;

  return (
    <Overlay
      open={open}
      onClose={() => {}}
      noEscDismiss
      noBackdropDismiss
      onEnter={onContinue}
      autoFocus="container"
      ariaLabel={t('hyteOnboarding.title')}
      className={styles.surface}
      backdropClassName={styles.backdrop}
    >
      <div className={styles.topBar}>
        {onBack ? (
          <Button tone="ghost" size="sm" icon={<ArrowLeft />} onClick={onBack}>
            {t('nav.back')}
          </Button>
        ) : <span />}
        {onSkipOnboarding ? <SkipOnboardingButton onSkip={onSkipOnboarding} /> : <span />}
      </div>

      <div className={styles.scroller}>
        <div className={styles.hero}>
          <div className={styles.brands} aria-hidden>
            <span className={styles.hyteMark} style={{ ['--mark' as string]: `url(${HYTE_MARK})` }} />
            <span className={styles.plus}>+</span>
            <img src="/nexus-mark-color.png" alt="" width={44} height={44} className={styles.nexusMark} />
          </div>
          <h1 className={styles.title}>{t('hyteOnboarding.title')}</h1>
          <p className={styles.intro}>{t('hyteOnboarding.intro1')}</p>
          <p className={styles.intro}>{t('hyteOnboarding.intro2')}</p>
        </div>

        <p className={styles.groupLabel}>{t('hyteOnboarding.whatsNew')}</p>
        <ul className={styles.grid}>
          {CARDS.map(({ key, Icon }) => (
            <li key={key} className={styles.card}>
              <span className={styles.cardIcon} aria-hidden>
                {Icon
                  ? <Icon size={44} strokeWidth={1.75} />
                  : <span className={styles.hyteMark} style={{ ['--mark' as string]: `url(${HYTE_MARK})` }} />}
              </span>
              <span className={styles.cardTitle}>{t(`hyteOnboarding.card.${key}.title`)}</span>
              <span className={styles.cardDescription}>{t(`hyteOnboarding.card.${key}.description`)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.footer}>
        <Button tone="accent" size="lg" onClick={onContinue} className={styles.continueButton}>
          {t('hyteOnboarding.continue')}
        </Button>
        <PanelPageIndicator total={STEP_COUNT} active={STEP_INDEX} persistent className={styles.steps} />
      </div>
    </Overlay>
  );
}
