import { BrowserWindow, Notification, powerMonitor } from 'electron';
import type { SocialSettingsPatch } from '@shared/ipc';
import { AUDIO_OFFSET_MAX_MS } from '@shared/settings';
import { EMPTY_SOCIAL_STATE, type PartyReport, type SocialState } from '@shared/social';
import {
  cleanName,
  isUserId,
  isVideoId,
  type NowPlaying,
  type PartyOptions,
  type SuggestedTrack,
  type UserId,
} from '@shared/social-protocol';
import type { PlayerCommand } from '@shared/types';
import { getPlayerState, onPlayerState } from '../player';
import { getSettings, onSettingsChanged, updateSettings } from '../settings';
import {
  focusMainWindow,
  onYtReady,
  sendPlayerCommand,
  sendToUi,
  sendToYt,
  toggleSocialPanel,
} from '../windows/main-window';
import { SOCIAL_SERVER_URL } from './config';
import { FriendsService } from './friends';
import { createIdentity, deleteIdentity, loadIdentity, type Identity } from './identity';
import { PartyService } from './party';

const NOTICE_MS = 6000;
const CHANGE_DEBOUNCE_MS = 40;

let identity: Identity | null = null;
let notice: SocialState['notice'] = null;
let noticeTimer: NodeJS.Timeout | null = null;
let changeTimer: NodeJS.Timeout | null = null;
const partyListeners = new Set<() => void>();

const displayName = () => getSettings().social.displayName || 'Pegel';

function setNotice(text: string, kind: 'info' | 'error'): void {
  notice = { text, kind };
  if (noticeTimer) clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    notice = null;
    emitChange();
  }, NOTICE_MS);
  emitChange();
}

/** Coalesces bursts (member updates, presence) into one UI update. */
function emitChange(): void {
  if (changeTimer) return;
  changeTimer = setTimeout(() => {
    changeTimer = null;
    sendToUi('social:state', getSocialState());
    updatePresence();
    for (const listener of partyListeners) listener();
  }, CHANGE_DEBOUNCE_MS);
}

const friends = new FriendsService(SOCIAL_SERVER_URL, {
  onChange: emitChange,
  notice: setNotice,
  onInvite: (invite) => {
    if (anyWindowFocused() || !Notification.isSupported()) return;
    const n = new Notification({
      title: 'Einladung zur Hör-Party',
      body: `${invite.name} lädt dich zur Party ein.`,
    });
    n.on('click', () => {
      focusMainWindow();
      toggleSocialPanel(true);
    });
    n.show();
  },
  onJoinTicket: (ticket) => {
    if (!identity) return;
    party.leave();
    party.join(identity, displayName, ticket);
  },
  onJoinRequest: (from, name, partyId) => {
    // Open party: friends get a ticket right away.
    if (!party.isHost || party.id !== partyId || !getSettings().social.partyOpen) return;
    const ticket = party.makeTicket(from);
    if (ticket) {
      friends.invite(from, ticket, true);
      setNotice(`${name} kommt dazu.`, 'info');
    }
  },
});

const party = new PartyService(SOCIAL_SERVER_URL, {
  onChange: emitChange,
  notice: setNotice,
  setYt: (control) => sendToYt('yt:party', control),
  command: sendPlayerCommand,
  skip: () => sendToYt('yt:party-skip'),
  audioOffsetMs: () => getSettings().social.audioOffsetMs,
  nameOf: (id) => friends.nameOf(id),
});

let lastPresenceKey = '';

/** "Hört gerade" (only while playing, never during an ad) and the own party. */
function updatePresence(): void {
  if (!identity || !getSettings().social.enabled) return;
  const state = getPlayerState();
  const nowPlaying: NowPlaying | null =
    state?.isPlaying && !state.adPlaying && state.title
      ? {
          title: state.title.slice(0, 300),
          artist: state.artist.slice(0, 300),
          ...(state.videoId && isVideoId(state.videoId) && { videoId: state.videoId }),
        }
      : null;
  const partyPresence =
    party.isHost && party.id ? { partyId: party.id, open: getSettings().social.partyOpen } : null;
  const key = JSON.stringify([nowPlaying?.title, nowPlaying?.artist, partyPresence]);
  if (key === lastPresenceKey) return;
  lastPresenceKey = key;
  friends.updatePresence(nowPlaying, partyPresence);
}

export function getSocialState(): SocialState {
  const settings = getSettings().social;
  if (!settings.enabled || !identity) return { ...EMPTY_SOCIAL_STATE, notice };
  return {
    enabled: true,
    connection: friends.connection,
    me: { id: identity.id, name: settings.displayName },
    code: friends.codeView(),
    friends: friends.views(),
    invites: friends.inviteViews(),
    party: party.view(),
    notice,
  };
}

/** Tray entry and mini player badge follow the party. */
export function onPartyChanged(listener: () => void): () => void {
  partyListeners.add(listener);
  return () => partyListeners.delete(listener);
}

export function partyTrayItem(): { label: string; click(): void } | null {
  if (!party.active) return null;
  return party.isHost
    ? { label: 'Party beenden', click: () => party.end() }
    : { label: 'Party verlassen', click: () => party.leave() };
}

export function startSocial(): void {
  const settings = getSettings().social;
  if (settings.enabled) {
    identity = loadIdentity();
    if (identity) friends.start(identity, displayName, settings.shareNowPlaying);
  }

  onPlayerState(() => updatePresence());
  onYtReady(() => sendToYt('yt:party', party.control()));

  let previous = getSettings().social;
  onSettingsChanged((s) => {
    const next = s.social;
    if (identity && next.enabled) {
      if (next.shareNowPlaying !== previous.shareNowPlaying) friends.setShare(next.shareNowPlaying);
      if (next.displayName !== previous.displayName) friends.restart(identity, displayName);
      if (next.audioOffsetMs !== previous.audioOffsetMs) party.refreshControl();
      if (
        party.isHost &&
        (next.partyOpen !== previous.partyOpen ||
          next.allowSuggestions !== previous.allowSuggestions ||
          next.everyoneControls !== previous.everyoneControls)
      ) {
        party.setOptions(partyOptions());
        lastPresenceKey = '';
        updatePresence();
      }
    }
    previous = next;
    emitChange();
  });

  // After sleep the sockets are dead; do not wait for the backoff.
  powerMonitor.on('resume', () => friends.reconnectNow());
}

/** Leaves the party cleanly when Pegel quits. */
export function stopSocial(): void {
  party.leave();
  friends.stop();
}

// ---------- Actions from the UI (payloads validated here) ----------

export function enableSocial(rawName: unknown): void {
  const name = cleanName(rawName);
  if (!name) return setNotice('Bitte gib einen Namen ein.', 'error');
  identity = loadIdentity() ?? createIdentity();
  updateSettings((s) => {
    s.social.displayName = name;
    s.social.enabled = true;
  });
  friends.start(identity, displayName, getSettings().social.shareNowPlaying);
  emitChange();
}

export function disableSocial(): void {
  party.leave();
  friends.stop();
  updateSettings((s) => {
    s.social.enabled = false;
  });
  emitChange();
}

export function resetSocial(): void {
  party.leave();
  friends.deleteAll();
  deleteIdentity();
  identity = null;
  updateSettings((s) => {
    s.social.enabled = false;
    s.social.displayName = '';
  });
  emitChange();
}

export function patchSocial(raw: unknown): void {
  if (typeof raw !== 'object' || raw === null) return;
  const p = raw as SocialSettingsPatch;
  updateSettings((s) => {
    if (p.displayName !== undefined) {
      const name = cleanName(p.displayName);
      if (name) s.social.displayName = name;
    }
    if (typeof p.shareNowPlaying === 'boolean') s.social.shareNowPlaying = p.shareNowPlaying;
    if (typeof p.partyOpen === 'boolean') s.social.partyOpen = p.partyOpen;
    if (typeof p.allowSuggestions === 'boolean') s.social.allowSuggestions = p.allowSuggestions;
    if (typeof p.everyoneControls === 'boolean') s.social.everyoneControls = p.everyoneControls;
    if (typeof p.audioOffsetMs === 'number' && Number.isFinite(p.audioOffsetMs)) {
      s.social.audioOffsetMs = Math.max(
        -AUDIO_OFFSET_MAX_MS,
        Math.min(AUDIO_OFFSET_MAX_MS, Math.round(p.audioOffsetMs)),
      );
    }
  });
}

export function createFriendCode(): void {
  friends.createCode();
}

export function redeemFriendCode(code: unknown): void {
  if (typeof code === 'string') friends.redeemCode(code);
}

export function removeFriend(id: unknown): void {
  if (isUserId(id)) friends.removeFriend(id);
}

export function startParty(): void {
  if (!identity || party.active) return;
  party.startHost(identity, displayName, partyOptions());
  emitChange();
}

export function inviteToParty(friendId: unknown): void {
  if (!isUserId(friendId) || !identity) return;
  if (!party.active) startParty();
  // The ticket needs the party; right after starting it exists locally already.
  const ticket = party.makeTicket(friendId);
  if (!ticket) return setNotice('Nur der Host kann einladen.', 'error');
  friends.invite(friendId, ticket);
  setNotice(`Einladung an ${friends.nameOf(friendId) ?? 'deinen Freund'} gesendet.`, 'info');
}

export function respondToInvite(raw: unknown): void {
  if (typeof raw !== 'object' || raw === null || !identity) return;
  const { inviteId, accept } = raw as { inviteId?: unknown; accept?: unknown };
  if (typeof inviteId !== 'string') return;
  const invite = friends.takeInvite(inviteId);
  if (!invite) return;
  if (accept !== true) return friends.decline(invite);
  party.leave();
  party.join(identity, displayName, invite.ticket);
  toggleSocialPanel(true);
}

export function joinFriendParty(friendId: unknown): void {
  if (!isUserId(friendId) || !identity) return;
  if (friends.requestJoin(friendId as UserId)) setNotice('Anfrage gesendet …', 'info');
}

export function leaveParty(): void {
  party.leave();
}

export function endParty(): void {
  party.end();
}

export function kickFromParty(userId: unknown): void {
  if (isUserId(userId)) party.kick(userId);
}

export function transferParty(userId: unknown): void {
  if (isUserId(userId)) party.transfer(userId);
}

export function answerSuggestion(raw: unknown): void {
  if (typeof raw !== 'object' || raw === null) return;
  const { id, accept } = raw as { id?: unknown; accept?: unknown };
  if (typeof id === 'string' && typeof accept === 'boolean') party.answerSuggestion(id, accept);
}

export function resumeParty(): void {
  sendToYt('yt:party-resume');
}

export function handlePartyReport(report: PartyReport): void {
  party.onYtReport(report);
}

/** Party rules from the settings (the host's switches in the Social panel). */
function partyOptions(): PartyOptions {
  const { partyOpen, allowSuggestions, everyoneControls } = getSettings().social;
  return { open: partyOpen, allowSuggestions, everyoneControls };
}

/** The "+" next to a track in YT. */
export function addPartyTrack(track: SuggestedTrack): void {
  party.addTrack(track);
}

export function removeQueued(id: unknown): void {
  if (typeof id === 'string' && id.length <= 40) party.removeQueued(id);
}

export function moveQueuedToTop(id: unknown): void {
  if (typeof id === 'string' && id.length <= 40) party.moveQueuedToTop(id);
}

/**
 * Pegel's own play controls (UI, mini player, tray): in a party they may be
 * commands for everybody; otherwise they go to YT as always.
 */
export function routePlayerCommand(command: PlayerCommand): void {
  if (!party.routeCommand(command)) sendPlayerCommand(command);
}

/** True while a Pegel window has focus; the panel shows invites then, no notification needed. */
function anyWindowFocused(): boolean {
  return BrowserWindow.getAllWindows().some((w) => w.isFocused());
}
