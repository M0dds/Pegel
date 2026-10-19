import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { app } from 'electron';
import type { FriendView, InviteView } from '@shared/social';
import {
  cleanName,
  isUserId,
  MAX_FRIENDS,
  TICKET_TTL_MS,
  toNowPlaying,
  toPartyPresence,
  toTicket,
  type ErrorCode,
  type HubServerMessage,
  type NowPlaying,
  type PartyPresence,
  type Ticket,
  type UserId,
} from '@shared/social-protocol';
import { SocialSocket, type SocketState } from './connection';
import type { Identity } from './identity';

export interface FriendRecord {
  id: UserId;
  name: string;
  addedAt: number;
}

interface Presence {
  online: boolean;
  name: string;
  nowPlaying: NowPlaying | null;
  party: PartyPresence | null;
}

interface PendingInvite extends InviteView {
  ticket: Ticket;
}

export interface FriendsHooks {
  onChange(): void;
  onInvite(invite: InviteView): void;
  /** A friend answered our join request with a ticket: join now. */
  onJoinTicket(ticket: Ticket, fromName: string): void;
  /** A friend wants to join our (open) party. */
  onJoinRequest(from: UserId, name: string, partyId: string): void;
  notice(text: string, kind: 'info' | 'error'): void;
}

const ERROR_TEXT: Partial<Record<ErrorCode, string>> = {
  'invalid-code': 'Dieser Code ist ungültig oder abgelaufen.',
  'own-code': 'Das ist dein eigener Code.',
  'rate-limit': 'Zu viele Versuche. Bitte warte kurz.',
  offline: 'Dein Freund ist gerade nicht online.',
  'not-friends': 'Ihr müsst euch gegenseitig hinzugefügt haben.',
  'old-client': 'Bitte aktualisiere Pegel, um Freunde zu nutzen.',
};

function filePath(): string {
  return join(app.getPath('userData'), 'friends.json');
}

function loadFriends(): FriendRecord[] {
  try {
    const raw = JSON.parse(readFileSync(filePath(), 'utf8')) as { friends?: unknown };
    if (!Array.isArray(raw.friends)) return [];
    const seen = new Set<string>();
    const result: FriendRecord[] = [];
    for (const item of raw.friends as Record<string, unknown>[]) {
      const name = cleanName(item?.['name']);
      if (!isUserId(item?.['id']) || !name || seen.has(item['id'])) continue;
      seen.add(item['id']);
      const addedAt = typeof item['addedAt'] === 'number' ? item['addedAt'] : Date.now();
      result.push({ id: item['id'], name, addedAt });
    }
    return result.slice(0, MAX_FRIENDS);
  } catch {
    return [];
  }
}

/**
 * Friend list (only on this computer), presence and invites via the hub.
 * The server learns the list only while connected, to forward presence
 * between mutual friends.
 */
export class FriendsService {
  /** Read on start: the profile folder (userData) is only final once the app runs. */
  private friends: FriendRecord[] = [];
  private presence = new Map<UserId, Presence>();
  private invites = new Map<string, PendingInvite>();
  private code: { code: string; expiresAt: number } | null = null;
  private socket: SocialSocket<HubServerMessage> | null = null;
  private state: SocketState | 'off' = 'off';
  private share = true;
  private lastPresence = '';
  private presenceToSend: { nowPlaying: NowPlaying | null; party: PartyPresence | null } = {
    nowPlaying: null,
    party: null,
  };
  /** Party ids we asked to join, with the time of the request. */
  private joinRequests = new Map<string, number>();
  private pruneTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly url: string,
    private readonly hooks: FriendsHooks,
  ) {}

  get connection(): SocketState | 'off' {
    return this.state;
  }

  start(identity: Identity, name: () => string, share: boolean): void {
    this.stop();
    this.friends = loadFriends();
    this.share = share;
    this.socket = new SocialSocket<HubServerMessage>({
      url: `${this.url}/hub`,
      target: 'hub',
      identity,
      name,
      onMessage: (msg) => this.handle(msg),
      onState: (state) => {
        this.state = state;
        if (state === 'online') {
          this.lastPresence = '';
          this.sendHello();
          this.flushPresence();
        } else if (state !== 'connecting') {
          // Without a connection nobody is known to be online.
          for (const p of this.presence.values()) p.online = false;
        }
        this.hooks.onChange();
      },
      onFinal: (reason) => {
        this.state = 'offline';
        this.hooks.notice(
          ERROR_TEXT[reason as ErrorCode] ?? 'Verbindung zum Freunde-Server abgelehnt.',
          'error',
        );
        this.hooks.onChange();
      },
    });
    this.socket.start();
    this.pruneTimer = setInterval(() => this.prune(), 30_000);
  }

  stop(): void {
    this.socket?.stop();
    this.socket = null;
    if (this.pruneTimer) clearInterval(this.pruneTimer);
    this.pruneTimer = null;
    this.state = 'off';
    this.presence.clear();
    this.invites.clear();
    this.code = null;
  }

  /** Name changes are only part of the login, so the connection starts over. */
  restart(identity: Identity, name: () => string): void {
    if (this.socket) this.start(identity, name, this.share);
  }

  reconnectNow(): void {
    this.socket?.reconnectNow();
  }

  /** "Freunde zurücksetzen": the list is gone for good. */
  deleteAll(): void {
    this.stop();
    this.friends = [];
    rmSync(filePath(), { force: true });
  }

  setShare(share: boolean): void {
    if (share === this.share) return;
    this.share = share;
    this.sendHello();
  }

  updatePresence(nowPlaying: NowPlaying | null, party: PartyPresence | null): void {
    this.presenceToSend = { nowPlaying, party };
    this.flushPresence();
  }

  createCode(): void {
    if (!this.socket?.send({ t: 'code.create' })) this.offlineNotice();
  }

  redeemCode(code: string): void {
    if (!this.socket?.send({ t: 'code.redeem', code: code.slice(0, 20) })) this.offlineNotice();
  }

  removeFriend(id: UserId): void {
    this.friends = this.friends.filter((f) => f.id !== id);
    this.presence.delete(id);
    this.save();
    this.sendHello();
    this.hooks.onChange();
  }

  invite(to: UserId, ticket: Ticket, reply = false): void {
    if (!this.socket?.send({ t: 'invite', to, ticket, ...(reply && { reply: true }) })) {
      this.offlineNotice();
    }
  }

  /** Takes an invite out of the list (accepted or declined). */
  takeInvite(inviteId: string): PendingInvite | null {
    const invite = this.invites.get(inviteId) ?? null;
    this.invites.delete(inviteId);
    if (invite) this.hooks.onChange();
    return invite;
  }

  decline(invite: PendingInvite): void {
    this.socket?.send({ t: 'invite.decline', to: invite.from, partyId: invite.ticket.partyId });
  }

  requestJoin(friendId: UserId): boolean {
    const party = this.presence.get(friendId)?.party;
    if (!party?.open) return false;
    this.joinRequests.set(party.partyId, Date.now());
    if (!this.socket?.send({ t: 'join.request', to: friendId, partyId: party.partyId })) {
      this.offlineNotice();
      return false;
    }
    return true;
  }

  nameOf(id: UserId): string | null {
    return this.friends.find((f) => f.id === id)?.name ?? null;
  }

  isFriend(id: UserId): boolean {
    return this.friends.some((f) => f.id === id);
  }

  views(): FriendView[] {
    return this.friends
      .map((f) => {
        const p = this.presence.get(f.id);
        const online = !!p?.online && this.state === 'online';
        return {
          id: f.id,
          name: p?.name ?? f.name,
          online,
          nowPlaying: online ? (p?.nowPlaying ?? null) : null,
          party: online ? (p?.party ?? null) : null,
        };
      })
      .sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name, 'de'));
  }

  inviteViews(): InviteView[] {
    return [...this.invites.values()].map(({ ticket: _, ...view }) => view);
  }

  codeView(): { code: string; expiresAt: number } | null {
    return this.code && this.code.expiresAt > Date.now() ? this.code : null;
  }

  private offlineNotice(): void {
    this.hooks.notice('Keine Verbindung zum Freunde-Server.', 'error');
  }

  private sendHello(): void {
    this.socket?.send({
      t: 'hello',
      friends: this.friends.map((f) => f.id),
      share: { nowPlaying: this.share },
    });
  }

  private flushPresence(): void {
    const key = JSON.stringify(this.presenceToSend);
    if (key === this.lastPresence) return;
    if (this.socket?.send({ t: 'presence', ...this.presenceToSend })) this.lastPresence = key;
  }

  private addFriend(id: UserId, name: string): void {
    const existing = this.friends.find((f) => f.id === id);
    if (existing) existing.name = name;
    else if (this.friends.length < MAX_FRIENDS)
      this.friends.push({ id, name, addedAt: Date.now() });
    this.save();
    this.sendHello();
  }

  private prune(): void {
    const now = Date.now();
    let changed = false;
    for (const [id, invite] of this.invites) {
      if (invite.expiresAt <= now) {
        this.invites.delete(id);
        changed = true;
      }
    }
    for (const [partyId, at] of this.joinRequests) {
      if (now - at > 60_000) this.joinRequests.delete(partyId);
    }
    if (this.code && this.code.expiresAt <= now) {
      this.code = null;
      changed = true;
    }
    if (changed) this.hooks.onChange();
  }

  private handle(msg: HubServerMessage): void {
    switch (msg.t) {
      case 'resync':
        this.lastPresence = '';
        this.sendHello();
        this.flushPresence();
        break;
      case 'presence': {
        if (!isUserId(msg.userId) || !this.isFriend(msg.userId)) return;
        const name = cleanName(msg.name) ?? this.nameOf(msg.userId) ?? '?';
        this.presence.set(msg.userId, {
          online: msg.online === true,
          name,
          nowPlaying: toNowPlaying(msg.nowPlaying),
          party: toPartyPresence(msg.party),
        });
        // Keep the stored name current (friends may rename themselves).
        const friend = this.friends.find((f) => f.id === msg.userId);
        if (friend && friend.name !== name) {
          friend.name = name;
          this.save();
        }
        this.hooks.onChange();
        break;
      }
      case 'code':
        if (typeof msg.code === 'string' && typeof msg.expiresAt === 'number') {
          this.code = { code: msg.code, expiresAt: msg.expiresAt };
          this.hooks.onChange();
        }
        break;
      case 'friend.added': {
        const name = cleanName(msg.name);
        if (!isUserId(msg.userId) || !name) return;
        const isNew = !this.isFriend(msg.userId);
        this.addFriend(msg.userId, name);
        // The code was used up.
        this.code = null;
        if (isNew) this.hooks.notice(`${name} ist jetzt dein Freund.`, 'info');
        this.hooks.onChange();
        break;
      }
      case 'invite': {
        const ticket = toTicket(msg.ticket);
        const name = cleanName(msg.name);
        if (!ticket || !name || !isUserId(msg.from) || !this.isFriend(msg.from)) return;
        if (msg.reply) {
          // Only answers to our own, recent join request count.
          if (!this.joinRequests.has(ticket.partyId)) return;
          this.joinRequests.delete(ticket.partyId);
          this.hooks.onJoinTicket(ticket, name);
          return;
        }
        const invite: PendingInvite = {
          inviteId:
            typeof msg.inviteId === 'string' ? msg.inviteId.slice(0, 40) : String(Date.now()),
          from: msg.from,
          name,
          nowPlaying: toNowPlaying(msg.nowPlaying),
          expiresAt: Date.now() + TICKET_TTL_MS,
          ticket,
        };
        // One invite per friend: a newer one replaces the older.
        for (const [id, other] of this.invites)
          if (other.from === msg.from) this.invites.delete(id);
        this.invites.set(invite.inviteId, invite);
        this.hooks.onInvite(this.inviteViews().find((i) => i.inviteId === invite.inviteId)!);
        this.hooks.onChange();
        break;
      }
      case 'invite.declined': {
        const name = cleanName(msg.name);
        if (name) this.hooks.notice(`${name} hat die Einladung abgelehnt.`, 'info');
        break;
      }
      case 'join.request': {
        const name = cleanName(msg.name);
        if (!isUserId(msg.from) || !name || !this.isFriend(msg.from)) return;
        if (typeof msg.partyId !== 'string') return;
        this.hooks.onJoinRequest(msg.from, name, msg.partyId);
        break;
      }
      case 'error': {
        const text = ERROR_TEXT[msg.code];
        if (text) this.hooks.notice(text, 'error');
        break;
      }
    }
  }

  private save(): void {
    const target = filePath();
    try {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(`${target}.tmp`, JSON.stringify({ friends: this.friends }, null, 2), 'utf8');
      renameSync(`${target}.tmp`, target);
    } catch (error) {
      console.error('[friends] save failed', error);
    }
  }
}
