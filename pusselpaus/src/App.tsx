import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import { LobbyPage, StatsOverviewPage, LoginPage, SkinShopPage, FriendsLeaderboardPage, TopBar } from './app-shell';
import LevelUpOverlay from './app-shell/components/LevelUpOverlay';
import { useHeartbeat } from './hooks/useHeartbeat';
import { games } from './game-registry';

const DevMatchTestPage = lazy(() => import('./dev/DevMatchTestPage'));

function AppRoutes() {
  const { user, loading, isGuest } = useAuth();

  if (loading) {
    return <div className="p-6 text-center text-sm text-text-muted">Laddar…</div>;
  }

  if (!user && !isGuest) {
    return <LoginPage />;
  }

  const isLoggedIn = !!user;

  // Periodic heartbeat keeps last_seen fresh so AFK detection works
  useHeartbeat();

  return (
    <>
      {isLoggedIn && <TopBar />}
      {isLoggedIn && <LevelUpOverlay />}
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
