import { PanelDevicePopup } from './PanelDevicePopup';

interface Y70PopupProps {
  open: boolean;
  onClose: () => void;
}

export function Y70Popup(props: Y70PopupProps) {
  return <PanelDevicePopup {...props} />;
}
