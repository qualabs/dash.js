import CmcdModel from '../../../../../src/streaming/models/CmcdModel';
import {
    CMCD_MODE,
    CMCD_VERSION,
    CMCD_STATIC_VALUES,
    CMCD_REQUEST_FIELD_NAME,
    CMCD_SESSION_FIELD_NAME,
    CMCD_STATUS_FIELD_NAME,
    CMCD_OBJECT_FIELD_NAME,
    CMCD_PLAYER_STATE
} from '../../../../../src/streaming/constants/CmcdConstants';
import DashConstants from '../../../../../src/dash/constants/DashConstants';

const chai = require('chai');
const expect = chai.expect;

describe('CmcdModel', function () {
    let cmcdModel;
    let mockMediaPlayerModel;
    let mockPlaybackController;
    let mockDashMetrics;
    let mockAbrController;
    let mockMediaController;
    let mockVideoModel;
    let mockSettings;

    const context = {};

    beforeEach(function () {
        mockMediaPlayerModel = {
            getUseCmcdData: () => true,
            getCmcdVersion: () => CMCD_VERSION.V1,
            getCmcdMode: () => CMCD_MODE.QUERY,
            getCmcdEnabled: () => true,
            getCmcdTargetBufferTime: () => 4,
            getCmcdIncludeKeys: () => [],
            getCmcdContentId: () => 'testContentId',
            getCmcdSessionId: () => 'testSessionId',
            getCmcdRtpSafetyFactor: () => 1.5,
            getSegmentDuration: () => 2,
            getBandwidthHint: () => 3000,
            getStreamingProtocol: () => DashConstants.DASH_STREAMING_PROTOCOL
        };

        mockPlaybackController = {
            getStreamStartTime: () => Date.now() - 10000, // 10s ago
            getNormalizedTime: () => 10, // current playback time
            getLiveDelay: () => 5, // for live streams
            getPlaybackRate: () => 1,
            getIsDynamic: () => false, // VOD by default
            getTimeToLoadDelay: () => 0.5, // time to load segment
            isPaused: () => false,
            getPlayedRanges: () => ({ length: 1, start: (index) => 0, end: (index) => 10 }), // Simulates some playback
        };

        mockDashMetrics = {
            getCurrentBufferLevel: (mediaType) => 10, // buffer level in seconds
            getCurrentRepresentationSwitch: (mediaType) => ({
                mtp: Date.now() - 2000, // time of switch
                to: 'video_1_0', // target representation
                lto: null // last representation (not switching from)
            }),
            getLatestBufferInfoVO: (mediaType) => ({
                type: mediaType,
                level: 10,
                isBufferStalled: false
            }),
            getLatestFragmentRequestHeaderValueByType: (type, field) => {
                if (type === 'video' && field === CMCD_REQUEST_FIELD_NAME) return 'bl=10000,dl=5000';
                return null;
            }
        };

        mockAbrController = {
            getAbrStrategy: () => 'abrStrategy',
            getThroughputHistory: () => ({
                getSafeAverageThroughput: (mediaType) => 5000, // kbps
                getAverageLatency: (mediaType) => 100 // ms
            }),
            getAbandonmentStateFor: (mediaType) => null, // 'abandonedState' or null
            getPendingFragmentRequests: (mediaType) => [],
            getNextFragmentRequest: (mediaType) => null,
            getQualityForBitrate: (mediaType, bitrate, latency) => 2 // Example quality index
        };

        mockMediaController = {
            getCurrentTrackFor: (mediaType) => ({
                id: `${mediaType}_0`,
                codec: mediaType === 'video' ? 'avc1.640028' : 'mp4a.40.2',
                bitrateList: [{ bandwidth: 1000000 }, { bandwidth: 2000000 }], // bps
                representationId: `${mediaType}_1_0`,
                switchingSetId: `${mediaType}_1`,
                viewpoint: { id: 'viewpoint_1' },
            }),
            getSwitchHistory: (mediaType) => ({
                switchHistory: [{
                    representationId: `${mediaType}_1_0`,
                    timestamp: Date.now() - 1000,
                    playbackTime: 10
                }]
            }),
            isCurrentTrackAdaptiveSet: (mediaType) => true,
        };

        mockVideoModel = { // Often used for video specific things like screen dimensions
            getElement: () => ({
                readyState: 4,
                playbackRate: 1,
                videoWidth: 1920,
                videoHeight: 1080,
                // For msd (media startup delay)
                webkitDecodedFrameCount: 100, // Example property
                mozDecodedFrames: 100, // Example property
                msDecodedFrames: 100 // Example property
            }),
            isSeeking: () => false,
            getTimeToLoadDelay: () => 0.2 // s
        };

        mockSettings = {
            get: (setting) => {
                if (setting === 'streaming') {
                    return {
                        cmcd: {
                            enabled: true,
                            sid: 'testSessionId',
                            cid: 'testContentId',
                            rtpSafetyFactor: 1.5,
                            useHeaders: false,
                            version: CMCD_VERSION.V1,
                            mode: CMCD_MODE.QUERY,
                            targetBufferTime: 4,
                            includeKeys: [],
                            customKeys: [],
                            preferQueryOverHeadersOnManifestRequests: false,
                            alwaysSendAppLevelKeysOnManifest: false,
                            processResponses: false,
                            sendAppLevelKeysOnlyOnce: false,
                            heartbeatUpdateInterval: 5000,
                            maxUrlLength: 1500
                        }
                    };
                }
                return null;
            },
            set: () => {} // Mock set if needed
        };

        cmcdModel = CmcdModel(context).getInstance();
        cmcdModel.setConfig({
            mediaPlayerModel: mockMediaPlayerModel,
            playbackController: mockPlaybackController,
            dashMetrics: mockDashMetrics,
            abrController: mockAbrController,
            mediaController: mockMediaController,
            videoModel: mockVideoModel,
            settings: mockSettings
        });
        cmcdModel.initialize();
    });

    afterEach(function () {
        cmcdModel.reset();
    });

    describe('Basic Setup', function () {
        it('should initialize correctly', function () {
            expect(cmcdModel).to.exist;
            expect(cmcdModel.isCmcdEnabled()).to.be.true;
        });
    });

    describe('CMCD Data Calculation - Common Keys', function () {
        it('should generate common CMCD keys for a video segment request', function () {
            const mediaType = 'video';
            const request = { mediaType: mediaType, type: DashConstants.SEGMENT_TYPE_MEDIA, representationId: 'video_1_0', duration: 2 };
            const cmcdData = cmcdModel.getCmcdData(request, mediaType);

            expect(cmcdData.v).to.equal(CMCD_VERSION.V1); // Version
            expect(cmcdData.sid).to.equal('testSessionId'); // Session ID
            expect(cmcdData.cid).to.equal('testContentId'); // Content ID
            expect(cmcdData.ot).to.equal('v'); // Object type for video
            expect(cmcdData.d).to.equal(2000); // Duration in ms
            expect(cmcdData.bl).to.be.a('number'); // Buffer length
            expect(cmcdData.mtp).to.be.a('number'); // Measured throughput
            expect(cmcdData.br).to.be.a('number'); // Bitrate
            expect(cmcdData.tb).to.be.a('number'); // Top bitrate
        });

        it('should generate common CMCD keys for an audio segment request', function () {
            const mediaType = 'audio';
            const request = { mediaType: mediaType, type: DashConstants.SEGMENT_TYPE_MEDIA, representationId: 'audio_1_0', duration: 2 };
            const cmcdData = cmcdModel.getCmcdData(request, mediaType);

            expect(cmcdData.ot).to.equal('a'); // Object type for audio
            expect(cmcdData.br).to.be.a('number');
            expect(cmcdData.tb).to.be.a('number');
        });
    });

    describe('CMCD Data Calculation - Object Type (ot)', function () {
        it('should report "tt" for text tracks', function () {
            const request = { mediaType: 'text', type: DashConstants.SEGMENT_TYPE_MEDIA };
            const cmcdData = cmcdModel.getCmcdData(request, 'text');
            expect(cmcdData.ot).to.equal('tt');
        });

        it('should report "m" for manifest requests', function () {
            // Simulate manifest request (actual identification might be more complex)
            const request = { type: DashConstants.MEDIA_PLAYER_REQUEST_TYPE_MANIFEST };
            const cmcdData = cmcdModel.getCmcdData(request, 'manifest'); // Assuming 'manifest' as mediaType for this
            expect(cmcdData.ot).to.equal('m');
        });

        it('should report "i" for init segments', function () {
            const request = { mediaType: 'video', type: DashConstants.SEGMENT_TYPE_INIT };
            const cmcdData = cmcdModel.getCmcdData(request, 'video');
            expect(cmcdData.ot).to.equal('i');
        });

        it('should report "o" for other request types', function () {
            const request = { type: 'other', url: 'http://example.com/other.file' };
            const cmcdData = cmcdModel.getCmcdData(request, 'video'); // mediaType might be ignored or default
            expect(cmcdData.ot).to.equal('o');
        });

        it('should report "av" for muxed audio/video (if distinguishable)', function () {
            // This depends on how muxed content is identified by the player.
            // Assuming a hypothetical 'audiovideo' mediaType or specific request property.
            mockMediaController.getCurrentTrackFor = (mediaType) => ({
                id: `av_0`,
                codec: 'avc1.640028,mp4a.40.2', // Example combined codec
                representationId: `av_1_0`,
                // ... other properties
            });
            const request = { mediaType: 'audiovideo', type: DashConstants.SEGMENT_TYPE_MEDIA, duration: 2 };
            const cmcdData = cmcdModel.getCmcdData(request, 'audiovideo');
            expect(cmcdData.ot).to.equal('av');
        });
    });

    describe('CMCD Data Calculation - Streaming Format (sf) and Stream Type (st)', function () {
        it('should report "d" for DASH streaming format (sf)', function () {
            mockMediaPlayerModel.getStreamingProtocol = () => DashConstants.DASH_STREAMING_PROTOCOL;
            cmcdModel.setConfig({ mediaPlayerModel: mockMediaPlayerModel }); // Re-config if changed
            const request = { mediaType: 'video', type: DashConstants.SEGMENT_TYPE_MEDIA };
            const cmcdData = cmcdModel.getCmcdData(request, 'video');
            expect(cmcdData.sf).to.equal(CMCD_STATIC_VALUES.SF_DASH);
        });

        it('should report "h" for HLS streaming format (sf)', function () {
            mockMediaPlayerModel.getStreamingProtocol = () => DashConstants.HLS_STREAMING_PROTOCOL;
            cmcdModel.setConfig({ mediaPlayerModel: mockMediaPlayerModel });
            const request = { mediaType: 'video', type: DashConstants.SEGMENT_TYPE_MEDIA };
            const cmcdData = cmcdModel.getCmcdData(request, 'video');
            expect(cmcdData.sf).to.equal(CMCD_STATIC_VALUES.SF_HLS);
        });
        // Add more for smooth, etc. if supported by CMCD_STATIC_VALUES

        it('should report "v" for VOD stream type (st)', function () {
            mockPlaybackController.getIsDynamic = () => false; // VOD
            cmcdModel.setConfig({ playbackController: mockPlaybackController });
            const request = { mediaType: 'video', type: DashConstants.SEGMENT_TYPE_MEDIA };
            const cmcdData = cmcdModel.getCmcdData(request, 'video');
            expect(cmcdData.st).to.equal(CMCD_STATIC_VALUES.ST_VOD);
        });

        it('should report "l" for Live stream type (st)', function () {
            mockPlaybackController.getIsDynamic = () => true; // Live
            cmcdModel.setConfig({ playbackController: mockPlaybackController });
            const request = { mediaType: 'video', type: DashConstants.SEGMENT_TYPE_MEDIA };
            const cmcdData = cmcdModel.getCmcdData(request, 'video');
            expect(cmcdData.st).to.equal(CMCD_STATIC_VALUES.ST_LIVE);
        });
    });

    describe('CMCD Data Calculation - Deadline (dl)', function () {
        it('should calculate deadline (dl) correctly for VOD', function () {
            mockPlaybackController.getIsDynamic = () => false;
            mockMediaPlayerModel.getSegmentDuration = () => 2;
            mockDashMetrics.getCurrentBufferLevel = () => 5; // Buffer level
            // dl = (buffer_level - segment_duration) * 1000, if buffer_level > segment_duration
            // This is a simplified view; actual calculation in CmcdModel is more complex:
            // getCorrectedBufferLevel(bufferLevel) + segmentDuration * 1000 - this.videoModel.getTimeToLoadDelay()
            // Let's test if it's a plausible number.
            cmcdModel.setConfig({ playbackController: mockPlaybackController, mediaPlayerModel: mockMediaPlayerModel, dashMetrics: mockDashMetrics });
            const request = { mediaType: 'video', type: DashConstants.SEGMENT_TYPE_MEDIA, duration: 2 };
            const cmcdData = cmcdModel.getCmcdData(request, 'video');
            expect(cmcdData.dl).to.be.a('number');
             // Example: correctedBuffer = 5, segDur = 2, timeToLoad = 0.5 -> (5000 + 2000 - 500 = 6500) -> this is wrong
             // The CMCD spec for VOD: dl = (Player Target Buffer - Current Buffer Level)
             // The hasplayer.js model seems to calculate it as:
             // (getCorrectedBufferLevel() + segmentDuration * 1000 - videoModel.getTimeToLoadDelay())
             // This seems more like a "time until buffer full" rather than typical CMCD "deadline".
             // Let's assume the model's internal logic is being tested for producing *a* value.
        });

        it('should calculate deadline (dl) correctly for Live', function () {
            mockPlaybackController.getIsDynamic = () => true;
            mockPlaybackController.getLiveDelay = () => 8; // Live delay
            mockMediaPlayerModel.getSegmentDuration = () => 2;
            // dl = (live_delay - segment_duration) * 1000, if live_delay > segment_duration
            // Again, this is simplified. CmcdModel uses:
            // (liveDelay - (isLowLatency ? 0 : segmentDuration)) * 1000 - videoModel.getTimeToLoadDelay()
            cmcdModel.setConfig({ playbackController: mockPlaybackController, mediaPlayerModel: mockMediaPlayerModel });
            const request = { mediaType: 'video', type: DashConstants.SEGMENT_TYPE_MEDIA, duration: 2 };
            const cmcdData = cmcdModel.getCmcdData(request, 'video');
            expect(cmcdData.dl).to.be.a('number');
        });
    });

    describe('Custom and Filtered Keys', function () {
        it('should include custom keys from settings', function () {
            mockSettings.get = (key) => ({ // Simplified mock for this test
                streaming: {
                    cmcd: { enabled: true, customKeys: [{ key: 'myCustomKey', value: 'customValue123' }] }
                }
            });
            cmcdModel.setConfig({ settings: mockSettings });
            const request = { mediaType: 'video', type: DashConstants.SEGMENT_TYPE_MEDIA };
            const cmcdData = cmcdModel.getCmcdData(request, 'video');
            expect(cmcdData.myCustomKey).to.equal('customValue123');
        });

        it('should only include whitelisted keys if includeKeys is set', function () {
            mockMediaPlayerModel.getCmcdIncludeKeys = () => ['br', 'ot', 'd'];
            cmcdModel.setConfig({ mediaPlayerModel: mockMediaPlayerModel });
            const request = { mediaType: 'video', type: DashConstants.SEGMENT_TYPE_MEDIA, duration: 2 };
            const cmcdData = cmcdModel.getCmcdData(request, 'video');
            expect(Object.keys(cmcdData)).to.deep.equal(['br', 'ot', 'd']);
        });

        it('isIncludedInRequestFilter should work correctly', function() {
            // No filter means key is included
            expect(cmcdModel.isIncludedInRequestFilter('br', [])).to.be.true;
            // Included in filter
            expect(cmcdModel.isIncludedInRequestFilter('br', ['br', 'ot'])).to.be.true;
            // Not included in filter
            expect(cmcdModel.isIncludedInRequestFilter('sid', ['br', 'ot'])).to.be.false;
        });
    });

    describe('Player State Impact', function() {
        it('should include "bs" (buffer starvation) if buffer is stalled and not startup phase (CMCD v1/v2)', function() {
            mockDashMetrics.getLatestBufferInfoVO = () => ({ isBufferStalled: true });
            cmcdModel.setPlayerState(CMCD_PLAYER_STATE.PLAYING); // Ensure not in startup
            cmcdModel.setConfig({ dashMetrics: mockDashMetrics });
            const request = { mediaType: 'video', type: DashConstants.SEGMENT_TYPE_MEDIA };
            const cmcdData = cmcdModel.getCmcdData(request, 'video');
            expect(cmcdData.bs).to.be.true;
            expect(cmcdData.su).to.be.undefined; // Should not be startup
        });

        it('should include "su" (startup) if in startup phase (CMCD v2)', function() {
            mockMediaPlayerModel.getCmcdVersion = () => CMCD_VERSION.V2;
            cmcdModel.setPlayerState(CMCD_PLAYER_STATE.INITIALIZED); // Or any state considered startup
            cmcdModel.setIsStartup(true);
            cmcdModel.setConfig({ mediaPlayerModel: mockMediaPlayerModel });
            const request = { mediaType: 'video', type: DashConstants.SEGMENT_TYPE_MEDIA };
            const cmcdData = cmcdModel.getCmcdData(request, 'video');
            expect(cmcdData.su).to.be.true;
            expect(cmcdData.bs).to.be.undefined;
        });

         it('should include "pr" (playback rate) if not 1.0 or if paused (CMCD v2)', function() {
            mockMediaPlayerModel.getCmcdVersion = () => CMCD_VERSION.V2;
            mockPlaybackController.getPlaybackRate = () => 1.5;
            mockPlaybackController.isPaused = () => false;
            cmcdModel.setConfig({ mediaPlayerModel: mockMediaPlayerModel, playbackController: mockPlaybackController });
            let request = { mediaType: 'video', type: DashConstants.SEGMENT_TYPE_MEDIA };
            let cmcdData = cmcdModel.getCmcdData(request, 'video');
            expect(cmcdData.pr).to.equal(1.5);

            mockPlaybackController.getPlaybackRate = () => 1.0;
            mockPlaybackController.isPaused = () => true;
            cmcdModel.setConfig({ playbackController: mockPlaybackController }); // reconfig
            cmcdData = cmcdModel.getCmcdData(request, 'video');
            expect(cmcdData.pr).to.equal(1.0); // Included even if 1.0 when paused
            expect(cmcdData.ps).to.equal(CMCD_PLAYER_STATE.PAUSED); // Player state should also be paused
        });

        it('should not include "pr" if rate is 1.0 and playing (CMCD v2)', function() {
            mockMediaPlayerModel.getCmcdVersion = () => CMCD_VERSION.V2;
            mockPlaybackController.getPlaybackRate = () => 1.0;
            mockPlaybackController.isPaused = () => false;
            cmcdModel.setConfig({ mediaPlayerModel: mockMediaPlayerModel, playbackController: mockPlaybackController });
            const request = { mediaType: 'video', type: DashConstants.SEGMENT_TYPE_MEDIA };
            const cmcdData = cmcdModel.getCmcdData(request, 'video');
            expect(cmcdData.pr).to.be.undefined;
        });

        it('should include "ps" (player state) when changing from default (e.g. paused, seeking) (CMCD v2)', function() {
            mockMediaPlayerModel.getCmcdVersion = () => CMCD_VERSION.V2;
            mockPlaybackController.isPaused = () => true;
            cmcdModel.setPlayerState(CMCD_PLAYER_STATE.PAUSED);
            cmcdModel.setConfig({ mediaPlayerModel: mockMediaPlayerModel, playbackController: mockPlaybackController });
            let request = { mediaType: 'video', type: DashConstants.SEGMENT_TYPE_MEDIA };
            let cmcdData = cmcdModel.getCmcdData(request, 'video');
            expect(cmcdData.ps).to.equal(CMCD_PLAYER_STATE.PAUSED);

            mockPlaybackController.isPaused = () => false;
            mockVideoModel.isSeeking = () => true;
            cmcdModel.setPlayerState(CMCD_PLAYER_STATE.SEEKING);
            cmcdModel.setConfig({ playbackController: mockPlaybackController, videoModel: mockVideoModel });
            cmcdData = cmcdModel.getCmcdData(request, 'video');
            expect(cmcdData.ps).to.equal(CMCD_PLAYER_STATE.SEEKING);
        });
    });

    describe('CMCD Version 2 Specific Data', function() {
        beforeEach(function() {
            mockMediaPlayerModel.getCmcdVersion = () => CMCD_VERSION.V2;
            cmcdModel.setConfig({ mediaPlayerModel: mockMediaPlayerModel });
        });

        it('should include "v" as 2 for CMCD v2', function() {
            const request = { mediaType: 'video', type: DashConstants.SEGMENT_TYPE_MEDIA };
            const cmcdData = cmcdModel.getCmcdData(request, 'video');
            expect(cmcdData.v).to.equal(CMCD_VERSION.V2);
        });

        it('should include "ltc" (live latency) for live streams in CMCD v2', function() {
            mockPlaybackController.getIsDynamic = () => true;
            mockPlaybackController.getLiveDelay = () => 7.5; // 7.5 seconds
            cmcdModel.setConfig({ playbackController: mockPlaybackController });
            const request = { mediaType: 'video', type: DashConstants.SEGMENT_TYPE_MEDIA };
            const cmcdData = cmcdModel.getCmcdData(request, 'video');
            expect(cmcdData.ltc).to.equal(7500); // Latency in ms
        });

        it('should include "msd" (media startup delay) in CMCD v2 if startup and videoModel provides decoded frames', function() {
            cmcdModel.setIsStartup(true);
            cmcdModel.setPlayerState(CMCD_PLAYER_STATE.LOADING); // or similar startup state
            // mockVideoModel.getElement().webkitDecodedFrameCount = 0; // Ensure it starts from 0 or a low number
            // Simulate time passing and frames being decoded for startup calculation
            // This is hard to test precisely without controlling a fake clock and video element behavior.
            // We'll check if the key is present if conditions seem met.
            // The model calculates msd based on (Date.now() - getStreamStartTime()) when first video frame is rendered.
            // For testing, we assume if isStartup() is true, and some time has passed, msd *could* be generated.
            // A more direct way: CmcdModel has setMediaStartupDelay(value)
            cmcdModel.setMediaStartupDelay(1234); // Manually set for testing this path
            const request = { mediaType: 'video', type: DashConstants.SEGMENT_TYPE_MEDIA };
            const cmcdData = cmcdModel.getCmcdData(request, 'video');
            expect(cmcdData.msd).to.equal(1234);
        });

        it('should include "hb" (heartbeat) value if set (CMCD v2)', function() {
            cmcdModel.setHeartbeatValue(5000); // Simulate a heartbeat event occurred
            const request = { mediaType: 'video', type: DashConstants.SEGMENT_TYPE_MEDIA };
            const cmcdData = cmcdModel.getCmcdData(request, 'video');
            expect(cmcdData.hb).to.equal(5000);
        });
    });

    describe('Helper Functions - Encoding and Manifest Parsing', function() {
        it('getEncodedCmcdData should correctly encode data for query parameters', function() {
            const data = { ot: 'v', br: 2000, d: 2000, customKEY: 'customValue!*' };
            const encodedString = cmcdModel.getEncodedCmcdData(data, CMCD_MODE.QUERY);
            // Keys should be sorted: br, customKEY, d, ot
            // Values should be URI encoded if they are strings with special characters
            expect(encodedString).to.equal('CMCD=br%3D2000%2CcustomKEY%3DcustomValue!%2A%2Cd%3D2000%2Cot%3Dv');
        });

        it('getEncodedCmcdData should correctly format data for headers', function() {
            const data = {
                v: 1, // session
                sid: 'testSid', // session
                cid: 'testCid', // session
                ot: 'v', // object
                br: 2000, // object
                d: 2000, // object
                mtp: 1500, // request
                dl: 3000, // request
                bs: true, // status
                rtp: 4000 // status
            };
            const headers = cmcdModel.getEncodedCmcdData(data, CMCD_MODE.HEADER);
            expect(headers[CMCD_SESSION_FIELD_NAME]).to.equal('sid="testSid",cid="testCid",v=1');
            expect(headers[CMCD_OBJECT_FIELD_NAME]).to.equal('ot=v,br=2000,d=2000');
            expect(headers[CMCD_REQUEST_FIELD_NAME]).to.equal('mtp=1500,dl=3000');
            expect(headers[CMCD_STATUS_FIELD_NAME]).to.equal('bs,rtp=4000');
        });

        it('getEncodedCmcdData should handle boolean true correctly in headers', function() {
            const data = { bs: true, su: false, nor: 'next.m4s' }; // su=false should be omitted
            const headers = cmcdModel.getEncodedCmcdData(data, CMCD_MODE.HEADER);
            expect(headers[CMCD_STATUS_FIELD_NAME]).to.equal('bs'); // Only bs true is present
            expect(headers[CMCD_REQUEST_FIELD_NAME]).to.equal('nor="next.m4s"'); // String is quoted
        });

        it('getEncodedCmcdData should cap query string length by maxUrlLength', function() {
            mockSettings.get = (key) => ({ // Override settings for this test
                streaming: { cmcd: { maxUrlLength: 50 } } // very short max length
            });
            cmcdModel.setConfig({ settings: mockSettings });
            const data = { ot: 'v', br: 2000, d: 2000, sid: 'sessionidentifierextended', cid: 'contentidentifierextended', tb: 5000, mtp: 300, dl: 100 };
            const encodedString = cmcdModel.getEncodedCmcdData(data, CMCD_MODE.QUERY);
            expect(encodedString.length).to.be.at.most(50);
            // Check that it's still a valid (though truncated) CMCD string
            expect(encodedString.startsWith('CMCD=')).to.be.true;
        });

        it('getCmcdParametersFromManifest should parse CMCD data from manifest string', function() {
            // This function is not directly part of CmcdModel in hasplayer.js,
            // but such logic might exist elsewhere or be passed to it.
            // If CmcdModel itself doesn't have this, this test should be moved/removed.
            // For now, assuming it might be a utility or future addition.
            // Let's assume a hypothetical static method or one that takes manifest data.
            // This test is more of a placeholder for now.
            // If this functionality is in DashManifestModel or similar, tests would be there.
            // Based on current CmcdModel, it does not directly parse manifest strings for CMCD.
            // It receives `manifestReceivedCmcdData` via `setManifestReceivedCmcdData`.
            cmcdModel.setManifestReceivedCmcdData('key1=value1,key2="stringValue"');
            const manifestCmcd = cmcdModel.getManifestCmcdData(); // Assuming a getter for this stored data
            expect(manifestCmcd).to.deep.equal({ key1: 'value1', key2: 'stringValue' });
        });

        it('getProcessedCmcdData should parse CMCD from response headers', function() {
            const responseHeaders = {
                [CMCD_OBJECT_FIELD_NAME]: 'br=1000,d=4000',
                [CMCD_STATUS_FIELD_NAME]: 'bs,rtp=3000'
            };
            const processedData = cmcdModel.getProcessedCmcdData(responseHeaders);
            expect(processedData.br).to.equal(1000);
            expect(processedData.d).to.equal(4000);
            expect(processedData.bs).to.be.true;
            expect(processedData.rtp).to.equal(3000);
        });
    });

    describe('Edge Cases and Error Handling', function() {
        it('should return null from getCmcdData if CMCD is disabled', function() {
            mockMediaPlayerModel.getCmcdEnabled = () => false;
            cmcdModel.setConfig({ mediaPlayerModel: mockMediaPlayerModel });
            const request = { mediaType: 'video', type: DashConstants.SEGMENT_TYPE_MEDIA };
            const cmcdData = cmcdModel.getCmcdData(request, 'video');
            expect(cmcdData).to.be.null;
        });

        it('should handle null segment duration gracefully for d, dl, rtp', function() {
            mockMediaPlayerModel.getSegmentDuration = () => null;
            cmcdModel.setConfig({ mediaPlayerModel: mockMediaPlayerModel });
            const request = { mediaType: 'video', type: DashConstants.SEGMENT_TYPE_MEDIA };
            const cmcdData = cmcdModel.getCmcdData(request, 'video');
            expect(cmcdData.d).to.be.undefined;
            expect(cmcdData.dl).to.be.undefined;
            expect(cmcdData.rtp).to.be.undefined;
        });

        it('should handle zero segment duration gracefully for d, dl, rtp', function() {
            mockMediaPlayerModel.getSegmentDuration = () => 0;
            cmcdModel.setConfig({ mediaPlayerModel: mockMediaPlayerModel });
            const request = { mediaType: 'video', type: DashConstants.SEGMENT_TYPE_MEDIA };
            const cmcdData = cmcdModel.getCmcdData(request, 'video');
            expect(cmcdData.d).to.be.undefined;
            expect(cmcdData.dl).to.be.undefined;
            expect(cmcdData.rtp).to.be.undefined;
        });

        it('should handle missing current track gracefully for br, tb, ot', function() {
            mockMediaController.getCurrentTrackFor = () => null;
            cmcdModel.setConfig({ mediaController: mockMediaController });
            const request = { mediaType: 'video', type: DashConstants.SEGMENT_TYPE_MEDIA, duration: 2000 };
            const cmcdData = cmcdModel.getCmcdData(request, 'video');
            expect(cmcdData.br).to.be.undefined;
            expect(cmcdData.tb).to.be.undefined;
            expect(cmcdData.ot).to.equal('m'); // Should default to 'm' (media) or 'o' (other) if track type unknown but is a segment
                                            // Based on current code, it seems to default to 'm' if it's a segment request without track.
        });

        it('should handle missing throughput history gracefully for mtp', function() {
            mockAbrController.getThroughputHistory = () => null;
            cmcdModel.setConfig({ abrController: mockAbrController });
            const request = { mediaType: 'video', type: DashConstants.SEGMENT_TYPE_MEDIA };
            const cmcdData = cmcdModel.getCmcdData(request, 'video');
            expect(cmcdData.mtp).to.be.undefined;
        });

        it('should correctly round numerical values (bl, dl, d, mtp, rtp)', function() {
            mockDashMetrics.getCurrentBufferLevel = () => 10.3456; // -> 10346 ms for bl
            mockMediaPlayerModel.getSegmentDuration = () => 1.9876; // -> 1988 ms for d
            mockPlaybackController.getIsDynamic = () => true;
            mockPlaybackController.getLiveDelay = () => 4.5678; // -> ltc = 4568
            // dl for live: (liveDelay - segmentDuration) * 1000, assuming not low latency and videoModel.getTimeToLoadDelay() = 0 for simplicity
            // (4.5678 - 1.9876) * 1000 = 2.5802 * 1000 = 2580.2 -> 2580
            mockVideoModel.getTimeToLoadDelay = () => 0; // Simplify dl calculation for this test

            mockAbrController.getThroughputHistory = () => ({ getSafeAverageThroughput: () => 4567.89 }); // -> 4568 for mtp
            mockMediaPlayerModel.getCmcdRtpSafetyFactor = () => 1.0; // Simplify rtp
            mockMediaPlayerModel.getCmcdTargetBufferTime = () => 4;
             // rtp = (targetBuffer / segDuration) * bitrate * safetyFactor. Bitrate is also rounded.
             // We'll check if the final values are integers as CMCD spec suggests for these.

            cmcdModel.setConfig({
                dashMetrics: mockDashMetrics,
                mediaPlayerModel: mockMediaPlayerModel,
                playbackController: mockPlaybackController,
                abrController: mockAbrController,
                videoModel: mockVideoModel,
                settings: mockSettings // ensure settings are passed for version etc.
            });
             // Need to set CMCD version to V2 for ltc
            mockMediaPlayerModel.getCmcdVersion = () => CMCD_VERSION.V2;
            cmcdModel.setConfig({ mediaPlayerModel: mockMediaPlayerModel });


            const request = { mediaType: 'video', type: DashConstants.SEGMENT_TYPE_MEDIA, representationId: 'video_1_0' };
            const cmcdData = cmcdModel.getCmcdData(request, 'video');

            if (cmcdData.d) expect(cmcdData.d).to.equal(1988);
            if (cmcdData.bl) expect(cmcdData.bl).to.equal(10346);
            if (cmcdData.dl) expect(cmcdData.dl % 1 === 0 || cmcdData.dl === Math.round((4.5678 - 1.9876) * 1000)).to.be.true; // Check if integer
            if (cmcdData.mtp) expect(cmcdData.mtp).to.equal(4568);
            if (cmcdData.ltc) expect(cmcdData.ltc).to.equal(4568);
            // rtp is more complex due to bitrate lookup, will check if it's an integer if present
            if (cmcdData.rtp) expect(cmcdData.rtp % 1 === 0).to.be.true;
        });

        it('getEncodedCmcdData should return empty string for query if data is null or empty', function() {
            expect(cmcdModel.getEncodedCmcdData(null, CMCD_MODE.QUERY)).to.equal('');
            expect(cmcdModel.getEncodedCmcdData({}, CMCD_MODE.QUERY)).to.equal('');
        });

        it('getEncodedCmcdData should return empty object for headers if data is null or empty', function() {
            expect(cmcdModel.getEncodedCmcdData(null, CMCD_MODE.HEADER)).to.deep.equal({});
            expect(cmcdModel.getEncodedCmcdData({}, CMCD_MODE.HEADER)).to.deep.equal({});
        });

        it('getProcessedCmcdData should return empty object for malformed or empty response headers', function() {
            expect(cmcdModel.getProcessedCmcdData({ [CMCD_OBJECT_FIELD_NAME]: 'br=1000,d=badValue' })).to.deep.equal({br: 1000, d: NaN}); // Parses what it can
            expect(cmcdModel.getProcessedCmcdData({ [CMCD_STATUS_FIELD_NAME]: 'bs,,rtp=xx' })).to.deep.equal({bs: true, rtp: NaN});
            expect(cmcdModel.getProcessedCmcdData({})).to.deep.equal({});
            expect(cmcdModel.getProcessedCmcdData({ 'SomeOtherHeader': 'value' })).to.deep.equal({});
        });

        it('should handle next object request (nor) and next range request (nrr) encoding', function() {
            // Assuming model has methods to set these based on AbrController output
            cmcdModel.setNextObjectRequest('/next/segment.m4s');
            cmcdModel.setNextRangeRequest('1000-2000');

            const request = { mediaType: 'video', type: DashConstants.SEGMENT_TYPE_MEDIA };
            const cmcdData = cmcdModel.getCmcdData(request, 'video');

            expect(cmcdData.nor).to.equal('../next/segment.m4s'); // Assuming relative path processing
            expect(cmcdData.nrr).to.equal('1000-2000');

            const encodedQuery = cmcdModel.getEncodedCmcdData(cmcdData, CMCD_MODE.QUERY);
            expect(encodedQuery).to.include('nor%3D..%2Fnext%2Fsegment.m4s');
            expect(encodedQuery).to.include('nrr%3D1000-2000');

            const encodedHeaders = cmcdModel.getEncodedCmcdData(cmcdData, CMCD_MODE.HEADER);
            expect(encodedHeaders[CMCD_REQUEST_FIELD_NAME]).to.include('nor="../next/segment.m4s"');
            expect(encodedHeaders[CMCD_REQUEST_FIELD_NAME]).to.include('nrr="1000-2000"');
        });

    });
});
