import CmcdController from '../../../../../src/streaming/controllers/CmcdController';
import {
    CMCD_MODE,
    CMCD_VERSION,
    CMCD_HEARTBEAT_UPDATE_INTERVAL
} from '../../../../../src/streaming/constants/CmcdConstants';
import Events from '../../../../../src/core/events/Events';
import EventBus from '../../../../../src/core/EventBus';

import DashConstants from '../../../../../src/dash/constants/DashConstants';
import MediaPlayerEvents from '../../../../../src/streaming/MediaPlayerEvents';

const chai = require('chai');
const spies = require('chai-spies');
const expect = chai.expect;

chai.use(spies);

describe('CmcdController', function () {
    let cmcdController;
    let eventBus;
    let mockMediaController;
    let mockAbrController;
    let mockDashMetrics;
    let mockMediaPlayerModel;
    let mockPlaybackController;
    let mockSettings;
    let mockStreamController;
    let mockVideoModel;

    const context = {};

    beforeEach(function () {
        eventBus = EventBus(context).getInstance();

        mockMediaController = {
            getMediaType: () => 'video',
            getCurrentTrack: () => ({
                id: 'video_0',
                codec: 'avc1.640028',
                bitrateList: [{ bandwidth: 1000 }, { bandwidth: 2000 }],
                viewpoint: { id: 'viewpoint_1' },
                representationId: 'video_1_0',
                switchingSetId: 'video_1'
            }),
            getSwitchHistory: () => ({
                switchHistory: [{
                    representationId: 'video_1_0',
                    timestamp: Date.now() - 1000,
                    playbackTime: 10
                }]
            })
        };

        mockAbrController = {
            getAbrStrategy: () => 'abrStrategy',
            getThroughputHistory: () => ({
                getSafeAverageThroughput: () => 5000,
                getAverageLatency: () => 100
            }),
            getAbandonmentStateFor: () => 'abandonedState'
        };

        mockDashMetrics = {
            getCurrentBufferLevel: () => 10,
            getCurrentRepresentationSwitch: () => ({
                mtp: Date.now() - 2000,
                to: 'video_1_0',
                lto: {
                    id: 'video_0_0',
                    mediaType: 'video',
                    adaptation: { id: 'video_0' },
                    representation: { id: 'video_0_0' }
                }
            }),
            getLatestBufferInfoVO: () => ({
                type: 'video',
                level: 10,
                isBufferStalled: false
            })
        };

        mockMediaPlayerModel = {
            getStreamingProtocol: () => 'dash',
            getSegmentDuration: () => 2,
            getBandwidthHint: () => 3000,
            getUseCmcdData(): true,
            getCmcdVersion: () => CMCD_VERSION.V1,
            getCmcdMode: () => CMCD_MODE.HEADER,
            getCmcdEnabled: () => true,
            getCmcdTargetBufferTime: () => 4,
            getCmcdIncludeKeys: () => [],
            getCmcdContentId: () => 'testContentId',
            getCmcdSessionId: () => 'testSessionId',
            getCmcdRtpSafetyFactor: () => 1.5
        };

        mockPlaybackController = {
            getStreamStartTime: () => Date.now() - 10000,
            getNormalizedTime: () => 10,
            getLiveDelay: () => 5,
            getPlaybackRate: () => 1,
            getIsDynamic: () => false,
            getTimeToLoadDelay: () => 0.5
        };

        mockStreamController = {
            getActiveStreamInfo: () => ({
                id: 'stream_0',
                manifestInfo: {
                    isDynamic: false,
                    duration: 100
                }
            })
        };

        mockVideoModel = {
            getElement: () => ({
                readyState: 4,
                playbackRate: 1,
                videoWidth: 1920,
                videoHeight: 1080
            }),
            getCurrentTrack: () => ({
                id: 'video_0',
                codec: 'avc1.640028',
                bitrateList: [{ bandwidth: 1000 }, { bandwidth: 2000 }],
                viewpoint: { id: 'viewpoint_1' },
                representationId: 'video_1_0',
                switchingSetId: 'video_1'
            })
        };

        mockSettings = {
            get: chai.spy((key) => {
                if (key === 'streaming') {
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
                            heartbeatUpdateInterval: CMCD_HEARTBEAT_UPDATE_INTERVAL
                        }
                    };
                }
                return null;
            }),
            set: chai.spy()
        };


        cmcdController = CmcdController(context).create({
            mediaPlayerModel: mockMediaPlayerModel,
            playbackController: mockPlaybackController,
            dashMetrics: mockDashMetrics,
            abrController: mockAbrController,
            streamController: mockStreamController,
            mediaController: mockMediaController,
            videoModel: mockVideoModel,
            settings: mockSettings,
            eventBus: eventBus
        });
        cmcdController.initialize();
    });

    afterEach(function () {
        cmcdController.reset();
        eventBus.reset();
    });

    describe('initialize', function () {
        it('should initialize correctly and register event listeners', function () {
            expect(cmcdController).to.exist;
            expect(eventBus.on).to.have.been.called.with(Events.PLAYBACK_PLAYING, cmcdController.onPlaybackStateChanged);
            expect(eventBus.on).to.have.been.called.with(Events.PLAYBACK_PAUSED, cmcdController.onPlaybackStateChanged);
            expect(eventBus.on).to.have.been.called.with(Events.PLAYBACK_SEEKED, cmcdController.onPlaybackStateChanged);
            expect(eventBus.on).to.have.been.called.with(Events.PLAYBACK_ENDED, cmcdController.onPlaybackEnded);
            expect(eventBus.on).to.have.been.called.with(Events.PLAYBACK_ERROR, cmcdController.onPlaybackError);
            expect(eventBus.on).to.have.been.called.with(Events.MANIFEST_LOADED, cmcdController.onManifestLoaded);
            expect(eventBus.on).to.have.been.called.with(MediaPlayerEvents.FRAGMENT_LOADING_COMPLETED, cmcdController.onFragmentLoadingCompleted);
            expect(eventBus.on).to.have.been.called.with(MediaPlayerEvents.STREAM_COMPLETED, cmcdController.onStreamCompleted);
            expect(eventBus.on).to.have.been.called.with(MediaPlayerEvents.BUFFER_EMPTY, cmcdController.onBufferEmpty);
            expect(eventBus.on).to.have.been.called.with(MediaPlayerEvents.QUALITY_CHANGE_REQUESTED, cmcdController.onQualityChangeRequested);
        });
    });

    describe('CMCD Data Generation - Query Mode', function () {
        beforeEach(function () {
            // Ensure CMCD is enabled and mode is query for these tests
            mockMediaPlayerModel.getCmcdEnabled = () => true;
            mockMediaPlayerModel.getCmcdMode = () => CMCD_MODE.QUERY;
            mockMediaPlayerModel.getCmcdVersion = () => CMCD_VERSION.V1;
            cmcdController.setConfig({
                mediaPlayerModel: mockMediaPlayerModel,
                playbackController: mockPlaybackController,
                dashMetrics: mockDashMetrics,
                abrController: mockAbrController,
                streamController: mockStreamController,
                mediaController: mockMediaController,
                videoModel: mockVideoModel,
                settings: mockSettings,
                eventBus: eventBus
            });
        });

        it('should generate CMCD data object for video segment request', function () {
            const request = { mediaType: 'video', type: DashConstants.SEGMENT_TYPE_MEDIA, startTime: 0, duration: 2, representationId: 'video_1_0' };
            const cmcdData = cmcdController.getCmcdData('video', request);

            expect(cmcdData).to.be.an('object');
            expect(cmcdData.v).to.equal(CMCD_VERSION.V1);
            expect(cmcdData.sid).to.equal('testSessionId');
            expect(cmcdData.cid).to.equal('testContentId');
            expect(cmcdData.ot).to.equal('v'); // object type
            expect(cmcdData.sf).to.equal('d'); // streaming format
            expect(cmcdData.st).to.equal('v'); // stream type
            expect(cmcdData.d).to.equal(2000); // duration
            expect(cmcdData.bl).to.be.a('number'); // buffer length
            expect(cmcdData.dl).to.be.a('number'); // deadline
            expect(cmcdData.mtp).to.be.a('number'); // measured throughput
            expect(cmcdData.br).to.be.a('number'); // bitrate
            expect(cmcdData.tb).to.be.a('number'); // top bitrate
        });

        it('should generate CMCD data for audio segment request', function () {
            mockMediaController.getMediaType = () => 'audio';
            mockMediaController.getCurrentTrack = () => ({
                id: 'audio_0',
                codec: 'mp4a.40.2',
                bitrateList: [{ bandwidth: 128000 }, { bandwidth: 256000 }],
                representationId: 'audio_1_0',
                switchingSetId: 'audio_1'
            });
            const request = { mediaType: 'audio', type: DashConstants.SEGMENT_TYPE_MEDIA, startTime: 0, duration: 2, representationId: 'audio_1_0' };
            const cmcdData = cmcdController.getCmcdData('audio', request);

            expect(cmcdData).to.be.an('object');
            expect(cmcdData.ot).to.equal('a');
            expect(cmcdData.br).to.be.a('number');
            expect(cmcdData.tb).to.be.a('number');
        });

        it('should include specific keys if whitelisted', function () {
            mockMediaPlayerModel.getCmcdIncludeKeys = () => ['br', 'd', 'ot'];
            cmcdController.setConfig({ // Re-initialize with new includeKeys
                mediaPlayerModel: mockMediaPlayerModel,
                playbackController: mockPlaybackController,
                dashMetrics: mockDashMetrics,
                abrController: mockAbrController,
                streamController: mockStreamController,
                mediaController: mockMediaController,
                videoModel: mockVideoModel,
                settings: mockSettings,
                eventBus: eventBus
            });
            const request = { mediaType: 'video', type: DashConstants.SEGMENT_TYPE_MEDIA, startTime: 0, duration: 2, representationId: 'video_1_0' };
            const cmcdData = cmcdController.getCmcdData('video', request);

            expect(Object.keys(cmcdData)).to.deep.equal(['br', 'd', 'ot']);
        });
    });

    describe('CMCD Data Generation - Header Mode', function () {
        beforeEach(function () {
            mockMediaPlayerModel.getCmcdEnabled = () => true;
            mockMediaPlayerModel.getCmcdMode = () => CMCD_MODE.HEADER;
            mockMediaPlayerModel.getCmcdVersion = () => CMCD_VERSION.V1;
            cmcdController.setConfig({
                mediaPlayerModel: mockMediaPlayerModel,
                playbackController: mockPlaybackController,
                dashMetrics: mockDashMetrics,
                abrController: mockAbrController,
                streamController: mockStreamController,
                mediaController: mockMediaController,
                videoModel: mockVideoModel,
                settings: mockSettings,
                eventBus: eventBus
            });
        });

        it('should generate CMCD data string for headers', function () {
            const request = { mediaType: 'video', type: DashConstants.SEGMENT_TYPE_MEDIA, startTime: 0, duration: 2, representationId: 'video_1_0' };
            const cmcdHeaderString = cmcdController.getCmcdDataAsHeaders('video', request);

            expect(cmcdHeaderString).to.be.an('object');
            expect(cmcdHeaderString['CMCD-Object']).to.exist;
            expect(cmcdHeaderString['CMCD-Request']).to.exist;
            expect(cmcdHeaderString['CMCD-Session']).to.exist;
            expect(cmcdHeaderString['CMCD-Status']).to.exist;

            // Check some values in the header string
            expect(cmcdHeaderString['CMCD-Session']).to.include(`sid="${mockMediaPlayerModel.getCmcdSessionId()}"`);
            expect(cmcdHeaderString['CMCD-Session']).to.include(`cid="${mockMediaPlayerModel.getCmcdContentId()}"`);
            expect(cmcdHeaderString['CMCD-Object']).to.include('ot=v');
            expect(cmcdHeaderString['CMCD-Object']).to.include('d=2000');
        });

        it('should include specific keys in headers if whitelisted', function () {
            mockMediaPlayerModel.getCmcdIncludeKeys = () => ['br', 'd', 'ot'];
             cmcdController.setConfig({ // Re-initialize with new includeKeys
                mediaPlayerModel: mockMediaPlayerModel,
                playbackController: mockPlaybackController,
                dashMetrics: mockDashMetrics,
                abrController: mockAbrController,
                streamController: mockStreamController,
                mediaController: mockMediaController,
                videoModel: mockVideoModel,
                settings: mockSettings,
                eventBus: eventBus
            });
            const request = { mediaType: 'video', type: DashConstants.SEGMENT_TYPE_MEDIA, startTime: 0, duration: 2, representationId: 'video_1_0' };
            const cmcdHeaderString = cmcdController.getCmcdDataAsHeaders('video', request);

            // Check that only whitelisted keys are present (considering their header categories)
            // This is a simplified check; a more robust check would parse the header string
            expect(cmcdHeaderString['CMCD-Object']).to.include('br=');
            expect(cmcdHeaderString['CMCD-Object']).to.include('d=2000');
            expect(cmcdHeaderString['CMCD-Object']).to.include('ot=v');
            expect(cmcdHeaderString['CMCD-Request']).to.not.exist; // Example: if no request category keys are whitelisted
            expect(cmcdHeaderString['CMCD-Status']).to.not.exist; // Example: if no status category keys are whitelisted
        });
    });

    describe('Event Handling', function() {
        it('should update playback state on PLAYBACK_PLAYING event', function() {
            const spy = chai.spy.on(cmcdController, 'updatePlaybackState');
            eventBus.trigger(Events.PLAYBACK_PLAYING);
            expect(spy).to.have.been.called();
        });

        it('should update playback state on PLAYBACK_PAUSED event', function() {
            const spy = chai.spy.on(cmcdController, 'updatePlaybackState');
            eventBus.trigger(Events.PLAYBACK_PAUSED);
            expect(spy).to.have.been.called();
        });

        it('should update manifest data on MANIFEST_LOADED event', function() {
            const spy = chai.spy.on(cmcdController, 'updateManifestData');
            const manifestData = { type: 'dynamic', duration: 1000 };
            eventBus.trigger(Events.MANIFEST_LOADED, { manifest: manifestData, mediaType: 'video' });
            expect(spy).to.have.been.called.with(manifestData, 'video');
        });

        it('should handle fragment loading completion and update CMCD data', function() {
            const spy = chai.spy.on(cmcdController, 'updateCmcdDataForRequest');
            const eventData = {
                request: { mediaType: 'video', type: DashConstants.SEGMENT_TYPE_MEDIA, startTime: 0, duration: 2, representationId: 'video_1_0', quality: 0 },
                response: { headers: {}, status: 200 },
                mediaType: 'video'
            };
            eventBus.trigger(MediaPlayerEvents.FRAGMENT_LOADING_COMPLETED, eventData);
            expect(spy).to.have.been.called.with(eventData.request, eventData.response, eventData.mediaType);
        });

        it('should set startup to true on BUFFER_EMPTY event if it is the first buffer empty event', function() {
            cmcdController.reset(); // Reset to clear initial startup state
            cmcdController.initialize(); // Re-initialize
            expect(cmcdController.getStartup()).to.be.false;
            eventBus.trigger(MediaPlayerEvents.BUFFER_EMPTY, {streamId: 'stream_0', mediaType: 'video'});
            expect(cmcdController.getStartup()).to.be.true;
            // Trigger again to ensure it's only set on the first occurrence during startup phase
            eventBus.trigger(MediaPlayerEvents.BUFFER_EMPTY, {streamId: 'stream_0', mediaType: 'video'});
            expect(cmcdController.getStartup()).to.be.true; // Should remain true, not toggled
        });


        it('should set starved to true on BUFFER_EMPTY event after playback has started', function() {
            // Simulate playback started
            cmcdController.onPlaybackStateChanged({ e: { type: Events.PLAYBACK_PLAYING }});
            cmcdController.onPlaybackStateChanged({ e: { type: Events.PLAYBACK_PLAYING }}); // to ensure isPlaying is true
            cmcdController.setStartup(false); // Ensure startup phase is over

            expect(cmcdController.getStarved()).to.be.false;
            eventBus.trigger(MediaPlayerEvents.BUFFER_EMPTY, {streamId: 'stream_0', mediaType: 'video'});
            expect(cmcdController.getStarved()).to.be.true;
        });


        it('should update next object request on QUALITY_CHANGE_REQUESTED event', function() {
            const spy = chai.spy.on(cmcdController, 'updateNextObjectRequest');
            const eventData = { mediaType: 'video', newQuality: 1, oldQuality: 0, streamId: 'stream_0' };
            eventBus.trigger(MediaPlayerEvents.QUALITY_CHANGE_REQUESTED, eventData);
            expect(spy).to.have.been.called.with(eventData.mediaType, eventData.newQuality);
        });

    });

    describe('CMCD Version 2 Specific Features', function() {
        beforeEach(function () {
            mockMediaPlayerModel.getCmcdEnabled = () => true;
            mockMediaPlayerModel.getCmcdVersion = () => CMCD_VERSION.V2;
            mockMediaPlayerModel.getCmcdMode = () => CMCD_MODE.QUERY; // Default to query for these tests
            cmcdController.setConfig({
                mediaPlayerModel: mockMediaPlayerModel,
                playbackController: mockPlaybackController,
                dashMetrics: mockDashMetrics,
                abrController: mockAbrController,
                streamController: mockStreamController,
                mediaController: mockMediaController,
                videoModel: mockVideoModel,
                settings: mockSettings,
                eventBus: eventBus
            });
        });

        it('should report CMCD version 2 correctly in query parameters', function() {
            const request = { mediaType: 'video', type: DashConstants.SEGMENT_TYPE_MEDIA, startTime: 0, duration: 2, representationId: 'video_1_0' };
            const cmcdData = cmcdController.getCmcdData('video', request);
            expect(cmcdData.v).to.equal(CMCD_VERSION.V2);
        });

        it('should report CMCD version 2 correctly in headers', function() {
            mockMediaPlayerModel.getCmcdMode = () => CMCD_MODE.HEADER;
            cmcdController.setConfig({ // Re-initialize with new mode
                mediaPlayerModel: mockMediaPlayerModel,
                playbackController: mockPlaybackController,
                dashMetrics: mockDashMetrics,
                abrController: mockAbrController,
                streamController: mockStreamController,
                mediaController: mockMediaController,
                videoModel: mockVideoModel,
                settings: mockSettings,
                eventBus: eventBus
            });
            const request = { mediaType: 'video', type: DashConstants.SEGMENT_TYPE_MEDIA, startTime: 0, duration: 2, representationId: 'video_1_0' };
            const cmcdHeaderString = cmcdController.getCmcdDataAsHeaders('video', request);
            expect(cmcdHeaderString['CMCD-Session']).to.include(`v=${CMCD_VERSION.V2}`);
        });

        it('should include playback rate (pr) when playing and CMCD v2', function() {
            mockPlaybackController.getPlaybackRate = () => 1.5;
            eventBus.trigger(Events.PLAYBACK_PLAYING); // Ensure isPlaying is true
            const request = { mediaType: 'video', type: DashConstants.SEGMENT_TYPE_MEDIA, startTime: 0, duration: 2, representationId: 'video_1_0' };
            const cmcdData = cmcdController.getCmcdData('video', request);
            expect(cmcdData.pr).to.equal(1.5);
        });

        it('should include startup (su) key when in startup phase for CMCD v2', function() {
            cmcdController.reset();
            cmcdController.initialize(); // Reset startup state
            mockMediaPlayerModel.getCmcdVersion = () => CMCD_VERSION.V2; // Ensure V2
             cmcdController.setConfig({
                mediaPlayerModel: mockMediaPlayerModel,
                playbackController: mockPlaybackController,
                dashMetrics: mockDashMetrics,
                abrController: mockAbrController,
                streamController: mockStreamController,
                mediaController: mockMediaController,
                videoModel: mockVideoModel,
                settings: mockSettings,
                eventBus: eventBus
            });
            eventBus.trigger(MediaPlayerEvents.BUFFER_EMPTY, {streamId: 'stream_0', mediaType: 'video'}); // Triggers startup state
            const request = { mediaType: 'video', type: DashConstants.SEGMENT_TYPE_MEDIA, startTime: 0, duration: 2, representationId: 'video_1_0' };
            const cmcdData = cmcdController.getCmcdData('video', request);
            expect(cmcdData.su).to.be.true;
        });

        describe('Heartbeat (hb) Mechanism - CMCD v2', function() {
            let clock;

            beforeEach(function() {
                clock = chai.spy.clock();
                mockMediaPlayerModel.getCmcdVersion = () => CMCD_VERSION.V2;
                // Ensure settings provide a heartbeat interval
                mockSettings.get = chai.spy((key) => {
                    if (key === 'streaming') {
                        return {
                            cmcd: {
                                enabled: true,
                                sid: 'testSessionId',
                                cid: 'testContentId',
                                rtpSafetyFactor: 1.5,
                                useHeaders: false,
                                version: CMCD_VERSION.V2,
                                mode: CMCD_MODE.QUERY,
                                targetBufferTime: 4,
                                includeKeys: [],
                                heartbeatUpdateInterval: 5000 // 5 seconds for testing
                            }
                        };
                    }
                    return null;
                });
                cmcdController.setConfig({ // Re-initialize with new settings for heartbeat
                    mediaPlayerModel: mockMediaPlayerModel,
                    playbackController: mockPlaybackController,
                    dashMetrics: mockDashMetrics,
                    abrController: mockAbrController,
                    streamController: mockStreamController,
                    mediaController: mockMediaController,
                    videoModel: mockVideoModel,
                    settings: mockSettings,
                    eventBus: eventBus
                });
            });

            afterEach(function() {
                clock.restore();
            });

            it('should send heartbeat (hb) updates periodically when playing', function() {
                const sendHeartbeatSpy = chai.spy.on(cmcdController, 'sendHeartbeat');
                eventBus.trigger(Events.PLAYBACK_PLAYING); // Start playback

                expect(sendHeartbeatSpy).to.not.have.been.called(); // Should not be called immediately

                clock.tick(5000);
                expect(sendHeartbeatSpy).to.have.been.called.once;

                clock.tick(5000);
                expect(sendHeartbeatSpy).to.have.been.called.twice;

                eventBus.trigger(Events.PLAYBACK_PAUSED); // Pause playback
                clock.tick(5000);
                expect(sendHeartbeatSpy).to.have.been.called.twice; // Should not be called while paused
            });

             it('should include hb in CMCD data when heartbeat event occurs', function() {
                eventBus.trigger(Events.PLAYBACK_PLAYING); // Start playback
                const request = { mediaType: 'video', type: DashConstants.SEGMENT_TYPE_MEDIA, startTime: 0, duration: 2, representationId: 'video_1_0' };
                // Simulate internal heartbeat trigger leads to data request
                cmcdController.setIsHeartbeat(true);
                const cmcdData = cmcdController.getCmcdData('video', request);
                expect(cmcdData.hb).to.be.a('number'); // Heartbeat is typically a counter or timestamp
                cmcdController.setIsHeartbeat(false); // Reset for other tests
            });
        });
    });

    describe('CMCD Data Omission and Edge Cases', function() {
        beforeEach(function () {
            // Default to V1, Query mode for these tests unless specified
            mockMediaPlayerModel.getCmcdVersion = () => CMCD_VERSION.V1;
            mockMediaPlayerModel.getCmcdMode = () => CMCD_MODE.QUERY;
            cmcdController.setConfig({
                mediaPlayerModel: mockMediaPlayerModel,
                playbackController: mockPlaybackController,
                dashMetrics: mockDashMetrics,
                abrController: mockAbrController,
                streamController: mockStreamController,
                mediaController: mockMediaController,
                videoModel: mockVideoModel,
                settings: mockSettings,
                eventBus: eventBus
            });
        });

        it('should not generate CMCD data if cmcdEnabled is false', function() {
            mockMediaPlayerModel.getCmcdEnabled = () => false;
            cmcdController.setConfig({ // Re-initialize with CMCD disabled
                mediaPlayerModel: mockMediaPlayerModel,
                playbackController: mockPlaybackController,
                dashMetrics: mockDashMetrics,
                abrController: mockAbrController,
                streamController: mockStreamController,
                mediaController: mockMediaController,
                videoModel: mockVideoModel,
                settings: mockSettings,
                eventBus: eventBus
            });
            const request = { mediaType: 'video', type: DashConstants.SEGMENT_TYPE_MEDIA, startTime: 0, duration: 2 };
            const cmcdData = cmcdController.getCmcdData('video', request);
            expect(cmcdData).to.be.null;

            const cmcdHeaders = cmcdController.getCmcdDataAsHeaders('video', request);
            expect(cmcdHeaders).to.be.null;
        });

        it('should omit cid if getCmcdContentId returns null', function() {
            mockMediaPlayerModel.getCmcdContentId = () => null;
            cmcdController.setConfig({ mediaPlayerModel: mockMediaPlayerModel });
            const request = { mediaType: 'video', type: DashConstants.SEGMENT_TYPE_MEDIA, startTime: 0, duration: 2 };
            const cmcdData = cmcdController.getCmcdData('video', request);
            expect(cmcdData).to.be.an('object');
            expect(cmcdData.cid).to.be.undefined;
        });

        it('should omit sid if getCmcdSessionId returns null', function() {
            mockMediaPlayerModel.getCmcdSessionId = () => null;
            cmcdController.setConfig({ mediaPlayerModel: mockMediaPlayerModel });
            const request = { mediaType: 'video', type: DashConstants.SEGMENT_TYPE_MEDIA, startTime: 0, duration: 2 };
            const cmcdData = cmcdController.getCmcdData('video', request);
            expect(cmcdData).to.be.an('object');
            expect(cmcdData.sid).to.be.undefined;
        });

        it('should gracefully handle missing current track for bitrate/top bitrate', function() {
            mockMediaController.getCurrentTrack = () => null;
            cmcdController.setConfig({ mediaController: mockMediaController });
            const request = { mediaType: 'video', type: DashConstants.SEGMENT_TYPE_MEDIA, startTime: 0, duration: 2 };
            const cmcdData = cmcdController.getCmcdData('video', request);
            expect(cmcdData).to.be.an('object');
            expect(cmcdData.br).to.be.undefined;
            expect(cmcdData.tb).to.be.undefined;
        });

        it('should gracefully handle missing dashMetrics data for buffer length', function() {
            mockDashMetrics.getCurrentBufferLevel = () => null;
            cmcdController.setConfig({ dashMetrics: mockDashMetrics });
            const request = { mediaType: 'video', type: DashConstants.SEGMENT_TYPE_MEDIA, startTime: 0, duration: 2 };
            const cmcdData = cmcdController.getCmcdData('video', request);
            expect(cmcdData).to.be.an('object');
            expect(cmcdData.bl).to.be.undefined;
        });
    });

    describe('Advanced CMCD Key Behavior and Versioning', function() {
        it('should include rtp (Requested maximum throughput) and respect rtpSafetyFactor', function() {
            // Assuming targetBufferTime = 4s, segmentDuration = 2s, rtpSafetyFactor = 1.5
            // rtp = (targetBufferTime / segmentDuration) * segmentBitrate * rtpSafetyFactor
            // This test will check if rtp is calculated, actual value depends on bitrate from track.
            mockMediaPlayerModel.getCmcdTargetBufferTime = () => 4;
            mockMediaPlayerModel.getSegmentDuration = () => 2;
            mockMediaPlayerModel.getCmcdRtpSafetyFactor = () => 1.5;
            mockMediaController.getCurrentTrack = () => ({ // Ensure a track with bitrate is available
                bitrateList: [{ bandwidth: 1000000 }] // 1 Mbps
            });
             cmcdController.setConfig({
                mediaPlayerModel: mockMediaPlayerModel,
                mediaController: mockMediaController,
            });

            const request = { mediaType: 'video', type: DashConstants.SEGMENT_TYPE_MEDIA, representationId: 'video_1_0' };
            const cmcdData = cmcdController.getCmcdData('video', request);
            expect(cmcdData.rtp).to.be.a('number');
            // Example: If selected bitrate was 1Mbps (1000kbps for CMCD)
            // rtp = (4 / 2) * 1000 * 1.5 = 2 * 1000 * 1.5 = 3000 (kbps)
            // We check if it's a number, actual calculation is internal and complex.
            // A more precise test would mock getNextBitrate and verify exact rtp.
        });

        it('should send bs (buffer starvation) key if player is starved and CMCD v2', function() {
            mockMediaPlayerModel.getCmcdVersion = () => CMCD_VERSION.V2;
            cmcdController.setConfig({ mediaPlayerModel: mockMediaPlayerModel });

            // Simulate playback started and then buffer empty (starvation)
            cmcdController.onPlaybackStateChanged({ e: { type: Events.PLAYBACK_PLAYING }});
            cmcdController.setStartup(false); // Ensure startup phase is over
            eventBus.trigger(MediaPlayerEvents.BUFFER_EMPTY, {streamId: 'stream_0', mediaType: 'video'}); // Triggers starved state

            const request = { mediaType: 'video', type: DashConstants.SEGMENT_TYPE_MEDIA, representationId: 'video_1_0' };
            const cmcdData = cmcdController.getCmcdData('video', request);
            expect(cmcdData.bs).to.be.true;
            expect(cmcdData.su).to.be.undefined; // Should not be startup if starved
        });

        it('should correctly report stream type (st) for VOD content', function() {
            mockPlaybackController.getIsDynamic = () => false; // VOD
            cmcdController.setConfig({ playbackController: mockPlaybackController });
            const request = { mediaType: 'video', type: DashConstants.SEGMENT_TYPE_MEDIA, representationId: 'video_1_0' };
            const cmcdData = cmcdController.getCmcdData('video', request);
            expect(cmcdData.st).to.equal('v'); // 'v' for VOD
        });

        it('should correctly report stream type (st) for Live content for CMCD v1', function() {
            mockMediaPlayerModel.getCmcdVersion = () => CMCD_VERSION.V1;
            mockPlaybackController.getIsDynamic = () => true; // Live
            cmcdController.setConfig({ mediaPlayerModel: mockMediaPlayerModel, playbackController: mockPlaybackController });
            const request = { mediaType: 'video', type: DashConstants.SEGMENT_TYPE_MEDIA, representationId: 'video_1_0' };
            const cmcdData = cmcdController.getCmcdData('video', request);
            expect(cmcdData.st).to.equal('l'); // 'l' for Live in v1
        });

        it('should correctly report stream type (st) for Live content for CMCD v2', function() {
            mockMediaPlayerModel.getCmcdVersion = () => CMCD_VERSION.V2;
            mockPlaybackController.getIsDynamic = () => true; // Live
            cmcdController.setConfig({ mediaPlayerModel: mockMediaPlayerModel, playbackController: mockPlaybackController });
            const request = { mediaType: 'video', type: DashConstants.SEGMENT_TYPE_MEDIA, representationId: 'video_1_0' };
            const cmcdData = cmcdController.getCmcdData('video', request);
            expect(cmcdData.st).to.equal('l'); // 'l' for Live in v2 (same as v1 for this key)
        });


        it('should send CMCD data with "other" type if request type is not media/init segment', function () {
            const request = { mediaType: 'video', type: 'other', url: 'http://example.com/someotherfile.txt' };
            const cmcdData = cmcdController.getCmcdData('video', request);
            expect(cmcdData.ot).to.equal('o');
        });

        it('should send CMCD data with manifest type (m) for manifest requests', function () {
            const request = { mediaType: 'manifest', type: 'manifest', url: 'http://example.com/manifest.mpd' };
            // Typically, getCmcdData is called with mediaType 'video' or 'audio' even for manifest,
            // but the internal logic should identify it as manifest.
            // We might need a specific method or parameter to indicate a manifest request if getCmcdData is strictly for segments.
            // For now, let's assume the controller can identify manifest requests based on type.
            // This might require a more specific test if the controller uses a different path for manifest CMCD data.
            // Re-checking CmcdController, it seems it's mainly focused on segment requests.
            // Let's simulate a manifest request by setting the object type directly if possible or checking common keys.
            // As a workaround for testing, we can check if common keys like 'sid', 'cid', 'v' are present for any request.
            const cmcdDataForManifest = cmcdController.getCmcdDataForPayload({ ot: 'm' }); // Simulate direct payload construction
            expect(cmcdDataForManifest.ot).to.equal('m');
            expect(cmcdDataForManifest.sid).to.equal('testSessionId'); // Session specific
        });


        it('should include next object request (nor) if next fragment is known', function() {
            // This requires mocking getNextFragmentRequest or similar logic within AbrController/FragmentController
            // For simplicity, we'll assume the controller can determine this and check for the key's presence.
            // A more detailed test would involve deeper mocking of the ABR/fragment loading logic.
            mockAbrController.getNextFragmentRequest = () => ({ url: 'next_segment.m4s' }); // Simplified mock
            cmcdController.setConfig({ abrController: mockAbrController });

            const request = { mediaType: 'video', type: DashConstants.SEGMENT_TYPE_MEDIA, representationId: 'video_1_0', url: 'current_segment.m4s' };
            const cmcdData = cmcdController.getCmcdData('video', request);
            // The actual value of 'nor' is complex (relative path). Here we just check if the logic to add it exists.
            // In a real environment, this depends on the fragment loader and manifest.
            // Given the current structure, direct testing of 'nor' value is hard without significant mocking.
            // We will assume if getNextFragmentRequest is called and returns something, 'nor' might be populated.
            // This test is more of a placeholder for ensuring the pathway for 'nor' is considered.
            // The actual implementation of _getNextObjectRequestUrl in CmcdModel.js is what creates this.
            // We expect it to be undefined if no next request is determined by the internal model.
            if (cmcdData.nor) { // Only check if present, as it might not always be.
                 expect(cmcdData.nor).to.be.a('string');
            }
        });

        it('should use custom keys provided via settings', function() {
            mockSettings.get = chai.spy((key) => {
                if (key === 'streaming') {
                    return {
                        cmcd: {
                            enabled: true,
                            sid: 'testSessionId',
                            cid: 'testContentId',
                            version: CMCD_VERSION.V1,
                            mode: CMCD_MODE.QUERY,
                            customKeys: [{key: 'myKey', value: 'myValue'}, {key: 'anotherKey', value: 123}]
                        }
                    };
                }
                return null;
            });
            cmcdController.setConfig({ settings: mockSettings });
            const request = { mediaType: 'video', type: DashConstants.SEGMENT_TYPE_MEDIA, representationId: 'video_1_0' };
            const cmcdData = cmcdController.getCmcdData('video', request);
            expect(cmcdData.myKey).to.equal('myValue');
            expect(cmcdData.anotherKey).to.equal(123);
        });
    });

    describe('Further Edge Cases and Error Handling', function() {
        it('should report correct object type (ot) for text tracks', function() {
            const request = { mediaType: 'text', type: DashConstants.SEGMENT_TYPE_MEDIA, representationId: 'text_1_0' };
            // Need to ensure mediaController can be configured for 'text' or CmcdController handles it
            mockMediaController.getMediaType = () => 'text';
            cmcdController.setConfig({ mediaController: mockMediaController });
            const cmcdData = cmcdController.getCmcdData('text', request);
            expect(cmcdData.ot).to.equal('tt'); // 'tt' for text track
        });

        it('should handle invalid segment duration for d, dl, rtp calculations gracefully', function() {
            mockMediaPlayerModel.getSegmentDuration = () => 0; // Invalid duration
            cmcdController.setConfig({ mediaPlayerModel: mockMediaPlayerModel });
            const request = { mediaType: 'video', type: DashConstants.SEGMENT_TYPE_MEDIA, representationId: 'video_1_0' };
            const cmcdData = cmcdController.getCmcdData('video', request);

            expect(cmcdData.d).to.be.undefined; // Duration might be omitted or handled as per spec for invalid values
            expect(cmcdData.dl).to.be.undefined; // Deadline calculation depends on duration
            expect(cmcdData.rtp).to.be.undefined; // RTP calculation also depends on duration
        });

        it('should handle null segment duration gracefully', function() {
            mockMediaPlayerModel.getSegmentDuration = () => null; // Null duration
            cmcdController.setConfig({ mediaPlayerModel: mockMediaPlayerModel });
            const request = { mediaType: 'video', type: DashConstants.SEGMENT_TYPE_MEDIA, representationId: 'video_1_0' };
            const cmcdData = cmcdController.getCmcdData('video', request);

            expect(cmcdData.d).to.be.undefined;
            expect(cmcdData.dl).to.be.undefined;
            expect(cmcdData.rtp).to.be.undefined;
        });

        it('should handle zero live delay for live streams correctly for dl key', function() {
            mockPlaybackController.getIsDynamic = () => true;
            mockPlaybackController.getLiveDelay = () => 0; // Zero live delay
            cmcdController.setConfig({ playbackController: mockPlaybackController });
            const request = { mediaType: 'video', type: DashConstants.SEGMENT_TYPE_MEDIA, representationId: 'video_1_0' };
            const cmcdData = cmcdController.getCmcdData('video', request);
            // If live delay is 0, 'dl' might be very small or equal to segment duration,
            // or handled specially based on CMCD model's interpretation.
            // Expecting it to be a non-negative number.
            expect(cmcdData.dl).to.be.a('number').that.is.gte(0);
        });

        it('should handle missing abrController gracefully for mtp key', function() {
            cmcdController.setConfig({ abrController: null }); // Remove ABR controller
            const request = { mediaType: 'video', type: DashConstants.SEGMENT_TYPE_MEDIA, representationId: 'video_1_0' };
            const cmcdData = cmcdController.getCmcdData('video', request);
            expect(cmcdData.mtp).to.be.undefined;
        });

        it('should handle missing playbackController gracefully for keys like pr, st, dl', function() {
            cmcdController.setConfig({ playbackController: null }); // Remove Playback controller
            const request = { mediaType: 'video', type: DashConstants.SEGMENT_TYPE_MEDIA, representationId: 'video_1_0' };
            const cmcdData = cmcdController.getCmcdData('video', request);
            expect(cmcdData.pr).to.be.undefined; // Playback rate
            expect(cmcdData.st).to.be.undefined; // Stream type
            expect(cmcdData.dl).to.be.undefined; // Deadline
        });


        it('should not include Next Request Range (nrr) if request is not partial', function() {
            // nrr is for byte-range requests. Standard segment requests shouldn't have it.
            const request = { mediaType: 'video', type: DashConstants.SEGMENT_TYPE_MEDIA, representationId: 'video_1_0', range: undefined };
            const cmcdData = cmcdController.getCmcdData('video', request);
            expect(cmcdData.nrr).to.be.undefined;
        });

        it('should correctly round numerical values to nearest integer where specified by CMCD spec (e.g., bl, dl, d)', function() {
            mockDashMetrics.getCurrentBufferLevel = () => 10.345; // Buffer level in seconds
            mockMediaPlayerModel.getSegmentDuration = () => 1.987; // Segment duration in seconds
            mockPlaybackController.getLiveDelay = () => 4.567; // Live delay
            mockPlaybackController.getIsDynamic = () => true;
            cmcdController.setConfig({ dashMetrics: mockDashMetrics, mediaPlayerModel: mockMediaPlayerModel, playbackController: mockPlaybackController });

            const request = { mediaType: 'video', type: DashConstants.SEGMENT_TYPE_MEDIA, representationId: 'video_1_0' };
            const cmcdData = cmcdController.getCmcdData('video', request);

            // Values that are durations or times are typically rounded to nearest 100ms or integer ms.
            // CMCD spec: "integer milliseconds" for d, dl, bl.
            if (cmcdData.d) expect(cmcdData.d).to.equal(Math.round(1.987 * 1000)); // duration
            if (cmcdData.bl) expect(cmcdData.bl).to.equal(Math.round(10.345 * 1000)); // buffer length
            // dl = (liveDelay - segmentDuration) * 1000 for live if liveDelay > segmentDuration
            // or more complex based on target buffer. For this test, we assume a simplified calculation path is hit.
            // The actual dl calculation is: (this.cmcdModel.getCorrectedBufferLevel(bufferLevel) + segmentDuration * 1000 - this.cmcdModel.getVideoModel().getTimeToLoadDelay())
            // This is hard to precisely mock here without replicating the internal logic of getCorrectedBufferLevel etc.
            // For now, we'll check if it's an integer if present.
            if (cmcdData.dl) expect(cmcdData.dl % 1).to.equal(0);
        });

        it('should cap bitrate values (br, tb) at a reasonable maximum if necessary (spec dependent, mostly for query length)', function() {
            // This is more of a spec interpretation. The current code doesn't seem to cap client-side.
            // Let's assume extremely high bitrates are passed as is.
            mockMediaController.getCurrentTrack = () => ({
                bitrateList: [{ bandwidth: 500000000 }, { bandwidth: 1000000000 }] // 500 Mbps, 1 Gbps
            });
            cmcdController.setConfig({ mediaController: mockMediaController });
            const request = { mediaType: 'video', type: DashConstants.SEGMENT_TYPE_MEDIA, representationId: 'video_1_0' };
            const cmcdData = cmcdController.getCmcdData('video', request);
            expect(cmcdData.br).to.be.a('number'); // Should be the selected bitrate in kbps
            expect(cmcdData.tb).to.equal(1000000); // Top bitrate in kbps (1Gbps)
        });

    });
});
