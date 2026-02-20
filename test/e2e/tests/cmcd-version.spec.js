import { test, expect } from '@playwright/test';
import { CmcdRequestCollector } from '../helpers/request-collector.js';
import { setupPlayer } from '../helpers/player-setup.js';
import { DEFAULT_CMCD_V2_CONFIG, VOD_STREAM, TIMEOUTS } from '../helpers/constants.js';
import { validateCmcd } from '@svta/cml-cmcd';

test.describe('CMCD Version', () => {
    let collector;

    test.beforeEach(async ({ page }) => {
        collector = new CmcdRequestCollector();
        await collector.attach(page);
    });

    test('v=2 present in query mode payloads', async ({ page }) => {
        await setupPlayer(page, {
            sourceUrl: VOD_STREAM,
            cmcd: { ...DEFAULT_CMCD_V2_CONFIG, mode: 'query' }
        });

        await collector.waitForRequests('query', 3, TIMEOUTS.REQUEST_COLLECTION);

        expect(collector.queryRequests.length).toBeGreaterThan(0);

        // Check manifest request specifically (always has CMCD in query mode)
        const manifests = collector.getQueryManifestRequests();
        expect(manifests.length).toBeGreaterThan(0);
        expect(manifests[0].cmcd.v).toBe(2);

        // Full spec validation
        const result = validateCmcd(manifests[0].cmcd, { version: 2, reportingMode: 'request' });
        expect(
            result.valid,
            `CMCD v2 query validation failed:\n${result.issues.map(i => `  [${i.severity}] ${i.key ? i.key + ': ' : ''}${i.message}`).join('\n')}`
        ).toBeTruthy();
    });

    test('v=2 present in header mode payloads', async ({ page }) => {
        await setupPlayer(page, {
            sourceUrl: VOD_STREAM,
            cmcd: { ...DEFAULT_CMCD_V2_CONFIG, mode: 'header' }
        });

        await collector.waitForRequests('header', 3, TIMEOUTS.REQUEST_COLLECTION);

        expect(collector.headerRequests.length).toBeGreaterThan(0);

        // Check manifest request specifically
        const manifests = collector.getHeaderManifestRequests();
        expect(manifests.length).toBeGreaterThan(0);
        expect(manifests[0].cmcd.v).toBe(2);

        // Full spec validation
        const result = validateCmcd(manifests[0].cmcd, { version: 2, reportingMode: 'request' });
        expect(
            result.valid,
            `CMCD v2 header validation failed:\n${result.issues.map(i => `  [${i.severity}] ${i.key ? i.key + ': ' : ''}${i.message}`).join('\n')}`
        ).toBeTruthy();
    });

    test('v absent or 1 in v1 mode (regression)', async ({ page }) => {
        await setupPlayer(page, {
            sourceUrl: VOD_STREAM,
            cmcd: {
                version: 1,
                enabled: true,
                sid: 'test-session-id',
                cid: 'test-content-id',
                mode: 'query',
                enabledKeys: ['br', 'd', 'ot', 'tb', 'bl', 'dl', 'mtp', 'su', 'bs', 'rtp', 'cid', 'pr', 'sf', 'sid', 'st', 'v'],
            }
        });

        await collector.waitForRequests('query', 1, TIMEOUTS.REQUEST_COLLECTION);

        expect(collector.queryRequests.length).toBeGreaterThan(0);

        for (const req of collector.queryRequests) {
            // In v1, the v key should be absent (omitted when 1) or explicitly 1
            expect(req.cmcd.v === undefined || req.cmcd.v === 1).toBeTruthy();
        }
    });
});
