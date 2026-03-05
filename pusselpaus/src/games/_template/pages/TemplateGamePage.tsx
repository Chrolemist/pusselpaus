import { Link } from 'react-router-dom';
import { clearPlaceholderState, savePlaceholderState } from '../core/storage';

export default function TemplateGamePage() {
  return (
    <div className="flex min-h-full flex-col items-center gap-4 px-4 py-10">
      <Link to="/" className="self-start text-sm text-text-muted hover:text-brand-light">
        ← Lobby
      </Link>

      <h2 className="text-3xl font-bold">🎮 Template Game</h2>
      <p className="max-w-xs text-center text-sm text-text-muted">
        Replace this page with your game UI and hook logic.
      </p>

      <div className="flex gap-2">
        <button
          onClick={() => savePlaceholderState(new Date().toISOString())}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white"
        >
          Save sample
        </button>
        <button
          onClick={clearPlaceholderState}
          className="rounded-lg bg-surface-card px-4 py-2 text-sm font-semibold"
        >
          Clear sample
        </button>
      </div>

      <Link to="/template/stats" className="text-sm text-text-muted underline underline-offset-4 hover:text-brand-light">
        📊 Template stats
      </Link>
    </div>
  );
}
