import { StrictMode } from 'react';
import { isThemeId } from '@shared/themes';
import { createRoot } from 'react-dom/client';
import { applyTheme } from './styles/theme';
import { App } from './App';
import { MiniPlayer } from './routes/MiniPlayer';
import './styles/global.css';

// Initial theme and route from the URL (set by the main process); live updates come via settings.
const params = new URLSearchParams(location.search);
const initialTheme = params.get('theme');
const isMini = params.get('view') === 'mini';
applyTheme(isThemeId(initialTheme) ? initialTheme : 'standard');
document.documentElement.dataset['platform'] = window.pegel.platform;
if (isMini) document.documentElement.dataset['window'] = 'mini';

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isMini ? <MiniPlayer /> : <App />}</StrictMode>,
);
