import { Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { LobbyPage, StatsOverviewPage } from './app-shell';
import { games } from './game-registry';

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div className="p-6 text-center text-sm text-text-muted">Laddar…</div>}>
        <Routes>
          <Route path="/" element={<LobbyPage />} />
          <Route path="/stats" element={<StatsOverviewPage />} />
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
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
