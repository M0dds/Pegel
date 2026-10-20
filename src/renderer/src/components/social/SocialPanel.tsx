import { useEffect, useState, type FormEvent } from 'react';
import { IN_SYNC_SUMMARY_MS, NAME_MAX } from '@shared/social-protocol';
import type { FriendView, PartyMemberView, PartyView, SocialState } from '@shared/social';
import type { SocialSettings } from '@shared/types';
import { Switch } from '../Switch';
import { CloseIcon, NextIcon, PartyIcon, PauseIcon, PlayIcon, PlusIcon } from '../icons';
import { AddFriendDialog } from './AddFriendDialog';
import { RowMenu } from './RowMenu';

interface Props {
  state: SocialState;
  settings: SocialSettings;
  open: boolean;
}

const CONNECTION_TEXT: Record<SocialState['connection'], string> = {
  off: '',
  connecting: 'Verbinde …',
  online: 'Online',
  offline: 'Offline – verbinde neu …',
};

/** Re-renders every second while `active` (countdowns). */
function useTicker(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

function nowPlayingText(np: { title: string; artist: string } | null): string {
  if (!np) return '';
  return np.artist ? `${np.title} – ${np.artist}` : np.title;
}

/** Friends & listening party, right of YT like the EQ panel. */
export function SocialPanel({ state, settings, open }: Props) {
  const [adding, setAdding] = useState(false);

  return (
    <aside
      className={`eq social${open ? ' open' : ''}`}
      aria-hidden={!open}
      onTransitionEnd={(e) => {
        if (e.target === e.currentTarget && e.propertyName === 'width') {
          window.pegel.eqPanelAnimationDone(open);
        }
      }}
    >
      <div className="eq-inner">
        <div className="eq-head">
          <h3>Social</h3>
          {state.enabled && (
            <span className={`conn conn-${state.connection}`}>
              <i aria-hidden="true" />
              {CONNECTION_TEXT[state.connection]}
            </span>
          )}
        </div>

        {state.notice && (
          <div className={`social-notice ${state.notice.kind}`} role="status">
            {state.notice.text}
          </div>
        )}

        {!state.enabled ? (
          <Setup initialName={settings.displayName} />
        ) : (
          <>
            {state.invites.map((invite) => (
              <div className="invite-card" key={invite.inviteId}>
                <div>
                  <b>{invite.name} lädt dich zur Party ein</b>
                  {invite.nowPlaying && <small>{nowPlayingText(invite.nowPlaying)}</small>}
                </div>
                <div className="card-actions">
                  <button
                    className="btn"
                    onClick={() => window.pegel.partyRespond(invite.inviteId, false)}
                  >
                    Ablehnen
                  </button>
                  <button
                    className="btn primary"
                    onClick={() => window.pegel.partyRespond(invite.inviteId, true)}
                  >
                    Beitreten
                  </button>
                </div>
              </div>
            ))}

            {state.party ? (
              <PartyCard party={state.party} settings={settings} />
            ) : (
              <div className="party-start">
                <button
                  className="btn primary"
                  disabled={state.connection !== 'online'}
                  onClick={() => window.pegel.partyStart()}
                >
                  <PartyIcon />
                  Party starten
                </button>
                <p className="hint">
                  Freunde hören dasselbe wie du, zur gleichen Zeit. Jeder spielt über sein eigenes
                  YT-Konto ab, Pegel gleicht nur Titel und Position ab.
                </p>
              </div>
            )}

            <FriendList state={state} />

            <button className="add-friend" onClick={() => setAdding(true)}>
              <PlusIcon />
              Freund hinzufügen
            </button>
          </>
        )}
      </div>
      {adding && (
        <AddFriendDialog
          code={state.code}
          online={state.connection === 'online'}
          onClose={() => setAdding(false)}
        />
      )}
    </aside>
  );
}

function Setup({ initialName }: { initialName: string }) {
  const [name, setName] = useState(initialName);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) window.pegel.socialEnable(name.trim());
  };
  return (
    <form className="social-setup" onSubmit={submit}>
      <p className="lead-small">
        Füge Freunde per Code hinzu, sieh, was sie gerade hören, und hört gemeinsam in einer
        Hör-Party.
      </p>
      <p className="hint">
        Ohne Passwort und ohne Google-Daten: Pegel erzeugt auf diesem Rechner einen eigenen
        Schlüssel. Der Server kennt deinen Namen und deine Freundesliste nur, solange du online
        bist, und speichert nichts davon.
      </p>
      <label className="field">
        <span className="field-label">Dein Name</span>
        <input
          value={name}
          maxLength={NAME_MAX}
          placeholder="So sehen dich deine Freunde"
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <button type="submit" className="btn primary" disabled={!name.trim()}>
        Freunde einrichten
      </button>
    </form>
  );
}

function memberTag(m: PartyMemberView): { text: string; ok: boolean } {
  if (m.conn === 'reconnecting') return { text: 'verbindet neu …', ok: false };
  if (m.isHost) return { text: 'Host', ok: true };
  const s = m.status;
  if (!s) return { text: 'tritt bei …', ok: false };
  if (s.ad) return { text: 'Werbung', ok: false };
  if (s.unplayable) return { text: 'nicht verfügbar', ok: false };
  if (s.localPause) return { text: 'pausiert', ok: false };
  if (s.buffering || s.driftMs === null) return { text: 'lädt …', ok: false };
  return Math.abs(s.driftMs) <= IN_SYNC_SUMMARY_MS
    ? { text: 'synchron', ok: true }
    : { text: 'holt auf', ok: false };
}

function PartyCard({ party, settings }: { party: PartyView; settings: SocialSettings }) {
  const isHost = party.role === 'host';
  const now = useTicker(party.hold?.kind === 'ads');
  const host = party.members.find((m) => m.isHost);
  const hostAway = !isHost && host?.conn === 'reconnecting';

  let status: string | null = null;
  if (party.connection === 'connecting') status = 'Verbinde mit der Party …';
  else if (party.connection === 'reconnecting') status = 'Verbindung unterbrochen – verbinde neu …';
  else if (party.hold?.kind === 'host-ad') {
    status = isHost ? 'Du hörst gerade Werbung, die Party wartet.' : 'Der Host hört kurz Werbung …';
  } else if (party.hold?.kind === 'ads') {
    const secs = Math.max(0, Math.ceil((party.hold.until - now) / 1000));
    status = `Warte auf ${party.hold.names.join(', ')} (Werbung) … ${secs} s`;
  } else if (hostAway)
    status = `Verbindung zu ${host?.name ?? 'Host'} weg – der Titel läuft weiter.`;

  return (
    <section className="party-card">
      <div className="party-head">
        <span className="field-label">Party</span>
        <span className="party-count">
          {party.members.length} {party.members.length === 1 ? 'Person' : 'Personen'}
        </span>
      </div>

      <div className="party-track">
        <PartyIcon />
        <div>
          <b>{party.track?.title || 'Noch nichts'}</b>
          <small>
            {party.track
              ? `${party.track.artist}${party.playing ? '' : ' · pausiert'}`
              : isHost
                ? 'Spiel einen Titel ab, alle hören mit.'
                : 'Warte auf den Host …'}
          </small>
        </div>
        {party.canControl && party.track && (
          <div className="party-controls">
            <button
              className="icon-btn"
              aria-label={party.playing ? 'Pause für alle' : 'Weiter für alle'}
              title={party.playing ? 'Pause für alle' : 'Abspielen für alle'}
              onClick={() => window.pegel.playerCommand({ type: 'playPause' })}
            >
              {party.playing ? <PauseIcon /> : <PlayIcon />}
            </button>
            <button
              className="icon-btn"
              aria-label="Überspringen"
              title="Überspringen"
              onClick={() => window.pegel.playerCommand({ type: 'next' })}
            >
              <NextIcon />
            </button>
          </div>
        )}
      </div>

      {status && <div className="party-status">{status}</div>}

      {party.local.localPause && (
        <div className="party-status action">
          <span>Du hast pausiert, die Party läuft weiter.</span>
          <button className="tb-hint-action" onClick={() => window.pegel.partyResume()}>
            Weiterhören
          </button>
        </div>
      )}
      {party.local.unplayable && (
        <div className="party-status">
          Dieser Titel ist für dich nicht verfügbar – beim nächsten bist du wieder dabei.
        </div>
      )}

      <ul className="members">
        {party.members.map((m) => {
          const tag = memberTag(m);
          return (
            <li key={m.userId}>
              <i
                className={`dot${tag.ok ? ' ok' : ''}${m.conn === 'reconnecting' ? ' away' : ''}`}
              />
              <span className="member-name">
                {m.name}
                {m.isMe && <em> (du)</em>}
              </span>
              <span className={`member-tag${tag.ok ? ' ok' : ''}`}>{tag.text}</span>
              {isHost && !m.isMe ? (
                <RowMenu
                  label={`${m.name}: Aktionen`}
                  items={[
                    ...(m.conn === 'ok'
                      ? [
                          {
                            label: 'Host übergeben',
                            onSelect: () => window.pegel.partyTransfer(m.userId),
                          },
                        ]
                      : []),
                    {
                      label: 'Aus der Party entfernen',
                      danger: true,
                      confirm: 'Wirklich entfernen?',
                      onSelect: () => window.pegel.partyKick(m.userId),
                    },
                  ]}
                />
              ) : (
                <span className="row-menu-space" />
              )}
            </li>
          );
        })}
      </ul>

      {party.suggestions.length > 0 && (isHost || party.options.allowSuggestions) && (
        <div className="suggestions">
          <div className="field-label">Vorschläge</div>
          <ul>
            {party.suggestions.map((s) => (
              <li key={s.id}>
                <div>
                  <b>{s.title || s.videoId}</b>
                  <small>
                    {s.artist} · von {s.fromName}
                  </small>
                </div>
                {isHost && (
                  <>
                    <button
                      className="chip-action"
                      onClick={() => window.pegel.partySuggestion(s.id, true)}
                    >
                      Abspielen
                    </button>
                    <button
                      className="icon-btn"
                      aria-label="Vorschlag ablehnen"
                      title="Ablehnen"
                      onClick={() => window.pegel.partySuggestion(s.id, false)}
                    >
                      <CloseIcon />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {isHost && (
        <div className="party-options">
          <label className="option-row">
            <span>Offen für Freunde</span>
            <Switch
              checked={settings.partyOpen}
              label="Offen für Freunde"
              onChange={(partyOpen) => window.pegel.socialPatch({ partyOpen })}
            />
          </label>
          <label className="option-row">
            <span>Alle dürfen steuern</span>
            <Switch
              checked={settings.everyoneControls}
              label="Alle dürfen steuern"
              onChange={(everyoneControls) => window.pegel.socialPatch({ everyoneControls })}
            />
          </label>
          {!settings.everyoneControls && (
            <label className="option-row">
              <span>Vorschläge erlauben</span>
              <Switch
                checked={settings.allowSuggestions}
                label="Vorschläge erlauben"
                onChange={(allowSuggestions) => window.pegel.socialPatch({ allowSuggestions })}
              />
            </label>
          )}
        </div>
      )}
      {!isHost && (
        <p className="hint">
          {party.canControl
            ? 'Startest du in YT eine Playlist oder einen Titel, hören alle mit und du legst auf. Pause, Weiter und Spulen gelten für alle.'
            : party.options.allowSuggestions
              ? 'Mit dem + neben einem Titel in YT schlägst du ihn dem Host vor.'
              : 'In dieser Party steuert der Host. Pausierst du, gilt das nur für dich.'}
        </p>
      )}

      <div className="card-actions">
        {isHost ? (
          <button className="btn danger" onClick={() => window.pegel.partyEnd()}>
            Party beenden
          </button>
        ) : (
          <button className="btn danger" onClick={() => window.pegel.partyLeave()}>
            Party verlassen
          </button>
        )}
      </div>
    </section>
  );
}

function FriendList({ state }: { state: SocialState }) {
  const online = state.friends.filter((f) => f.online);
  const offline = state.friends.filter((f) => !f.online);
  if (!state.friends.length) {
    return (
      <p className="empty-hint">
        Noch keine Freunde. Tauscht eure Codes aus, dann seht ihr euch hier.
      </p>
    );
  }
  return (
    <div className="friends">
      {online.length > 0 && <div className="field-label">Online</div>}
      {online.map((f) => (
        <FriendRow key={f.id} friend={f} state={state} />
      ))}
      {offline.length > 0 && <div className="field-label">Offline</div>}
      {offline.map((f) => (
        <FriendRow key={f.id} friend={f} state={state} />
      ))}
    </div>
  );
}

function FriendRow({ friend, state }: { friend: FriendView; state: SocialState }) {
  const party = state.party;
  const inMyParty = !!party?.members.some((m) => m.userId === friend.id);
  const canInvite =
    friend.online &&
    !inMyParty &&
    (!party || party.role === 'host') &&
    state.connection === 'online';
  // A friend's open party: joining is the main action, inviting moves into the ⋯ menu.
  const canJoin =
    friend.online &&
    !!friend.party?.open &&
    friend.party.partyId !== party?.partyId &&
    state.connection === 'online';

  const np = friend.nowPlaying;
  let sub = friend.online ? 'online' : 'offline';
  if (inMyParty) sub = 'in deiner Party';
  else if (friend.nowPlaying) sub = `hört ${nowPlayingText(friend.nowPlaying)}`;
  else if (friend.party) sub = 'in einer Party';

  return (
    <div className="friend-row">
      <i className={`dot${friend.online ? ' ok' : ' away'}`} />
      <div className="friend-meta">
        <b>{friend.name}</b>
        {!inMyParty && np?.videoId ? (
          <button
            className="np-link"
            title={`Anhören: ${nowPlayingText(np)}`}
            onClick={() => window.pegel.playFriendTrack(friend.id)}
          >
            {sub}
          </button>
        ) : (
          <small title={sub}>{sub}</small>
        )}
        {!inMyParty && np?.playlistId && (
          <button
            className="np-link playlist"
            title="Playlist öffnen (geht, wenn sie öffentlich oder per Link geteilt ist)"
            onClick={() => window.pegel.openFriendPlaylist(friend.id)}
          >
            aus {np.playlistTitle ? `„${np.playlistTitle}“` : 'einer Playlist'}
          </button>
        )}
      </div>
      {canJoin ? (
        <button className="chip-action" onClick={() => window.pegel.partyJoin(friend.id)}>
          Beitreten
        </button>
      ) : (
        canInvite && (
          <button className="chip-action" onClick={() => window.pegel.partyInvite(friend.id)}>
            Einladen
          </button>
        )
      )}
      <RowMenu
        label={`${friend.name}: Aktionen`}
        items={[
          ...(canJoin && canInvite
            ? [
                {
                  label: 'Zu meiner Party einladen',
                  onSelect: () => window.pegel.partyInvite(friend.id),
                },
              ]
            : []),
          {
            label: 'Entfernen',
            danger: true,
            confirm: 'Wirklich entfernen?',
            onSelect: () => window.pegel.removeFriend(friend.id),
          },
        ]}
      />
    </div>
  );
}
