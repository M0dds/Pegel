import { StrictMode } from 'react';
import { isThemeId } from '@shared/themes';
import { createRoot } from 'react-dom/client';
import { applyTheme } from './styles/theme';
import { App } from './App';
import { MiniPlayer } from './routes/MiniPlayer';
import { SidePanels } from './routes/SidePanels';
import './styles/global.css';

// Initial theme and route from the URL (set by the main process); live updates come via settings.
const params = new URLSearchParams(location.search);
const initialTheme = params.get('theme');
const route = params.get('view');
applyTheme(isThemeId(initialTheme) ? initialTheme : 'standard');
document.documentElement.dataset['platform'] = window.pegel.platform;
if (route === 'mini' || route === 'panel') document.documentElement.dataset['window'] = route;

const root = route === 'mini' ? <MiniPlayer /> : route === 'panel' ? <SidePanels /> : <App />;
createRoot(document.getElementById('root')!).render(<StrictMode>{root}</StrictMode>);
