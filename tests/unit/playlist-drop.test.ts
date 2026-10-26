import { createHash } from 'node:crypto';
import { playlistDropText, toPlaylistDropReport, toPlaylistTrack } from '@shared/playlist-drop';
import { describe, expect, it } from 'vitest';
import {
  buildAddToPlaylistQuery,
  buildAddVideoRequest,
  parseAddToPlaylist,
  parseAddVideoResult,
  readSapisid,
  sapisidHash,
  type InnertubeConfig,
} from '../../src/yt/dnd/innertube';
import {
  bezier,
  criticalDamping,
  FOLLOW,
  flightControl,
  isSettled,
  magnetize,
  RETURN,
  stepSpring,
  tiltFor,
  type Spring,
} from '../../src/yt/dnd/motion';
import {
  isVideoId,
  playlistIdFromBrowseId,
  sizedCover,
  videoIdFromHref,
} from '../../src/yt/dnd/track';

describe('videoIdFromHref', () => {
  it('reads the id from YT row links', () => {
    expect(
      videoIdFromHref('watch?v=XnZ-GLMo8G8&list=OLAK5uy_lVCqLgxr23dwtRErdlmnh28vL3wbOIcFo'),
    ).toBe('XnZ-GLMo8G8');
    expect(videoIdFromHref('https://music.youtube.com/watch?v=seYfmj3L2EA')).toBe('seYfmj3L2EA');
    expect(videoIdFromHref('/watch?list=RDAMVM&v=EpzdkA40a2o')).toBe('EpzdkA40a2o');
  });

  it('ignores links that are not a track', () => {
    expect(videoIdFromHref('browse/MPREb_hC5MIRfJVaI')).toBeNull();
    expect(videoIdFromHref('channel/UCsIBPgSLApZDHx6KUMQd3TQ')).toBeNull();
    expect(videoIdFromHref('playlist?list=PL123')).toBeNull();
    expect(videoIdFromHref('watch?v=short')).toBeNull();
    expect(videoIdFromHref('watch?v=bad<script>x')).toBeNull();
    expect(videoIdFromHref(null)).toBeNull();
  });

  it('validates ids', () => {
    expect(isVideoId('dQw4w9WgXcQ')).toBe(true);
    expect(isVideoId('dQw4w9WgXc')).toBe(false);
    expect(isVideoId(42)).toBe(false);
  });
});

describe('playlistIdFromBrowseId', () => {
  it('strips the VL prefix of playlist browse ids', () => {
    expect(playlistIdFromBrowseId('VLPLabc_DEF-123')).toBe('PLabc_DEF-123');
    expect(playlistIdFromBrowseId('VLLM')).toBe('LM');
  });

  it('ignores other browse ids', () => {
    expect(playlistIdFromBrowseId('FEmusic_home')).toBeNull();
    expect(playlistIdFromBrowseId('VL')).toBeNull();
    expect(playlistIdFromBrowseId(undefined)).toBeNull();
  });
});

describe('sizedCover', () => {
  it('asks for a sharper Google image', () => {
    expect(sizedCover('https://yt3.googleusercontent.com/abc=w60-h60-l90-rj', 120)).toBe(
      'https://yt3.googleusercontent.com/abc=w120-h120-l90-rj',
    );
  });

  it('never asks for a smaller image', () => {
    const big = 'https://lh3.googleusercontent.com/abc=w544-h544-l90-rj';
    expect(sizedCover(big, 120)).toBe(big);
  });

  it('keeps other images and drops placeholders', () => {
    expect(sizedCover('https://i.ytimg.com/vi/x/hqdefault.jpg', 120)).toBe(
      'https://i.ytimg.com/vi/x/hqdefault.jpg',
    );
    expect(sizedCover('data:image/gif;base64,R0lGOD', 120)).toBeUndefined();
    expect(sizedCover(undefined, 120)).toBeUndefined();
  });
});

const config: InnertubeConfig = {
  context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20261020.01.00', hl: 'de' } },
  sessionIndex: '0',
  visitorData: 'CgtWaXNpdG9y',
  clientName: '67',
  clientVersion: '1.20261020.01.00',
};

describe('InnerTube requests', () => {
  it('computes the SAPISIDHASH like YT', async () => {
    const now = 1_790_000_000_123;
    const expected = createHash('sha1')
      .update('1790000000 SECRET https://music.youtube.com')
      .digest('hex');
    expect(await sapisidHash('SECRET', 'https://music.youtube.com', now)).toBe(
      `SAPISIDHASH 1790000000_${expected}`,
    );
  });

  it('reads SAPISID from the cookie string', () => {
    expect(readSapisid('PREF=x; SAPISID=abc/def=; HSID=1')).toBe('abc/def=');
    expect(readSapisid('__Secure-3PAPISID=zzz')).toBe('zzz');
    expect(readSapisid('PREF=x; VISITOR_INFO1_LIVE=y')).toBeNull();
  });

  it('builds the add request: only ACTION_ADD_VIDEO, duplicates checked', () => {
    const req = buildAddVideoRequest(config, 'SAPISIDHASH 1_x', 'PLtest', 'XnZ-GLMo8G8');
    expect(req.url).toBe(
      'https://music.youtube.com/youtubei/v1/browse/edit_playlist?prettyPrint=false',
    );
    expect(req.headers).toMatchObject({
      Authorization: 'SAPISIDHASH 1_x',
      'X-Origin': 'https://music.youtube.com',
      'X-Goog-AuthUser': '0',
      'X-Goog-Visitor-Id': 'CgtWaXNpdG9y',
      'X-Youtube-Client-Name': '67',
    });
    expect(req.headers['X-Goog-PageId']).toBeUndefined();
    expect(JSON.parse(req.body)).toEqual({
      context: config.context,
      playlistId: 'PLtest',
      actions: [
        {
          action: 'ACTION_ADD_VIDEO',
          addedVideoId: 'XnZ-GLMo8G8',
          dedupeOption: 'DEDUPE_OPTION_CHECK',
        },
      ],
    });
  });

  it('adds a duplicate only when asked to ("Trotzdem hinzufügen")', () => {
    const req = buildAddVideoRequest(config, 'h', 'PLtest', 'XnZ-GLMo8G8', true);
    expect(JSON.parse(req.body).actions).toEqual([
      {
        action: 'ACTION_ADD_VIDEO',
        addedVideoId: 'XnZ-GLMo8G8',
        dedupeOption: 'DEDUPE_OPTION_SKIP',
      },
    ]);
  });

  it('sends the brand account page id', () => {
    const req = buildAddVideoRequest({ ...config, pageId: '1234' }, 'h', 'PL', 'XnZ-GLMo8G8');
    expect(req.headers['X-Goog-PageId']).toBe('1234');
  });

  it('builds the playlist query', () => {
    const req = buildAddToPlaylistQuery(config, 'h', 'XnZ-GLMo8G8');
    expect(req.url).toContain('/youtubei/v1/playlist/get_add_to_playlist');
    expect(JSON.parse(req.body)).toMatchObject({ videoIds: ['XnZ-GLMo8G8'] });
  });
});

describe('InnerTube answers', () => {
  it('lists the playlists YT offers, with what they contain', () => {
    const response = {
      contents: [
        {
          addToPlaylistRenderer: {
            playlists: [
              {
                playlistAddToOptionRenderer: {
                  playlistId: 'PLa',
                  title: { simpleText: 'Chill' },
                  containsSelectedVideos: 'NONE',
                },
              },
              {
                playlistAddToOptionRenderer: {
                  playlistId: 'PLb',
                  title: { runs: [{ text: 'Auto' }, { text: 'fahrt' }] },
                  containsSelectedVideos: 'ALL',
                },
              },
              { playlistAddToOptionRenderer: { title: { simpleText: 'kaputt' } } },
            ],
          },
        },
      ],
    };
    expect(parseAddToPlaylist(response)).toEqual([
      { playlistId: 'PLa', title: 'Chill', contains: false },
      { playlistId: 'PLb', title: 'Autofahrt', contains: true },
    ]);
    expect(parseAddToPlaylist(null)).toEqual([]);
  });

  it('reads the add result honestly', () => {
    expect(parseAddVideoResult(200, { status: 'STATUS_SUCCEEDED' })).toBe('added');
    // YT's answer for a track that is already there (shape from October 2026, texts shortened).
    const duplicate = {
      status: 'STATUS_FAILED',
      actions: [
        {
          addToToastAction: {
            item: {
              notificationActionRenderer: {
                responseText: {
                  runs: [{ text: 'Dieser Titel ist schon in der Playlist enthalten' }],
                },
                actionButton: {
                  buttonRenderer: {
                    text: { runs: [{ text: 'Trotzdem hinzufügen' }] },
                    command: {
                      playlistEditEndpoint: {
                        playlistId: 'PLtest',
                        actions: [
                          {
                            addedVideoId: 'XnZ-GLMo8G8',
                            action: 'ACTION_ADD_VIDEO',
                            dedupeOption: 'DEDUPE_OPTION_SKIP',
                          },
                        ],
                      },
                    },
                  },
                },
              },
            },
          },
        },
      ],
    };
    expect(parseAddVideoResult(200, duplicate)).toBe('duplicate');
    expect(parseAddVideoResult(200, { status: 'STATUS_FAILED' })).toBe('error');
    expect(parseAddVideoResult(200, {})).toBe('error');
    expect(parseAddVideoResult(403, { status: 'STATUS_SUCCEEDED' })).toBe('error');
    expect(parseAddVideoResult(200, null)).toBe('error');
  });
});

describe('springs', () => {
  const run = (target: number, fps: number, seconds: number, config = FOLLOW): Spring => {
    const s: Spring = { value: 0, velocity: 0 };
    for (let i = 0; i < fps * seconds; i++) stepSpring(s, target, config, 1 / fps);
    return s;
  };

  it('settles on the target', () => {
    const s = run(100, 60, 1);
    expect(isSettled(s, 100, 0.05)).toBe(true);
  });

  it('moves the same at 60 and 144 Hz', () => {
    const a = run(100, 60, 0.25);
    const b = run(100, 144, 0.25);
    expect(Math.abs(a.value - b.value)).toBeLessThan(0.5);
  });

  it('does not overshoot when critically damped', () => {
    const config = { stiffness: 400, damping: criticalDamping(400) };
    const s: Spring = { value: 0, velocity: 0 };
    let max = 0;
    for (let i = 0; i < 120; i++) {
      stepSpring(s, 100, config, 1 / 60);
      max = Math.max(max, s.value);
    }
    expect(max).toBeLessThanOrEqual(100.0001);
  });

  it('overshoots only a little when following and returning', () => {
    for (const config of [FOLLOW, RETURN]) {
      const s: Spring = { value: 0, velocity: 0 };
      let max = 0;
      for (let i = 0; i < 120; i++) {
        stepSpring(s, 100, config, 1 / 60);
        max = Math.max(max, s.value);
      }
      expect(max).toBeLessThan(103);
    }
  });

  it('does not jump after a long frame', () => {
    const s: Spring = { value: 0, velocity: 0 };
    stepSpring(s, 100, FOLLOW, 2);
    expect(s.value).toBeLessThan(100);
    expect(Number.isFinite(s.value)).toBe(true);
  });
});

describe('drop motion', () => {
  it('pulls the card into the target lane', () => {
    const p = magnetize({ x: 50, y: 100 }, { left: 0, top: 110, width: 200, height: 40 }, 0.5);
    expect(p).toEqual({ x: 50, y: 115 });
  });

  it('arcs the flight above the straight line', () => {
    const from = { x: 600, y: 400 };
    const to = { x: 100, y: 300 };
    const c = flightControl(from, to);
    const mid = bezier(from, c, to, 0.5);
    expect(mid.y).toBeLessThan((from.y + to.y) / 2);
    expect(bezier(from, c, to, 0)).toEqual(from);
    expect(bezier(from, c, to, 1)).toEqual(to);
  });

  it('tilts with the motion, within bounds', () => {
    expect(tiltFor(0, -2)).toBe(-2);
    expect(tiltFor(100_000, -2)).toBe(5);
    expect(tiltFor(-100_000, -2)).toBe(-9);
  });
});

describe('drop reports', () => {
  it('accepts valid reports from the YT view', () => {
    expect(toPlaylistDropReport({ result: 'added', playlist: ' Chill ' })).toEqual({
      result: 'added',
      playlist: 'Chill',
    });
    expect(
      toPlaylistDropReport({
        result: 'duplicate',
        playlist: 'Chill',
        track: { playlistId: 'PLabc', videoId: 'XnZ-GLMo8G8' },
      }),
    ).toEqual({
      result: 'duplicate',
      playlist: 'Chill',
      track: { playlistId: 'PLabc', videoId: 'XnZ-GLMo8G8' },
    });
  });

  it('rejects broken ones and keeps "add anyway" for duplicates only', () => {
    expect(toPlaylistDropReport({ result: 'deleted' })).toBeNull();
    expect(toPlaylistDropReport(null)).toBeNull();
    expect(
      toPlaylistDropReport({
        result: 'added',
        track: { playlistId: 'PLabc', videoId: 'XnZ-GLMo8G8' },
      }),
    ).toEqual({ result: 'added' });
    expect(toPlaylistTrack({ playlistId: 'PL abc', videoId: 'XnZ-GLMo8G8' })).toBeNull();
    expect(toPlaylistTrack({ playlistId: 'PLabc', videoId: 'short' })).toBeNull();
  });

  it('words the title bar hint', () => {
    expect(playlistDropText({ result: 'added', playlist: 'Chill' })).toBe('Zu „Chill“ hinzugefügt');
    expect(playlistDropText({ result: 'duplicate', playlist: 'Chill' })).toBe('Schon in „Chill“');
    expect(playlistDropText({ result: 'error', playlist: 'Chill' })).toBe(
      'Konnte nicht zu „Chill“ hinzugefügt werden',
    );
    expect(playlistDropText({ result: 'added', playlist: 'x'.repeat(50) })).toBe(
      `Zu „${'x'.repeat(31)}…“ hinzugefügt`,
    );
  });
});
