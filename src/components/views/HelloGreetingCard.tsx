import { useTranslation } from '../../lib/i18n';
import { Card } from '../common/Card/Card';
import { Button } from '../common/Button/Button';
import { playHelloGreeting, resetHelloGreetedBoot } from '../../search/helloGreetingStore';
import styles from './ToolsView.module.scss';

export function HelloGreetingCard() {
  const { t } = useTranslation();

  return (
    <Card title={t('tools.helloGreeting.title')}>
      <span className={styles.dim}>{t('tools.helloGreeting.label')}</span>
      <div className={styles.actionsRow}>
        <Button tone="accent" size="sm" onClick={playHelloGreeting}>
          {t('tools.helloGreeting.play')}
        </Button>
        <Button tone="danger" size="sm" onClick={resetHelloGreetedBoot}>
          {t('tools.helloGreeting.reset')}
        </Button>
      </div>
    </Card>
  );
}
