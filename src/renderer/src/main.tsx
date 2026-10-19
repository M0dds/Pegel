import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { applyTheme } from './styles/theme';
import { App } from './App';
import './styles/global.css';

applyTheme('standard');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
