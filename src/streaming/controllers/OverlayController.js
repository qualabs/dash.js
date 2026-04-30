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
        resizeObserver,
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
        videoElement.style.display = 'block';
        videoElement.style.transform = 'scale(1)';

        const parent = videoElement.parentElement;
        parent.style.position = 'relative';
        parent.style.overflow = 'hidden';
        parent.style.isolation = 'isolate';
    }

    function setupOverlayEvents() {
        eventBus.on(Constants.OVERLAY.SCHEME_ID, _handleOverlayEvent);
    }

    function reset() {
        _stopAllOverlayEvents();

        overlayList = [];

        clearInterval(schedulerInitialized);
        schedulerInitialized = false;

        if (resizeObserver) {
            resizeObserver.disconnect();
        }

        _removeOverlayStyles()
    }

    function _stopAllOverlayEvents () {
        overlayList.forEach((overlay) => {
            _stopOverlayEvent(overlay.eventId);
        })
    }

    function _removeOverlayStyles() {
        const overlayDiv = videoModel.getOverlayRenderingDiv();
        if (!overlayDiv) {
            return
        }

        videoModel.setOverlayRenderingDiv(overlayDiv);
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
            if (scheduledOverlay.started) { return };
            if (!_canSetOverlayElement(presentationTime, currentTime, duration)) { return };
            if (!scheduledOverlay.resolved) {
                _stopOverlayEvent(eventId);
                return;
            }
            scheduledOverlay.started = true;
            _stylizeOverlayContainter(overlay, overlayElement);
            overlayElement.loop = overlay.loop === 'true';
            videoModel.setOverlayElement(overlayElement, eventId);
            if (scheduledOverlay.blobUrl) {
                overlayElement.src = scheduledOverlay.blobUrl;
            }
        });
    }

    function _stopScheduledOverlay() {
        const currentTime = playbackController.getTime();
        overlayList.forEach((scheduledOverlay) => {
            const { eventId, duration, presentationTime } = scheduledOverlay;
            if (duration && _overlayEventIsFinished(presentationTime, duration, currentTime)) {
                _stopOverlayEvent(eventId);
            }
        });
        if (!overlayList.length) {
            _stopScheduler();
        }
    }

    function _handleOverlayEvent(e) {
        const { event } = e;
        if (!event || !event.overlay) {
            return
        }
        const overlayMode = event.overlay.mode ?? Constants.OVERLAY.START_MODE;
        switch (overlayMode) {
            case Constants.OVERLAY.START_MODE:
                _overlayStartMode(event);
                break;
            case Constants.OVERLAY.EXTEND_MODE:
                _overlayExtendMode(event);
                break;
            case Constants.OVERLAY.STOP_MODE:
                _overlayStopMode(event);
                break;
        }
    }

    function _overlayStartMode(event) {
        let overlayElement;
        if (event.overlay.mimeType === Constants.OVERLAY.VIDEO_MIMETYPE) {
            overlayElement = _createVideoOverlayElement(event);
        } else if (event.overlay.mimeType === Constants.OVERLAY.IFRMAE_MIMETYPE) {
            overlayElement = _createIframeOverlayElement(event);
        }

        const eventId = event.id ?? `${Utils.generateUuid()}`;
        const presentationTime = event.presentationTime / 1000;
        const overlayEntry = {
            eventId,
            duration: event.duration,
            presentationTime,
            overlay: event.overlay,
            overlayElement,
            started: false,
            resolved: false,
            abortController: null,
            blobUrl: null
        };
        overlayList.push(overlayEntry);

        const usePrefetch = event.overlay.mimeType === Constants.OVERLAY.IFRMAE_MIMETYPE
            && event.overlay.earliestResolutionTime > 0;

        if (usePrefetch) {
            overlayElement.style.width = '100%';
            overlayElement.style.height = '100%';
            _prefetchIframeContent(overlayEntry, event.overlay.uri);
        } else {
            _adaptOverlayElement(overlayElement, event.overlay.uri);
            overlayEntry.resolved = true;
        }

        _initializeScheduler();
    }

    function _prefetchIframeContent(overlayEntry, uri) {
        const abortController = new AbortController();
        overlayEntry.abortController = abortController;

        fetch(uri, { signal: abortController.signal })
            .then((response) => {
                if (!response.ok) { return };
                return response.blob();
            })
            .then((blob) => {
                if (!blob) { return };
                const entry = overlayList.find(e => e.eventId === overlayEntry.eventId);
                if (!entry) { return };
                const blobUrl = URL.createObjectURL(blob);
                entry.blobUrl = blobUrl;
                entry.resolved = true;
            })
            .catch(() => {});
    }

    function _overlayExtendMode(event) {
        if (event.duration) {
            const overlayElement = overlayList.find(element => element.eventId == event.overlay.refId);
            if (overlayElement) {
                overlayElement.duration = event.duration;
                overlayElement.presentationTime = event.presentationTime / 1000;
            }
        }
    }

    function _overlayStopMode(event) {
        _stopOverlayEvent(event.overlay.refId);
    }

    function _stopOverlayEvent(refId) {
        const entry = overlayList.find(e => e.eventId === refId);
        if (entry) {
            if (entry.abortController) {
                entry.abortController.abort();
            }
            if (entry.blobUrl) {
                URL.revokeObjectURL(entry.blobUrl);
            }
        }
        videoModel.removeOverlayElementById(refId);
        configureVideoElementForOverlay();
        overlayList = overlayList.filter((element) => element.eventId !== refId);
    }

    function _overlayEventIsFinished(presentationTime, duration, currentTime) {
        return presentationTime + duration <= currentTime
    }

    function _canSetOverlayElement(presentationTime, currentTime, duration) {
        return presentationTime <= currentTime && (!_overlayEventIsFinished(presentationTime, duration, currentTime) || !duration);
    }

    function _createVideoOverlayElement (event) {
        const overlayElement = document.createElement('video');
        overlayElement.preload = 'auto';
        overlayElement.autoplay = true;
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
            if (seekTime > presentationTime && (!_overlayEventIsFinished(presentationTime, seekTime, event.duration) || !event.duration)) {
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
        overlayDiv.style.overflow = 'hidden';

        if (SqueezeCurrent && z == -1) {
            const squeezeCurrent = SqueezeCurrent.percentage;
            videoElement.style.transition = 'transform';
            videoElement.style['transform-origin'] = SqueezeCurrent.origin ?? 'top left';
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
        resizeObserver = new ResizeObserver(resizeFunction);
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
        reset
    };

    return instance;
}

OverlayController.__dashjs_factory_name = 'OverlayController';
const factory = FactoryMaker.getSingletonFactory(OverlayController);
FactoryMaker.updateSingletonFactory(OverlayController.__dashjs_factory_name, factory);
export default factory;
