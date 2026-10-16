import type { WidgetProps } from '../types';
import { WebViewSurface } from './WebViewSurface';

export function WebViewWidget({ widget, surface, editorPreview }: WidgetProps) {
  return <WebViewSurface widget={widget} surface={surface} editorPreview={editorPreview} immersive={false} />;
}

export default WebViewWidget;
