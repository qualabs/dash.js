import OverlayController from '../../../../src/streaming/controllers/OverlayController.js';
import EventBus from '../../../../src/core/EventBus.js';
import VideoModelMock from '../../mocks/VideoModelMock.js';
import Constants from '../../../../src/streaming/constants/Constants.js';

import {expect} from 'chai';
const context = {};

const eventBus = EventBus(context).getInstance();

describe('OverlayController', function () {

    let overlayController,
        videoModelMock,
        videoElement,
        parentElement

    beforeEach(function () {
        overlayController = OverlayController(context).getInstance();
        videoModelMock = new VideoModelMock();

        overlayController.setConfig({
            videoModel: videoModelMock
        });

        videoElement = videoModelMock.element
        parentElement = document.createElement('div');
        parentElement.appendChild(videoElement);

        overlayController.setupOverlayEvents();
    });

    this.afterEach(function () {
        overlayController.reset()
    })

    describe('configure video element for overlay', function () {
        it('should apply the correct style properties to the video element', function () {
            overlayController.configureVideoElementForOverlay();
            
            expect(videoElement.style.width).to.equal('100%');
            expect(videoElement.style.height).to.equal('100%');
            expect(videoElement.style.transform).to.equal('scale(1)');
        });
    
        it('should apply the correct style properties to the parent element', function () {
            overlayController.configureVideoElementForOverlay();
    
            expect(parentElement.style.position).to.equal('relative');
            expect(parentElement.style.overflow).to.equal('hidden');
        });
    });

    describe('setupOverlayEvents', function () {
        it('should execute without throwing errors', function () {
            expect(() => overlayController.setupOverlayEvents()).to.not.throw();
        });

        it.only('should handle triggering an empty event without errors', function () {
            
            expect(() => {
                eventBus.trigger(Constants.OVERLAY.SCHEME_ID, {}); 
            }).to.not.throw();
        });

        it.only('should handle triggering the event start mode and video mimetype without errors', function () {
            expect(() => {
                eventBus.trigger(Constants.OVERLAY.SCHEME_ID, { event: {
                    overlay: {
                        mode: Constants.OVERLAY.START_MODE,
                        mimeType: Constants.OVERLAY.VIDEO_MIMETYPE
                    }
                }});
            }).to.not.throw();
        });

        it.only('should handle triggering the event start mode and iframe mimetype without errors', function () {
            expect(() => {
                eventBus.trigger(Constants.OVERLAY.SCHEME_ID, { event: {
                    overlay: {
                        mode: Constants.OVERLAY.START_MODE,
                        mimeType: Constants.OVERLAY.IFRMAE_MIMETYPE
                    }
                }});
            }).to.not.throw();
        });

        it.only('should handle triggering the event extend mode without errors', function () {
            expect(() => {
                eventBus.trigger(Constants.OVERLAY.SCHEME_ID, { event: {
                    overlay: {
                        mode: Constants.OVERLAY.START_MODE,
                        mimeType: Constants.OVERLAY.VIDEO_MIMETYPE,
                    },
                    duration: 5,
                    presentationTime: 3000,
                    id: '1234'
                }});

                eventBus.trigger(Constants.OVERLAY.SCHEME_ID, { event: {
                    overlay: {
                        mode: Constants.OVERLAY.EXTEND_MODE,
                        refId: '1234'
                    },
                    duration: 10,
                    presentationTime: 4000
                }});
            }).to.not.throw();
        });

        it.only('should handle triggering the event stop mode without errors', function () {
            expect(() => {
                eventBus.trigger(Constants.OVERLAY.SCHEME_ID, { event: {
                    overlay: {
                        mode: Constants.OVERLAY.START_MODE,
                        mimeType: Constants.OVERLAY.VIDEO_MIMETYPE,
                    },
                    duration: 5,
                    presentationTime: 3000,
                    id: '1234'
                }});

                eventBus.trigger(Constants.OVERLAY.SCHEME_ID, { event: {
                    overlay: {
                        mode: Constants.OVERLAY.STOP_MODE,
                        refId: '1234'
                    }
                }});
            }).to.not.throw();
        });
    });
})