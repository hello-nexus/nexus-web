// Mark traced from brand/NexusLogoMarkAlpha.png (new interlocking-N mark).
// Wordmark traced from /nexus/NexusWordMark.png (the "NEXUS" lettering). viewBoxes are tight to the visible content bbox
// so the height/size props govern the rendered dimensions directly.

const MARK_VIEWBOX = '0 0 706 741'; // traced from brand/NexusLogoMarkAlpha.png
const MARK_ASPECT = 706 / 741;

const WORDMARK_VIEWBOX = '0 0 1526 373'; // traced from /nexus/NexusWordMark.png
const WORDMARK_ASPECT = 1526 / 373;

const MARK_PATHS = (
  <g transform="translate(-155.500000,882.838615) scale(0.100000,-0.100000)" fill="currentColor" stroke="none">
    <path d="M2955 8815 c-701 -98 -1238 -603 -1377 -1295 l-23 -115 0 -2285 0
-2285 23 -115 c244 -1226 1727 -1728 2634 -892 115 106 301 354 493 655 l87
138 -33 42 c-30 39 -248 304 -363 443 -28 33 -103 124 -166 202 -63 78 -117
142 -120 142 -4 0 -69 -84 -146 -187 -78 -104 -210 -280 -294 -392 -190 -255
-249 -305 -407 -346 -244 -64 -520 113 -573 368 -7 36 -10 708 -8 2257 l3
2205 22 54 c102 248 352 363 591 271 110 -42 152 -85 415 -416 122 -155 322
-404 444 -555 121 -151 283 -350 358 -444 76 -93 208 -255 294 -360 87 -104
222 -271 301 -370 79 -99 169 -210 199 -246 31 -36 153 -184 271 -329 118
-144 241 -295 273 -334 33 -39 79 -97 104 -128 57 -72 47 -74 140 28 375 412
437 928 166 1398 -51 89 -77 123 -363 465 -107 129 -303 366 -435 526 -132
160 -285 345 -340 412 -55 66 -156 190 -225 274 -240 295 -554 653 -696 794
-322 319 -808 482 -1249 420z"/>
    <path d="M6850 8815 c-454 -64 -782 -260 -1065 -638 -147 -196 -362 -551 -347
-570 94 -119 408 -507 446 -552 29 -33 91 -108 140 -167 l87 -108 103 143
c209 291 454 614 502 661 246 244 644 129 752 -217 21 -66 32 -4305 12 -4412
-43 -220 -207 -366 -412 -365 -141 1 -224 58 -372 252 -310 410 -638 829 -858
1098 -16 19 -117 145 -226 280 -108 134 -242 299 -297 366 -55 66 -149 183
-210 260 -60 76 -155 193 -210 260 -55 66 -143 173 -195 238 -81 101 -320 392
-439 535 l-36 44 -109 -119 c-477 -520 -484 -1066 -23 -1612 139 -163 739
-912 1068 -1332 85 -107 185 -233 224 -280 38 -47 135 -168 215 -270 198 -254
316 -393 397 -471 755 -728 1978 -490 2451 477 68 139 100 236 139 421 21 99
33 4479 13 4658 -99 882 -907 1537 -1750 1420z"/>
  </g>
);



const WORDMARK_PATHS = (
  <g transform="translate(-141.000000,499.240329) scale(0.100000,-0.100000)" fill="currentColor" stroke="none">
    <path d="M15380 4980 c-755 -105 -1169 -589 -1056 -1239 73 -418 297 -605
1020 -847 501 -168 632 -266 668 -498 98 -633 -896 -806 -1372 -239 l-35 41
-215 -199 c-118 -110 -221 -206 -229 -214 -54 -53 340 -323 605 -415 1064
-367 2038 258 1884 1208 -70 429 -308 622 -1090 881 -457 152 -580 249 -605
477 -59 526 757 715 1211 282 l62 -59 203 222 c232 254 223 223 93 322 -281
213 -761 330 -1144 277z"/>
    <path d="M1410 3130 l0 -1770 315 0 315 0 0 1366 c0 751 3 1363 8 1360 4 -2
383 -617 842 -1365 l835 -1360 403 -1 402 0 0 1770 0 1770 -315 0 -315 0 -2
-1326 -3 -1327 -822 1324 -821 1324 -421 3 -421 2 0 -1770z"/>
    <path d="M5060 3130 l0 -1770 1220 0 1220 0 0 280 0 280 -905 0 -905 0 0 500
0 500 815 0 815 0 0 265 0 265 -815 0 -815 0 0 450 0 450 860 0 860 0 0 275 0
275 -1175 0 -1175 0 0 -1770z"/>
    <path d="M7820 4895 c0 -3 246 -374 546 -824 l547 -820 -599 -923 c-328 -508
-604 -933 -612 -946 l-14 -22 383 0 384 0 410 690 c226 379 412 689 415 689 3
0 193 -303 424 -674 230 -371 424 -682 430 -690 10 -13 62 -15 409 -13 l397 3
-630 930 c-354 522 -629 937 -627 946 2 8 240 380 529 825 288 445 528 815
532 822 6 10 -66 12 -359 10 l-367 -3 -354 -595 c-194 -327 -356 -594 -360
-593 -4 1 -168 268 -365 595 l-358 593 -380 3 c-210 1 -381 0 -381 -3z"/>
    <path d="M11070 3709 c0 -1294 0 -1293 56 -1487 171 -593 682 -946 1369 -946
631 0 1090 280 1315 802 111 257 110 238 110 1630 l0 1192 -315 0 -315 0 0
-1127 c0 -1337 0 -1337 -106 -1552 -254 -516 -1124 -516 -1378 0 -106 215
-106 217 -106 1552 l0 1127 -315 0 -315 0 0 -1191z"/>
  </g>
);

export function NexusMark({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={Math.round(size * MARK_ASPECT)}
      height={size}
      viewBox={MARK_VIEWBOX}
      preserveAspectRatio="xMidYMid meet"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Nexus"
      style={{ display: 'block' }}
    >
      {MARK_PATHS}
    </svg>
  );
}

export function NexusWordmark({ height = 40 }: { height?: number }) {
  const width = Math.round(height * WORDMARK_ASPECT);
  return (
    <svg
      width={width}
      height={height}
      viewBox={WORDMARK_VIEWBOX}
      preserveAspectRatio="xMinYMid meet"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Nexus"
      // No max-width: while the sidebar transitions from collapsed → expanded,
      // the wordmark span's flex width starts narrow. A max-width:100% here
      // would shrink the SVG to that width and ease it back to natural width,
      // producing a scaling animation. Keeping the SVG at its natural width
      // lets the parent's `overflow: hidden` clip during the transition so
      // the mark is correctly sized from frame 0.
      style={{ display: 'block' }}
    >
      {WORDMARK_PATHS}
    </svg>
  );
}
