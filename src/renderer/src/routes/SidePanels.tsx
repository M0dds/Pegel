import { useEffect, useState } from 'react';
import { themeEffect } from '@shared/effects';
import { watchLinkDrops } from '@shared/link-drop';
import { EMPTY_SOCIAL_STATE, type SocialState } from '@shared/social';
import type { PagePlaylist, PlayerState, Settings } from '@shared/types';
import { EqPanel } from '../components/eq/EqPanel';
import { SocialPanel } from '../components/social/SocialPanel';
import { ThemeEffectLayer } from '../components/ThemeEffectLayer';
import { applyTheme } from '../styles/theme';

type Panel = 'eq' | 'social';

/**
 * EQ and Social at the right edge of the main window, in their own view above
 * YT (route /panel), so the panel can slide over YT while YT reflows underneath.
 * The main process shows the view while a panel is open and until it has slid
 * out again.
 */
export function SidePanels() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [playing, setPlaying] = useState<PlayerState | null>(null);
  const [pagePlaylist, setPagePlaylist] = useState<PagePlaylist | null>(null);
  const [social, setSocial] = useState<SocialState>(EMPTY_SOCIAL_STATE);
  /** The panel shown; stays while the panels slide out. */
  const [shown, setShown] = useState<Panel>('eq');

  useEffect(() => {
    void window.pegel.getSettings().then(setSettings);
    const offSettings = window.pegel.onSettingsChanged(setSettings);
    void window.pegel.getPlayerState().then(setPlaying);
    const offPlayer = window.pegel.onPlayerState(setPlaying);
    void window.pegel.getPagePlaylist().then(setPagePlaylist);
    const offPage = window.pegel.onPagePlaylist(setPagePlaylist);
    void window.pegel.getSocialState().then(setSocial);
    const offSocial = window.pegel.onSocialState(setSocial);
    return () => {
      offSettings();
      offPlayer();
      offPage();
      offSocial();
    };
  }, []);

  useEffect(() => watchLinkDrops(window, (url) => window.pegel.dropLink(url)), []);

  const theme = settings?.theme;
  useEffect(() => {
    if (theme) applyTheme(theme);
  }, [theme]);

  const eqOpen = settings?.eq.panelOpen ?? false;
  const socialOpen = settings?.social.panelOpen ?? false;
  const open = eqOpen || socialOpen;
  const current: Panel | null = eqOpen ? 'eq' : socialOpen ? 'social' : null;
  // Adjusted while rendering (no extra frame): closing keeps the last panel.
  if (current && current !== shown) setShown(current);

  if (!settings || !theme) return null;
  const effect = settings.effects.theme && themeEffect(theme) ? theme : null;

  return (
    <>
      <div
        className={`side-panels${open ? ' open' : ''}`}
        aria-hidden={!open}
        onTransitionEnd={(e) => {
          if (e.target === e.currentTarget) window.pegel.eqPanelAnimationDone(open);
        }}
      >
        <EqPanel
          eq={settings.eq}
          open={shown === 'eq'}
          playing={playing}
          pagePlaylist={pagePlaylist}
        />
        <SocialPanel state={social} settings={settings.social} open={shown === 'social'} />
      </div>
      {/* Floating parts (petals, sparks …) over the panel, as over YT and the title bar. */}
      {effect && <ThemeEffectLayer theme={effect} only="front" />}
    </>
  );
}
