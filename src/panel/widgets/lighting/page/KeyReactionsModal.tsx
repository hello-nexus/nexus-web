import { useRef } from 'react';
import { DeviceModal } from '../../../../components/common/DeviceModal/DeviceModal';
import {
  TypeReactiveEditor,
  useTypeReactiveConfig,
  type TypeReactiveEditorProps,
} from '../../../../components/common/TypeReactiveEditor/TypeReactiveEditor';
import type { KeyReaction } from '../../../../api/keyReactive';
import { useTranslation } from '../../../../lib/i18n';

interface KeyReactionsModalProps extends Omit<TypeReactiveEditorProps, 'controller' | 'layout'> {
  initialConfig: KeyReaction;
  deviceName: string;
  onClose: () => void;
}

/** Modal shell around the shared Type reactive editor. */
export function KeyReactionsModal({ deviceName, onClose, initialConfig, ...editor }: KeyReactionsModalProps) {
  const { t } = useTranslation();
  const controller = useTypeReactiveConfig(editor.cardId, initialConfig);
  // The last edit is written before the host refetches on close, so the
  // refetch never reads the config from before it.
  const closingRef = useRef(false);
  const handleClose = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    void controller.flushSave().finally(onClose);
  };
  return (
    <DeviceModal
      open
      onClose={handleClose}
      title={t('lighting.keyReactions.title')}
      subtitle={deviceName}
      large
    >
      <TypeReactiveEditor {...editor} controller={controller} layout="split" />
    </DeviceModal>
  );
}
