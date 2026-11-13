import { useTranslation } from '../../../lib/i18n';
import styles from './BuildLogo.module.scss';

// The BUILD wordmark is artwork, not text: the letters are baked outlines (Lexend Bold, tracked at 0.04em) inside a rounded
// outline, in 1/1000 em units so the logo is 1.885em tall at any font size and never takes a panel or skin font.
const VIEW_W = 4737;
const VIEW_H = 1885;
const STROKE = 167.4;
const CORNER = 550;
const LETTERS = 'M655.1 1317.4V617.4H964.3Q1036.5 617.4 1086.2 638Q1135.9 658.5 1161.7 697.2Q1187.5 735.8 1187.5 789.4Q1187.5 849.8 1157.7 890.4Q1128 931 1072.5 945.4L1070.8 926Q1117.2 936.5 1151.7 961.5Q1186.1 986.4 1205.3 1022.7Q1224.5 1059 1224.5 1105.7Q1224.5 1158.5 1206.4 1198.2Q1188.3 1237.8 1154.4 1264.4Q1120.5 1291 1074.9 1304.2Q1029.3 1317.4 974.3 1317.4ZM815.9 1175.5H968.3Q996.7 1175.5 1016.3 1166.7Q1035.9 1157.8 1046.5 1140.1Q1057.1 1122.3 1057.1 1097.3Q1057.1 1074.4 1045.8 1058.4Q1034.4 1042.4 1013.6 1033.8Q992.8 1025.2 963.3 1025.2H815.9ZM815.9 898.2H940.5Q966.5 898.2 984.8 889.7Q1003.1 881.1 1012.6 865.6Q1022.1 850 1022.1 828.8Q1022.1 796.4 1000.4 777.8Q978.7 759.3 934.2 759.3H815.9ZM1691 1323.4Q1604.3 1323.4 1536.6 1287.9Q1468.8 1252.4 1430.3 1190.2Q1391.8 1128 1391.8 1048.4V617H1563V1039.4Q1563 1077.8 1580.1 1107.9Q1597.2 1138.1 1626.3 1155.8Q1655.5 1173.5 1691 1173.5Q1729 1173.5 1758.9 1155.8Q1788.7 1138.1 1806.4 1107.9Q1824.1 1077.8 1824.1 1039.4V617H1990.3V1048.4Q1990.3 1128 1951.7 1190.2Q1913.2 1252.4 1845.5 1287.9Q1777.8 1323.4 1691 1323.4ZM2187.1 1317.4V1174.3H2305.9V760.5H2187.1V617.4H2594.6V760.5H2475.9V1174.3H2594.6V1317.4ZM2796.1 1317.4V617.4H2966.1V1167.5H3278V1317.4ZM3445.1 1317.4V617.4H3738.6Q3815.9 617.4 3879.5 643Q3943.2 668.5 3989.6 715.3Q4036.1 762 4061.1 826Q4086.1 890 4086.1 967.4Q4086.1 1044.3 4061.1 1108.8Q4036.1 1173.3 3989.9 1219.8Q3943.6 1266.3 3879.8 1291.8Q3815.9 1317.4 3738.6 1317.4ZM3615.1 1201.4M3592.6 1167.5H3733.6Q3775.1 1167.5 3808.3 1153.1Q3841.5 1138.6 3865.1 1112.6Q3888.7 1086.5 3901.4 1049.4Q3914.1 1012.3 3914.1 967.4Q3914.1 922.5 3901.4 885.6Q3888.7 848.7 3864.9 822.4Q3841 796.2 3808.1 781.7Q3775.1 767.3 3733.6 767.3H3589.6L3615.1 735.4Z';

interface BuildLogoProps {
  /** contrast is the theme's full-contrast ink (pure white on dark, pure black on light); muted is the dim text token; primary the body text color (the default). Never the accent. */
  tone?: 'contrast' | 'muted' | 'primary';
  /** The size in CSS px of the type the logo is proportioned to; omitted, the body type token applies. */
  fontSize?: number;
  /** The accessible name; a host with its own translations passes it. Defaults to the app's BUILD string. */
  label?: string;
  className?: string;
}

/** The BUILD logo: an inline SVG wordmark inside a rounded outline, painted in the tone's color. A quiet identifier, not a button. */
export function BuildLogo({ tone = 'primary', fontSize, label, className }: BuildLogoProps) {
  const { t } = useTranslation();
  return (
    <span
      className={[styles.logo, styles[tone], className].filter(Boolean).join(' ')}
      style={fontSize ? { fontSize } : undefined}
      role="img"
      aria-label={label ?? t('panel.widget.build.badge')}
    >
      <svg className={styles.mark} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} aria-hidden="true" focusable="false">
        <rect x={STROKE / 2} y={STROKE / 2} width={VIEW_W - STROKE} height={VIEW_H - STROKE} rx={CORNER - STROKE / 2} fill="none" stroke="currentColor" strokeWidth={STROKE} />
        <path d={LETTERS} fill="currentColor" />
      </svg>
    </span>
  );
}
