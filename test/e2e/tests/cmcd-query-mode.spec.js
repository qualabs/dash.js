import { test, expect } from '@playwright/test';
import { CmcdRequestCollector } from '../helpers/request-collector.js';
import { setupPlayer, waitForPlayback } from '../helpers/player-setup.js';
import { DEFAULT_CMCD_V2_CONFIG, VOD_STREAM, TIMEOUTS } from '../helpers/constants.js';
import { validateCmcd } from '@svta/cml-cmcd';

test.describe('CMCD Query Mode', () => {
    let collector;

    test.beforeEach(async ({ page }) => {
        collector = new CmcdRequestCollector();
        await collector.attach(page);
    });

    test('manifest requests carry CMCD query params with v=2, ot, sid, cid', async ({ page }) => {
        await setupPlayer(page, {
            sourceUrl: VOD_STREAM,
            cmcd: { ...DEFAULT_CMCD_V2_CONFIG, mode: 'query' }
        });

        await collector.waitForRequests('query', 3, TIMEOUTS.REQUEST_COLLECTION);

        const manifests = collector.getQueryManifestRequests();
        expect(manifests.length).toBeGreaterThan(0);

        const cmcd = manifests[0].cmcd;
        expect(cmcd.v).toBe(2);
        expect(cmcd.ot).toBeDefined();
        expect(cmcd.sid).toBe('test-session-id');
        expect(cmcd.cid).toBe('test-content-id');
    });

    test('init segment requests carry CMCD query params with ot, sid, cid, v=2', async ({ page }) => {
        await setupPlayer(page, {
            sourceUrl: VOD_STREAM,
            cmcd: { ...DEFAULT_CMCD_V2_CONFIG, mode: 'query' }
        });

        await collector.waitForRequests('query', 3, TIMEOUTS.REQUEST_COLLECTION);

        const initSegments = collector.getQueryInitSegmentRequests();
        expect(initSegments.length).toBeGreaterThan(0);

        const cmcd = initSegments[0].cmcd;
        expect(cmcd.ot).toBeDefined();
        expect(cmcd.sid).toBe('test-session-id');
        expect(cmcd.cid).toBe('test-content-id');
    });

    test('sn increments across successive requests', async ({ page }) => {
        await setupPlayer(page, {
            sourceUrl: VOD_STREAM,
            cmcd: { ...DEFAULT_CMCD_V2_CONFIG, mode: 'query' }
        });

        await collector.waitForRequests('query', 3, TIMEOUTS.REQUEST_COLLECTION);

        // All CMCD-bearing requests should have incrementing sn
        const withSn = collector.queryRequests.filter(r => r.cmcd.sn !== undefined);
        expect(withSn.length).toBeGreaterThanOrEqual(2);

        for (let i = 1; i < withSn.length; i++) {
            expect(withSn[i].cmcd.sn).toBeGreaterThan(withSn[i - 1].cmcd.sn);
        }
    });

    test('sf is d (DASH)', async ({ page }) => {
        await setupPlayer(page, {
            sourceUrl: VOD_STREAM,
            cmcd: { ...DEFAULT_CMCD_V2_CONFIG, mode: 'query' }
        });

        await collector.waitForRequests('query', 3, TIMEOUTS.REQUEST_COLLECTION);

        const withSf = collector.queryRequests.filter(r => r.cmcd.sf !== undefined);
        expect(withSf.length).toBeGreaterThan(0);

        for (const req of withSf) {
            expect(req.cmcd.sf).toBe('d');
        }
    });

    test('st is v for VOD', async ({ page }) => {
        await setupPlayer(page, {
            sourceUrl: VOD_STREAM,
            cmcd: { ...DEFAULT_CMCD_V2_CONFIG, mode: 'query' }
        });

        await collector.waitForRequests('query', 3, TIMEOUTS.REQUEST_COLLECTION);

        const withSt = collector.queryRequests.filter(r => r.cmcd.st !== undefined);
        expect(withSt.length).toBeGreaterThan(0);

        for (const req of withSt) {
            expect(req.cmcd.st).toBe('v');
        }
    });

    test('CMCD query payloads pass spec validation', async ({ page }) => {
        await setupPlayer(page, {
            sourceUrl: VOD_STREAM,
            cmcd: { ...DEFAULT_CMCD_V2_CONFIG, mode: 'query' }
        });

        await collector.waitForRequests('query', 3, TIMEOUTS.REQUEST_COLLECTION);

        expect(collector.queryRequests.length).toBeGreaterThan(0);

        for (const req of collector.queryRequests) {
            const result = validateCmcd(req.cmcd, { version: 2, reportingMode: 'request' });
            expect(
                result.valid,
                `CMCD validation failed for ${req.url}:\n${result.issues.map(i => `  [${i.severity}] ${i.key ? i.key + ': ' : ''}${i.message}`).join('\n')}`
            ).toBeTruthy();
        }
    });
});
