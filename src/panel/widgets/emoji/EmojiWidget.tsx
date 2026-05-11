import { useState, useCallback, useRef, useEffect } from 'react';
import type { WidgetProps } from '../types';
import styles from './EmojiWidget.module.scss';

const CATEGORIES: Record<string, { icon: string; emojis: string[] }> = {
  smileys: { icon: '\u{1F60A}', emojis: ['\u{1F600}','\u{1F603}','\u{1F604}','\u{1F601}','\u{1F606}','\u{1F605}','\u{1F923}','\u{1F602}','\u{1F642}','\u{1F609}','\u{1F60A}','\u{1F607}','\u{1F970}','\u{1F60D}','\u{1F929}','\u{1F618}','\u{1F617}','\u{1F61A}','\u{1F60B}','\u{1F61B}','\u{1F61C}','\u{1F92A}','\u{1F61D}','\u{1F911}','\u{1F917}','\u{1F92D}','\u{1F92B}','\u{1F914}','\u{1F610}','\u{1F611}','\u{1F636}','\u{1F60F}','\u{1F612}','\u{1F644}','\u{1F62C}','\u{1F62E}\u200D\u{1F4A8}','\u{1F925}','\u{1F60C}','\u{1F614}','\u{1F62A}','\u{1F924}','\u{1F634}','\u{1F637}','\u{1F912}','\u{1F915}','\u{1F922}','\u{1F92E}','\u{1F975}','\u{1F976}','\u{1F974}','\u{1F635}','\u{1F92F}','\u{1F920}','\u{1F973}','\u{1F978}','\u{1F60E}','\u{1F913}','\u{1F9D0}','\u{1F615}','\u{1F61F}','\u{2639}\uFE0F','\u{1F62E}','\u{1F62F}','\u{1F632}','\u{1F633}','\u{1F97A}','\u{1F626}','\u{1F627}','\u{1F628}','\u{1F630}','\u{1F625}','\u{1F622}','\u{1F62D}','\u{1F631}','\u{1F616}','\u{1F623}','\u{1F61E}','\u{1F613}','\u{1F629}','\u{1F62B}','\u{1F971}'] },
  animals: { icon: '\u{1F431}', emojis: ['\u{1F436}','\u{1F431}','\u{1F42D}','\u{1F439}','\u{1F430}','\u{1F98A}','\u{1F43B}','\u{1F43C}','\u{1F43B}\u200D\u2744\uFE0F','\u{1F428}','\u{1F42F}','\u{1F981}','\u{1F42E}','\u{1F437}','\u{1F438}','\u{1F435}','\u{1F414}','\u{1F427}','\u{1F426}','\u{1F424}','\u{1F986}','\u{1F985}','\u{1F989}','\u{1F987}','\u{1F43A}','\u{1F417}','\u{1F434}','\u{1F984}','\u{1F41D}','\u{1FAB1}','\u{1F41B}','\u{1F98B}','\u{1F40C}','\u{1F41E}','\u{1F41C}','\u{1FAB2}','\u{1FAB3}','\u{1F99F}','\u{1F997}','\u{1F577}\uFE0F','\u{1F422}','\u{1F40D}','\u{1F98E}','\u{1F996}','\u{1F995}','\u{1F419}','\u{1F991}','\u{1F990}','\u{1F99E}','\u{1F980}','\u{1F421}','\u{1F420}','\u{1F41F}','\u{1F42C}','\u{1F433}','\u{1F40B}','\u{1F988}','\u{1F40A}','\u{1F405}','\u{1F406}'] },
  food: { icon: '\u{1F355}', emojis: ['\u{1F34F}','\u{1F34E}','\u{1F350}','\u{1F34A}','\u{1F34B}','\u{1F34C}','\u{1F349}','\u{1F347}','\u{1F353}','\u{1FAD0}','\u{1F348}','\u{1F352}','\u{1F351}','\u{1F96D}','\u{1F34D}','\u{1F965}','\u{1F95D}','\u{1F345}','\u{1F951}','\u{1F346}','\u{1F954}','\u{1F955}','\u{1F33D}','\u{1F336}\uFE0F','\u{1FAD1}','\u{1F952}','\u{1F96C}','\u{1F966}','\u{1F9C4}','\u{1F9C5}','\u{1F344}','\u{1F95C}','\u{1FAD8}','\u{1F330}','\u{1F35E}','\u{1F950}','\u{1F956}','\u{1FAD3}','\u{1F968}','\u{1F96F}','\u{1F95E}','\u{1F9C7}','\u{1F9C0}','\u{1F356}','\u{1F357}','\u{1F969}','\u{1F953}','\u{1F354}','\u{1F35F}','\u{1F355}','\u{1F32D}','\u{1F96A}','\u{1F32E}','\u{1F32F}','\u{1FAD4}','\u{1F959}','\u{1F9C6}','\u{1F95A}','\u{1F373}','\u{1F958}','\u{1F372}','\u{1FAD5}','\u{1F963}','\u{1F957}','\u{1F37F}','\u{1F9C8}'] },
  activities: { icon: '\u26BD', emojis: ['\u26BD','\u{1F3C0}','\u{1F3C8}','\u26BE','\u{1F94E}','\u{1F3BE}','\u{1F3D0}','\u{1F3C9}','\u{1F94F}','\u{1F3B1}','\u{1FA80}','\u{1F3D3}','\u{1F3F8}','\u{1F3D2}','\u{1F3D1}','\u{1F94D}','\u{1F3CF}','\u{1FA83}','\u{1F945}','\u26F3','\u{1FA81}','\u{1F3F9}','\u{1F3A3}','\u{1F93F}','\u{1F94A}','\u{1F94B}','\u{1F3BD}','\u{1F6F9}','\u{1F6FC}','\u{1F6F7}','\u26F8\uFE0F','\u{1F94C}','\u{1F3BF}','\u26F7\uFE0F','\u{1F3C2}','\u{1FA82}','\u{1F3CB}\uFE0F','\u{1F938}','\u{1F93A}','\u26F9\uFE0F','\u{1F93E}','\u{1F3CC}\uFE0F','\u{1F3C7}','\u{1F9D8}','\u{1F3C4}','\u{1F3CA}','\u{1F93D}','\u{1F6A3}','\u{1F9D7}','\u{1F6B5}','\u{1F6B4}','\u{1F3C6}','\u{1F947}','\u{1F948}','\u{1F949}','\u{1F3C5}','\u{1F396}\uFE0F','\u{1F3F5}\uFE0F','\u{1F397}\uFE0F','\u{1F3AB}','\u{1F39F}\uFE0F','\u{1F3AA}'] },
  travel: { icon: '\u2708\uFE0F', emojis: ['\u{1F697}','\u{1F695}','\u{1F699}','\u{1F68C}','\u{1F68E}','\u{1F3CE}\uFE0F','\u{1F693}','\u{1F691}','\u{1F692}','\u{1F690}','\u{1F6FB}','\u{1F69A}','\u{1F69B}','\u{1F69C}','\u{1F6F5}','\u{1F6B2}','\u{1F6F4}','\u{1F6FA}','\u{1F694}','\u{1F68D}','\u{1F698}','\u{1F696}','\u{1F6DE}','\u{1F6A1}','\u{1F6A0}','\u{1F69F}','\u{1F683}','\u{1F68B}','\u{1F69E}','\u{1F69D}','\u{1F684}','\u{1F685}','\u{1F688}','\u{1F682}','\u{1F686}','\u{1F687}','\u{1F68A}','\u{1F689}','\u2708\uFE0F','\u{1F6EB}','\u{1F6EC}','\u{1F4BA}','\u{1F680}','\u{1F6F8}','\u{1F681}','\u{1F6F6}','\u26F5','\u{1F6A4}','\u{1F6E5}\uFE0F','\u{1F6F3}\uFE0F','\u26F4\uFE0F','\u{1F6A2}'] },
  objects: { icon: '\u{1F4A1}', emojis: ['\u231A','\u{1F4F1}','\u{1F4BB}','\u2328\uFE0F','\u{1F5A5}\uFE0F','\u{1F5A8}\uFE0F','\u{1F5B1}\uFE0F','\u{1F5B2}\uFE0F','\u{1F579}\uFE0F','\u{1F5DC}\uFE0F','\u{1F4BD}','\u{1F4BE}','\u{1F4BF}','\u{1F4C0}','\u{1F4FC}','\u{1F4F7}','\u{1F4F8}','\u{1F4F9}','\u{1F3A5}','\u{1F4FD}\uFE0F','\u{1F39E}\uFE0F','\u{1F4DE}','\u260E\uFE0F','\u{1F4DF}','\u{1F4E0}','\u{1F4FA}','\u{1F4FB}','\u{1F399}\uFE0F','\u{1F39A}\uFE0F','\u{1F39B}\uFE0F','\u{1F9ED}','\u23F1\uFE0F','\u23F2\uFE0F','\u23F0','\u{1F570}\uFE0F','\u{1F4A1}','\u{1F526}','\u{1F56F}\uFE0F','\u{1F9EF}','\u{1F6E2}\uFE0F','\u{1F4B0}','\u{1FA99}','\u{1F4B4}','\u{1F4B5}','\u{1F4B6}','\u{1F4B7}','\u{1FAA}','\u{1F4B3}','\u{1F48E}','\u2696\uFE0F','\u{1FA9C}','\u{1F9F0}','\u{1FA9B}','\u{1F527}','\u{1F528}','\u2692\uFE0F','\u{1F6E0}\uFE0F','\u26CF\uFE0F','\u{1FA9A}','\u{1F529}'] },
  symbols: { icon: '\u2764\uFE0F', emojis: ['\u2764\uFE0F','\u{1F9E1}','\u{1F49B}','\u{1F49A}','\u{1F499}','\u{1F49C}','\u{1F5A4}','\u{1F90D}','\u{1F90E}','\u{1F494}','\u2764\uFE0F\u200D\u{1F525}','\u2764\uFE0F\u200D\u{1FA79}','\u2763\uFE0F','\u{1F495}','\u{1F49E}','\u{1F493}','\u{1F497}','\u{1F496}','\u{1F498}','\u{1F49D}','\u{1F49F}','\u262E\uFE0F','\u271D\uFE0F','\u262A\uFE0F','\u{1F549}\uFE0F','\u2638\uFE0F','\u2721\uFE0F','\u{1F52F}','\u{1FAAC}','\u262F\uFE0F','\u2626\uFE0F','\u{1F6D0}','\u26CE','\u2648','\u2649','\u264A','\u264B','\u264C','\u264D','\u264E','\u264F','\u2650','\u2651','\u2652','\u2653','\u{1F194}','\u269B\uFE0F','\u{1F251}','\u2622\uFE0F','\u2623\uFE0F','\u{1F4F4}','\u{1F4F3}','\u{1F236}','\u{1F21A}'] },
};

const CATEGORY_KEYS = Object.keys(CATEGORIES);

export function EmojiWidget({ widget: _widget }: WidgetProps) {
  const [activeCategory, setActiveCategory] = useState(CATEGORY_KEYS[0]);
  const [toast, setToast] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const handleEmojiClick = useCallback((emoji: string) => {
    navigator.clipboard.writeText(emoji).catch(() => {});
    setToast(true);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(false), 1200);
  }, []);

  const cat = CATEGORIES[activeCategory];

  return (
    <div className={styles.container}>
      <div className={styles.tabs}>
        {CATEGORY_KEYS.map(key => (
          <button
            key={key}
            type="button"
            className={`${styles.tab} ${activeCategory === key ? styles.activeTab : ''}`}
            onClick={() => setActiveCategory(key)}
            aria-label={key}
          >
            {CATEGORIES[key].icon}
          </button>
        ))}
      </div>
      <div className={styles.grid} data-panel-scrollable="true">
        {cat.emojis.map((emoji, i) => (
          <button
            key={`${activeCategory}-${i}`}
            type="button"
            className={styles.emojiBtn}
            onClick={() => handleEmojiClick(emoji)}
          >
            {emoji}
          </button>
        ))}
      </div>
      {toast && <div className={styles.toast}>Copied!</div>}
    </div>
  );
}

export default EmojiWidget;
