import { useApp } from '../store.js';

const THEMES = [
  { value: 'light', label: '浅色', icon: '☀️' },
  { value: 'dark', label: '深色', icon: '🌙' },
  { value: 'system', label: '系统', icon: '💻' },
];

export function ThemeToggleButton() {
  const { theme, setTheme } = useApp();

  function cycleTheme() {
    const idx = THEMES.findIndex(t => t.value === theme);
    const next = THEMES[(idx + 1) % THEMES.length];
    setTheme(next.value);
  }

  const current = THEMES.find(t => t.value === theme) || THEMES[2];

  return (
    <button
      className="icon-btn"
      onClick={cycleTheme}
      title={`切换主题 (当前: ${current.label})`}
      aria-label="切换主题"
    >
      {current.icon}
    </button>
  );
}

export function ThemeOptions() {
  const { theme, setTheme } = useApp();

  return (
    <div className="theme-options">
      {THEMES.map(t => (
        <button
          key={t.value}
          className={`theme-option ${theme === t.value ? 'selected' : ''}`}
          onClick={() => setTheme(t.value)}
        >
          <span className="theme-option-icon">{t.icon}</span>
          <span className="theme-option-label">{t.label}</span>
        </button>
      ))}
    </div>
  );
}
