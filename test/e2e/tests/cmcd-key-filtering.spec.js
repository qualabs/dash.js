import { test, expect } from '@playwright/test';
import { CmcdRequestCollector } from '../helpers/request-collector.js';
import { setupPlayer, waitForPlayback } from '../helpers/player-setup.js';
import { DEFAULT_CMCD_V2_CONFIG, VOD_STREAM, TIMEOUTS } from '../helpers/constants.js';
import { validateCmcdKeys } from '@svta/cml-cmcd';

test.describe('CMCD Key Filtering', () => {
    let collector;

    test.beforeEach(async ({ page }) => {
        collector = new CmcdRequestCollector();
        await collector.attach(page);
    });

    test('only configured enabledKeys appear in query mode', async ({ page }) => {
        const enabledKeys = ['ot', 'sid', 'v', 'sn'];

        await setupPlayer(page, {
            sourceUrl: VOD_STREAM,
            cmcd: {
                ...DEFAULT_CMCD_V2_CONFIG,
                mode: 'query',
                enabledKeys,
            }
        });

        await collector.waitForRequests('query', 3, TIMEOUTS.REQUEST_COLLECTION);

        expect(collector.queryRequests.length).toBeGreaterThan(0);

        for (const req of collector.queryRequests) {
            const keys = Object.keys(req.cmcd);
            for (const key of keys) {
                expect(
                    enabledKeys.includes(key),
                    `Unexpected key "${key}" found. Expected only: ${enabledKeys.join(', ')}`
                ).toBeTruthy();
            }
        }
    });

    test('empty enabledKeys produces no CMCD data', async ({ page }) => {
        await setupPlayer(page, {
            sourceUrl: VOD_STREAM,
            cmcd: {
                ...DEFAULT_CMCD_V2_CONFIG,
                mode: 'query',
                enabledKeys: [],
            }
        });

        await waitForPlayback(page, 3);

        // Wait a bit for any requests to come in
        await new Promise(resolve => setTimeout(resolve, 5000));

        // With empty enabledKeys, no CMCD data should be appended to requests
        expect(collector.queryRequests.length).toBe(0);
    });

    test('all default keys appear when no filter is set', async ({ page }) => {
        await setupPlayer(page, {
            sourceUrl: VOD_STREAM,
            cmcd: {
                ...DEFAULT_CMCD_V2_CONFIG,
                mode: 'query',
            }
        });

        await collector.waitForRequests('query', 3, TIMEOUTS.REQUEST_COLLECTION);

        // Collect all unique keys across all CMCD-bearing requests
        const allSeenKeys = new Set();
        for (const req of collector.queryRequests) {
            for (const key of Object.keys(req.cmcd)) {
                allSeenKeys.add(key);
            }
        }

        // These core keys should appear across manifest/init segment requests
        const expectedKeys = ['ot', 'sid', 'v'];
        for (const key of expectedKeys) {
            expect(
                allSeenKeys.has(key),
                `Expected key "${key}" to appear in at least one request`
            ).toBeTruthy();
        }

        // Validate all keys are recognized CMCD keys
        for (const req of collector.queryRequests) {
            const result = validateCmcdKeys(req.cmcd, { version: 2 });
            expect(
                result.valid,
                `Unrecognized keys found:\n${result.issues.map(i => `  [${i.severity}] ${i.key ? i.key + ': ' : ''}${i.message}`).join('\n')}`
            ).toBeTruthy();
        }
    });
});
