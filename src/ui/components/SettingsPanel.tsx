import { BOARD_THEMES, type BoardTheme, type ThemePreference } from '../../persistence/settings';
import { useSettings } from '../hooks/settings';
import { Segmented, Toggle } from './Segmented';

export function BoardThemePicker() {
  const { settings, update } = useSettings();
  return (
    <fieldset className="theme-picker">
      <legend className="segmented__legend">Board theme</legend>
      <div className="theme-picker__options">
        {BOARD_THEMES.map((t) => (
          <label key={t.id} className="theme-picker__option">
            <input
              type="radio"
              name="board-theme"
              checked={settings.boardTheme === t.id}
              onChange={() => update({ boardTheme: t.id as BoardTheme })}
            />
            <span className={`theme-swatch board-theme-${t.id}`} aria-hidden="true">
              <span className="square--light" />
              <span className="square--dark" />
              <span className="square--dark" />
              <span className="square--light" />
            </span>
            <span>{t.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function SettingsPanel() {
  const { settings, update, reducedMotion } = useSettings();
  return (
    <div className="settings-panel">
      <Segmented<ThemePreference>
        legend="Appearance"
        value={settings.theme}
        onChange={(theme) => update({ theme })}
        options={[
          { value: 'system', label: 'System' },
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ]}
      />
      <BoardThemePicker />
      <Toggle label="Sound effects" checked={settings.sound} onChange={(sound) => update({ sound })} />
      <Toggle label="Show legal moves" checked={settings.showLegalMoves} onChange={(showLegalMoves) => update({ showLegalMoves })} />
      <Toggle label="Show board coordinates" checked={settings.showCoordinates} onChange={(showCoordinates) => update({ showCoordinates })} />
      <Toggle
        label="Move animations"
        checked={settings.animations}
        onChange={(animations) => update({ animations })}
        description={reducedMotion ? 'Your system asks for reduced motion, so animations stay off.' : undefined}
      />
    </div>
  );
}
