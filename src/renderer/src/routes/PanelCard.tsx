import { useEffect, useState, type CSSProperties } from 'react';
import { themeEffect } from '@shared/effects';
import { EQ_PANEL_WIDTH, PANEL_GAP } from '@shared/layout';
import { watchLinkDrops } from '@shared/link-drop';
import { EMPTY_SOCIAL_STATE, type SocialState } from '@shared/social';
import type { PagePlaylist, PlayerState, Settings } from '@shared/types';
import { EqPanel } from '../components/eq/EqPanel';
import { SocialPanel } from '../components/social/SocialPanel';
import { ThemeEffectLayer } from '../components/ThemeEffectLayer';
import { applyTheme } from '../styles/theme';

type Panel = 'eq' | 'social';

const CARD_VARS = {
  '--panel-width': `${EQ_PANEL_WIDTH}px`,
  '--panel-gap': `${PANEL_GAP}px`,
} as CSSProperties;

/**
 * The floating card of the EQ and Social panels, in its own see-through view
 * above YT (route /panel). The main process shows the view while a panel is
 * open and until the card has slid out again.
 */
export function PanelCard() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [playing, setPlaying] = useState<PlayerState | null>(null);
  const [pagePlaylist, setPagePlaylist] = useState<PagePlaylist | null>(null);
  const [social, setSocial] = useState<SocialState>(EMPTY_SOCIAL_STATE);
  /** The panel shown in the card; stays while the card slides out. */
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
    <div className="panel-host" style={CARD_VARS}>
      <div
        className={`panel-card${open ? ' open' : ''}`}
        aria-hidden={!open}
        onTransitionEnd={(e) => {
          if (e.target === e.currentTarget && e.propertyName === 'opacity') {
            window.pegel.eqPanelAnimationDone(open);
          }
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
      {/* Floating parts (petals, sparks …) over the card, like over YT and the title bar. */}
      {effect && <ThemeEffectLayer theme={effect} layers={{ front: 'small' }} />}
    </div>
  );
}
