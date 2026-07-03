import { useState } from 'react';
import { Card } from '../Card/Card';
import { CardDeleteButton } from '../CardDeleteButton/CardDeleteButton';
import { Button } from '../Button/Button';
import { useTranslation } from '../../../lib/i18n';
import {
  listPairedPcs,
  removePairedPc,
  activatePairedPc,
  getActivePcId,
  type PairedPcRecord,
} from '../../../api/pairedPcs';
import styles from './PairedPcsContent.module.scss';

/**
 * The phone's own remembered PCs - independent of LAN reachability, so a PC
 * paired once over the cloud relay still shows up on cellular with no Wi-Fi
 * at all. Applies a record's session token, then does a full navigation into
 * /panel/phone: the token/relay-region state this reads is per-origin
 * localStorage, so a hot in-place swap of the live connection isn't possible
 * - the same reasoning every claim path in this app already follows.
 */
export function PairedPcsContent() {
  const { t } = useTranslation();
  const [records, setRecords] = useState<PairedPcRecord[]>(() => listPairedPcs());
  const [activeId, setActiveId] = useState<string | null>(() => getActivePcId());

  const handleConnect = (id: string) => {
    activatePairedPc(id);
    window.location.assign('/panel/phone');
  };

  const handleRemove = (id: string) => {
    removePairedPc(id);
    setRecords(listPairedPcs());
    setActiveId(getActivePcId());
  };

  if (records.length === 0) {
    return <p className={styles.empty}>{t('pairedPcs.empty')}</p>;
  }

  return (
    <div className={styles.grid}>
      {records.map(pc => {
        const isActive = pc.id === activeId;
        const displayName = pc.machineName || t('pairedPcs.unnamed');
        const tone = isActive ? 'good' : pc.needsRepair ? 'bad' : 'neutral';
        const statusLabel = isActive
          ? t('pairedPcs.statusConnected')
          : pc.needsRepair
          ? t('pairedPcs.statusNeedsRepair')
          : t('pairedPcs.statusSaved');
        return (
          <Card key={pc.id} title={displayName} className={styles.card}>
            <div className={styles.footer}>
              <span className={styles.status} data-tone={tone}>
                <span className={styles.statusDot} data-tone={tone} aria-hidden="true" />
                {statusLabel}
              </span>
              {isActive ? null : pc.needsRepair ? (
                <Button size="sm" tone="accent" href="/r/pair">
                  {t('connection.sessionRevoked.pairAgain')}
                </Button>
              ) : (
                <Button size="sm" tone="accent" onClick={() => handleConnect(pc.id)}>
                  {t('pairedPcs.connect')}
                </Button>
              )}
            </div>
            <CardDeleteButton
              onDelete={() => handleRemove(pc.id)}
              ariaLabel={t('pairedPcs.remove', { name: displayName })}
              revealOnHover={false}
              className={styles.delete}
            />
          </Card>
        );
      })}
    </div>
  );
}
