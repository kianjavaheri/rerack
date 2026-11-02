// Starts the app (main.tsx loads this unless index.html is showing the landing page).
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';
import { reportCrashes } from './native/crashes';
import { trackKeyboard } from './utils/keyboard';

reportCrashes();
trackKeyboard();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
