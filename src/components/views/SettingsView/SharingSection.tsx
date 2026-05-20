import { RotateCcw } from 'lucide-react';
import { Button } from '../../common/Button/Button';
import { PROFILE_CATEGORIES, type ProfileCategory } from '../../../api/profiles';
import { useProfileSharing, type UseProfilesResult } from '../../../hooks/useProfiles';
import { useTranslation } from '../../../lib/i18n';
import styles from './SettingsView.module.scss';

export interface SharingSectionProps {
  profiles: UseProfilesResult;
  sharing: ReturnType<typeof useProfileSharing>;
  primaryId: string;
  sharedCats: ProfileCategory[];
  onlyOneProfile: boolean;
  onResetCategory: (profileId: string, category: ProfileCategory, shared: boolean) => void;
  onShareCategory: (category: ProfileCategory) => void;
}

export function SharingSection({ profiles, sharing, primaryId, sharedCats, onlyOneProfile, onResetCategory, onShareCategory }: SharingSectionProps) {
  const { t } = useTranslation();
  const primaryName = profiles.profiles.find(p => p.id === primaryId)?.name ?? '';

  return (
    <div className={styles.sharingSection}>
      <h3 className={styles.sharingHeading}>{t('settings.profiles.sharing.heading')}</h3>

      <p className={styles.sharingExplain}>
        {t('settings.profiles.sharing.explainV2', { primary: primaryName })}
      </p>

      <div className={styles.sharingCategories}>
        {PROFILE_CATEGORIES.map(category => {
          const isShared = sharedCats.includes(category);
          return (
            <div key={category} className={styles.sharingRow}>
              <div className={styles.rowInfo}>
                <span className={styles.rowLabel}>{t(`settings.profiles.sharing.cat.${category}.label`)}</span>
                <span className={styles.rowDesc}>{t(`settings.profiles.sharing.cat.${category}.desc`)}</span>
              </div>
              <div className={styles.sharingControls}>
                <div className={styles.segmented} role="radiogroup" aria-label={t(`settings.profiles.sharing.cat.${category}.label`)}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={!isShared}
                    className={`${styles.segmentedOption} ${!isShared ? styles.segmentedOptionActive : ''}`}
                    onClick={() => { if (isShared) sharing.setCategoryShared(category, false); }}
                    disabled={onlyOneProfile}
                  >
                    {t('settings.profiles.sharing.perProfile')}
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={isShared}
                    className={`${styles.segmentedOption} ${isShared ? styles.segmentedOptionActive : ''}`}
                    onClick={() => { if (!isShared) onShareCategory(category); }}
                    disabled={onlyOneProfile}
                  >
                    {t('settings.profiles.sharing.shared')}
                  </button>
                </div>
                <Button
                  type="button"
                  tone="ghost"
                  size="sm"
                  icon={<RotateCcw />}
                  onClick={() => onResetCategory(profiles.activeId, category, isShared)}
                  title={t('settings.profiles.reset.categoryTooltip')}
                  aria-label={t('settings.profiles.reset.categoryTooltip')}
                />
              </div>
            </div>
          );
        })}
      </div>

      {onlyOneProfile && (
        <p className={styles.note}>{t('settings.profiles.sharing.onlyOneProfile')}</p>
      )}
    </div>
  );
}
