import { test, expect } from '@playwright/test';
import { CmcdRequestCollector } from '../helpers/request-collector.js';
import { setupPlayer, waitForPlayback } from '../helpers/player-setup.js';
import { DEFAULT_CMCD_V2_CONFIG, VOD_STREAM, EVENT_TARGET_BASE, TIMEOUTS } from '../helpers/constants.js';
import { validateCmcdEvent } from '@svta/cml-cmcd';

const EVENT_TARGETS = {
    RESPONSE_RECEIVED: `${EVENT_TARGET_BASE}/rr`,
    PLAY_STATE: `${EVENT_TARGET_BASE}/ps`,
    TIME_INTERVAL: `${EVENT_TARGET_BASE}/ti`,
    ALL: `${EVENT_TARGET_BASE}/all`,
};

function makeEventConfig(targets) {
    return {
        ...DEFAULT_CMCD_V2_CONFIG,
        mode: 'query',
        targets,
    };
}

test.describe('CMCD Event Mode', () => {
    let collector;

    test('response-received events (e=rr) POST to configured target', async ({ page }) => {
        const targetUrl = EVENT_TARGETS.RESPONSE_RECEIVED;
        collector = new CmcdRequestCollector();
        await collector.attach(page, {
            eventTargetUrls: [targetUrl],
        });

        await setupPlayer(page, {
            sourceUrl: VOD_STREAM,
            cmcd: makeEventConfig([
                {
                    enabled: true,
                    url: targetUrl,
                    enabledKeys: ['url', 'rc', 'msd', 'e', 'ts', 'sn'],
                    includeOnRequests: ['mpd', 'segment'],
                    events: ['rr'],
                },
            ]),
        });

        await waitForPlayback(page, 3);
        await collector.waitForRequests('event', 2, TIMEOUTS.REQUEST_COLLECTION);

        const posts = collector.eventPosts;
        expect(posts.length).toBeGreaterThanOrEqual(1);

        // At least one event should be a response-received event
        const rrPosts = posts.filter(p => p.cmcd && p.cmcd.e === 'rr');
        expect(rrPosts.length).toBeGreaterThanOrEqual(1);
    });

    test('play state events (e=ps) POST on state changes', async ({ page }) => {
        const targetUrl = EVENT_TARGETS.PLAY_STATE;
        collector = new CmcdRequestCollector();
        await collector.attach(page, {
            eventTargetUrls: [targetUrl],
        });

        await setupPlayer(page, {
            sourceUrl: VOD_STREAM,
            cmcd: makeEventConfig([
                {
                    enabled: true,
                    url: targetUrl,
                    enabledKeys: ['e', 'sta', 'msd', 'ts', 'sn'],
                    events: ['ps'],
                },
            ]),
        });

        await waitForPlayback(page, 3);
        await collector.waitForRequests('event', 1, TIMEOUTS.REQUEST_COLLECTION);

        const posts = collector.eventPosts;
        expect(posts.length).toBeGreaterThanOrEqual(1);

        const psPosts = posts.filter(p => p.cmcd && p.cmcd.e === 'ps');
        expect(psPosts.length).toBeGreaterThanOrEqual(1);

        for (const post of psPosts) {
            expect(post.cmcd.sta).toBeDefined();

            // Validate play-state event against spec
            if (post.body) {
                const result = validateCmcdEvent(post.body, { version: 2 });
                expect(
                    result.valid,
                    `Play-state event validation failed:\n${result.issues.map(i => `  [${i.severity}] ${i.key ? i.key + ': ' : ''}${i.message}`).join('\n')}`
                ).toBeTruthy();
            }
        }
    });

    test('time interval events fire periodically', async ({ page }) => {
        test.setTimeout(90_000);

        const targetUrl = EVENT_TARGETS.TIME_INTERVAL;
        collector = new CmcdRequestCollector();
        await collector.attach(page, {
            eventTargetUrls: [targetUrl],
        });

        await setupPlayer(page, {
            sourceUrl: VOD_STREAM,
            cmcd: makeEventConfig([
                {
                    enabled: true,
                    url: targetUrl,
                    enabledKeys: ['e', 'ts', 'sn'],
                    events: ['t'],
                    timeInterval: 3,
                },
            ]),
        });

        // Wait long enough for at least 2 time interval events (3s interval)
        await waitForPlayback(page, 8);
        await collector.waitForRequests('event', 2, 20_000);

        const tiPosts = collector.eventPosts.filter(p => p.cmcd && p.cmcd.e === 't');
        expect(tiPosts.length).toBeGreaterThanOrEqual(2);
    });

    test('POST content type is text/cmcd', async ({ page }) => {
        const targetUrl = EVENT_TARGETS.ALL;
        collector = new CmcdRequestCollector();
        await collector.attach(page, {
            eventTargetUrls: [targetUrl],
        });

        await setupPlayer(page, {
            sourceUrl: VOD_STREAM,
            cmcd: makeEventConfig([
                {
                    enabled: true,
                    url: targetUrl,
                    enabledKeys: ['e', 'ts', 'sn', 'sta'],
                    events: ['ps', 'rr'],
                    includeOnRequests: ['mpd', 'segment'],
                },
            ]),
        });

        await waitForPlayback(page, 3);
        await collector.waitForRequests('event', 1, TIMEOUTS.REQUEST_COLLECTION);

        const posts = collector.eventPosts;
        expect(posts.length).toBeGreaterThanOrEqual(1);

        for (const post of posts) {
            expect(post.contentType).toContain('text/cmcd');
        }
    });

    test('POST bodies pass CMCD event spec validation', async ({ page }) => {
        const targetUrl = EVENT_TARGETS.RESPONSE_RECEIVED;

        collector = new CmcdRequestCollector();
        await collector.attach(page, {
            eventTargetUrls: [targetUrl],
        });

        await setupPlayer(page, {
            sourceUrl: VOD_STREAM,
            cmcd: makeEventConfig([
                {
                    enabled: true,
                    url: targetUrl,
                    enabledKeys: ['e', 'ts', 'sn', 'rc', 'url'],
                    includeOnRequests: ['mpd', 'segment'],
                    events: ['rr'],
                },
            ]),
        });

        await waitForPlayback(page, 3);
        await collector.waitForRequests('event', 1, TIMEOUTS.REQUEST_COLLECTION);

        const posts = collector.eventPosts;
        expect(posts.length).toBeGreaterThanOrEqual(1);

        for (const post of posts) {
            if (post.body) {
                const result = validateCmcdEvent(post.body, { version: 2 });
                expect(
                    result.valid,
                    `CMCD event validation failed for POST to ${post.url}:\n${result.issues.map(i => `  [${i.severity}] ${i.key ? i.key + ': ' : ''}${i.message}`).join('\n')}`
                ).toBeTruthy();
            }
        }
    });

    test('sn increments across event POSTs', async ({ page }) => {
        const targetUrl = EVENT_TARGETS.RESPONSE_RECEIVED;
        collector = new CmcdRequestCollector();
        await collector.attach(page, {
            eventTargetUrls: [targetUrl],
        });

        await setupPlayer(page, {
            sourceUrl: VOD_STREAM,
            cmcd: makeEventConfig([
                {
                    enabled: true,
                    url: targetUrl,
                    enabledKeys: ['e', 'ts', 'sn', 'url', 'rc'],
                    includeOnRequests: ['mpd', 'segment'],
                    events: ['rr'],
                },
            ]),
        });

        await waitForPlayback(page, TIMEOUTS.PLAYBACK_DURATION);
        await collector.waitForRequests('event', 3, TIMEOUTS.REQUEST_COLLECTION);

        const posts = collector.eventPosts.filter(p => p.cmcd && p.cmcd.sn !== undefined);
        expect(posts.length).toBeGreaterThanOrEqual(2);

        for (let i = 1; i < posts.length; i++) {
            expect(posts[i].cmcd.sn).toBeGreaterThan(posts[i - 1].cmcd.sn);
        }
    });
});
