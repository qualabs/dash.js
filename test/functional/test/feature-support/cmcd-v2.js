import Constants from '../../src/Constants.js';
import Utils from '../../src/Utils.js';
import {
    checkIsPlaying,
    checkIsProgressing,
    checkNoCriticalErrors,
    initializeDashJsAdapter,
} from '../common/common.js';
import { expect } from 'chai';
import CmcdRequestCollector from '../../helpers/CmcdRequestCollector.js';
import { validateCmcd, validateCmcdHeaders, validateCmcdEvent, validateCmcdKeys } from '@svta/cml-cmcd';

const TESTCASE = Constants.TESTCASES.FEATURE_SUPPORT.CMCD_V2;

const EVENT_TARGET_BASE = 'http://localhost:19876/cmcd/event';

const DEFAULT_CMCD_V2_CONFIG = {
    version: 2,
    enabled: true,
    sid: 'test-session-id',
    cid: 'test-content-id',
    mode: 'query',
    enabledKeys: [
        'br', 'd', 'ot', 'tb', 'bl', 'dl', 'mtp', 'nor', 'nrr',
        'su', 'bs', 'rtp', 'cid', 'pr', 'sf', 'sid', 'st', 'v', 'msd', 'sn',
    ],
};

const TIMEOUTS = {
    REQUEST_COLLECTION: 15000,
    PLAYBACK_DURATION: 5000,
};

Utils.getTestvectorsForTestcase(TESTCASE).forEach((item) => {
    const mpd = item.url;

    // ─── CMCD Query Mode ────────────────────────────────────────────────

    describe(`CMCD V2 Query Mode - ${item.name} - ${mpd}`, () => {
        let playerAdapter;
        let collector;

        before(() => {
            collector = new CmcdRequestCollector();
            collector.attach();
            const settings = {
                streaming: {
                    cmcd: { ...DEFAULT_CMCD_V2_CONFIG, mode: 'query' },
                },
            };
            playerAdapter = initializeDashJsAdapter(item, mpd, settings);
        });

        after(() => {
            collector.detach();
            if (playerAdapter) {
                playerAdapter.destroy();
            }
        });

        it('Checking playing state', async () => {
            await checkIsPlaying(playerAdapter, true);
        });

        it('Checking progressing state', async () => {
            await checkIsProgressing(playerAdapter);
        });

        it('Manifest requests carry CMCD query params with v=2, ot, sid, cid', async () => {
            await collector.waitForRequests('query', 3, TIMEOUTS.REQUEST_COLLECTION);

            const manifests = collector.getQueryManifestRequests();
            expect(manifests.length).to.be.greaterThan(0);

            const cmcd = manifests[0].cmcd;
            expect(cmcd.v).to.equal(2);
            expect(cmcd.ot).to.not.be.undefined;
            expect(cmcd.sid).to.equal('test-session-id');
            expect(cmcd.cid).to.equal('test-content-id');
        });

        it('Init segment requests carry CMCD query params with ot, sid, cid, v=2', async () => {
            await collector.waitForRequests('query', 3, TIMEOUTS.REQUEST_COLLECTION);

            const initSegments = collector.getQueryInitSegmentRequests();
            expect(initSegments.length).to.be.greaterThan(0);

            const cmcd = initSegments[0].cmcd;
            expect(cmcd.ot).to.not.be.undefined;
            expect(cmcd.sid).to.equal('test-session-id');
            expect(cmcd.cid).to.equal('test-content-id');
        });

        it('sn increments across successive requests', async () => {
            await collector.waitForRequests('query', 3, TIMEOUTS.REQUEST_COLLECTION);

            const withSn = collector.queryRequests.filter((r) => r.cmcd.sn !== undefined);
            expect(withSn.length).to.be.at.least(2);

            for (let i = 1; i < withSn.length; i++) {
                expect(withSn[i].cmcd.sn).to.be.greaterThan(withSn[i - 1].cmcd.sn);
            }
        });

        it('sf is d (DASH)', async () => {
            await collector.waitForRequests('query', 3, TIMEOUTS.REQUEST_COLLECTION);

            const withSf = collector.queryRequests.filter((r) => r.cmcd.sf !== undefined);
            expect(withSf.length).to.be.greaterThan(0);

            for (const req of withSf) {
                expect(req.cmcd.sf).to.equal('d');
            }
        });

        it('st is v for VOD', async () => {
            await collector.waitForRequests('query', 3, TIMEOUTS.REQUEST_COLLECTION);

            const withSt = collector.queryRequests.filter((r) => r.cmcd.st !== undefined);
            expect(withSt.length).to.be.greaterThan(0);

            for (const req of withSt) {
                expect(req.cmcd.st).to.equal('v');
            }
        });

        it('CMCD query payloads pass spec validation', async () => {
            await collector.waitForRequests('query', 3, TIMEOUTS.REQUEST_COLLECTION);

            expect(collector.queryRequests.length).to.be.greaterThan(0);

            for (const req of collector.queryRequests) {
                const result = validateCmcd(req.cmcd, { version: 2, reportingMode: 'request' });
                expect(
                    result.valid,
                    `CMCD validation failed for ${req.url}:\n${result.issues.map((i) => `  [${i.severity}] ${i.key ? i.key + ': ' : ''}${i.message}`).join('\n')}`
                ).to.be.true;
            }
        });

        it('Expect no critical errors to be thrown', () => {
            checkNoCriticalErrors(playerAdapter);
        });
    });

    // ─── CMCD Header Mode ───────────────────────────────────────────────

    describe(`CMCD V2 Header Mode - ${item.name} - ${mpd}`, () => {
        let playerAdapter;
        let collector;

        before(() => {
            collector = new CmcdRequestCollector();
            collector.attach();
            const settings = {
                streaming: {
                    cmcd: { ...DEFAULT_CMCD_V2_CONFIG, mode: 'header' },
                },
            };
            playerAdapter = initializeDashJsAdapter(item, mpd, settings);
        });

        after(() => {
            collector.detach();
            if (playerAdapter) {
                playerAdapter.destroy();
            }
        });

        it('Checking playing state', async () => {
            await checkIsPlaying(playerAdapter, true);
        });

        it('CMCD headers present on manifest requests with v=2', async () => {
            await collector.waitForRequests('header', 3, TIMEOUTS.REQUEST_COLLECTION);

            const manifests = collector.getHeaderManifestRequests();
            expect(manifests.length).to.be.greaterThan(0);

            const cmcd = manifests[0].cmcd;
            expect(cmcd.v).to.equal(2);

            const headers = manifests[0].headers;
            expect(Object.keys(headers).length).to.be.greaterThan(0);

            const result = validateCmcd(cmcd, { version: 2, reportingMode: 'request' });
            expect(
                result.valid,
                `CMCD spec validation failed:\n${result.issues.map((i) => `  [${i.severity}] ${i.key ? i.key + ': ' : ''}${i.message}`).join('\n')}`
            ).to.be.true;
        });

        it('CMCD headers present on init segment requests', async () => {
            await collector.waitForRequests('header', 3, TIMEOUTS.REQUEST_COLLECTION);

            const initSegments = collector.getHeaderInitSegmentRequests();
            expect(initSegments.length).to.be.greaterThan(0);

            const cmcd = initSegments[0].cmcd;
            expect(cmcd.ot).to.not.be.undefined;
            expect(cmcd.sid).to.equal('test-session-id');
        });

        it('Keys distributed across correct header shards (validateCmcdHeaders)', async () => {
            await collector.waitForRequests('header', 3, TIMEOUTS.REQUEST_COLLECTION);

            expect(collector.headerRequests.length).to.be.greaterThan(0);

            for (const req of collector.headerRequests) {
                const result = validateCmcdHeaders(req.headers, { version: 2 });
                expect(
                    result.valid,
                    `CMCD header validation failed for ${req.url}:\n${result.issues.map((i) => `  [${i.severity}] ${i.key ? i.key + ': ' : ''}${i.message}`).join('\n')}`
                ).to.be.true;
            }
        });

        it('No CMCD= query params when in header mode', async () => {
            await collector.waitForRequests('header', 3, TIMEOUTS.REQUEST_COLLECTION);

            expect(collector.queryRequests.length).to.equal(0);
            expect(collector.headerRequests.length).to.be.greaterThan(0);
        });

        it('Expect no critical errors to be thrown', () => {
            checkNoCriticalErrors(playerAdapter);
        });
    });

    // ─── CMCD Event Mode ────────────────────────────────────────────────

    describe(`CMCD V2 Event Mode - ${item.name} - ${mpd}`, () => {

        describe('Response-received events (e=rr)', () => {
            let playerAdapter;
            let collector;

            before(function () {
                this.timeout(60000);
                const targetUrl = `${EVENT_TARGET_BASE}/rr`;
                collector = new CmcdRequestCollector();
                collector.attach({ eventTargetUrls: [targetUrl] });
                const settings = {
                    streaming: {
                        cmcd: {
                            ...DEFAULT_CMCD_V2_CONFIG,
                            mode: 'query',
                            targets: [
                                {
                                    enabled: true,
                                    url: targetUrl,
                                    enabledKeys: ['url', 'rc', 'msd', 'e', 'ts', 'sn'],
                                    includeOnRequests: ['mpd', 'segment'],
                                    events: ['rr'],
                                },
                            ],
                        },
                    },
                };
                playerAdapter = initializeDashJsAdapter(item, mpd, settings);
            });

            after(() => {
                collector.detach();
                if (playerAdapter) {
                    playerAdapter.destroy();
                }
            });

            it('Checking playing state', async () => {
                await checkIsPlaying(playerAdapter, true);
            });

            it('POST to configured target with e=rr', async function () {
                this.timeout(30000);
                await collector.waitForRequests('event', 2, TIMEOUTS.REQUEST_COLLECTION);

                const posts = collector.eventPosts;
                expect(posts.length).to.be.at.least(1);

                const rrPosts = posts.filter((p) => p.cmcd && p.cmcd.e === 'rr');
                expect(rrPosts.length).to.be.at.least(1);
            });
        });

        describe('Play-state events (e=ps)', () => {
            let playerAdapter;
            let collector;

            before(function () {
                this.timeout(60000);
                const targetUrl = `${EVENT_TARGET_BASE}/ps`;
                collector = new CmcdRequestCollector();
                collector.attach({ eventTargetUrls: [targetUrl] });
                const settings = {
                    streaming: {
                        cmcd: {
                            ...DEFAULT_CMCD_V2_CONFIG,
                            mode: 'query',
                            targets: [
                                {
                                    enabled: true,
                                    url: targetUrl,
                                    enabledKeys: ['e', 'sta', 'msd', 'ts', 'sn'],
                                    events: ['ps'],
                                },
                            ],
                        },
                    },
                };
                playerAdapter = initializeDashJsAdapter(item, mpd, settings);
            });

            after(() => {
                collector.detach();
                if (playerAdapter) {
                    playerAdapter.destroy();
                }
            });

            it('Checking playing state', async () => {
                await checkIsPlaying(playerAdapter, true);
            });

            it('POST on state changes with sta defined', async function () {
                this.timeout(30000);
                await collector.waitForRequests('event', 1, TIMEOUTS.REQUEST_COLLECTION);

                const posts = collector.eventPosts;
                expect(posts.length).to.be.at.least(1);

                const psPosts = posts.filter((p) => p.cmcd && p.cmcd.e === 'ps');
                expect(psPosts.length).to.be.at.least(1);

                for (const post of psPosts) {
                    expect(post.cmcd.sta).to.not.be.undefined;

                    if (post.body) {
                        const result = validateCmcdEvent(post.body, { version: 2 });
                        expect(
                            result.valid,
                            `Play-state event validation failed:\n${result.issues.map((i) => `  [${i.severity}] ${i.key ? i.key + ': ' : ''}${i.message}`).join('\n')}`
                        ).to.be.true;
                    }
                }
            });
        });

        describe('Time interval events', () => {
            let playerAdapter;
            let collector;

            before(function () {
                this.timeout(90000);
                const targetUrl = `${EVENT_TARGET_BASE}/ti`;
                collector = new CmcdRequestCollector();
                collector.attach({ eventTargetUrls: [targetUrl] });
                const settings = {
                    streaming: {
                        cmcd: {
                            ...DEFAULT_CMCD_V2_CONFIG,
                            mode: 'query',
                            targets: [
                                {
                                    enabled: true,
                                    url: targetUrl,
                                    enabledKeys: ['e', 'ts', 'sn'],
                                    events: ['t'],
                                    timeInterval: 3,
                                },
                            ],
                        },
                    },
                };
                playerAdapter = initializeDashJsAdapter(item, mpd, settings);
            });

            after(() => {
                collector.detach();
                if (playerAdapter) {
                    playerAdapter.destroy();
                }
            });

            it('Checking playing state', async () => {
                await checkIsPlaying(playerAdapter, true);
            });

            it('Fire periodically', async function () {
                this.timeout(60000);
                // Wait long enough for at least 2 time interval events (3s interval)
                await playerAdapter.sleep(8000);
                await collector.waitForRequests('event', 2, 20000);

                const tiPosts = collector.eventPosts.filter((p) => p.cmcd && p.cmcd.e === 't');
                expect(tiPosts.length).to.be.at.least(2);
            });
        });

        describe('POST format and validation', () => {
            let playerAdapter;
            let collector;

            before(function () {
                this.timeout(60000);
                const targetUrl = `${EVENT_TARGET_BASE}/all`;
                collector = new CmcdRequestCollector();
                collector.attach({ eventTargetUrls: [targetUrl] });
                const settings = {
                    streaming: {
                        cmcd: {
                            ...DEFAULT_CMCD_V2_CONFIG,
                            mode: 'query',
                            targets: [
                                {
                                    enabled: true,
                                    url: targetUrl,
                                    enabledKeys: ['e', 'ts', 'sn', 'sta', 'url', 'rc'],
                                    events: ['ps', 'rr'],
                                    includeOnRequests: ['mpd', 'segment'],
                                },
                            ],
                        },
                    },
                };
                playerAdapter = initializeDashJsAdapter(item, mpd, settings);
            });

            after(() => {
                collector.detach();
                if (playerAdapter) {
                    playerAdapter.destroy();
                }
            });

            it('Checking playing state', async () => {
                await checkIsPlaying(playerAdapter, true);
            });

            it('POST content type is text/cmcd', async function () {
                this.timeout(30000);
                await collector.waitForRequests('event', 1, TIMEOUTS.REQUEST_COLLECTION);

                const posts = collector.eventPosts;
                expect(posts.length).to.be.at.least(1);

                for (const post of posts) {
                    expect(post.contentType).to.include('text/cmcd');
                }
            });

            it('POST bodies pass CMCD event spec validation', async function () {
                this.timeout(30000);
                await collector.waitForRequests('event', 1, TIMEOUTS.REQUEST_COLLECTION);

                const posts = collector.eventPosts;
                expect(posts.length).to.be.at.least(1);

                for (const post of posts) {
                    if (post.body) {
                        const result = validateCmcdEvent(post.body, { version: 2 });
                        expect(
                            result.valid,
                            `CMCD event validation failed for POST to ${post.url}:\n${result.issues.map((i) => `  [${i.severity}] ${i.key ? i.key + ': ' : ''}${i.message}`).join('\n')}`
                        ).to.be.true;
                    }
                }
            });

            it('sn increments across event POSTs', async function () {
                this.timeout(30000);
                await collector.waitForRequests('event', 3, TIMEOUTS.REQUEST_COLLECTION);

                const posts = collector.eventPosts.filter((p) => p.cmcd && p.cmcd.sn !== undefined);
                expect(posts.length).to.be.at.least(2);

                for (let i = 1; i < posts.length; i++) {
                    expect(posts[i].cmcd.sn).to.be.greaterThan(posts[i - 1].cmcd.sn);
                }
            });
        });
    });

    // ─── CMCD Key Filtering ─────────────────────────────────────────────

    describe(`CMCD V2 Key Filtering - ${item.name} - ${mpd}`, () => {

        describe('Only configured enabledKeys appear', () => {
            let playerAdapter;
            let collector;
            const enabledKeys = ['ot', 'sid', 'v', 'sn'];

            before(() => {
                collector = new CmcdRequestCollector();
                collector.attach();
                const settings = {
                    streaming: {
                        cmcd: {
                            ...DEFAULT_CMCD_V2_CONFIG,
                            mode: 'query',
                            enabledKeys,
                        },
                    },
                };
                playerAdapter = initializeDashJsAdapter(item, mpd, settings);
            });

            after(() => {
                collector.detach();
                if (playerAdapter) {
                    playerAdapter.destroy();
                }
            });

            it('Checking playing state', async () => {
                await checkIsPlaying(playerAdapter, true);
            });

            it('Only configured keys appear in query mode', async () => {
                await collector.waitForRequests('query', 3, TIMEOUTS.REQUEST_COLLECTION);

                expect(collector.queryRequests.length).to.be.greaterThan(0);

                for (const req of collector.queryRequests) {
                    const keys = Object.keys(req.cmcd);
                    for (const key of keys) {
                        expect(
                            enabledKeys.includes(key),
                            `Unexpected key "${key}" found. Expected only: ${enabledKeys.join(', ')}`
                        ).to.be.true;
                    }
                }
            });
        });

        describe('Empty enabledKeys produces no CMCD data', () => {
            let playerAdapter;
            let collector;

            before(() => {
                collector = new CmcdRequestCollector();
                collector.attach();
                const settings = {
                    streaming: {
                        cmcd: {
                            ...DEFAULT_CMCD_V2_CONFIG,
                            mode: 'query',
                            enabledKeys: [],
                        },
                    },
                };
                playerAdapter = initializeDashJsAdapter(item, mpd, settings);
            });

            after(() => {
                collector.detach();
                if (playerAdapter) {
                    playerAdapter.destroy();
                }
            });

            it('Checking playing state', async () => {
                await checkIsPlaying(playerAdapter, true);
            });

            it('No CMCD data appended to requests', async () => {
                await playerAdapter.sleep(5000);
                expect(collector.queryRequests.length).to.equal(0);
            });
        });

        describe('All default keys appear when no filter is set', () => {
            let playerAdapter;
            let collector;

            before(() => {
                collector = new CmcdRequestCollector();
                collector.attach();
                const settings = {
                    streaming: {
                        cmcd: {
                            ...DEFAULT_CMCD_V2_CONFIG,
                            mode: 'query',
                        },
                    },
                };
                playerAdapter = initializeDashJsAdapter(item, mpd, settings);
            });

            after(() => {
                collector.detach();
                if (playerAdapter) {
                    playerAdapter.destroy();
                }
            });

            it('Checking playing state', async () => {
                await checkIsPlaying(playerAdapter, true);
            });

            it('Core keys appear across requests', async () => {
                await collector.waitForRequests('query', 3, TIMEOUTS.REQUEST_COLLECTION);

                const allSeenKeys = new Set();
                for (const req of collector.queryRequests) {
                    for (const key of Object.keys(req.cmcd)) {
                        allSeenKeys.add(key);
                    }
                }

                const expectedKeys = ['ot', 'sid', 'v'];
                for (const key of expectedKeys) {
                    expect(
                        allSeenKeys.has(key),
                        `Expected key "${key}" to appear in at least one request`
                    ).to.be.true;
                }
            });

            it('All keys are recognized CMCD keys', async () => {
                await collector.waitForRequests('query', 3, TIMEOUTS.REQUEST_COLLECTION);

                for (const req of collector.queryRequests) {
                    const result = validateCmcdKeys(req.cmcd, { version: 2 });
                    expect(
                        result.valid,
                        `Unrecognized keys found:\n${result.issues.map((i) => `  [${i.severity}] ${i.key ? i.key + ': ' : ''}${i.message}`).join('\n')}`
                    ).to.be.true;
                }
            });
        });
    });

    // ─── CMCD Version ───────────────────────────────────────────────────

    describe(`CMCD V2 Version - ${item.name} - ${mpd}`, () => {

        describe('v=2 in query mode', () => {
            let playerAdapter;
            let collector;

            before(() => {
                collector = new CmcdRequestCollector();
                collector.attach();
                const settings = {
                    streaming: {
                        cmcd: { ...DEFAULT_CMCD_V2_CONFIG, mode: 'query' },
                    },
                };
                playerAdapter = initializeDashJsAdapter(item, mpd, settings);
            });

            after(() => {
                collector.detach();
                if (playerAdapter) {
                    playerAdapter.destroy();
                }
            });

            it('Checking playing state', async () => {
                await checkIsPlaying(playerAdapter, true);
            });

            it('v=2 present in query mode payloads', async () => {
                await collector.waitForRequests('query', 3, TIMEOUTS.REQUEST_COLLECTION);

                expect(collector.queryRequests.length).to.be.greaterThan(0);

                const manifests = collector.getQueryManifestRequests();
                expect(manifests.length).to.be.greaterThan(0);
                expect(manifests[0].cmcd.v).to.equal(2);

                const result = validateCmcd(manifests[0].cmcd, { version: 2, reportingMode: 'request' });
                expect(
                    result.valid,
                    `CMCD v2 query validation failed:\n${result.issues.map((i) => `  [${i.severity}] ${i.key ? i.key + ': ' : ''}${i.message}`).join('\n')}`
                ).to.be.true;
            });
        });

        describe('v=2 in header mode', () => {
            let playerAdapter;
            let collector;

            before(() => {
                collector = new CmcdRequestCollector();
                collector.attach();
                const settings = {
                    streaming: {
                        cmcd: { ...DEFAULT_CMCD_V2_CONFIG, mode: 'header' },
                    },
                };
                playerAdapter = initializeDashJsAdapter(item, mpd, settings);
            });

            after(() => {
                collector.detach();
                if (playerAdapter) {
                    playerAdapter.destroy();
                }
            });

            it('Checking playing state', async () => {
                await checkIsPlaying(playerAdapter, true);
            });

            it('v=2 present in header mode payloads', async () => {
                await collector.waitForRequests('header', 3, TIMEOUTS.REQUEST_COLLECTION);

                expect(collector.headerRequests.length).to.be.greaterThan(0);

                const manifests = collector.getHeaderManifestRequests();
                expect(manifests.length).to.be.greaterThan(0);
                expect(manifests[0].cmcd.v).to.equal(2);

                const result = validateCmcd(manifests[0].cmcd, { version: 2, reportingMode: 'request' });
                expect(
                    result.valid,
                    `CMCD v2 header validation failed:\n${result.issues.map((i) => `  [${i.severity}] ${i.key ? i.key + ': ' : ''}${i.message}`).join('\n')}`
                ).to.be.true;
            });
        });

        describe('v1 regression', () => {
            let playerAdapter;
            let collector;

            before(() => {
                collector = new CmcdRequestCollector();
                collector.attach();
                const settings = {
                    streaming: {
                        cmcd: {
                            version: 1,
                            enabled: true,
                            sid: 'test-session-id',
                            cid: 'test-content-id',
                            mode: 'query',
                            enabledKeys: [
                                'br', 'd', 'ot', 'tb', 'bl', 'dl', 'mtp',
                                'su', 'bs', 'rtp', 'cid', 'pr', 'sf', 'sid', 'st', 'v',
                            ],
                        },
                    },
                };
                playerAdapter = initializeDashJsAdapter(item, mpd, settings);
            });

            after(() => {
                collector.detach();
                if (playerAdapter) {
                    playerAdapter.destroy();
                }
            });

            it('Checking playing state', async () => {
                await checkIsPlaying(playerAdapter, true);
            });

            it('v absent or 1 in v1 mode', async () => {
                await collector.waitForRequests('query', 1, TIMEOUTS.REQUEST_COLLECTION);

                expect(collector.queryRequests.length).to.be.greaterThan(0);

                for (const req of collector.queryRequests) {
                    expect(
                        req.cmcd.v === undefined || req.cmcd.v === 1,
                        `Expected v to be undefined or 1, got ${req.cmcd.v}`
                    ).to.be.true;
                }
            });
        });
    });
});
