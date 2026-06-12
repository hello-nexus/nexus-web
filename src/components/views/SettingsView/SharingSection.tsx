import { RotateCcw } from 'lucide-react';
import { Button } from '../../common/Button/Button';
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
  onlyOneProfile: boolean;
  onResetCategory: (profileId: string, category: ProfileCategory, shared: boolean) => void;
  onShareCategory: (category: ProfileCategory) => void;
}

export function SharingSection({ profiles, sharing, primaryId, sharedCats, onlyOneProfile, onResetCategory, onShareCategory }: SharingSectionProps) {
  const { t } = useTranslation();
  const primaryName = profiles.profiles.find(p => p.id === primaryId)?.name ?? '';

  return (
    <SettingsSection
      title={t('settings.profiles.sharing.heading')}
      description={t('settings.profiles.sharing.explainV2', { primary: primaryName })}
    >
      {PROFILE_CATEGORIES.map(category => {
        const isShared = sharedCats.includes(category);
        return (
          <SettingRow
            key={category}
            label={t(`settings.profiles.sharing.cat.${category}.label`)}
            description={t(`settings.profiles.sharing.cat.${category}.desc`)}
          >
            <Tabs
              variant="pill"
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

      {onlyOneProfile && (
        <p className={styles.note}>{t('settings.profiles.sharing.onlyOneProfile')}</p>
      )}
    </SettingsSection>
  );
}
