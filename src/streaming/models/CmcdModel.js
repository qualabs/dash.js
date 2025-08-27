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

import {CmcdObjectType} from '@svta/common-media-library/cmcd/CmcdObjectType';
import {CmcdStreamType} from '@svta/common-media-library/cmcd/CmcdStreamType';
import {CmcdStreamingFormat} from '@svta/common-media-library/cmcd/CmcdStreamingFormat';
import {HTTPRequest} from '../vo/metrics/HTTPRequest.js';
import MediaPlayerEvents from '../MediaPlayerEvents.js';
import Utils from '../../core/Utils.js';
import Constants from '../../streaming/constants/Constants.js';
import DashManifestModel from '../../dash/models/DashManifestModel.js';
import Settings from '../../core/Settings.js';
import FactoryMaker from '../../core/FactoryMaker.js';

const RTP_SAFETY_FACTOR = 5;

function CmcdModel() {
    let dashManifestModel,
        instance,
        dashMetrics,
        serviceDescriptionController,
        playbackController,
        internalData,
        abrController,
        throughputController,
        _lastMediaTypeRequest,
        _isStartup,
        _bufferLevelStarved,
        _initialMediaRequestsDone,
        _playbackStartedTime,
        _isSeeking,
        streamProcessors,
        _msdSent = {
            [Constants.CMCD_MODE.EVENT]: false,
            [Constants.CMCD_MODE.REQUEST]: false
        },
        _mediaUrlSentEventMode = false,
        _rebufferingStartTime = {},
        _rebufferingDuration = {},
        _errorTracking = new Map(); // Track errors that have been sent via event mode

    let context = this.context;
    let settings = Settings(context).getInstance();
    
    function setup() {
        dashManifestModel = DashManifestModel(context).getInstance();
        resetInitialSettings();
    }
    
    function setConfig(config) {
        if (!config) {
            return;
        }

        if (config.abrController) {
            abrController = config.abrController;
        }

        if (config.dashMetrics) {
            dashMetrics = config.dashMetrics;
        }

        if (config.playbackController) {
            playbackController = config.playbackController;
        }

        if (config.throughputController) {
            throughputController = config.throughputController;
        }

        if (config.serviceDescriptionController) {
            serviceDescriptionController = config.serviceDescriptionController;
        }
    }

    function _getCmcdDataForMediaSegment(request, mediaType) {
        _initForMediaType(mediaType);
        const data = getGenericCmcdData(mediaType);
        const encodedBitrate = _getBitrateByRequest(request);
        const d = _getObjectDurationByRequest(request);
        const mtp = _getMeasuredThroughputByType(mediaType);
        const dl = _getDeadlineByType(mediaType);
        const bl = _getBufferLevelByType(mediaType);
        const tb = _getTopBitrateByType(request.representation?.mediaInfo);
        const tpb = _getTopPlayableBitrate(mediaType);
        const pb = _getPlayheadBitrate(mediaType);
        const pr = internalData.pr;

        const nextRequest = _probeNextRequest(mediaType);

        let ot;
        if (mediaType === Constants.VIDEO) {
            ot = CmcdObjectType.VIDEO;
        }
        if (mediaType === Constants.AUDIO) {
            ot = CmcdObjectType.AUDIO;
        }
        if (mediaType === Constants.TEXT) {
            if (request.representation.mediaInfo.mimeType === 'application/mp4') {
                ot = CmcdObjectType.TIMED_TEXT;
            } else {
                ot = CmcdObjectType.CAPTION;
            }
        }

        let rtp = settings.get().streaming.cmcd.rtp;
        if (!rtp) {
            rtp = _calculateRtp(request);
        }
        if (!isNaN(rtp)) {
            data.rtp = rtp;
        }

        if (nextRequest) {
            if (request.url !== nextRequest.url) {
                data.nor = encodeURIComponent(Utils.getRelativeUrl(request.url, nextRequest.url));
            } else if (nextRequest.range) {
                data.nrr = nextRequest.range;
            }
        }

        if (encodedBitrate) {
            data.br = encodedBitrate;
        }

        if (ot) {
            data.ot = ot;
        }

        if (!isNaN(d)) {
            data.d = d;
        }

        if (!isNaN(mtp)) {
            data.mtp = mtp;
        }

        if (!isNaN(dl)) {
            data.dl = dl;
        }

        if (!isNaN(bl)) {
            data.bl = bl;
        }

        if (!isNaN(tb)) {
            data.tb = tb;
        }

        if (tpb !== null && !isNaN(tpb)) {
            data.tpb = tpb;
        }
        
        if (pb !== null && !isNaN(pb)) {
            data.pb = pb;
        }

        if (!isNaN(pr) && pr !== 1) {
            data.pr = pr;
        }

        if (_bufferLevelStarved[mediaType]) {
            data.bs = true;
            _bufferLevelStarved[mediaType] = false;
        }

        if (_rebufferingDuration[mediaType]) {
            data.bsd = _rebufferingDuration[mediaType];
            delete _rebufferingDuration[mediaType];
        }

        if (_isStartup[mediaType] || !_initialMediaRequestsDone[mediaType]) {
            data.su = true;
            _isStartup[mediaType] = false;
            _initialMediaRequestsDone[mediaType] = true;
        }

        return data;
    }

    function _initForMediaType(mediaType) {

        if (!_initialMediaRequestsDone.hasOwnProperty(mediaType)) {
            _initialMediaRequestsDone[mediaType] = false;
        }

        if (!_isStartup.hasOwnProperty(mediaType)) {
            _isStartup[mediaType] = false;
        }

        if (!_bufferLevelStarved.hasOwnProperty(mediaType)) {
            _bufferLevelStarved[mediaType] = false;
        }
    }

    function _getCmcdDataForInitSegment() {
        const data = getGenericCmcdData();

        data.ot = CmcdObjectType.INIT;
        data.su = true;

        return data;
    }

    function _getCmcdDataForOther() {
        const data = getGenericCmcdData();

        data.ot = CmcdObjectType.OTHER;

        return data;
    }

    
    function _getBitrateByRequest(request) {
        try {
            return parseInt(request.bandwidth / 1000);
        } catch (e) {
            return null;
        }
    }

    function _getTopBitrateByType(mediaInfo) {
        try {
            const bitrates = abrController.getPossibleVoRepresentationsFilteredBySettings(mediaInfo).map((rep) => {
                return rep.bitrateInKbit
            });
            return Math.max(...bitrates)
        } catch (e) {
            return null;
        }
    }

    function _getPlayheadBitrate(mediaType) {
        try {
            if (!streamProcessors || streamProcessors.length === 0) {
                return null;
            }
            
            const streamProcessor = streamProcessors.find(sp => sp.getType() === mediaType);
            const bitrate = streamProcessor?.getRepresentationController()?.getCurrentRepresentation()?.bitrateInKbit;

            if (bitrate !== undefined && !isNaN(bitrate)) {
                return Math.round(bitrate);
            }

            return null;
        } catch (e) {
            return null;
        }
    }

    function _getTopPlayableBitrate(mediaType) {
        try {
            if (!streamProcessors || streamProcessors.length === 0) {
                return null;
            }

            const streamProcessor = streamProcessors.find(p => p.getType() === mediaType);

            if (streamProcessor) {
                const mediaInfo = streamProcessor.getMediaInfo();
                const topBitrate = _getTopBitrateByType(mediaInfo);

                // _getTopBitrateByType can return -Infinity for empty arrays, which is not a valid bitrate.
                return isFinite(topBitrate) && topBitrate > 0 ? topBitrate : null;
            }

            return null;
        } catch (e) {
            return null;
        }
    }

    function _getObjectDurationByRequest(request) {
        try {
            return !isNaN(request.duration) ? Math.round(request.duration * 1000) : NaN;
        } catch (e) {
            return null;
        }
    }

    function _getMeasuredThroughputByType(mediaType) {
        try {
            return parseInt(throughputController.getSafeAverageThroughput(mediaType) / 100) * 100;
        } catch (e) {
            return null;
        }
    }

    function _getDeadlineByType(mediaType) {
        try {
            const playbackRate = internalData.pr;
            const bufferLevel = dashMetrics.getCurrentBufferLevel(mediaType);

            if (!isNaN(playbackRate) && !isNaN(bufferLevel)) {
                return parseInt((bufferLevel / playbackRate) * 10) * 100;
            }

            return null;
        } catch (e) {
            return null;
        }
    }

    function _getBufferLevelByType(mediaType) {
        try {
            const bufferLevel = dashMetrics.getCurrentBufferLevel(mediaType);

            if (!isNaN(bufferLevel)) {
                return parseInt(bufferLevel * 10) * 100;
            }

            return null;
        } catch (e) {
            return null;
        }
    }

    function onPlaybackRateChanged(data) {
        try {
            internalData.pr = data.playbackRate;
        } catch (e) {

        }
    }

    function onManifestLoaded(data) {
        try {
            const isDynamic = dashManifestModel.getIsDynamic(data.data);
            const st = isDynamic ? CmcdStreamType.LIVE : CmcdStreamType.VOD;
            const sf = data.protocol && data.protocol === 'MSS' ? CmcdStreamingFormat.SMOOTH : CmcdStreamingFormat.DASH;

            internalData.st = `${st}`;
            internalData.sf = `${sf}`;
        } catch (e) {
        }
    }

    function onManifestLoadingStarted(data) {
        console.log('manifest loading started', data.request.url);

        onPlaybackStarted();

        if (data.request.url) {
            internalData.mu = data.request.url;
        }

    }

    function onBufferLevelStateChanged(data) {
        try {
            if (data.state && data.mediaType) {
                if (data.state === MediaPlayerEvents.BUFFER_EMPTY) {

                    if (!_bufferLevelStarved[data.mediaType]) {
                        _bufferLevelStarved[data.mediaType] = true;
                    }
                    if (!_isStartup[data.mediaType]) {
                        _isStartup[data.mediaType] = true;
                    }
                }
            }
        } catch (e) {

        }
    }

    function onPlaybackSeeking() {
        _isSeeking = true;
    }

    function onPlaybackSeeked() {
        _isSeeking = false;

        for (let key in _bufferLevelStarved) {
            if (_bufferLevelStarved.hasOwnProperty(key)) {
                _bufferLevelStarved[key] = true;
            }
        }

        for (let key in _isStartup) {
            if (_isStartup.hasOwnProperty(key)) {
                _isStartup[key] = true;
            }
        }
    }

    function wasPlaying() {
        return !_isSeeking && _playbackStartedTime;
    }

    function _probeNextRequest(mediaType) {
        if (!streamProcessors || streamProcessors.length === 0) {
            return;
        }
        for (let streamProcessor of streamProcessors) {
            if (streamProcessor.getType() === mediaType) {
                return streamProcessor.probeNextRequest();
            }
        }
    }

    function onPeriodSwitchComplete() {
        _updateStreamProcessors();
    }

    function onPlaybackStarted() {
        console.log('cmcd onPlaybackStarted');
        if (!_playbackStartedTime) {
            _playbackStartedTime = Date.now();
        }
    }

    function onPlaybackPlaying() {
        for (const mediaType in _rebufferingStartTime) {
            if (_rebufferingStartTime.hasOwnProperty(mediaType)) {
                onRebufferingCompleted(mediaType);
            }
        }
    }

    function onPlaybackReady() {
        _getMsdData();
    }

    function onRebufferingStarted(mediaType) {
        if (mediaType && !_rebufferingStartTime[mediaType]) {
            _rebufferingStartTime[mediaType] = Date.now();
        }
    }

    function onRebufferingCompleted(mediaType) {
        if (_rebufferingStartTime[mediaType] != null) {
            _rebufferingDuration[mediaType] = Date.now() - _rebufferingStartTime[mediaType];
            delete _rebufferingStartTime[mediaType];
        }
    }

    function _getMsdData() {
        if (!_playbackStartedTime || internalData.msd) {
            return;
        }
        console.log('cmcd _getMsdData');

        internalData.msd = Date.now() - _playbackStartedTime;
    }

    /**
     * Creates an error object with tracking information and composes an error string
     * @param {Object} errorData - The error data object
     * @returns {Object} Error object containing:
     *   - sentViaEventMode: {boolean} Flag indicating if this error was already sent via event mode
     *   - errorString: {string} Composed error string containing error code and message
     *   - errorCode: {number} The error code
     *   - errorMessage: {string} The error message
     */
    function _createErrorObject(errorData) {
        const errorCode = errorData && errorData.error && errorData.error.code ? errorData.error.code : 0;
        const errorMessage = errorData && errorData.error && errorData.error.message ? errorData.error.message : '';
        
        // Create error string combining code and message
        const errorString = errorCode > 0 ? 
            `Error ${errorCode}${errorMessage ? ': ' + errorMessage : ''}` : 
            errorMessage || 'Unknown error';
        
        // Use the error string as the key for tracking
        const errorKey = errorString;
        
        return {
            sentViaEventMode: false,
            errorString: errorString,
            errorCode: errorCode,
            errorMessage: errorMessage,
            errorKey: errorKey
        };
    }

    /**
     * Marks an error as sent via event mode
     * @param {Object} errorObject - The error object returned by _createErrorObject
     */
    function _markErrorAsSent(errorObject) {
        if (errorObject && errorObject.errorKey) {
            _errorTracking.set(errorObject.errorKey, true);
        }
    }

    function onPlayerError(errorData) {
        console.log('cmcd onPlayerError', errorData);

        const errorObject = _createErrorObject(errorData);
        // Add the error string to the array if it's not already there
        if (!internalData.ec.includes(errorObject.errorString)) {
            internalData.ec.push(errorObject.errorString);
        }
        console.log('cmcd internalData.ec', internalData.ec);
        console.log('cmcd error object', errorObject);
    }

    function getGenericCmcdData(mediaType) {
        const cmcdParametersFromManifest = getCmcdParametersFromManifest();
        const data = {};

        let cid = settings.get().streaming.cmcd.cid ? settings.get().streaming.cmcd.cid : internalData.cid;
        cid = cmcdParametersFromManifest.contentID ? cmcdParametersFromManifest.contentID : cid;

        data.v = settings.get().streaming.cmcd.version ?? Constants.DEFAULT_CMCD_VERSION;

        data.sid = settings.get().streaming.cmcd.sid ? settings.get().streaming.cmcd.sid : internalData.sid;
        data.sid = cmcdParametersFromManifest.sessionID ? cmcdParametersFromManifest.sessionID : data.sid;

        data.sid = `${data.sid}`;
        data.ts = Date.now();

        if (cid) {
            data.cid = `${cid}`;
        }

        if (!isNaN(internalData.pr) && internalData.pr !== 1 && internalData.pr !== null) {
            data.pr = internalData.pr;
        }

        if (internalData.st) {
            data.st = internalData.st;
        }

        if (internalData.sf) {
            data.sf = internalData.sf;
        }

        if (internalData.sta) {
            data.sta = internalData.sta;
        }

        if (internalData.e) {
            data.e = internalData.e;
        }

        if (data.v === 2) {
            let ltc = playbackController.getCurrentLiveLatency() * 1000;
            if (!isNaN(ltc)) {
                data.ltc = ltc;
            }

            if (typeof document !== 'undefined' && document.hidden) {
                data.bg = true;
            }
        }

        if (mediaType && _shouldIncludeDroppedFrames(mediaType)) {
            const droppedFrames = dashMetrics.getCurrentDroppedFrames()?.droppedFrames;
            if (droppedFrames > 0) {
                data.df = droppedFrames;
            }
        }

        return data;
    }

    function _shouldIncludeDroppedFrames(mediaType) {
        return mediaType === Constants.VIDEO ||
               mediaType === Constants.AUDIO ||
               mediaType === Constants.OTHER;
    }

    function triggerCmcdEventMode(event){
        const cmcdData = {
            ...getGenericCmcdData(),
            ...updateMsdData(Constants.CMCD_MODE.EVENT),
            ..._getAggregatedBitrateData(),
            ..._getEventModeStructuredBitrateData(),
            e: event
        };

        if (event == 'e') {
            console.log('event e', internalData.ec);
            // Only include errors that haven't been sent yet
            const unsentErrors = internalData.ec.filter(errorString => {
                // Check if this error has been sent before
                return !_errorTracking.has(errorString);
            });
            
            if (unsentErrors.length > 0) {
                cmcdData.ec = unsentErrors;
                
                // Mark the errors as sent via event mode
                unsentErrors.forEach(errorString => {
                    const errorObject = {
                        errorCode: 0, // We don't have the original code here, but we can track by string
                        errorMessage: errorString,
                        errorKey: errorString
                    };
                    _markErrorAsSent(errorObject);
                });
            }
        }

        // checking media url
        if (!_mediaUrlSentEventMode && internalData.mu) {
            cmcdData.mu = internalData.mu;
            _mediaUrlSentEventMode = true;
        }

        console.log('event mode', cmcdData);
        
        return cmcdData;
    }

    function onStateChange(state) {
        internalData.sta = state;
    }

    function onEventChange(state){
        internalData.e = state;
    }

    function resetInitialSettings() {
        internalData = {
            pr: 1,
            nor: null,
            st: null,
            sf: null,
            sid: `${Utils.generateUuid()}`,
            cid: null,
            ec: [] // Initialize ec as an array to store error strings
        };
        
        _bufferLevelStarved = {};
        _isStartup = {};
        _initialMediaRequestsDone = {};
        _lastMediaTypeRequest = undefined;
        _playbackStartedTime = undefined;
        _rebufferingStartTime = {};
        _rebufferingDuration = {};
        _msdSent = {
            [Constants.CMCD_MODE.EVENT]: false,
            [Constants.CMCD_MODE.REQUEST]: false
        };
        _errorTracking.clear(); // Reset error tracking

        _updateStreamProcessors();
    }

    function _updateStreamProcessors() {
        if (!playbackController) {
            return;
        }
        const streamController = playbackController.getStreamController();
        if (!streamController) {
            return;
        }
        if (typeof streamController.getActiveStream !== 'function') {
            return;
        }
        const activeStream = streamController.getActiveStream();
        if (!activeStream) {
            return;
        }
        streamProcessors = activeStream.getStreamProcessors();
    }

    function _calculateRtp(request) {
        try {
            // Get the values we need
            let playbackRate = playbackController.getPlaybackRate();
            if (!playbackRate) {
                playbackRate = 1;
            }
            let { bandwidth, mediaType, representation, duration } = request;
            const mediaInfo = representation.mediaInfo;

            if (!mediaInfo) {
                return NaN;
            }
            let currentBufferLevel = _getBufferLevelByType(mediaType);
            if (currentBufferLevel === 0) {
                currentBufferLevel = 500;
            }

            // Calculate RTP
            let segmentSize = (bandwidth * duration) / 1000; // Calculate file size in kilobits
            let timeToLoad = (currentBufferLevel / playbackRate) / 1000; // Calculate time available to load file in seconds
            let minBandwidth = segmentSize / timeToLoad; // Calculate the exact bandwidth required
            let rtpSafetyFactor = settings.get().streaming.cmcd.rtpSafetyFactor && !isNaN(settings.get().streaming.cmcd.rtpSafetyFactor) ? settings.get().streaming.cmcd.rtpSafetyFactor : RTP_SAFETY_FACTOR;
            let maxBandwidth = minBandwidth * rtpSafetyFactor; // Include a safety buffer


            // Round to the next multiple of 100
            return (parseInt(maxBandwidth / 100) + 1) * 100;
        } catch (e) {
            return NaN;
        }
    }

    function updateMsdData(mode) {
        const cmcdVersion = settings.get().streaming.cmcd.version ?? Constants.DEFAULT_CMCD_VERSION;
        const data = {};
        const msd = internalData.msd;

        if (cmcdVersion === 2) {
            if (!_msdSent[mode] && !isNaN(msd)) {
                data.msd = msd;
                _msdSent[mode] = true;
            }
        }
    
        return data;
    }

    function getCmcdParametersFromManifest() {
        let cmcdParametersFromManifest = {};
        if (serviceDescriptionController) {
            const serviceDescription = serviceDescriptionController.getServiceDescriptionSettings();
            if (
                settings.get().streaming.cmcd.applyParametersFromMpd &&
                serviceDescription.clientDataReporting &&
                serviceDescription.clientDataReporting.cmcdParameters
            ) {
                cmcdParametersFromManifest = serviceDescription.clientDataReporting.cmcdParameters;
            }
        }
        return cmcdParametersFromManifest;
    }

    function getCmcdData(request) {
        try {
            let cmcdData = null;

            
            cmcdData = {
                ..._updateLastMediaTypeRequest(request.type, request.mediaType)
            }

            if (isIncludedInRequestFilter(request.type)) {
                if (request.type === HTTPRequest.MPD_TYPE) {
                    return _getCmcdDataForMpd(request);
                } else if (request.type === HTTPRequest.MEDIA_SEGMENT_TYPE) {
                    _initForMediaType(request.mediaType);
                    return _getCmcdDataForMediaSegment(request, request.mediaType);
                } else if (request.type === HTTPRequest.INIT_SEGMENT_TYPE) {
                    return _getCmcdDataForInitSegment(request);
                } else if (request.type === HTTPRequest.OTHER_TYPE || request.type === HTTPRequest.XLINK_EXPANSION_TYPE) {
                    return _getCmcdDataForOther(request);
                } else if (request.type === HTTPRequest.LICENSE) {
                    return _getCmcdDataForLicense(request);
                } else if (request.type === HTTPRequest.CONTENT_STEERING_TYPE) {
                    return _getCmcdDataForSteering(request);
                }
            }
            return cmcdData;
        } catch (e) {
            return null;
        }
    }

    function isIncludedInRequestFilter(type, includeInRequests) {
        const cmcdParametersFromManifest = getCmcdParametersFromManifest();
        let includeInRequestsArray = includeInRequests || settings.get().streaming.cmcd.includeInRequests;

        if (cmcdParametersFromManifest.version) {
            includeInRequestsArray = cmcdParametersFromManifest.includeInRequests ? cmcdParametersFromManifest.includeInRequests : [Constants.CMCD_DEFAULT_INCLUDE_IN_REQUESTS];
        }

        const filtersTypes = {
            [HTTPRequest.INIT_SEGMENT_TYPE]: 'segment',
            [HTTPRequest.MEDIA_SEGMENT_TYPE]: 'segment',
            [HTTPRequest.XLINK_EXPANSION_TYPE]: 'xlink',
            [HTTPRequest.MPD_TYPE]: 'mpd',
            [HTTPRequest.CONTENT_STEERING_TYPE]: 'steering',
            [HTTPRequest.OTHER_TYPE]: 'other',
        };

        return includeInRequestsArray.some(t => filtersTypes[type] === t);
    }

    function reset() {
        resetInitialSettings();
    }

    function _updateLastMediaTypeRequest(type, mediatype) {
        // Video > Audio > None
        if (mediatype === Constants.VIDEO || mediatype === Constants.AUDIO) {
            if (!_lastMediaTypeRequest || _lastMediaTypeRequest == Constants.AUDIO) {
                _lastMediaTypeRequest = mediatype;
            }
        }
    }

    function _getCmcdDataForSteering(request) {
        const data = !_lastMediaTypeRequest ? getGenericCmcdData(request) : _getCmcdDataForMediaSegment(request, _lastMediaTypeRequest);

        data.ot = CmcdObjectType.OTHER;

        return data;
    }

    function _getCmcdDataForLicense(request) {
        const data = getGenericCmcdData(request);

        data.ot = CmcdObjectType.KEY;

        return data;
    }

    function _getCmcdDataForMpd() {
        const data = getGenericCmcdData();

        data.ot = CmcdObjectType.MANIFEST;

        return data;
    }

    function _getAggregatedBitrateData() {
        // defining data to return
        const data = {};
        // accessing active stream
        const activeStream = playbackController.getStreamController()?.getActiveStream();
        if (!activeStream) {
            return data;
        }   
 
        // Get current representations
        const videoRep = activeStream.getCurrentRepresentationForType(Constants.VIDEO);
        const audioRep = activeStream.getCurrentRepresentationForType(Constants.AUDIO);

        // Calculate aggregated bitrate (current video + audio)
        const currentVideoBitrate = videoRep ? videoRep.bitrateInKbit : 0;
        const currentAudioBitrate = audioRep ? audioRep.bitrateInKbit : 0;
        const aggregatedBitrate = currentVideoBitrate + currentAudioBitrate;
        if (aggregatedBitrate > 0) {
            data.ab = Math.round(aggregatedBitrate);
        }

        // Calculate top aggregated bitrate (max video + max audio)
        const allVideoReps = activeStream.getRepresentationsByType(Constants.VIDEO) || [];
        const allAudioReps = activeStream.getRepresentationsByType(Constants.AUDIO) || [];
        const topVideoBitrate = allVideoReps.reduce((max, rep) => Math.max(max, rep.bitrateInKbit), 0);
        const topAudioBitrate = allAudioReps.reduce((max, rep) => Math.max(max, rep.bitrateInKbit), 0);
        const topAggregatedBitrate = topVideoBitrate + topAudioBitrate;
        if (topAggregatedBitrate > 0) {
            data.tab = Math.round(topAggregatedBitrate);
        }

        // Calculate lowest aggregated bitrate (min video + min audio)
        const lowestVideoBitrate = allVideoReps.length > 0 ? Math.min(...allVideoReps.map(rep => rep.bitrateInKbit)) : 0;
        const lowestAudioBitrate = allAudioReps.length > 0 ? Math.min(...allAudioReps.map(rep => rep.bitrateInKbit)) : 0;
        const lowestAggregatedBitrate = lowestVideoBitrate + lowestAudioBitrate;
        if (lowestAggregatedBitrate > 0) {
            data.lab = Math.round(lowestAggregatedBitrate);
        }

        return data;
    }
    
    function getLastMediaTypeRequest() {
        return _lastMediaTypeRequest;
    }

    /**
     * Returns event mode structured bitrate fields as described in the event mode spec.
     * Each key (epb, etb, elb, etpb) contains a string with per-object-type breakdown: v, a, tt.
     * Example: epb="v=4750;a=250;tt=100"
     */
    function _getEventModeStructuredBitrateData() {
        const data = {};
        const activeStream = playbackController.getStreamController()?.getActiveStream();
        if (!activeStream) {
            return data;
        }

        // Helper to format the structured value
        function formatStructured(v, a, tt) {
            const parts = [];
            if (v > 0) { parts.push(`v=${Math.round(v)}`); }
            if (a > 0) { parts.push(`a=${Math.round(a)}`); }
            if (tt > 0) { parts.push(`tt=${Math.round(tt)}`); }
            return parts.join(';');
        }

        // Get current representations
        const videoRep = activeStream.getCurrentRepresentationForType(Constants.VIDEO);
        const audioRep = activeStream.getCurrentRepresentationForType(Constants.AUDIO);
        const textRep = activeStream.getCurrentRepresentationForType(Constants.TEXT);

        // Playhead (current) bitrates
        const currentVideoBitrate = videoRep ? videoRep.bitrateInKbit : 0;
        const currentAudioBitrate = audioRep ? audioRep.bitrateInKbit : 0;
        const currentTextBitrate = textRep ? textRep.bitrateInKbit : 0;
        data.epb = formatStructured(currentVideoBitrate, currentAudioBitrate, currentTextBitrate);

        // Top (max) bitrates
        const allVideoReps = activeStream.getRepresentationsByType(Constants.VIDEO) || [];
        const allAudioReps = activeStream.getRepresentationsByType(Constants.AUDIO) || [];
        const allTextReps = activeStream.getRepresentationsByType(Constants.TEXT) || [];
        const topVideoBitrate = allVideoReps.reduce((max, rep) => Math.max(max, rep.bitrateInKbit), 0);
        const topAudioBitrate = allAudioReps.reduce((max, rep) => Math.max(max, rep.bitrateInKbit), 0);
        const topTextBitrate = allTextReps.reduce((max, rep) => Math.max(max, rep.bitrateInKbit), 0);
        data.etb = formatStructured(topVideoBitrate, topAudioBitrate, topTextBitrate);

        // Lowest (min) bitrates
        const lowestVideoBitrate = allVideoReps.length > 0 ? allVideoReps.reduce((min, rep) => Math.min(min, rep.bitrateInKbit), allVideoReps[0].bitrateInKbit) : 0;
        const lowestAudioBitrate = allAudioReps.length > 0 ? allAudioReps.reduce((min, rep) => Math.min(min, rep.bitrateInKbit), allAudioReps[0].bitrateInKbit) : 0;
        const lowestTextBitrate = allTextReps.length > 0 ? allTextReps.reduce((min, rep) => Math.min(min, rep.bitrateInKbit), allTextReps[0].bitrateInKbit) : 0;
        data.elb = formatStructured(lowestVideoBitrate, lowestAudioBitrate, lowestTextBitrate);

        // Top playable (current) bitrates (for now, same as playhead, can be adjusted if logic differs)
        // If you want to use a different logic for etpb, adjust here.
        data.etpb = formatStructured(currentVideoBitrate, currentAudioBitrate, currentTextBitrate);

        return data;
    }

    instance = {
        setup,
        reset,
        setConfig,
        getCmcdData,
        onStateChange,
        onPeriodSwitchComplete,
        onPlaybackStarted,
        onPlaybackReady,
        onPlaybackPlaying,
        onRebufferingStarted,
        onRebufferingCompleted,
        onPlayerError,
        onPlaybackSeeking,
        onPlaybackSeeked,
        onPlaybackRateChanged,
        wasPlaying,
        onManifestLoaded,
        onManifestLoadingStarted,
        onBufferLevelStateChanged,
        updateMsdData,
        resetInitialSettings,
        getCmcdParametersFromManifest,
        triggerCmcdEventMode,
        getGenericCmcdData,
        isIncludedInRequestFilter,
        onEventChange,
        _getEventModeStructuredBitrateData,
        getLastMediaTypeRequest,
        onEventChange,
        _createErrorObject,
        _markErrorAsSent
    };

    setup();

    return instance;
}

CmcdModel.__dashjs_factory_name = 'CmcdModel';
export default FactoryMaker.getSingletonFactory(CmcdModel);