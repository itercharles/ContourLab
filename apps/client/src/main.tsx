import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

// Expose stores for Playwright e2e tests (dev server only, never in production builds).
if (import.meta.env.DEV) {
  Promise.all([
    import('./core/store/structureStore'),
    import('./core/store/volumeStore'),
    import('./core/store/uiStore'),
  ]).then(([{ useStructureStore }, { useVolumeStore }, { useUIStore }]) => {
    (window as unknown as Record<string, unknown>)['__contourlab_stores'] = {
      structureStore: useStructureStore,
      volumeStore: useVolumeStore,
      uiStore: useUIStore,
    };
  });
}

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);
