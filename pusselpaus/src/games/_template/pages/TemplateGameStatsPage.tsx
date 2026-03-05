import { Link } from 'react-router-dom';
import { hasSavedGame } from '../core/storage';

export default function TemplateGameStatsPage() {
  const hasSave = hasSavedGame();

  return (
    <div className="flex min-h-full flex-col items-center gap-4 px-4 py-10">
      <div className="flex w-full max-w-sm justify-between">
        <Link to="/" className="text-sm text-text-muted hover:text-brand-light">
          ← Lobby
        </Link>
        <Link to="/template" className="text-sm text-text-muted hover:text-brand-light">
          🎮 Template Game
        </Link>
      </div>

      <h2 className="text-3xl font-bold">📊 Template stats</h2>
      <p className="text-sm text-text-muted">
        Saved state exists: {hasSave ? 'Yes' : 'No'}
      </p>
    </div>
  );
}
