const CMCD_MODE_QUERY = 'query';
let leaderTimestamp;
let leaderPlayhead;
let playbackRate;

let lastInterval;

(() => {
    const syncPlayer = (player) => {
        if (!leaderTimestamp || !leaderPlayhead || !playbackRate) {
            return;
        }

        const currentTimestamp = Date.now();
        const timeElapsed = (currentTimestamp - leaderTimestamp) / 1000;
        const timeToSeek = leaderPlayhead + timeElapsed * playbackRate;

        const SEEK_THRESHOLD = 0.4;
        const SYNC_THRESHOLD = 0.04;

        const getPlayersTimeDifference = () => Math.abs(timeToSeek - player.time());

        const playersDifference = getPlayersTimeDifference();
        if (getPlayersTimeDifference() > SEEK_THRESHOLD) {
            player.seekToPresentationTime(timeToSeek);
            if (lastInterval) {
                clearInterval(lastInterval);
            }
        } else if (playersDifference > SYNC_THRESHOLD) {
            if (lastInterval) {
                return
            }
            const isAheadOfTheLeader = player.time() > timeToSeek;
            const speedModification = isAheadOfTheLeader ? 0.5 : 2;
            player.setPlaybackRate(speedModification * playbackRate);
            const interval = setInterval(() => {
                lastInterval = interval;
                const currentDifference = getPlayersTimeDifference();
                if (currentDifference <= SYNC_THRESHOLD) {
                    player.setPlaybackRate(playbackRate);
                    lastInterval = null;
                    clearInterval(interval);
                }
            }, 10);
        }
    };

    const setupCMCD = (player, isLeader, url) => {
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
                            requestUrl: url,
                            requestMethod: 'POST',
                        }
                    },
                    sid: isLeader ? 'leader-sid' : 'follower-sid',
                    cid: isLeader ? 'leader-cid' : 'follower-cid',
                    mode: CMCD_MODE_QUERY,
                }
            }
        });

        if (!isLeader) {
            let firstRun = true;

            player.addRequestInterceptor((request) => {
                const { filteredCmcdData } = request;
                if (filteredCmcdData) {
                    filteredCmcdData['synchronization-leader-sid'] = 'leader-sid';
                }
                return Promise.resolve(request);
            });

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
                            syncPlayer(player);
                            firstRun = false;
                        }

                        return Promise.resolve(response);
                    });
                }
                return Promise.resolve(response);
            });
        }
    };

    window.playerSynchronization = {
        addLeader(player, url) {
            setupCMCD(player, true, url);
        },
        addFollower(player, url) {
            setupCMCD(player, false, url);
            setInterval(() => syncPlayer(player), 5000);
            player.on(dashjs.MediaPlayer.events.PLAYBACK_SEEKED, () => {
                syncPlayer(player);
            });
        },
        syncPlayer
    };
})();
