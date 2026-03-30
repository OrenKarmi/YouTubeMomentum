import { useEffect, useRef, useState } from 'react';
import FilterBar from './components/FilterBar';
import KpiStrip from './components/KpiStrip';
import WidgetCard from './components/WidgetCard';
import WidgetGrid from './components/WidgetGrid';
import SongsLeaderboardWidget from './widgets/SongsLeaderboardWidget';
import TrackViewsDeltaWidget from './widgets/TrackViewsDeltaWidget';
import TrackTrendWidget from './widgets/TrackTrendWidget';
import TrendingArtistsWidget from './widgets/TrendingArtistsWidget';
import ViralAlertsWidget from './widgets/ViralAlertsWidget';
import { fetchDashboard, fetchRefreshSettings, updateRefreshSettings } from './services/dashboardApi';

const initialFilters = { region: 'US', windowAmount: 1, windowUnit: 'hours', search: '' };
const defaultRefreshSettings = {
  mode: '10m',
  intervalMinutes: 10,
  intervalSeconds: 600,
  cacheTtlMinutes: 10,
  cacheTtlSeconds: 600,
  options: [],
};

export default function App() {
  const [filters, setFilters] = useState(initialFilters);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshSettings, setRefreshSettings] = useState(defaultRefreshSettings);
  const [refreshModeSaving, setRefreshModeSaving] = useState(false);
  const forceRefreshRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    fetchRefreshSettings()
      .then((settings) => {
        if (!cancelled) {
          setRefreshSettings(settings);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || 'Failed to load refresh settings');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleRefreshModeChange(mode) {
    if (refreshModeSaving || mode === refreshSettings.mode) {
      return;
    }

    try {
      setRefreshModeSaving(true);
      setError('');
      const settings = await updateRefreshSettings(mode);
      setRefreshSettings(settings);
      setRefreshKey((value) => value + 1);
    } catch (err) {
      setError(err.message || 'Failed to update refresh mode');
    } finally {
      setRefreshModeSaving(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      try {
        setLoading(true);
        setError('');
        const payload = await fetchDashboard(filters, { force: forceRefreshRef.current });
        if (!cancelled) setData(payload);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load dashboard');
      } finally {
        forceRefreshRef.current = false;
        if (!cancelled) setLoading(false);
      }
    }

    loadDashboard();
    return () => {
      cancelled = true;
    };
  }, [filters, refreshKey]);

  const momentumAvailable = data?.cache?.momentumAvailable !== false;

  return (
    <main className="app-shell">
      <section className="hero">
        <h1>Live music momentum dashboard</h1>
        <p className="subtitle">Monitor breakout tracks, leaderboard shifts, and newly detected songs across YouTube regions in one command-center view.</p>
      </section>

      <FilterBar
        filters={filters}
        onChange={setFilters}
        refreshSettings={refreshSettings}
        onRefreshModeChange={handleRefreshModeChange}
        refreshModeSaving={refreshModeSaving}
        onRefresh={() => {
          forceRefreshRef.current = true;
          setRefreshKey((value) => value + 1);
        }}
      />

      {error ? <div className="error-banner">{error}</div> : null}

      <KpiStrip
        kpis={data?.kpis}
        updatedAt={data?.updatedAt}
        loading={loading}
        source={data?.source}
        cache={data?.cache}
        refreshSettings={refreshSettings}
        filters={data?.filters || filters}
      />

      <WidgetGrid>
        <WidgetCard title="Track Views Leaderboard" subtitle="Top 10 tracks by views in the selected region" loading={loading} className="widget-card--span-8 widget-card--tall">
          <SongsLeaderboardWidget items={data?.widgets?.songs || []} momentumAvailable={momentumAvailable} />
        </WidgetCard>

        <WidgetCard title="Viral Alerts" subtitle="High-signal shifts worth watching right now" loading={loading} className="widget-card--span-4 widget-card--side-stack">
          <ViralAlertsWidget items={data?.widgets?.viralAlerts || []} momentumAvailable={momentumAvailable} />
        </WidgetCard>

        <WidgetCard title="Trending Artists (Total Tracks)" subtitle="Artists accumulating the most momentum across tracks" loading={loading} className="widget-card--span-4 widget-card--side-stack">
          <TrendingArtistsWidget items={data?.widgets?.artists || []} momentumAvailable={momentumAvailable} />
        </WidgetCard>

        <WidgetCard title="Views Gained Between Samples" subtitle="For each fetch, shows how many new views were added since the previous sample" loading={loading} className="widget-card--wide">
          <TrackViewsDeltaWidget items={data?.widgets?.songs || []} sharedTimeAxis={data?.charts?.sharedTimeAxis || null} />
        </WidgetCard>

        <WidgetCard title="Rising Tracks Leaderboard" subtitle="Top 10 momentum tracks over the active time window" loading={loading} className="widget-card--wide">
          <TrackTrendWidget items={data?.widgets?.trendTracks || []} momentumAvailable={momentumAvailable} sharedTimeAxis={data?.charts?.sharedTimeAxis || null} />
        </WidgetCard>
      </WidgetGrid>
    </main>
  );
}
