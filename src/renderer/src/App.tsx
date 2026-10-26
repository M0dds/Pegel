import { useEffect, useState } from 'react';
import { watchLinkDrops } from '@shared/link-drop';
import type { PegelLink } from '@shared/links';
import { playlistDropText, type PlaylistDropReport } from '@shared/playlist-drop';
import type { UpdateStatus } from '@shared/update';
import type { AppInfo, Settings, View } from '@shared/types';
import { EMPTY_SOCIAL_STATE, type SocialState } from '@shared/social';
import { Titlebar, type TitlebarHint } from './components/Titlebar';
import { ThemeEffectLayer } from './components/ThemeEffectLayer';
import { applyTheme } from './styles/theme';
import { LINK_KIND_LABEL } from '@shared/links';
import { themeEffect } from '@shared/effects';
import { OfflinePage } from './routes/OfflinePage';
import { SettingsPage } from './routes/SettingsPage';
import { WelcomePage } from './routes/WelcomePage';

/** Title bar pill while in a party: who waits, or how many listen. */
/** How long the hint after dragging a track onto a playlist stays (ms); longer with "Trotzdem hinzufügen". */
const DROP_HINT_MS = 4000;
const DROP_HINT_ACTION_MS = 9000;

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
  /** "Was ist neu" dialog; `auto`: opened by itself after an update. */
  const [changelog, setChangelog] = useState<{ auto: boolean } | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [selectorIssues, setSelectorIssues] = useState<string[]>([]);
  const [sidebarOutdated, setSidebarOutdated] = useState(false);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [linkOffer, setLinkOffer] = useState<PegelLink | null>(null);
  const [update, setUpdate] = useState<UpdateStatus>({ state: 'idle' });
  /** Version whose update hint was closed; the settings still offer it. */
  const [dismissedUpdate, setDismissedUpdate] = useState<string | null>(null);
  const [social, setSocial] = useState<SocialState>(EMPTY_SOCIAL_STATE);
  /** Outcome of the last drag onto a playlist; `n` restarts the timer for a repeat. */
  const [drop, setDrop] = useState<{ report: PlaylistDropReport; n: number } | null>(null);

  useEffect(() => {
    void window.pegel.getView().then(setView);
    void window.pegel.getAppInfo().then(setAppInfo);
    void window.pegel.getSettings().then(setSettings);
    const offView = window.pegel.onViewChanged((next) => {
      setView(next);
      // Leaving the settings in another way closes the dialog with them.
      if (next !== 'settings') setChangelog(null);
    });
    // After an update: "Was ist neu" once, on the settings page (the YT view would
    // cover anything shown over the music). Closing it goes back to the music.
    void window.pegel.getPendingChangelog().then((version) => {
      if (!version) return;
      window.pegel.markChangelogSeen();
      setChangelog({ auto: true });
      window.pegel.showView('settings');
    });
    const offSettings = window.pegel.onSettingsChanged(setSettings);
    void window.pegel.getSelectorIssues().then(setSelectorIssues);
    const offIssues = window.pegel.onSelectorIssues(setSelectorIssues);
    const offSidebar = window.pegel.onSidebarOutdated(setSidebarOutdated);
    const offLink = window.pegel.onLinkOffer(setLinkOffer);
    const offDrop = window.pegel.onPlaylistDrop((report) =>
      setDrop((prev) => ({ report, n: (prev?.n ?? 0) + 1 })),
    );
    void window.pegel.getUpdateStatus().then(setUpdate);
    const offUpdate = window.pegel.onUpdateStatus(setUpdate);
    void window.pegel.getSocialState().then(setSocial);
    const offSocial = window.pegel.onSocialState(setSocial);
    return () => {
      offSocial();
      offLink();
      offDrop();
      offUpdate();
      offView();
      offSettings();
      offIssues();
      offSidebar();
    };
  }, []);

  useEffect(() => {
    if (!drop) return;
    const ms = drop.report.track ? DROP_HINT_ACTION_MS : DROP_HINT_MS;
    const timer = setTimeout(() => setDrop(null), ms);
    return () => clearTimeout(timer);
  }, [drop]);

  // Links dropped onto Pegel's own pages and the title bar (the YT view handles its own).
  useEffect(() => watchLinkDrops(window, (url) => window.pegel.dropLink(url)), []);

  // Esc leaves Pegel's pages. Dialogs, menus and dropdowns on them stop the key
  // first, so it closes only them.
  useEffect(() => {
    if (view !== 'settings' && view !== 'welcome') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.ctrlKey || e.metaKey) return;
      window.pegel.showView('music');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view]);

  const theme = settings?.theme;
  useEffect(() => {
    if (theme) applyTheme(theme);
  }, [theme]);

  const panelOpen = settings?.eq.panelOpen ?? false;
  const socialOpen = settings?.social.panelOpen ?? false;
  const effectTheme = theme && settings?.effects.theme && themeEffect(theme) ? theme : null;
  const backEffect = effectTheme !== null && themeEffect(effectTheme)?.layer === 'back';
  const hint = titlebarHint();

  /**
   * One hint at a time: an invite and a copied link are the most immediate, an
   * update can wait. A drop onto a playlist just happened, so it comes before
   * the link offer (it goes away by itself).
   */
  function titlebarHint(): TitlebarHint | null {
    const invite = social.invites[0];
    if (invite) {
      return {
        text: `${invite.name} lädt dich zur Party ein`,
        action: { label: 'Beitreten', run: () => window.pegel.partyRespond(invite.inviteId, true) },
        onClose: () => window.pegel.partyRespond(invite.inviteId, false),
      };
    }
    if (drop) {
      const { track } = drop.report;
      return {
        text: playlistDropText(drop.report),
        ...(track && {
          action: {
            label: 'Trotzdem hinzufügen',
            run: () => {
              window.pegel.addToPlaylistAnyway(track);
              setDrop(null);
            },
          },
        }),
        onClose: () => setDrop(null),
      };
    }
    if (linkOffer) {
      return {
        text: `Kopierter Link: ${LINK_KIND_LABEL[linkOffer.kind]}`,
        action: { label: 'Öffnen', run: () => window.pegel.openOfferedLink() },
        onClose: () => window.pegel.dismissLink(),
      };
    }
    if (sidebarOutdated) {
      return {
        text: 'Neue Playlist angelegt',
        action: { label: 'Jetzt aktualisieren', run: () => window.pegel.reloadYt() },
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
        action: {
          label: update.state === 'ready' ? 'Neu starten' : 'Herunterladen',
          run: () => window.pegel.installUpdate(),
        },
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
      {/* On the music view, the main process lays the YT view and the side panels over .content. */}
      <div className="content">
        {view === 'settings' && settings && (
          <SettingsPage
            settings={settings}
            appInfo={appInfo}
            selectorIssues={selectorIssues}
            update={update}
            changelogOpen={!!changelog}
            onChangelog={(open) => {
              if (open) return setChangelog({ auto: false });
              if (changelog?.auto) window.pegel.showView('music');
              setChangelog(null);
            }}
          />
        )}
        {view === 'offline' && <OfflinePage />}
        {view === 'welcome' && <WelcomePage />}
      </div>
    </div>
  );
}
