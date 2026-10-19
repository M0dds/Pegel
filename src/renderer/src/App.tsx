import { useEffect, useState } from 'react';
import { watchLinkDrops } from '@shared/link-drop';
import type { PegelLink } from '@shared/links';
import type { UpdateStatus } from '@shared/update';
import type { AppInfo, PagePlaylist, PlayerState, Settings, View } from '@shared/types';
import { EqPanel } from './components/eq/EqPanel';
import { Titlebar, type TitlebarHint } from './components/Titlebar';
import { PetalLayer } from './components/PetalLayer';
import { applyTheme } from './styles/theme';
import { LINK_KIND_LABEL } from '@shared/links';
import { THEMES } from '@shared/themes';
import { OfflinePage } from './routes/OfflinePage';
import { SettingsPage } from './routes/SettingsPage';
import { WelcomePage } from './routes/WelcomePage';

export function App() {
  const [view, setView] = useState<View>('music');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [selectorIssues, setSelectorIssues] = useState<string[]>([]);
  const [playing, setPlaying] = useState<PlayerState | null>(null);
  const [pagePlaylist, setPagePlaylist] = useState<PagePlaylist | null>(null);
  const [sidebarOutdated, setSidebarOutdated] = useState(false);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [linkOffer, setLinkOffer] = useState<PegelLink | null>(null);
  const [update, setUpdate] = useState<UpdateStatus>({ state: 'idle' });
  /** Version whose update hint was closed; the settings still offer it. */
  const [dismissedUpdate, setDismissedUpdate] = useState<string | null>(null);

  useEffect(() => {
    void window.pegel.getView().then(setView);
    void window.pegel.getAppInfo().then(setAppInfo);
    void window.pegel.getSettings().then(setSettings);
    const offView = window.pegel.onViewChanged(setView);
    const offSettings = window.pegel.onSettingsChanged(setSettings);
    void window.pegel.getSelectorIssues().then(setSelectorIssues);
    const offIssues = window.pegel.onSelectorIssues(setSelectorIssues);
    void window.pegel.getPlayerState().then(setPlaying);
    const offPlayer = window.pegel.onPlayerState(setPlaying);
    void window.pegel.getPagePlaylist().then(setPagePlaylist);
    const offPage = window.pegel.onPagePlaylist(setPagePlaylist);
    const offSidebar = window.pegel.onSidebarOutdated(setSidebarOutdated);
    const offLink = window.pegel.onLinkOffer(setLinkOffer);
    void window.pegel.getUpdateStatus().then(setUpdate);
    const offUpdate = window.pegel.onUpdateStatus(setUpdate);
    return () => {
      offLink();
      offUpdate();
      offView();
      offSettings();
      offIssues();
      offPlayer();
      offPage();
      offSidebar();
    };
  }, []);

  // Links dropped onto Pegel's own pages and the title bar (the YT view handles its own).
  useEffect(() => watchLinkDrops(window, (url) => window.pegel.dropLink(url)), []);

  const theme = settings?.theme;
  useEffect(() => {
    if (theme) applyTheme(theme);
  }, [theme]);

  const panelOpen = settings?.eq.panelOpen ?? false;
  const animatedPetals = theme === 'sakura' && (settings?.effects.petals ?? false);
  const hint = titlebarHint();

  /** One hint at a time: a copied link is the most immediate, an update can wait. */
  function titlebarHint(): TitlebarHint | null {
    if (linkOffer) {
      return {
        text: `Kopierter Link: ${LINK_KIND_LABEL[linkOffer.kind]}`,
        action: 'Öffnen',
        onAction: () => window.pegel.openOfferedLink(),
        onClose: () => window.pegel.dismissLink(),
      };
    }
    if (sidebarOutdated) {
      return {
        text: 'Neue Playlist angelegt',
        action: 'Jetzt aktualisieren',
        onAction: () => window.pegel.reloadYt(),
        onClose: () => setSidebarOutdated(false),
      };
    }
    if (
      (update.state === 'ready' || update.state === 'available') &&
      update.version !== dismissedUpdate
    ) {
      const { version } = update;
      return {
        text: update.state === 'ready' ? `Update auf ${version} bereit` : `Pegel ${version} ist da`,
        action: update.state === 'ready' ? 'Neu starten' : 'Herunterladen',
        onAction: () => window.pegel.installUpdate(),
        onClose: () => setDismissedUpdate(version),
      };
    }
    return null;
  }

  return (
    <div className="app">
      <Titlebar
        view={view}
        eqOpen={panelOpen}
        theme={theme ?? 'standard'}
        animatedPetals={animatedPetals}
        hint={hint}
      />
      {animatedPetals && <PetalLayer color={THEMES.sakura.tokens.accent} />}
      <div className="content">
        <div className="music">
          {/* The main process lays the YT view over this slot. */}
          <div className="yt-slot" />
          {settings && (
            <EqPanel
              eq={settings.eq}
              open={panelOpen}
              playing={playing}
              pagePlaylist={pagePlaylist}
            />
          )}
        </div>
        {view === 'settings' && settings && (
          <SettingsPage
            settings={settings}
            appInfo={appInfo}
            selectorIssues={selectorIssues}
            update={update}
          />
        )}
        {view === 'offline' && <OfflinePage />}
        {view === 'welcome' && <WelcomePage />}
      </div>
    </div>
  );
}
