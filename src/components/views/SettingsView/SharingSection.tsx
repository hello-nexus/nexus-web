import { RotateCcw, UsersRound } from 'lucide-react';
import { Button } from '../../common/Button/Button';
import { Badge } from '../../common/Badge/Badge';
import { Tabs } from '../../common/Tabs/Tabs';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { SettingRow } from '../../common/SettingRow/SettingRow';
import { PROFILE_CATEGORIES, type ProfileCategory } from '../../../api/profiles';
import { useProfileSharing, type UseProfilesResult } from '../../../hooks/useProfiles';
import { useTranslation } from '../../../lib/i18n';
import styles from './SettingsView.module.scss';

export interface SharingSectionProps {
  profiles: UseProfilesResult;
  sharing: ReturnType<typeof useProfileSharing>;
  primaryId: string;
  sharedCats: ProfileCategory[];
  // Active-profile user-preset count per category; renders as a small badge
  // on the row when > 0.
  counts: Record<string, number>;
  onlyOneProfile: boolean;
  onResetCategory: (profileId: string, category: ProfileCategory, shared: boolean) => void;
  onShareCategory: (category: ProfileCategory) => void;
}

export function SharingSection({ profiles, sharing, primaryId, sharedCats, counts, onlyOneProfile, onResetCategory, onShareCategory }: SharingSectionProps) {
  const { t } = useTranslation();
  const primaryName = profiles.profiles.find(p => p.id === primaryId)?.name ?? '';

  return (
    <SettingsSection
      title={t('settings.profiles.sharing.heading')}
      description={t('settings.profiles.sharing.explainV2', { primary: primaryName })}
    >
      {onlyOneProfile && (
        <p className={`${styles.note} ${styles.sharingHint}`} data-settings-aside="true">
          <UsersRound size={16} aria-hidden />
          {t('settings.profiles.sharing.onlyOneProfile')}
        </p>
      )}

      {PROFILE_CATEGORIES.map(category => {
        const isShared = sharedCats.includes(category);
        const count = counts[category] ?? 0;
        return (
          <SettingRow
            key={category}
            label={t(`settings.profiles.sharing.cat.${category}.label`)}
            description={t(`settings.profiles.sharing.cat.${category}.desc`)}
          >
            {count > 0 && (
              <span role="img" aria-label={t(
                count === 1 ? 'settings.profiles.sharing.presetCountAria.one' : 'settings.profiles.sharing.presetCountAria.other',
                { count },
              )}>
                <Badge label={String(count)} />
              </span>
            )}
            <Tabs
              ariaLabel={t(`settings.profiles.sharing.cat.${category}.label`)}
              disabled={onlyOneProfile}
              activeKey={isShared ? 'shared' : 'perProfile'}
              onChange={key => {
                if (key === 'shared' && !isShared) onShareCategory(category);
                else if (key === 'perProfile' && isShared) sharing.setCategoryShared(category, false);
              }}
              tabs={[
                { key: 'perProfile', label: t('settings.profiles.sharing.perProfile') },
                { key: 'shared', label: t('settings.profiles.sharing.shared') },
              ]}
            />
            <Button
              type="button"
              tone="ghost"
              size="sm"
              icon={<RotateCcw />}
              onClick={() => onResetCategory(profiles.activeId, category, isShared)}
              title={t('settings.profiles.reset.categoryTooltip')}
              aria-label={t('settings.profiles.reset.categoryTooltip')}
            />
          </SettingRow>
        );
      })}
    </SettingsSection>
  );
}
