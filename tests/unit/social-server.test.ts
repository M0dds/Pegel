import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  authPayload,
  RECONNECT_GRACE_MS,
  ticketPayload,
  type PartyPlayback,
  type Ticket,
} from '@shared/social-protocol';
import { defaultDeps, type Conn, type CoreDeps } from '../../server/src/common';
import { HubCore, MemoryHubStore, type HubAttachment } from '../../server/src/hub-core';
import { PartyCore } from '../../server/src/party-core';

interface Identity {
  id: string;
  key: KeyObject;
  sign(payload: string): string;
}

function identity(): Identity {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const id = publicKey.export({ format: 'jwk' }).x!;
  return {
    id,
    key: privateKey,
    sign: (payload) => sign(null, Buffer.from(payload), privateKey).toString('base64url'),
  };
}

/** A fake socket that records what the server sent. */
class FakeConn implements Conn {
  sent: Record<string, unknown>[] = [];
  closed: { code: number; reason: string } | null = null;
  send(text: string): void {
    this.sent.push(JSON.parse(text) as Record<string, unknown>);
  }
  close(code: number, reason: string): void {
    this.closed = { code, reason };
  }
  last(t: string): Record<string, unknown> | undefined {
    return this.sent.filter((m) => m['t'] === t).at(-1);
  }
  all(t: string): Record<string, unknown>[] {
    return this.sent.filter((m) => m['t'] === t);
  }
  get nonce(): string {
    return this.last('challenge')!['nonce'] as string;
  }
}

let clock = 1_000_000;
const deps: CoreDeps = { ...defaultDeps, now: () => clock };

const msg = (value: object) => JSON.stringify(value);

describe('hub', () => {
  let hub: HubCore;
  let store: MemoryHubStore;

  beforeEach(() => {
    clock = 1_000_000;
    store = new MemoryHubStore();
    hub = new HubCore(store, deps);
  });

  async function connect(who: Identity, name: string, friends: string[] = []): Promise<FakeConn> {
    const conn = new FakeConn();
    hub.open(conn);
    await hub.message(
      conn,
      msg({ t: 'auth', v: 1, userId: who.id, name, sig: who.sign(authPayload('hub', conn.nonce)) }),
    );
    expect(conn.last('ready')).toBeTruthy();
    await hub.message(conn, msg({ t: 'hello', friends, share: { nowPlaying: true } }));
    return conn;
  }

  it('rejects a wrong signature', async () => {
    const a = identity();
    const conn = new FakeConn();
    hub.open(conn);
    await hub.message(
      conn,
      msg({ t: 'auth', v: 1, userId: a.id, name: 'A', sig: a.sign(authPayload('hub', 'other')) }),
    );
    expect(conn.last('error')).toMatchObject({ code: 'bad-sig' });
    expect(conn.closed?.code).toBe(4100);
  });

  it('shows presence only between mutual friends', async () => {
    const a = identity();
    const b = identity();
    const ca = await connect(a, 'Anna', [b.id]);
    const cb = await connect(b, 'Ben'); // Ben has not added Anna (yet)
    expect(ca.all('presence')).toHaveLength(0);
    expect(cb.all('presence')).toHaveLength(0);

    await hub.message(cb, msg({ t: 'hello', friends: [a.id], share: { nowPlaying: true } }));
    expect(ca.last('presence')).toMatchObject({ userId: b.id, name: 'Ben', online: true });
    expect(cb.last('presence')).toMatchObject({ userId: a.id, name: 'Anna', online: true });

    await hub.message(
      ca,
      msg({ t: 'presence', nowPlaying: { title: 'Song', artist: 'Band' }, party: null }),
    );
    expect(cb.last('presence')).toMatchObject({ nowPlaying: { title: 'Song', artist: 'Band' } });

    hub.close(ca);
    expect(cb.last('presence')).toMatchObject({ userId: a.id, online: false });
  });

  it('hides what someone plays when they do not share it', async () => {
    const a = identity();
    const b = identity();
    const ca = await connect(a, 'Anna', [b.id]);
    const cb = await connect(b, 'Ben', [a.id]);
    await hub.message(ca, msg({ t: 'hello', friends: [b.id], share: { nowPlaying: false } }));
    await hub.message(
      ca,
      msg({ t: 'presence', nowPlaying: { title: 'X', artist: 'Y' }, party: null }),
    );
    expect(cb.last('presence')).toMatchObject({ userId: a.id, online: true, nowPlaying: null });
  });

  it('removing a friend makes both offline for each other', async () => {
    const a = identity();
    const b = identity();
    const ca = await connect(a, 'Anna', [b.id]);
    const cb = await connect(b, 'Ben', [a.id]);
    await hub.message(ca, msg({ t: 'hello', friends: [], share: { nowPlaying: true } }));
    expect(cb.last('presence')).toMatchObject({ userId: a.id, online: false });
    expect(ca.last('presence')).toMatchObject({ userId: b.id, online: false });
  });

  it('friend codes work once and tell the offline creator later', async () => {
    const a = identity();
    const b = identity();
    const ca = await connect(a, 'Anna');
    await hub.message(ca, msg({ t: 'code.create' }));
    const code = ca.last('code')!['code'] as string;
    expect(code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/);

    // Own code does not count.
    await hub.message(ca, msg({ t: 'code.redeem', code }));
    expect(ca.last('error')).toMatchObject({ code: 'own-code' });

    hub.close(ca);
    const cb = await connect(b, 'Ben');
    await hub.message(cb, msg({ t: 'code.redeem', code: code.toLowerCase().replace('-', ' ') }));
    expect(cb.last('friend.added')).toMatchObject({ userId: a.id, name: 'Anna' });

    await hub.message(cb, msg({ t: 'code.redeem', code }));
    expect(cb.last('error')).toMatchObject({ code: 'invalid-code' });

    const ca2 = await connect(a, 'Anna');
    expect(ca2.last('friend.added')).toMatchObject({ userId: b.id, name: 'Ben' });
  });

  it('codes expire after 24 hours', async () => {
    const a = identity();
    const b = identity();
    const ca = await connect(a, 'Anna');
    await hub.message(ca, msg({ t: 'code.create' }));
    const code = ca.last('code')!['code'] as string;
    clock += 24 * 60 * 60 * 1000;
    const cb = await connect(b, 'Ben');
    await hub.message(cb, msg({ t: 'code.redeem', code }));
    expect(cb.last('error')).toMatchObject({ code: 'invalid-code' });
  });

  it('forwards invites only between mutual friends and only own tickets', async () => {
    const a = identity();
    const b = identity();
    const c = identity();
    const ca = await connect(a, 'Anna', [b.id, c.id]);
    const cb = await connect(b, 'Ben', [a.id]);
    await connect(c, 'Cem'); // has not added Anna
    const ticket = (guest: string, host = a): Ticket => ({
      partyId: 'p'.repeat(22),
      guest,
      exp: clock + 60_000,
      host: host.id,
      sig: host.sign(ticketPayload('p'.repeat(22), guest, clock + 60_000)),
    });

    await hub.message(ca, msg({ t: 'invite', to: b.id, ticket: ticket(b.id) }));
    expect(cb.last('invite')).toMatchObject({ from: a.id, name: 'Anna' });

    await hub.message(ca, msg({ t: 'invite', to: c.id, ticket: ticket(c.id) }));
    expect(ca.last('error')).toMatchObject({ code: 'not-friends' });

    // A ticket made out to someone else is refused.
    await hub.message(ca, msg({ t: 'invite', to: b.id, ticket: ticket(c.id) }));
    expect(ca.last('error')).toMatchObject({ code: 'bad-message' });
  });

  it('after hibernation still knows mutual friends from the socket attachment', async () => {
    const a = identity();
    const b = identity();
    let saved: HubAttachment | null = null;
    const ca = new FakeConn();
    hub.open(ca);
    const keep = (att: HubAttachment) => (saved = att);
    await hub.message(
      ca,
      msg({
        t: 'auth',
        v: 1,
        userId: a.id,
        name: 'Anna',
        sig: a.sign(authPayload('hub', ca.nonce)),
      }),
      keep,
    );
    await hub.message(ca, msg({ t: 'hello', friends: [b.id], share: { nowPlaying: true } }), keep);
    expect(saved!.friends).toEqual([b.id.slice(0, 11)]);

    // The hub wakes up without memory; the first message is an invite.
    hub = new HubCore(store, deps);
    const ra = new FakeConn();
    const rb = new FakeConn();
    hub.restore(ra, saved!);
    hub.restore(rb, { userId: b.id, name: 'Ben', friends: [a.id.slice(0, 11)], share: true });
    expect(ra.last('resync')).toBeTruthy();
    const ticket: Ticket = {
      partyId: 'p'.repeat(22),
      guest: b.id,
      exp: clock + 60_000,
      host: a.id,
      sig: a.sign(ticketPayload('p'.repeat(22), b.id, clock + 60_000)),
    };
    await hub.message(ra, msg({ t: 'invite', to: b.id, ticket }));
    expect(ra.last('error')).toBeUndefined();
    expect(rb.last('invite')).toMatchObject({ from: a.id });
  });
});

describe('party', () => {
  const partyId = 'Q'.repeat(22);
  let party: PartyCore;

  beforeEach(() => {
    clock = 1_000_000;
    party = new PartyCore(partyId, deps);
  });

  function ticketFor(host: Identity, guest: Identity, exp = clock + 600_000): Ticket {
    return {
      partyId,
      guest: guest.id,
      exp,
      host: host.id,
      sig: host.sign(ticketPayload(partyId, guest.id, exp)),
    };
  }

  async function join(
    who: Identity,
    name: string,
    extra: { ticket?: Ticket; create?: boolean } = {},
  ): Promise<FakeConn> {
    const conn = new FakeConn();
    party.open(conn);
    await party.message(
      conn,
      msg({
        t: 'auth',
        v: 1,
        userId: who.id,
        name,
        sig: who.sign(authPayload(partyId, conn.nonce)),
        ...(extra.ticket && { ticket: extra.ticket }),
        ...(extra.create && { create: { open: true, allowSuggestions: true } }),
      }),
    );
    return conn;
  }

  const state = (seq: number, extra: Partial<PartyPlayback> = {}): PartyPlayback => ({
    seq,
    videoId: 'dQw4w9WgXcQ',
    playing: true,
    positionMs: 1000,
    at: clock,
    title: 'Titel',
    artist: 'Interpret',
    ...extra,
  });

  it('creates, admits guests with a ticket and relays the host state', async () => {
    const host = identity();
    const guest = identity();
    const ch = await join(host, 'Host', { create: true });
    expect(ch.last('welcome')).toMatchObject({ hostId: host.id });

    await party.message(ch, msg({ t: 'state', state: state(1) }));
    const cg = await join(guest, 'Gast', { ticket: ticketFor(host, guest) });
    expect(cg.last('welcome')).toMatchObject({ hostId: host.id, state: { seq: 1 } });
    expect(ch.last('member')).toMatchObject({ member: { userId: guest.id, conn: 'ok' } });

    await party.message(ch, msg({ t: 'state', state: state(2, { playing: false }) }));
    expect(cg.last('state')).toMatchObject({ state: { seq: 2, playing: false } });
    // Old sequence numbers are dropped.
    await party.message(ch, msg({ t: 'state', state: state(1) }));
    expect(cg.all('state')).toHaveLength(1);
    // Guests cannot set the state.
    await party.message(cg, msg({ t: 'state', state: state(9) }));
    expect(ch.all('state')).toHaveLength(0);
  });

  it('refuses guests without a valid ticket', async () => {
    const host = identity();
    const guest = identity();
    const other = identity();
    await join(host, 'Host', { create: true });
    const forged = await join(guest, 'Gast', { ticket: ticketFor(other, guest) });
    expect(forged.last('error')).toMatchObject({ code: 'not-invited' });
    const expired = await join(guest, 'Gast', { ticket: ticketFor(host, guest, clock - 1) });
    expect(expired.last('error')).toMatchObject({ code: 'not-invited' });
    const none = await join(guest, 'Gast');
    expect(none.last('error')).toMatchObject({ code: 'not-invited' });
  });

  it('answers clock pings with server time', async () => {
    const host = identity();
    const ch = await join(host, 'Host', { create: true });
    await party.message(ch, msg({ t: 'ping', c0: 42 }));
    expect(ch.last('pong')).toEqual({ t: 'pong', c0: 42, s: clock });
  });

  it('keeps a dropped guest for the grace time, then removes it', async () => {
    const host = identity();
    const guest = identity();
    const ch = await join(host, 'Host', { create: true });
    const cg = await join(guest, 'Gast', { ticket: ticketFor(host, guest) });
    party.close(cg);
    expect(ch.last('member')).toMatchObject({ member: { userId: guest.id, conn: 'reconnecting' } });
    expect(party.nextDeadline()).toBe(clock + RECONNECT_GRACE_MS);

    // Comes back without needing the ticket again.
    const back = await join(guest, 'Gast');
    expect(back.last('welcome')).toBeTruthy();
    expect(party.nextDeadline()).toBeNull();

    party.close(back);
    clock += RECONNECT_GRACE_MS;
    party.tick();
    expect(ch.last('member.left')).toMatchObject({ userId: guest.id, reason: 'timeout' });
  });

  it('hands the host to the longest member when the host times out', async () => {
    const host = identity();
    const g1 = identity();
    const g2 = identity();
    const ch = await join(host, 'Host', { create: true });
    clock += 10;
    const c1 = await join(g1, 'Eins', { ticket: ticketFor(host, g1) });
    clock += 10;
    const c2 = await join(g2, 'Zwei', { ticket: ticketFor(host, g2) });
    party.close(ch);
    clock += RECONNECT_GRACE_MS;
    party.tick();
    expect(c2.last('host')).toEqual({ t: 'host', hostId: g1.id });
    expect(party.currentHost).toBe(g1.id);
    // The new host may now send state; tickets of the old host stay valid.
    await party.message(c1, msg({ t: 'state', state: state(1) }));
    expect(c2.last('state')).toBeTruthy();
  });

  it('ends when the host ends it or everybody left', async () => {
    const host = identity();
    const guest = identity();
    const ch = await join(host, 'Host', { create: true });
    const cg = await join(guest, 'Gast', { ticket: ticketFor(host, guest) });
    await party.message(ch, msg({ t: 'end' }));
    expect(cg.last('ended')).toEqual({ t: 'ended', reason: 'host-ended' });
    expect(party.isEnded).toBe(true);
    const late = await join(guest, 'Gast', { ticket: ticketFor(host, guest) });
    expect(late.last('error')).toMatchObject({ code: 'ended' });
  });

  it('kicked guests cannot come back', async () => {
    const host = identity();
    const guest = identity();
    const ch = await join(host, 'Host', { create: true });
    const cg = await join(guest, 'Gast', { ticket: ticketFor(host, guest) });
    await party.message(ch, msg({ t: 'kick', userId: guest.id }));
    expect(cg.last('error')).toMatchObject({ code: 'kicked' });
    const again = await join(guest, 'Gast', { ticket: ticketFor(host, guest) });
    expect(again.last('error')).toMatchObject({ code: 'kicked' });
  });

  it('collects suggestions from guests, at most five each', async () => {
    const host = identity();
    const guest = identity();
    const ch = await join(host, 'Host', { create: true });
    const cg = await join(guest, 'Gast', { ticket: ticketFor(host, guest) });
    for (let i = 0; i < 6; i++) {
      const videoId = `video${i}`.padEnd(11, '_');
      await party.message(
        cg,
        msg({ t: 'suggest', track: { videoId, title: `T${i}`, artist: 'A' } }),
      );
    }
    const list = ch.last('suggestions')!['suggestions'] as { id: string }[];
    expect(list).toHaveLength(5);
    expect(cg.last('error')).toMatchObject({ code: 'rate-limit' });
    await party.message(ch, msg({ t: 'suggest.answer', id: list[0]!.id, accept: true }));
    expect(cg.last('suggestions')!['suggestions']).toHaveLength(4);
  });

  it('broadcasts guest status only when something visible changes', async () => {
    const host = identity();
    const guest = identity();
    const ch = await join(host, 'Host', { create: true });
    const cg = await join(guest, 'Gast', { ticket: ticketFor(host, guest) });
    const status = (driftMs: number, ad = false) =>
      msg({
        t: 'status',
        status: { videoId: 'dQw4w9WgXcQ', driftMs, ad, buffering: false, localPause: false },
      });
    const before = ch.all('member').length;
    await party.message(cg, status(10));
    await party.message(cg, status(20));
    await party.message(cg, status(-30));
    expect(ch.all('member').length).toBe(before + 1);
    await party.message(cg, status(20, true));
    expect(ch.last('member')).toMatchObject({ member: { status: { ad: true } } });
  });

  it('a party the server forgot cannot be joined', async () => {
    const host = identity();
    const guest = identity();
    const cg = await join(guest, 'Gast', { ticket: ticketFor(host, guest) });
    expect(cg.last('error')).toMatchObject({ code: 'ended' });
  });
});
