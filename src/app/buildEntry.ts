// The Build app's icon and keys. The sidebar row, the Build widget tile and the
// search entry all read the one icon here, so swapping the glyph is a one-line change.

import { BuildIcon } from '../components/common/BuildLogo/BuildIcon';

export const BUILD_APP_KEY = 'build' as const;
export const BUILD_ICON = BuildIcon;
export const BUILD_I18N_KEY = 'panel.widget.build';
