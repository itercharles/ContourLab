import { Routes, Route, Navigate } from 'react-router-dom';
import About from './pages/About';
import MainWorkspace from './pages/MainWorkspace';
import Settings from './pages/Settings';

function App() {
  return (
    <Routes>
      <Route path="/workspace" element={<MainWorkspace />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/about" element={<About />} />
      <Route path="*" element={<Navigate to="/workspace" replace />} />
    </Routes>
  );
}

export default App;
