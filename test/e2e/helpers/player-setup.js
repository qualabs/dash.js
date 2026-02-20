export async function setupPlayer(page, config) {
    await page.addInitScript((cfg) => {
        window.__CMCD_TEST_CONFIG__ = cfg;
    }, config);

    await page.goto('/test/e2e/fixtures/cmcd-test-page.html');
    await page.waitForFunction(() => window.__PLAYER_READY__ === true, { timeout: 30000 });
}

export async function waitForPlayback(page, minSeconds = 2) {
    await page.waitForFunction(
        (min) => {
            const video = document.querySelector('video');
            return video && video.currentTime > min && !video.paused;
        },
        minSeconds,
        { timeout: 30000 }
    );
}
