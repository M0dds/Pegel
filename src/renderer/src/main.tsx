import { StrictMode } from 'react';
import { isThemeId } from '@shared/themes';
import { createRoot } from 'react-dom/client';
import { applyTheme } from './styles/theme';
import { App } from './App';
import './styles/global.css';

// Initial theme from the URL (set by the main process), live updates come via settings.
const initialTheme = new URLSearchParams(location.search).get('theme');
applyTheme(isThemeId(initialTheme) ? initialTheme : 'standard');
document.documentElement.dataset['platform'] = window.pegel.platform;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
