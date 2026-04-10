import { Routes, Route, Navigate } from 'react-router-dom';
import About from './pages/About';

function App() {
  return (
    <Routes>
      <Route path="/about" element={<About />} />
      <Route path="*" element={<Navigate to="/about" replace />} />
    </Routes>
  );
}

export default App;
