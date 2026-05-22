import { useEffect, useState } from 'react';
import { fetchObsConfig, saveObsConfig } from '../../../api/obs';
import type { WidgetSettingsProps } from '../types';
import {
  SettingsActions,
  SettingsButton,
  SettingsInput,
  SettingsRow,
  SettingsSaved,
  SettingsSection,
} from '../common/SettingsRow/SettingsRow';

export function ObsSettings(props: WidgetSettingsProps) {
  void props;
  const [host, setHost] = useState('127.0.0.1');
  const [port, setPort] = useState('4455');
  const [password, setPassword] = useState('');
  const [hasPassword, setHasPassword] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchObsConfig().then(config => {
      if (!config) return;
      setHost(config.host || '127.0.0.1');
      setPort(String(config.port || 4455));
      setHasPassword(config.hasPassword);
    });
  }, []);

  const save = async (clearPassword = false) => {
    const parsedPort = Number.parseInt(port, 10);
    await saveObsConfig({
      host: host.trim() || '127.0.0.1',
      port: Number.isFinite(parsedPort) ? parsedPort : 4455,
      ...(password.length > 0 || clearPassword ? { password: clearPassword ? '' : password } : {}),
    });
    setHasPassword(!clearPassword && (password.length > 0 || hasPassword));
    setPassword('');
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1200);
  };

  return (
    <SettingsSection title="OBS WebSocket">
      <SettingsRow label="Host">
        <SettingsInput
          type="text"
          value={host}
          onChange={e => setHost(e.target.value)}
          onBlur={() => save()}
          placeholder="127.0.0.1"
        />
      </SettingsRow>
      <SettingsRow label="Port">
        <SettingsInput
          type="number"
          min={1}
          max={65535}
          value={port}
          onChange={e => setPort(e.target.value)}
          onBlur={() => save()}
          placeholder="4455"
        />
      </SettingsRow>
      <SettingsRow label="Password">
        <SettingsInput
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder={hasPassword ? 'configured' : 'optional'}
        />
      </SettingsRow>
      <SettingsActions>
        <SettingsButton onClick={() => save()}>
          Save
        </SettingsButton>
        {hasPassword && (
          <SettingsButton variant="muted" onClick={() => save(true)}>
            Clear password
          </SettingsButton>
        )}
        {saved && <SettingsSaved>Saved</SettingsSaved>}
      </SettingsActions>
    </SettingsSection>
  );
}
