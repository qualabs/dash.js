import AlternativeMpdController from '../../../../src/streaming/controllers/AlternativeMpdController.js';
import EventBus from '../../../../src/core/EventBus.js';
import MediaPlayerEvents from '../../../../src/streaming/MediaPlayerEvents.js';
import Constants from '../../../../src/streaming/constants/Constants.js';
import VideoModelMock from '../../mocks/VideoModelMock.js';
import PlaybackControllerMock from '../../mocks/PlaybackControllerMock.js';
import DebugMock from '../../mocks/DebugMock.js';
import AlternativeMpdControllerMock from '../../mocks/AlternativeMpdControllerMock.js';

import { expect } from 'chai';

const { 
    MOCK_URLS, 
    setupMockNetwork, 
    teardownMockNetwork, 
    mockMediaPlayerCreation, 
    cleanupMockMediaPlayers,
    setupMockDocumentCreation,
    teardownMockDocumentCreation
} = AlternativeMpdControllerMock;

const context = {};
const eventBus = EventBus(context).getInstance();

/**
 * Utility function to wait for an event with timeout
 * @param {string} eventName - The name of the event to wait for
 * @param {number} timeout - Timeout in milliseconds (default: 5000)
 * @returns {Promise} - Promise that resolves when event is triggered or rejects after timeout
 */
function waitForEvent(eventName, timeout = 1000) {
    return new Promise((resolve, reject) => {
        let eventHandler;
        const timeoutId = setTimeout(() => {
            if (eventHandler) {
                eventBus.off(eventName, eventHandler);
            }
            reject(new Error(`Event '${eventName}' not triggered within ${timeout}ms`));
        }, timeout);

        eventHandler = (data) => {
            clearTimeout(timeoutId);
            eventBus.off(eventName, eventHandler);
            resolve(data);
        };

        eventBus.on(eventName, eventHandler);
    });
}



describe('AlternativeMpdController', function () {
    let alternativeMpdController;
    let videoModelMock;
    let playbackControllerMock;
    let loggerMock;
    let dashConstantsMock;
    let originalMediaPlayer;
    
    // Store original methods for restoration in afterEach
    let originalPlay;
    let originalPause;
    let originalCreateElement;
    let originalSeek;
    let originalError;
    let originalTrigger;

    beforeEach(function () {
        setupMockNetwork();
        originalMediaPlayer = mockMediaPlayerCreation();
        setupMockDocumentCreation();
        
        alternativeMpdController = AlternativeMpdController(context).getInstance();
        videoModelMock = new VideoModelMock();
        playbackControllerMock = new PlaybackControllerMock();
        loggerMock = new DebugMock().getLogger();
        
        dashConstantsMock = {
            DYNAMIC: 'dynamic',
            STATIC: 'static'
        };

        alternativeMpdController.setConfig({
            videoModel: videoModelMock,
            playbackController: playbackControllerMock,
            DashConstants: dashConstantsMock,
            logger: loggerMock,
            hideAlternativePlayerControls: false,
            alternativeContext: context
        });
        
        // Store original methods
        originalPlay = videoModelMock.play;
        originalPause = videoModelMock.pause;
        originalCreateElement = document.createElement;
        originalSeek = playbackControllerMock.seek;
        originalError = loggerMock.error;
        originalTrigger = eventBus.trigger;
    });

    afterEach(function () {
        // Restore original methods
        if (originalPlay) {
            videoModelMock.play = originalPlay;
        }
        if (originalPause) {
            videoModelMock.pause = originalPause;
        }
        if (originalCreateElement) {
            document.createElement = originalCreateElement;
        }
        if (originalSeek) {
            playbackControllerMock.seek = originalSeek;
        }
        if (originalError) {
            loggerMock.error = originalError;
        }
        if (originalTrigger) {
            eventBus.trigger = originalTrigger;
        }
        
        // Cleanup mocks
        teardownMockNetwork();
        cleanupMockMediaPlayers();
        teardownMockDocumentCreation();
        if (originalMediaPlayer && typeof window !== 'undefined') {
            window.MediaPlayer = originalMediaPlayer;
        }
        
        alternativeMpdController.reset();
        alternativeMpdController = null;
        videoModelMock = null;
        playbackControllerMock = null;
        loggerMock = null;
        dashConstantsMock = null;
    });

    beforeEach(function () {
        alternativeMpdController.initialize();
        eventBus.trigger(MediaPlayerEvents.MANIFEST_LOADED, {
            data: {
                type: dashConstantsMock.STATIC,
                originalUrl: 'test.mpd'
            }
        });
    });

    describe('_onAlternativeEventTriggered', function () {
        it('should trigger REPLACE alternative MPD event and create a new video element', function (done) {
            const testEvent = {
                alternativeMpd: {
                    url: MOCK_URLS.ALTERNATIVE_MPD,
                    mode: Constants.ALTERNATIVE_MPD.MODES.REPLACE,
                    maxDuration: 10000
                },
                id: 'test-event-1',
                presentationTime: 5000,
                duration: 10000,
                eventStream: {
                    schemeIdUri: Constants.ALTERNATIVE_MPD.URIS.REPLACE,
                    timescale: 1000
                }
            };

            playbackControllerMock.setTime(5);

            let alternativeVideoElementCreated = false;
        
            document.createElement = function(tagName) {
                if (tagName.toLowerCase() === 'video') {
                    alternativeVideoElementCreated = true;
                }
                return originalCreateElement.call(document, tagName);
            };

            waitForEvent(Constants.ALTERNATIVE_MPD.URIS.REPLACE).then(() => {
                expect(alternativeVideoElementCreated).to.be.true;
                done();
            }).catch((error) => {
                done(error);
            });

            eventBus.trigger(Constants.ALTERNATIVE_MPD.URIS.REPLACE, {
                event: testEvent
            });
        });

        it('should trigger INSERT alternative MPD event and create a new video element', function (done) {
            const testEvent = {
                alternativeMpd: {
                    url: MOCK_URLS.ALTERNATIVE_MPD,
                    mode: Constants.ALTERNATIVE_MPD.MODES.INSERT,
                    maxDuration: 5000
                },
                id: 'test-event-2',
                presentationTime: 3000,
                duration: 5000,
                eventStream: {
                    schemeIdUri: Constants.ALTERNATIVE_MPD.URIS.INSERT,
                    timescale: 1000
                }
            };

            playbackControllerMock.setTime(3);

            let alternativeVideoElementCreated = false;

            document.createElement = function(tagName) {
                const element = originalCreateElement.call(document, tagName);
                if (tagName.toLowerCase() === 'video') {
                    alternativeVideoElementCreated = true;
                }
                return element;
            };

            waitForEvent(Constants.ALTERNATIVE_MPD.URIS.INSERT).then(() => {
                expect(alternativeVideoElementCreated).to.be.true;
                done();
            }).catch((error) => {
                done(error);
            });

            eventBus.trigger(Constants.ALTERNATIVE_MPD.URIS.INSERT, {
                event: testEvent
            });
        });
    });

    describe('_switchToAlternativeContent', function () {
        it.only('should play alternative content and pause main content', function (done) {
            const testEvent = {
                alternativeMpd: {
                    url: MOCK_URLS.ALTERNATIVE_MPD
                },
                id: 'switch-test',
                presentationTime: 0,
                eventStream: {
                    schemeIdUri: Constants.ALTERNATIVE_MPD.URIS.REPLACE,
                    timescale: 1000
                }
            };

            let mainVideoPaused = false;
            let alternativeVideoPlayed = false;
    
            document.createElement = function(tagName) {
                const element = originalCreateElement.call(document, tagName);
                if (tagName.toLowerCase() === 'video') {
                    element.play = function() {
                        alternativeVideoPlayed = true;
                    };
                }
                return element;
            };

            playbackControllerMock.setTime(0);

            waitForEvent(Constants.ALTERNATIVE_MPD.URIS.REPLACE).then(() => {
                expect(mainVideoPaused && alternativeVideoPlayed).to.be.true;
                done();
            }).catch((error) => {
                done(error);
            });

            eventBus.trigger(Constants.ALTERNATIVE_MPD.URIS.REPLACE, {
                event: testEvent
            });
        });
    });

    describe('_switchBackToMainContent', function () {
        it('should resume main video playback and cleanup alternative player', function (done) {
            const testEvent = {
                alternativeMpd: {
                    url: MOCK_URLS.ALTERNATIVE_MPD,
                    mode: Constants.ALTERNATIVE_MPD.MODES.REPLACE,
                    maxDuration: 5000
                },
                id: 'switch-back-test',
                presentationTime: 5000,
                eventStream: {
                    schemeIdUri: Constants.ALTERNATIVE_MPD.URIS.REPLACE,
                    timescale: 1000
                }
            };

            let eventProcessed = false;
            videoModelMock.play = function() {
                originalPlay.call(this);
            };

            playbackControllerMock.setTime(5);

            eventBus.trigger = function(eventType, data) {
                if (eventType === Constants.ALTERNATIVE_MPD.URIS.REPLACE) {
                    eventProcessed = true;
                }
                return originalTrigger.call(this, eventType, data);
            };

            waitForEvent(Constants.ALTERNATIVE_MPD.URIS.REPLACE).then(() => {
                expect(eventProcessed && videoModelMock.getElement().style.display === 'block').to.be.true;
                done();
            }).catch((error) => {
                done(error);
            });

            eventBus.trigger(Constants.ALTERNATIVE_MPD.URIS.REPLACE, {
                event: testEvent
            });
        });

        it('should return to the main content at the correct time after INSERT mode', function (done) {
            const testEvent = {
                alternativeMpd: {
                    url: MOCK_URLS.ALTERNATIVE_MPD,
                    mode: Constants.ALTERNATIVE_MPD.MODES.INSERT
                },
                id: 'insert-test',
                presentationTime: 7000,
                eventStream: {
                    schemeIdUri: Constants.ALTERNATIVE_MPD.URIS.INSERT,
                    timescale: 1000
                }
            };

            playbackControllerMock.seek = function(time) {
                expect(time).to.equal(7);
                originalSeek.call(this, time);
                setTimeout(() => {
                    eventBus.trigger(MediaPlayerEvents.PLAYBACK_SEEKED, { time: time });
                }, 10);
            };

            eventBus.trigger(Constants.ALTERNATIVE_MPD.URIS.INSERT, {
                event: testEvent
            });

            waitForEvent(MediaPlayerEvents.PLAYBACK_SEEKED)
                .then(() => {
                    done();
                })
                .catch(done);
        });
    });

    describe('Error handling', function () {
        it('should handle malformed events', function (done) {
            const malformedEvent = {
                // Missing alternativeMpd
                id: 'malformed-test',
                eventStream: {
                    schemeIdUri: Constants.ALTERNATIVE_MPD.URIS.REPLACE
                }
            };

            let errorCalled = false;
            loggerMock.error = function() {
                errorCalled = true;
                originalError.apply(this, arguments);
            };

            waitForEvent(Constants.ALTERNATIVE_MPD.URIS.REPLACE)
                .then(() => {
                    expect(errorCalled).to.be.true;
                    done();
                })
                .catch((error) => {
                    done(error);
                });

            eventBus.trigger(Constants.ALTERNATIVE_MPD.URIS.REPLACE, {
                event: malformedEvent
            });
        });
    });
});