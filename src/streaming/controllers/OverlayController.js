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
        videoModel;

    function setConfig(config) {
        if (!config) {
            return;
        }

        if (config.videoModel) {
            videoModel = config.videoModel;
        }
    }

    function handleOverlayEvent(e) {
        let overlayElement,
            toExtendOverlayInfo;

        const { event } = e;
        const videoElement = videoModel.getElement();
        const overlayMode = event.overlay.mode ?? Constants.OVERLAY.START_MODE;
        if (overlayMode === Constants.OVERLAY.STOP_MODE) {
            const intervalId = videoModel.removeOverlayElementById(event.overlay.refId);
            clearInterval(intervalId)
            return
        }

        if (overlayMode === Constants.OVERLAY.START_MODE) {
            if (event.overlay.mimeType === Constants.OVERLAY.VIDEO_MIMETYPE) {
                overlayElement = _createVideoOverlayElement(event);
            } else if (event.overlay.mimeType === Constants.OVERLAY.IFRMAE_MIMETYPE) {
                overlayElement = _createIframeOverlayElement(event);
            }
            _adaptOverlayElement(overlayElement, videoElement, event.overlay.uri);
        }

        _configureOverlayContainter(event.overlay)

        if (overlayMode === Constants.OVERLAY.EXTEND_MODE) {
            toExtendOverlayInfo = videoModel.getOverlayElementById(event.overlay.refId);
            if (event.duration) {
                clearInterval(toExtendOverlayInfo.intervalId);
            }
            overlayElement = toExtendOverlayInfo.element;
        }

        if (!overlayElement) {
            return
        }

        let eventId = _getOverlayEventId(toExtendOverlayInfo, event) ;

        let intervalId
        if (event.duration) {
            intervalId = setInterval(function() {
                const presentationTime = event.presentationTime / 1000 ;
                if (presentationTime + event.duration <= playbackController.getTime()) {
                    videoModel.removeOverlayElementById(eventId);
                    clearInterval(intervalId);
                }
            }, 100);
        }

        if (event.overlay.mode === Constants.OVERLAY.START_MODE) {
            const setOverlayIntervalId = setInterval(function() {
                const presentationTime = event.presentationTime / 1000 ;
                const currentTime = playbackController.getTime();
                if (_canSetOverlayElement(presentationTime, currentTime, event.duration)) {
                    videoModel.setOverlayElement(overlayElement, eventId, intervalId);
                    clearInterval(setOverlayIntervalId);
                }
            }, 100);
        } else if (event.overlay.mode === Constants.OVERLAY.EXTEND_MODE && toExtendOverlayInfo) {
            toExtendOverlayInfo.intervalId = intervalId;
        }
    }

    function _canSetOverlayElement(presentationTime, currentTime, duration) {
        return presentationTime <= currentTime && (presentationTime + duration > currentTime || !duration);
    }

    function _createVideoOverlayElement (event) {
        const overlayElement = document.createElement('video');
        overlayElement.preload = 'auto';
        overlayElement.autoplay = true;
        overlayElement.loop = event.loop;
        eventBus.on(dashjs.MediaPlayer.events.PLAYBACK_PLAYING, function() {
            overlayElement.play();
        });

        eventBus.on(dashjs.MediaPlayer.events.PLAYBACK_PAUSED, function() {
            overlayElement.pause();
        });

        eventBus.on(dashjs.MediaPlayer.events.PLAYBACK_SEEKING, function() {
            const presentationTime = event.presentationTime / 1000
            const seekTime = videoModel.getElement().currentTime - presentationTime
            if (seekTime > presentationTime && (seekTime <= presentationTime + event.duration || !event.duration)) {
                overlayElement.currentTime = seekTime;
            } else if (seekTime < 0) {
                const intervalId = videoModel.removeOverlayElementById(event.id);
                clearInterval(intervalId);
            }
        });
        return overlayElement;
    }

    function _createIframeOverlayElement (event) {
        const overlayElement = document.createElement('iframe');
        overlayElement.style.border = 'none';
        eventBus.on(dashjs.MediaPlayer.events.PLAYBACK_SEEKING, function() {
            const presentationTime = event.presentationTime / 1000;
            const seekTime = videoModel.getElement().currentTime - presentationTime;
            if (seekTime < 0) {
                const intervalId = videoModel.removeOverlayElementById(event.id);
                clearInterval(intervalId);
            }
        });
        return overlayElement
    }

    function configureVideoElementForOverlay(videoElement) {
        videoElement.style.width = '100%';
        const parent = videoElement.parentElement;
        parent.style.position = 'relative';
    }

    function _adaptOverlayElement(overlayElement, videoElement, uri) {
        overlayElement.src = uri;
        overlayElement.style.width = '100%';
        overlayElement.style.height = '100%';
        const resizeObserver = new ResizeObserver((entries) => {
            for (let entry of entries) {
                const { width, height } = entry.contentRect;
                overlayElement.style.width = `${width}px`;
                overlayElement.style.height = `${height}px`;
            }
        });
        resizeObserver.observe(videoElement);
    }

    function _getOverlayEventId(extendOverlayElement, event) {
        let eventId = extendOverlayElement ? extendOverlayElement.id : event.id;
        if (!eventId) {
            eventId = `${Utils.generateUuid()}`;
        }
        return eventId;
    }

    function _configureOverlayContainter(overlayEvent) {
        const overlayDiv = videoModel.getOverlayRenderingDiv();
        if (!isNaN(overlayEvent.z)) {
            overlayDiv.style.zIndex = overlayEvent.z;
        }

        if (overlayEvent.z === -1) {
            // TODO: Implement SqueezeCurrent logic.
        }
    }

    instance = {
        setConfig,
        configureVideoElementForOverlay,
        handleOverlayEvent,
    };

    return instance;
}

OverlayController.__dashjs_factory_name = 'OverlayController';
const factory = FactoryMaker.getSingletonFactory(OverlayController);
FactoryMaker.updateSingletonFactory(OverlayController.__dashjs_factory_name, factory);
export default factory;
