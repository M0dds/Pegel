import { useEffect, useState } from 'react';
import { watchLinkDrops } from '@shared/link-drop';
import type { PegelLink } from '@shared/links';
import type { UpdateStatus } from '@shared/update';
import type { AppInfo, PagePlaylist, PlayerState, Settings, View } from '@shared/types';
import { EMPTY_SOCIAL_STATE, type SocialState } from '@shared/social';
import { EqPanel } from './components/eq/EqPanel';
import { SocialPanel } from './components/social/SocialPanel';
import { Titlebar, type TitlebarHint } from './components/Titlebar';
import { ThemeEffectLayer } from './components/ThemeEffectLayer';
import { applyTheme } from './styles/theme';
import { LINK_KIND_LABEL } from '@shared/links';
import { themeEffect } from '@shared/effects';
import { OfflinePage } from './routes/OfflinePage';
import { SettingsPage } from './routes/SettingsPage';
import { WelcomePage } from './routes/WelcomePage';

/** Title bar pill while in a party: who waits, or how many listen. */
function partyPill(social: SocialState): { label: string; waiting: boolean } | null {
  const party = social.party;
  if (!party) return null;
  if (party.hold?.kind === 'ads') {
    return { label: `Warte auf ${party.hold.names[0] ?? '…'} …`, waiting: true };
  }
  if (party.hold?.kind === 'host-ad') return { label: 'Party · Werbung', waiting: true };
  if (party.connection !== 'online') return { label: 'Party · verbinde …', waiting: true };
  // Someone else paused, skipped or added a track: say so for a moment.
  if (party.activity) return { label: party.activity, waiting: false };
  return { label: `Party · ${party.members.length}`, waiting: false };
}

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
  const [social, setSocial] = useState<SocialState>(EMPTY_SOCIAL_STATE);

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
    void window.pegel.getSocialState().then(setSocial);
    const offSocial = window.pegel.onSocialState(setSocial);
    return () => {
      offSocial();
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
  const socialOpen = settings?.social.panelOpen ?? false;
  const effectTheme = theme && settings?.effects.theme && themeEffect(theme) ? theme : null;
  const backEffect = effectTheme !== null && themeEffect(effectTheme)?.layer === 'back';
  const hint = titlebarHint();

  /** One hint at a time: an invite and a copied link are the most immediate, an update can wait. */
  function titlebarHint(): TitlebarHint | null {
    const invite = social.invites[0];
    if (invite) {
      return {
        text: `${invite.name} lädt dich zur Party ein`,
        action: 'Beitreten',
        onAction: () => window.pegel.partyRespond(invite.inviteId, true),
        onClose: () => window.pegel.partyRespond(invite.inviteId, false),
      };
    }
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
    <div className={backEffect ? 'app back-effect' : 'app'} data-view={view}>
      <Titlebar
        view={view}
        eqOpen={panelOpen}
        socialOpen={socialOpen}
        invites={social.invites.length}
        party={partyPill(social)}
        theme={theme ?? 'standard'}
        animatedPetals={effectTheme === 'sakura'}
        hint={hint}
      />
      {effectTheme && <ThemeEffectLayer theme={effectTheme} />}
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
          {settings && <SocialPanel state={social} settings={settings.social} open={socialOpen} />}
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
