import { useCallback, useEffect, useRef, useState } from 'react';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { Placeholder } from '../Placeholder';
import { Slider } from '../../common/Slider/Slider';
import { Toggle } from '../../common/Toggle/Toggle';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { MediaCropper, type NormalizedCrop } from '../../common/MediaCropper/MediaCropper';
import { useTopicCallback } from '../../../hooks/useMultiplexSocket';
import { useTranslation } from '../../../lib/i18n';
import {
  getTryxStatus,
  getTryxPresets,
  getTryxMedia,
  postTryxBrightness,
  postTryxScreen,
  postTryxPreset,
  postTryxFan,
  postTryxMediaUpload,
  postTryxMediaDelete,
  type TryxState,
  type TryxPreset,
} from '../../../api/tryx';
import styles from './PanelDevicePage.module.scss';

type TryxTab = 'display' | 'media' | 'fan';

const ROW: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0' };
const ROW_LABEL: React.CSSProperties = { flex: '0 0 120px', fontSize: 'var(--type-small)', color: 'var(--text-dim)', fontWeight: 'var(--weight-strong)' };
const SLIDER_WRAP: React.CSSProperties = { flex: 1 };
const PRESET_ROW: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: '0.5rem', padding: '0.5rem 0' };
const MEDIA_ROW: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.4rem 0', fontSize: 'var(--type-small)' };
const EMPTY_MSG: React.CSSProperties = { fontSize: 'var(--type-small)', color: 'var(--text-dim)', padding: '0.5rem 0' };
const ERR_MSG: React.CSSProperties = { fontSize: 'var(--type-small)', color: 'var(--color-error, #e55)', padding: '0.25rem 0' };
const TAB_BAR: React.CSSProperties = { display: 'flex', gap: '0.5rem', padding: '0.5rem 0 0.75rem' };

interface CurvePoint { x: number; y: number; }

const DEFAULT_CURVE: CurvePoint[] = [
  { x: 0, y: 20 }, { x: 40, y: 40 }, { x: 70, y: 70 }, { x: 100, y: 100 },
];

function TryxFanCurve({
  points, onChange, onCommit,
}: {
  points: CurvePoint[];
  onChange: (pts: CurvePoint[]) => void;
  onCommit: (pts: CurvePoint[]) => void;
}) {
  const W = 300;
  const H = 160;
  const PAD = 24;
  const iW = W - PAD * 2;
  const iH = H - PAD * 2;
  const toSvg = (p: CurvePoint) => ({
    cx: PAD + (p.x / 100) * iW,
    cy: PAD + (1 - p.y / 100) * iH,
  });
  const toData = (cx: number, cy: number): CurvePoint => ({
    x: Math.round(Math.max(0, Math.min(100, ((cx - PAD) / iW) * 100))),
    y: Math.round(Math.max(0, Math.min(100, (1 - (cy - PAD) / iH) * 100))),
  });
  const draggingRef = useRef<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const sorted = [...points].sort((a, b) => a.x - b.x);
  const pathD = sorted.map((p, i) => {
    const { cx, cy } = toSvg(p);
    return `${i === 0 ? 'M' : 'L'}${cx},${cy}`;
  }).join(' ');

  const handlePointerDown = (e: React.PointerEvent, idx: number) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    draggingRef.current = idx;
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (draggingRef.current === null) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;
    const cx = (e.clientX - rect.left) * scaleX;
    const cy = (e.clientY - rect.top) * scaleY;
    const next = [...points];
    next[draggingRef.current] = toData(cx, cy);
    onChange(next);
  };
  const handlePointerUp = () => {
    if (draggingRef.current !== null) {
      onCommit(points);
      draggingRef.current = null;
    }
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: '160px', cursor: 'crosshair', display: 'block', background: 'var(--bg-card)', borderRadius: '6px', border: '1px solid var(--separator)' }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {[0, 25, 50, 75, 100].map(v => {
        const x = PAD + (v / 100) * iW;
        const y = PAD + (1 - v / 100) * iH;
        return (
          <g key={v}>
            <line x1={x} y1={PAD} x2={x} y2={H - PAD} stroke="var(--separator)" strokeWidth="1" opacity="0.5" />
            <line x1={PAD} y1={y} x2={W - PAD} y2={y} stroke="var(--separator)" strokeWidth="1" opacity="0.5" />
          </g>
        );
      })}
      <path d={pathD} fill="none" stroke="var(--accent)" strokeWidth="2" />
      {points.map((p, i) => {
        const { cx, cy } = toSvg(p);
        return (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={6}
            fill="var(--accent)"
            stroke="var(--bg)"
            strokeWidth="2"
            style={{ cursor: 'grab' }}
            onPointerDown={e => handlePointerDown(e, i)}
            role="slider"
            aria-label={`Point ${i + 1}`}
            aria-valuenow={p.y}
            aria-valuemin={0}
            aria-valuemax={100}
            tabIndex={0}
            onKeyDown={e => {
              const delta = e.shiftKey ? 5 : 1;
              if (e.key === 'ArrowUp') { e.preventDefault(); const next = [...points]; next[i] = { ...p, y: Math.min(100, p.y + delta) }; onChange(next); onCommit(next); }
              if (e.key === 'ArrowDown') { e.preventDefault(); const next = [...points]; next[i] = { ...p, y: Math.max(0, p.y - delta) }; onChange(next); onCommit(next); }
              if (e.key === 'ArrowRight') { e.preventDefault(); const next = [...points]; next[i] = { ...p, x: Math.min(100, p.x + delta) }; onChange(next); onCommit(next); }
              if (e.key === 'ArrowLeft') { e.preventDefault(); const next = [...points]; next[i] = { ...p, x: Math.max(0, p.x - delta) }; onChange(next); onCommit(next); }
            }}
          />
        );
      })}
    </svg>
  );
}

export function TryxDevicePage() {
  const { t } = useTranslation();
  const [connection, setConnection] = useState<'unknown' | 'connected' | 'disconnected'>('unknown');
  const [state, setState] = useState<TryxState | null>(null);
  const [tab, setTab] = useState<TryxTab>('display');

  const [brightness, setBrightness] = useState(100);
  const [screenOn, setScreenOn] = useState(true);
  const [presets, setPresets] = useState<TryxPreset[] | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [media, setMedia] = useState<string[] | null>(null);
  const lastUploadedUrlRef = useRef<string | null>(null);

  const [fanMode, setFanMode] = useState<'smart' | 'fixed'>('smart');
  const [curvePoints, setCurvePoints] = useState<CurvePoint[]>(DEFAULT_CURVE);
  const [fixedSpeed, setFixedSpeed] = useState(50);

  const aliveRef = useRef(true);

  const refresh = useCallback(async () => {
    const status = await getTryxStatus();
    if (!aliveRef.current) return;
    if (status === null) return;
    if (!status.connected || !status.state) {
      setConnection('disconnected');
      setState(null);
      return;
    }
    setConnection('connected');
    setState(status.state);
    setBrightness(status.state.brightness);
    setScreenOn(status.state.screenEnabled);
  }, []);

  const refreshMedia = useCallback(async () => {
    const res = await getTryxMedia();
    if (!aliveRef.current || res === null) return;
    setMedia(res.media);
  }, []);

  const refreshPresets = useCallback(async () => {
    const res = await getTryxPresets();
    if (!aliveRef.current || res === null) return;
    setPresets(res.presets);
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    void refresh();
    void refreshMedia();
    void refreshPresets();
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    return () => {
      aliveRef.current = false;
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh, refreshMedia, refreshPresets]);

  useTopicCallback('tryx/status', true, () => { void refresh(); });

  useEffect(() => () => {
    if (pendingUrl) URL.revokeObjectURL(pendingUrl);
  }, [pendingUrl]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (pendingUrl) URL.revokeObjectURL(pendingUrl);
    setPendingFile(file);
    setPendingUrl(URL.createObjectURL(file));
    setUploadError(null);
    e.target.value = '';
  };

  const handleCropConfirm = async (crop: NormalizedCrop) => {
    if (!pendingFile) return;
    setUploading(true);
    setUploadError(null);
    const cropStr = `${crop.x.toFixed(6)},${crop.y.toFixed(6)},${crop.w.toFixed(6)},${crop.h.toFixed(6)}`;
    try {
      const result = await postTryxMediaUpload(pendingFile, cropStr);
      if (!aliveRef.current) return;
      if (result === null || result.error) {
        setUploadError(t('devices.tryx.uploadFailed'));
      } else {
        lastUploadedUrlRef.current = pendingUrl;
        setPendingUrl(null);
        setPendingFile(null);
        void refreshMedia();
        void refresh();
      }
    } finally {
      if (aliveRef.current) setUploading(false);
    }
  };

  const handleCropCancel = () => {
    if (pendingUrl) URL.revokeObjectURL(pendingUrl);
    setPendingFile(null);
    setPendingUrl(null);
    setUploadError(null);
  };

  const handleDeleteMedia = async (name: string) => {
    await postTryxMediaDelete(name);
    if (!aliveRef.current) return;
    void refreshMedia();
  };

  const loaded = connection !== 'unknown';

  if (connection === 'disconnected') {
    return (
      <div className={styles.page}>
        {/* eslint-disable-next-line i18next/no-literal-string -- brand name */}
        <ViewHeader title="Tryx Panorama" />
        <div className={`${styles.pageBody} pageBody`}>
          <Placeholder title={t('devices.tryx.notConnected')} />
        </div>
      </div>
    );
  }

  const tabButton = (id: TryxTab, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setTab(id)}
      style={{
        padding: '0.3rem 0.75rem',
        borderRadius: '4px',
        border: 'none',
        background: tab === id ? 'var(--accent)' : 'var(--bg-card)',
        color: tab === id ? 'var(--on-accent, #fff)' : 'var(--text-dim)',
        fontSize: 'var(--type-small)',
        fontWeight: 'var(--weight-strong)',
        cursor: 'pointer',
      }}
      aria-pressed={tab === id}
    >
      {label}
    </button>
  );

  return (
    <div className={styles.page}>
      {/* eslint-disable-next-line i18next/no-literal-string -- brand name */}
      <ViewHeader title="Tryx Panorama" />
      <div className={`${styles.pageBody} pageBody`}>
        <div style={TAB_BAR}>
          {tabButton('display', t('devices.tryx.display'))}
          {tabButton('media', t('devices.tryx.media'))}
          {tabButton('fan', t('devices.tryx.fan'))}
        </div>
        <div className={styles.splitLayout}>
          <div className={styles.leftPane} style={{ overflowY: 'auto' }}>
            {tab === 'display' && (
              <>
                <SettingsSection title={t('devices.tryx.display')}>
                  <div style={ROW}>
                    <span style={ROW_LABEL}>{t('devices.y70.brightness')}</span>
                    <div style={SLIDER_WRAP}>
                      <Slider
                        value={brightness}
                        min={0}
                        max={100}
                        step={1}
                        // eslint-disable-next-line i18next/no-literal-string -- layout orientation enum
                        orientation="inline"
                        trackFill={brightness}
                        formatValue={(v: number) => `${v}%`}
                        ariaLabel={t('devices.y70.brightness')}
                        disabled={!loaded}
                        onChange={(v: number) => setBrightness(Math.round(v))}
                        onCommit={(v: number) => { void postTryxBrightness(Math.round(v)); }}
                      />
                    </div>
                  </div>
                  <div style={{ ...ROW, justifyContent: 'space-between' }}>
                    <span style={ROW_LABEL}>{t('devices.tryx.screenOnOff')}</span>
                    <Toggle
                      checked={screenOn}
                      disabled={!loaded}
                      ariaLabel={t('devices.tryx.screenOnOff')}
                      onChange={(next: boolean) => {
                        setScreenOn(next);
                        void postTryxScreen(next);
                      }}
                    />
                  </div>
                </SettingsSection>
                {presets !== null && presets.length > 0 && (
                  <SettingsSection title={t('devices.tryx.presets')}>
                    <div style={PRESET_ROW}>
                      {presets.map(preset => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => { void postTryxPreset(preset.id); }}
                          style={{
                            padding: '0.3rem 0.75rem',
                            borderRadius: '4px',
                            border: '1px solid var(--separator)',
                            background: state?.currentMedia === preset.id ? 'var(--accent)' : 'var(--bg-card)',
                            color: state?.currentMedia === preset.id ? 'var(--on-accent, #fff)' : 'var(--text)',
                            fontSize: 'var(--type-small)',
                            cursor: 'pointer',
                          }}
                        >
                          {preset.name}
                        </button>
                      ))}
                    </div>
                  </SettingsSection>
                )}
              </>
            )}

            {tab === 'media' && (
              <SettingsSection title={t('devices.tryx.media')}>
                <div style={{ padding: '0.5rem 0' }}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/*"
                    style={{ display: 'none' }}
                    onChange={handleFileChange}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      padding: '0.4rem 0.9rem',
                      borderRadius: '4px',
                      border: '1px solid var(--separator)',
                      background: 'var(--bg-card)',
                      color: 'var(--text)',
                      fontSize: 'var(--type-small)',
                      cursor: 'pointer',
                    }}
                  >
                    {t('devices.tryx.addVideo')}
                  </button>
                  {uploadError && <div style={ERR_MSG}>{uploadError}</div>}
                </div>
                {media === null || media.length === 0 ? (
                  <div style={EMPTY_MSG}>{t('devices.tryx.noMedia')}</div>
                ) : (
                  media.map(name => (
                    <div key={name} style={MEDIA_ROW}>
                      <span style={{ color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                      <button
                        type="button"
                        onClick={() => { void handleDeleteMedia(name); }}
                        style={{
                          marginLeft: '0.5rem',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '3px',
                          border: '1px solid var(--separator)',
                          background: 'transparent',
                          color: 'var(--text-dim)',
                          fontSize: 'var(--type-small)',
                          cursor: 'pointer',
                          flexShrink: 0,
                        }}
                        aria-label={t('devices.tryx.deleteMedia')}
                      >
                        {t('devices.tryx.confirmDelete')}
                      </button>
                    </div>
                  ))
                )}
              </SettingsSection>
            )}

            {tab === 'fan' && (
              <SettingsSection title={t('devices.tryx.fan')}>
                <div style={{ ...ROW, marginBottom: '0.5rem' }}>
                  {(['smart', 'fixed'] as const).map(mode => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setFanMode(mode)}
                      style={{
                        padding: '0.3rem 0.75rem',
                        borderRadius: '4px',
                        border: 'none',
                        background: fanMode === mode ? 'var(--accent)' : 'var(--bg-card)',
                        color: fanMode === mode ? 'var(--on-accent, #fff)' : 'var(--text-dim)',
                        fontSize: 'var(--type-small)',
                        fontWeight: 'var(--weight-strong)',
                        cursor: 'pointer',
                      }}
                      aria-pressed={fanMode === mode}
                    >
                      {mode === 'smart' ? t('devices.tryx.fanSmartCurve') : t('devices.tryx.fanFixedSpeed')}
                    </button>
                  ))}
                </div>
                {fanMode === 'smart' && (
                  <TryxFanCurve
                    points={curvePoints}
                    onChange={setCurvePoints}
                    onCommit={pts => {
                      void postTryxFan({ mode: 'smart', curve: pts.map(p => [p.x, p.y]) });
                    }}
                  />
                )}
                {fanMode === 'fixed' && (
                  <div style={ROW}>
                    <span style={ROW_LABEL}>{t('devices.tryx.fanFixedSpeed')}</span>
                    <div style={SLIDER_WRAP}>
                      <Slider
                        value={fixedSpeed}
                        min={0}
                        max={100}
                        step={1}
                        // eslint-disable-next-line i18next/no-literal-string -- layout orientation enum
                        orientation="inline"
                        trackFill={fixedSpeed}
                        formatValue={(v: number) => `${v}%`}
                        ariaLabel={t('devices.tryx.fanFixedSpeed')}
                        onChange={(v: number) => setFixedSpeed(Math.round(v))}
                        onCommit={(v: number) => { void postTryxFan({ mode: 'fixed', fixed: Math.round(v) }); }}
                      />
                    </div>
                  </div>
                )}
              </SettingsSection>
            )}
          </div>

          <div className={styles.previewPane}>
            <div style={{
              width: '100%',
              aspectRatio: '2/1',
              borderRadius: '12px',
              background: 'var(--bg-card)',
              border: '1px solid var(--separator)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1rem',
              gap: '0.5rem',
              position: 'relative',
              overflow: 'hidden',
            }}>
              {lastUploadedUrlRef.current && state?.currentMediaIsCustom ? (
                <video
                  src={lastUploadedUrlRef.current}
                  autoPlay
                  muted
                  loop
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', borderRadius: '12px' }}
                />
              ) : null}
              <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', pointerEvents: 'none' }}>
                <div style={{
                  fontSize: 'var(--type-small)',
                  fontWeight: 'var(--weight-strong)',
                  color: lastUploadedUrlRef.current && state?.currentMediaIsCustom ? 'rgba(255,255,255,0.85)' : 'var(--text)',
                  marginBottom: '0.25rem',
                }}>
                  {state?.currentMedia ?? t('devices.tryx.noMedia')}
                </div>
                <div style={{
                  width: '80px',
                  height: '6px',
                  borderRadius: '3px',
                  background: 'var(--separator)',
                  overflow: 'hidden',
                  margin: '0 auto 0.5rem',
                }}>
                  <div style={{ height: '100%', width: `${brightness}%`, background: 'var(--accent)', borderRadius: '3px' }} />
                </div>
                <div style={{
                  fontSize: '0.7rem',
                  color: 'var(--text-dim)',
                  padding: '0.15rem 0.4rem',
                  borderRadius: '3px',
                  background: screenOn ? 'rgba(0,180,100,0.15)' : 'rgba(255,60,60,0.15)',
                  display: 'inline-block',
                }}>
                  {screenOn ? 'ON' : 'OFF'}
                </div>
              </div>
            </div>
            {state && (
              <div style={{ fontSize: 'var(--type-small)', color: 'var(--text-dim)', marginTop: '0.5rem', textAlign: 'center' }}>
                {state.modelName} {state.portName}
              </div>
            )}
          </div>
        </div>
      </div>
      {pendingUrl && pendingFile && (
        <MediaCropper
          src={pendingUrl}
          aspect={2}
          busy={uploading}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
        />
      )}
    </div>
  );
}
