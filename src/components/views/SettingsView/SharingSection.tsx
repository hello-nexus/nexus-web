import type { ReactNode } from 'react';
import { Fan, HardDrive, LayoutDashboard, Lightbulb, Palette, RotateCcw, UsersRound } from 'lucide-react';
import { Button } from '../../common/Button/Button';
import { Badge } from '../../common/Badge/Badge';
import { ChipGroup } from '../../common/ChipGroup/ChipGroup';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { SettingRow } from '../../common/SettingRow/SettingRow';
import { PROFILE_CATEGORIES, type ProfileCategory } from '../../../api/profiles';
import { useProfileSharing, type UseProfilesResult } from '../../../hooks/useProfiles';
import { useTranslation } from '../../../lib/i18n';
import { pluralKey } from '../../../lib/pluralKey';
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

/** Shared with the cross-machine import sheet so both surfaces label a category identically. */
export const CATEGORY_ICONS: Record<ProfileCategory, ReactNode> = {
  lighting: <Lightbulb />,
  cooling: <Fan />,
  theme: <Palette />,
  dashboard: <LayoutDashboard />,
  device: <HardDrive />,
};

export function SharingSection({ profiles, sharing, primaryId, sharedCats, counts, onlyOneProfile, onResetCategory, onShareCategory }: SharingSectionProps) {
  const { t, language } = useTranslation();
  const primaryName = profiles.profiles.find(p => p.id === primaryId)?.name ?? '';

  // The custom i18n t() only does single-brace substitution, no <Trans>-style
  // node interpolation - split on the raw token to highlight the profile name
  // in a non-dim span. Falls back to a plain string if a locale ever drops
  // the token so the sentence still renders correctly.
  // The one <p> is load-bearing: SettingsSection's description is a flex
  // column, so a bare fragment would make each part its own stacked line.
  const explainParts = t('settings.profiles.sharing.explainV2').split('{primary}');
  const explainDescription = explainParts.length === 2
    ? <p>{explainParts[0]}<span className={styles.primaryName}>{primaryName}</span>{explainParts[1]}</p>
    : t('settings.profiles.sharing.explainV2', { primary: primaryName });

  return (
    <SettingsSection
      title={t('settings.profiles.sharing.heading')}
      description={explainDescription}
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
            icon={CATEGORY_ICONS[category]}
            iconLeading="subtle"
            description={t(`settings.profiles.sharing.cat.${category}.desc`)}
          >
            {count > 0 && (
              <span className={styles.presetCountBadge}>
                <Badge label={t(pluralKey('settings.profiles.sharing.presetCount', language, count), { count })} />
              </span>
            )}
            <ChipGroup
              ariaLabel={t(`settings.profiles.sharing.cat.${category}.label`)}
              activeKey={isShared ? 'shared' : 'perProfile'}
              onChange={key => {
                if (key === 'shared' && !isShared) onShareCategory(category);
                else if (key === 'perProfile' && isShared) sharing.setCategoryShared(category, false);
              }}
              options={[
                { key: 'perProfile', label: t('settings.profiles.sharing.perProfile'), disabled: onlyOneProfile },
                { key: 'shared', label: t('settings.profiles.sharing.shared'), disabled: onlyOneProfile },
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
