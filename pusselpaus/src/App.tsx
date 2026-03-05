import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Lobby from './components/Lobby';
import SudokuPage from './pages/SudokuPage';
import SudokuStatsPage from './pages/SudokuStatsPage';
import StatsPage from './pages/StatsPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Lobby />} />
        <Route path="/sudoku" element={<SudokuPage />} />
        <Route path="/sudoku/stats" element={<SudokuStatsPage />} />
        <Route path="/stats" element={<StatsPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
