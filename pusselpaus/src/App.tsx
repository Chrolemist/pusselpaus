import { Suspense, lazy, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import TopBar from './app-shell/components/TopBar';
import { useHeartbeat } from './hooks/useHeartbeat';
import { games } from './game-registry';

const CoinRewardOverlay = lazy(() => import('./app-shell/components/CoinRewardOverlay'));
const LevelUpOverlay = lazy(() => import('./app-shell/components/LevelUpOverlay'));
const LobbyPage = lazy(() => import('./app-shell/pages/LobbyPage'));
const StatsOverviewPage = lazy(() => import('./app-shell/pages/StatsOverviewPage'));
const LoginPage = lazy(() => import('./app-shell/pages/LoginPage'));
const SkinShopPage = lazy(() => import('./app-shell/pages/SkinShopPage'));
const FriendsLeaderboardPage = lazy(() => import('./app-shell/pages/FriendsLeaderboardPage'));
const DevMatchTestPage = lazy(() => import('./dev/DevMatchTestPage'));

function useDeferredShellEffects(active: boolean) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!active) {
      setReady(false);
      return;
    }

    let cancelled = false;
    const activate = () => {
      if (!cancelled) setReady(true);
    };
    const idleApi = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    if (typeof idleApi.requestIdleCallback === 'function') {
      const idleId = idleApi.requestIdleCallback(activate, { timeout: 1200 });
      return () => {
        cancelled = true;
        idleApi.cancelIdleCallback?.(idleId);
      };
    }

    const timeoutId = globalThis.setTimeout(activate, 250);
    return () => {
      cancelled = true;
      globalThis.clearTimeout(timeoutId);
    };
  }, [active]);

  return ready;
}

function AppRoutes() {
  const { user, loading, isGuest } = useAuth();

  if (loading) {
    return <div className="p-6 text-center text-sm text-text-muted">Laddar…</div>;
  }

  if (!user && !isGuest) {
    return <LoginPage />;
  }

  const isLoggedIn = !!user;
  const showDeferredShellEffects = useDeferredShellEffects(isLoggedIn);

  // Periodic heartbeat keeps last_seen fresh so AFK detection works
  useHeartbeat();

  return (
    <>
      {isLoggedIn && <TopBar />}
      {isLoggedIn && showDeferredShellEffects && <CoinRewardOverlay />}
      {isLoggedIn && showDeferredShellEffects && <LevelUpOverlay />}
      <Routes>
        <Route path="/" element={<LobbyPage />} />
        <Route path="/stats" element={<StatsOverviewPage />} />
        <Route path="/shop" element={isLoggedIn ? <SkinShopPage /> : <Navigate to="/" replace />} />
        <Route path="/friends-leaderboard" element={isLoggedIn ? <FriendsLeaderboardPage /> : <Navigate to="/" replace />} />
        {games.map((game) => (
          <Route key={game.id} path={game.path} element={<game.PlayPage />} />
        ))}
        {games
          .filter((game) => game.statsPath && game.StatsPage)
          .map((game) => {
            const StatsPageComponent = game.StatsPage!;
            return (
              <Route
                key={`${game.id}-stats`}
                path={game.statsPath}
                element={<StatsPageComponent />}
              />
            );
          })}
        {/* Dev tools (only accessible via direct URL) */}
        <Route path="/dev/match-test" element={<DevMatchTestPage />} />
      </Routes>
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<div className="p-6 text-center text-sm text-text-muted">Laddar…</div>}>
          <AppRoutes />
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
