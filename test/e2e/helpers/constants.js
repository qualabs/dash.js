export const VOD_STREAM = 'https://dash.akamaized.net/akamai/bbb_30fps/bbb_30fps.mpd';
export const LIVE_STREAM = 'https://livesim2.dashif.org/livesim2/testpic_2s/Manifest.mpd';

export const EVENT_TARGET_BASE = 'http://localhost:9999/cmcd/event';

export const DEFAULT_CMCD_V2_CONFIG = {
    version: 2,
    enabled: true,
    sid: 'test-session-id',
    cid: 'test-content-id',
    mode: 'query',
    enabledKeys: [
        'br', 'd', 'ot', 'tb', 'bl', 'dl', 'mtp', 'nor', 'nrr',
        'su', 'bs', 'rtp', 'cid', 'pr', 'sf', 'sid', 'st', 'v', 'msd', 'sn'
    ],
};

export const TIMEOUTS = {
    PLAYBACK_START: 30_000,
    PLAYBACK_DURATION: 5,
    REQUEST_COLLECTION: 15_000,
};
