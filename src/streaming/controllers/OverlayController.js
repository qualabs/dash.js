/**
 * The copyright in this software is being made available under the BSD License,
 * included below. This software may be subject to other third party and contributor
 * rights, including patent rights, and no such rights are granted under this license.
 *
 * Copyright (c) 2013, Dash Industry Forum.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without modification,
 * are permitted provided that the following conditions are met:
 *  * Redistributions of source code must retain the above copyright notice, this
 *  list of conditions and the following disclaimer.
 *  * Redistributions in binary form must reproduce the above copyright notice,
 *  this list of conditions and the following disclaimer in the documentation and/or
 *  other materials provided with the distribution.
 *  * Neither the name of Dash Industry Forum nor the names of its
 *  contributors may be used to endorse or promote products derived from this software
 *  without specific prior written permission.
 *
 *  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS AS IS AND ANY
 *  EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 *  WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED.
 *  IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT,
 *  INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT
 *  NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 *  PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY,
 *  WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 *  ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 *  POSSIBILITY OF SUCH DAMAGE.
 */
import Constants from '../constants/Constants.js';
import EventBus from './../../core/EventBus.js';
import FactoryMaker from '../../core/FactoryMaker.js';
import PlaybackController from './PlaybackController.js';
import Utils from '../../core/Utils.js';

function OverlayController() {

    const context = this.context;
    const eventBus = EventBus(context).getInstance();
    const playbackController = PlaybackController(context).getInstance();

    let instance,
        videoModel,
        schedulerInitialized,
        overlayList = [];

    function setConfig(config) {
        if (!config) {
            return;
        }

        if (config.videoModel) {
            videoModel = config.videoModel;
        }
    }

    function configureVideoElementForOverlay() {
        const videoElement = videoModel.getElement();
        videoElement.style.width = '100%'; 
        videoElement.style.height = '100%';
        videoElement.style.transform = 'scale(1)';

        const parent = videoElement.parentElement;
        parent.style.position = 'relative';
        parent.style.overflow = 'hidden';
    }

    function setupOverlayEvents() {
        eventBus.on(Constants.OVERLAY.SCHEME_ID, _handleOverlayEvent);
    }

    function _initializeScheduler() {
        if (!schedulerInitialized) {
            schedulerInitialized = setInterval(_handleScheduleInerval, 100);
        }
    }

    function _stopScheduler() {
        clearInterval(schedulerInitialized);
        schedulerInitialized = false;
    }

    function _handleScheduleInerval() {
        if (overlayList.length) {
            _startScheduledOverlay();
            _stopScheduledOverlay();
        }
    }
    
    function _startScheduledOverlay() {
        const currentTime = playbackController.getTime();
        overlayList.forEach((scheduledOverlay) => {      
            const { eventId, duration, presentationTime, overlay, overlayElement } = scheduledOverlay;
            if (!scheduledOverlay.started && _canSetOverlayElement(presentationTime, currentTime, duration)) { 
                scheduledOverlay.started = true;
                _stylizeOverlayContainter(overlay);
                videoModel.setOverlayElement(overlayElement, eventId);
            }
        });
       
    }

    function _stopScheduledOverlay() {
        const currentTime = playbackController.getTime();
        overlayList.forEach((scheduledOverlay) => { 
            const { eventId, duration, presentationTime } = scheduledOverlay;
            if (duration && presentationTime + duration <= currentTime) {
                _stopOverlayEvent(eventId);
            }
        });
        if (!overlayList.length) {
            _stopScheduler();
        }
    }

    function _handleOverlayEvent(e) {
        let overlayElement

        const { event } = e;
        const overlayMode = event.overlay.mode ?? Constants.OVERLAY.START_MODE;

        if (overlayMode === Constants.OVERLAY.START_MODE) {
            if (event.overlay.mimeType === Constants.OVERLAY.VIDEO_MIMETYPE) {
                overlayElement = _createVideoOverlayElement(event);
            } else if (event.overlay.mimeType === Constants.OVERLAY.IFRMAE_MIMETYPE) {
                overlayElement = _createIframeOverlayElement(event);
            }

            _adaptOverlayElement(overlayElement, event.overlay.uri);

            let eventId = event.id ?? `${Utils.generateUuid()}`;
            const presentationTime = event.presentationTime / 1000;
            overlayList.push({
                eventId,
                duration: event.duration,
                presentationTime,
                overlay: event.overlay,
                overlayElement,
                started: false
            });
            _initializeScheduler();
            return;
        }

        if (overlayMode === Constants.OVERLAY.EXTEND_MODE) {
            if (event.duration) {
                const overlayElement = overlayList.find(element => element.eventId == event.overlay.refId);
                if (overlayElement) {
                    overlayElement.duration = event.duration;
                    overlayElement.presentationTime = event.presentationTime / 1000;
                }
            }
            return;
        }

        if (overlayMode === Constants.OVERLAY.STOP_MODE) {
            _stopOverlayEvent(event.overlay.refId);
            return;
        }
    }

    function _stopOverlayEvent(refId) {
        videoModel.removeOverlayElementById(refId);
        configureVideoElementForOverlay();
        // Do not filter if we want to reuse the overlays once they end.
        overlayList = overlayList.filter((element) => element.eventId != refId);
    }

    function _canSetOverlayElement(presentationTime, currentTime, duration) {
        return presentationTime <= currentTime && (presentationTime + duration > currentTime || !duration);
    }

    function _createVideoOverlayElement (event) {
        const overlayElement = document.createElement('video');
        overlayElement.preload = 'auto';
        overlayElement.autoplay = true;
        overlayElement.loop = event.loop === 'true';
        _setVideoOverlayEvents(event, overlayElement);
        return overlayElement;
    }

    function _setVideoOverlayEvents(event, overlayElement) {
        eventBus.on(dashjs.MediaPlayer.events.PLAYBACK_PLAYING, function() {
            overlayElement.play();
        });

        eventBus.on(dashjs.MediaPlayer.events.PLAYBACK_PAUSED, function() {
            overlayElement.pause();
        });

        eventBus.on(dashjs.MediaPlayer.events.PLAYBACK_SEEKING, function() {
            const presentationTime = event.presentationTime / 1000;
            const seekTime = videoModel.getElement().currentTime - presentationTime;
            if (seekTime > presentationTime && (seekTime <= presentationTime + event.duration || !event.duration)) {
                overlayElement.currentTime = seekTime;
            } else if (seekTime < 0) {
                _stopOverlayEvent(event.id);
            }
        });
    }

    function _createIframeOverlayElement (event) {
        const overlayElement = document.createElement('iframe');
        overlayElement.style.border = 'none';
        eventBus.on(dashjs.MediaPlayer.events.PLAYBACK_SEEKING, function() {
            const presentationTime = event.presentationTime / 1000;
            const seekTime = videoModel.getElement().currentTime - presentationTime;
            if (seekTime < 0) {
                _stopOverlayEvent(event.id);
            }
        });
        return overlayElement;
    }

    function _adaptOverlayElement(overlayElement, uri) {
        overlayElement.src = uri;
        overlayElement.style.width = '100%';
        overlayElement.style.height = '100%';
    }

    function _stylizeOverlayContainter(overlayEvent) {
        const videoElement = videoModel.getElement();
        const overlayDiv = videoModel.getOverlayRenderingDiv();
        const { Viewport, Size, TopLeft, SqueezeCurrent, z } = overlayEvent;

        if (!isNaN(z)) {
            overlayDiv.style['z-index'] = z;
        }

        const squeezeCurrent = SqueezeCurrent.percentage;
        if (SqueezeCurrent && z == -1) {
            videoElement.style.transition = 'transform';
            videoElement.style['transform-origin'] = 'top left';
            videoElement.style.transform = `scale(${squeezeCurrent})`;
        }

        if (!Viewport || !Viewport?.x || !Viewport?.y ) {
            return;
        }

        const { overlaySize, overlayTopLeft } = _calculateOverlayDimensions(Viewport, Size, TopLeft);
        const resizeFunction = (entries) => {
            const entry = entries[0];
            const { width, height } = entry.contentRect;
            overlayDiv.style.width = `${width * overlaySize.x}px`;
            overlayDiv.style.height = `${height * overlaySize.y}px`;
            overlayDiv.style.left = `${width * overlayTopLeft.x}px`;
            overlayDiv.style.top = `${height * overlayTopLeft.y}px`;
        };
        const resizeObserver = new ResizeObserver(resizeFunction);
        resizeObserver.observe(videoElement);
    }

    function _calculateOverlayDimensions(viewport, size, topLeft) {
        const overlaySize = {
            x: size && size.x ? size.x / viewport.x : 1,
            y: size && size.y ? size.y / viewport.y : 1
        };

        const overlayTopLeft = {
            x: topLeft && topLeft.x ? topLeft.x / viewport.x : 0,
            y: topLeft && topLeft.y ? topLeft.y / viewport.y : 0
        };

        return { overlaySize, overlayTopLeft };
    }

    instance = {
        setConfig,
        configureVideoElementForOverlay,
        setupOverlayEvents,
    };

    return instance;
}

OverlayController.__dashjs_factory_name = 'OverlayController';
const factory = FactoryMaker.getSingletonFactory(OverlayController);
FactoryMaker.updateSingletonFactory(OverlayController.__dashjs_factory_name, factory);
export default factory;
