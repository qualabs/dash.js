const CMCD_MODE_QUERY = 'query';
let leaderTimestamp;
let leaderPlayhead;
let playbackRate;

let lastInterval;

(() => {
    const syncPlayer = (player, config) => {
        if (!leaderTimestamp || !leaderPlayhead || !playbackRate) {
            return;
        }

        const currentTimestamp = Date.now();
        const timeElapsed = (currentTimestamp - leaderTimestamp) / 1000;
        const timeToSeek = leaderPlayhead + timeElapsed * playbackRate;

        const currentRepresentation = player.getCurrentRepresentationForType('video');
        const currentFrameRate = currentRepresentation.frameRate;
        const frameDelay = Math.min(config.frameDelay, currentFrameRate);

        const SEEK_THRESHOLD = config.seekThreshold ?? (currentFrameRate / 100);
        const SYNC_THRESHOLD = (currentFrameRate / 1000) * frameDelay;

        const getPlayersTimeDifference = () => Math.abs(timeToSeek - player.time());

        const playersDifference = getPlayersTimeDifference();
        if (playersDifference > SEEK_THRESHOLD) {
            player.seekToPresentationTime(timeToSeek);
            player.setPlaybackRate(playbackRate);
            if (lastInterval) {
                clearInterval(lastInterval);
                lastInterval = null;
            }
        } else if (playersDifference > SYNC_THRESHOLD) {
            if (lastInterval) {
                return;
            }

            const isAheadOfTheLeader = player.time() > timeToSeek;
            const catchUpRate = Math.max(config.catchUpRate, 1);
            const speedModification = isAheadOfTheLeader ? 1 / catchUpRate : catchUpRate;

            player.setPlaybackRate(speedModification * playbackRate);
            const interval = setInterval(() => {
                lastInterval = interval;
                const currentDifference = getPlayersTimeDifference();
                if (currentDifference <= SYNC_THRESHOLD) {
                    player.setPlaybackRate(playbackRate);
                    lastInterval = null;
                    clearInterval(interval);
                } else if (currentDifference > SEEK_THRESHOLD) {
                    player.seekToPresentationTime(timeToSeek);
                    player.setPlaybackRate(playbackRate);
                    lastInterval = null;
                    clearInterval(interval);
                }
            }, 10);
        }
    };

    const setupCMCD = (player, config) => {
        player.updateSettings({
            streaming: {
                cmcd: {
                    enabled: true,
                    version: 2,
                    reporting: {
                        eventMode: {
                            enabled: true,
                            mode: CMCD_MODE_QUERY,
                            interval: 10000,
                            enabledKeys: ['sid', 'cid', 'pr', 'pt', 'ts'],
                            requestUrl: config.url,
                            requestMethod: 'POST',
                        }
                    },
                    sid: config.id,
                    mode: CMCD_MODE_QUERY,
                }
            }
        });
    };

    const configInterceptors = (player, config) => {
        player.addRequestInterceptor((request) => {
            const { filteredCmcdData } = request;
            if (filteredCmcdData) {
                filteredCmcdData['synchronization-leader-sid'] = config.leaderId;
            }
            return Promise.resolve(request);
        });
        
        let firstRun = true;
        player.addResponseInterceptor((response) => {
            if (response.cmcdMode === 'event') {
                response.json().then((data) => {
                    if (!data || !data.ts || !data.pt) {
                        return Promise.resolve(response);
                    }
                    const { ts, pt, pr } = data;
                    leaderTimestamp = Number(ts);
                    leaderPlayhead = Number(pt);
                    playbackRate = Number(pr ?? 1);

                    if (firstRun) {
                        syncPlayer(player, config);
                        firstRun = false;
                    }

                    return Promise.resolve(response);
                });
            }
            return Promise.resolve(response);
        });
    }

    window.playerSynchronization = {
        addLeader(player, config) {
            setupCMCD(player, config);
        },
        addFollower(player, config) {
            setupCMCD(player, config);
            configInterceptors(player, config); 

            setInterval(() => {
                syncPlayer(player, config);
            }, config.syncInterval ?? 5000);

            let seeking = false;
            player.on(dashjs.MediaPlayer.events.PLAYBACK_SEEKED, () => {
                if (!seeking) {
                    syncPlayer(player, config);
                    seeking = true;
                }
            });
        }
    };
})();
