import { test, expect } from '@playwright/test';
import { CmcdRequestCollector } from '../helpers/request-collector.js';
import { setupPlayer, waitForPlayback } from '../helpers/player-setup.js';
import { DEFAULT_CMCD_V2_CONFIG, VOD_STREAM, TIMEOUTS } from '../helpers/constants.js';
import { validateCmcd, validateCmcdHeaders } from '@svta/cml-cmcd';

const HEADER_CONFIG = {
    ...DEFAULT_CMCD_V2_CONFIG,
    mode: 'header',
};

test.describe('CMCD Header Mode', () => {
    let collector;

    test.beforeEach(async ({ page }) => {
        collector = new CmcdRequestCollector();
        await collector.attach(page);
    });

    test('CMCD headers present on manifest requests with v=2', async ({ page }) => {
        await setupPlayer(page, {
            sourceUrl: VOD_STREAM,
            cmcd: HEADER_CONFIG,
        });

        await collector.waitForRequests('header', 3, TIMEOUTS.REQUEST_COLLECTION);

        const manifests = collector.getHeaderManifestRequests();
        expect(manifests.length).toBeGreaterThan(0);

        const cmcd = manifests[0].cmcd;
        expect(cmcd.v).toBe(2);

        const headers = manifests[0].headers;
        const headerCount = Object.keys(headers).length;
        expect(headerCount).toBeGreaterThan(0);

        // Validate payload against CMCD spec
        const result = validateCmcd(cmcd, { version: 2, reportingMode: 'request' });
        expect(
            result.valid,
            `CMCD spec validation failed:\n${result.issues.map(i => `  [${i.severity}] ${i.key ? i.key + ': ' : ''}${i.message}`).join('\n')}`
        ).toBeTruthy();
    });

    test('CMCD headers present on init segment requests', async ({ page }) => {
        await setupPlayer(page, {
            sourceUrl: VOD_STREAM,
            cmcd: HEADER_CONFIG,
        });

        await collector.waitForRequests('header', 3, TIMEOUTS.REQUEST_COLLECTION);

        const initSegments = collector.getHeaderInitSegmentRequests();
        expect(initSegments.length).toBeGreaterThan(0);

        const cmcd = initSegments[0].cmcd;
        expect(cmcd.ot).toBeDefined();
        expect(cmcd.sid).toBe('test-session-id');
    });

    test('keys distributed across correct header shards (validateCmcdHeaders)', async ({ page }) => {
        await setupPlayer(page, {
            sourceUrl: VOD_STREAM,
            cmcd: HEADER_CONFIG,
        });

        await collector.waitForRequests('header', 3, TIMEOUTS.REQUEST_COLLECTION);

        expect(collector.headerRequests.length).toBeGreaterThan(0);

        for (const req of collector.headerRequests) {
            const result = validateCmcdHeaders(req.headers, { version: 2 });
            expect(
                result.valid,
                `CMCD header validation failed for ${req.url}:\n${result.issues.map(i => `  [${i.severity}] ${i.key ? i.key + ': ' : ''}${i.message}`).join('\n')}`
            ).toBeTruthy();
        }
    });

    test('no CMCD= query params when in header mode', async ({ page }) => {
        await setupPlayer(page, {
            sourceUrl: VOD_STREAM,
            cmcd: HEADER_CONFIG,
        });

        await collector.waitForRequests('header', 3, TIMEOUTS.REQUEST_COLLECTION);

        // Verify no query-mode CMCD data was captured
        expect(collector.queryRequests.length).toBe(0);

        // Also verify header requests were captured
        expect(collector.headerRequests.length).toBeGreaterThan(0);
    });
});
