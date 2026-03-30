export default function FilterBar({ filters, onChange, onRefresh, refreshSettings, onRefreshModeChange, refreshModeSaving }) {
  const regionOptions = [
    { value: 'US', label: 'US' },
    { value: 'IL', label: 'Israel' },
    { value: 'FR', label: 'France' },
    { value: 'ES', label: 'Spain' },
    { value: 'GB', label: 'UK' },
    { value: 'GLOBAL', label: 'Global' },
  ];
  const windowUnitOptions = [
    { value: 'minutes', label: 'Minutes' },
    { value: 'hours', label: 'Hours' },
    { value: 'days', label: 'Days' },
    { value: 'weeks', label: 'Weeks' },
    { value: 'months', label: 'Months' },
  ];

  return (
    <section className="filter-bar">
      <div className="field">
        <label>Region</label>
        <select value={filters.region} onChange={(e) => onChange({ ...filters, region: e.target.value })}>
          {regionOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>Time window</label>
        <div className="field-row">
          <input
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            value={filters.windowAmount ?? 1}
            onChange={(e) => onChange({ ...filters, windowAmount: e.target.value })}
            aria-label="Time window amount"
          />
          <select
            value={filters.windowUnit || 'hours'}
            onChange={(e) => onChange({ ...filters, windowUnit: e.target.value })}
            aria-label="Time window unit"
          >
            {windowUnitOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field-hint">If the request exceeds stored history, the dashboard uses the largest comparable partial window available.</div>
      </div>

      <div className="field">
        <label>Refresh</label>
        <button onClick={onRefresh}>Refresh dashboard</button>
      </div>

      <div className="field">
        <label>Backend refresh</label>
        <div className="toggle-group">
          <button
            type="button"
            className={`toggle-button ${refreshSettings.mode === '10m' ? 'is-active' : ''}`}
            onClick={() => onRefreshModeChange('10m')}
            disabled={refreshModeSaving}
          >
            10 min
          </button>
          <button
            type="button"
            className={`toggle-button ${refreshSettings.mode === '1m' ? 'is-active' : ''}`}
            onClick={() => onRefreshModeChange('1m')}
            disabled={refreshModeSaving}
          >
            1 min
          </button>
        </div>
        {refreshModeSaving ? <div className="field-hint">Saving backend refresh mode…</div> : null}
      </div>
    </section>
  );
}
