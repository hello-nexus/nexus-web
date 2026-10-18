import { ArrowLeft, CloudUpload, Plug, SlidersHorizontal, type LucideIcon } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { Overlay } from '../Overlay/Overlay';
import { Button } from '../Button/Button';
import { SettingsSection } from '../SettingsSection/SettingsSection';
import { SettingRow } from '../SettingRow/SettingRow';
import { SkipOnboardingButton } from '../SkipOnboardingButton/SkipOnboardingButton';
import styles from './HyteOnboardingScreen.module.scss';

const HYTE_MARK = '/assets/devices/hyte.svg';

export interface HyteOnboardingScreenProps {
  open: boolean;
  onContinue: () => void;
  /** Steps back to the welcome screen; the Back button only renders when provided. */
  onBack?: () => void;
  /** Skips every remaining onboarding step; renders the top-right escape hatch when provided. */
  onSkipOnboarding?: () => void;
}

const ROWS: { key: string; Icon?: LucideIcon }[] = [
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

        <SettingsSection flush title={t('hyteOnboarding.whatsNew')} className={styles.list}>
          {ROWS.map(({ key, Icon }) => (
            <SettingRow
              key={key}
              iconLeading
              icon={Icon
                ? <Icon strokeWidth={1.75} />
                : <span className={styles.rowMark} style={{ ['--mark' as string]: `url(${HYTE_MARK})` }} />}
              label={t(`hyteOnboarding.card.${key}.title`)}
              description={t(`hyteOnboarding.card.${key}.description`)}
            />
          ))}
        </SettingsSection>
      </div>

      <div className={styles.footer}>
        <Button tone="accent" size="lg" onClick={onContinue} className={styles.continueButton}>
          {t('hyteOnboarding.continue')}
        </Button>
      </div>
    </Overlay>
  );
}
