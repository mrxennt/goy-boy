import { useEffect, useState } from 'react';
import { AVATARS, resetProgress, updateProfile, updateSettings, useAppState } from '../lib/store';
import { sfx } from '../lib/sound';

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { settings, profile } = useAppState();
  const [name, setName] = useState(profile.name);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Einstellungen"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h2>Einstellungen</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Schließen">
            ✕
          </button>
        </div>

        <section className="settings-group">
          <h3>Sound</h3>
          <label className="switch-row">
            <span>
              <b>Soundeffekte</b>
              <small>Klicks, Treffer und Erfolge</small>
            </span>
            <input
              type="checkbox"
              className="switch"
              checked={settings.sfx}
              onChange={(event) => {
                updateSettings({ sfx: event.target.checked });
                if (event.target.checked) sfx.click();
              }}
            />
          </label>
          <label className="switch-row">
            <span>
              <b>Hintergrundmusik</b>
              <small>Ruhiger Ambient-Loop, standardmäßig aus</small>
            </span>
            <input
              type="checkbox"
              className="switch"
              checked={settings.music}
              onChange={(event) => {
                updateSettings({ music: event.target.checked });
                sfx.click();
              }}
            />
          </label>
          <label className="range-row">
            <span>
              <b>Lautstärke</b>
              <small>{Math.round(settings.volume * 100)}%</small>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(settings.volume * 100)}
              onChange={(event) => updateSettings({ volume: Number(event.target.value) / 100 })}
              onPointerUp={() => sfx.point()}
            />
          </label>
        </section>

        <section className="settings-group">
          <h3>Profil</h3>
          <label className="field">
            <span>Benutzername</span>
            <input
              type="text"
              value={name}
              maxLength={24}
              onChange={(event) => setName(event.target.value)}
              onBlur={() => name.trim() && updateProfile({ name: name.trim() })}
            />
          </label>
          <div className="avatar-picker">
            {AVATARS.map((avatar) => (
              <button
                key={avatar}
                type="button"
                className={`avatar-option ${profile.avatar === avatar ? 'is-active' : ''}`}
                onClick={() => {
                  updateProfile({ avatar });
                  sfx.pick();
                }}
                aria-label={`Avatar ${avatar} wählen`}
                aria-pressed={profile.avatar === avatar}
              >
                {avatar}
              </button>
            ))}
          </div>
        </section>

        <section className="settings-group">
          <h3>Daten</h3>
          <p className="muted small">
            Profil, Favoriten, Rekorde und Erfolge liegen ausschließlich in deinem Browser (LocalStorage). Es gibt
            keinen Server und keine Anmeldung.
          </p>
          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={() => {
              if (window.confirm('Wirklich alle Fortschritte zurücksetzen? Favoriten, Rekorde und Erfolge gehen verloren.')) {
                resetProgress();
                setName('Player One');
              }
            }}
          >
            Fortschritt zurücksetzen
          </button>
        </section>

        <div className="modal-foot">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Fertig
          </button>
        </div>
      </div>
    </div>
  );
}
