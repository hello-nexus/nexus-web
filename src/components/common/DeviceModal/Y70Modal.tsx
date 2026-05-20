import { PanelDeviceModal } from './PanelDeviceModal';

interface Y70ModalProps {
  open: boolean;
  onClose: () => void;
}

export function Y70Modal(props: Y70ModalProps) {
  return <PanelDeviceModal {...props} />;
}
