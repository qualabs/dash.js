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

import FactoryMaker from '../../core/FactoryMaker.js';
//import ExtUrlQueryInfo from '../vo/ExtUrlQueryInfo.js';

function ExtUrlQueryInfoController() {
    let instance,
        mpd

    function createFinalQueryStrings(manifest) {
        mpd = {};
        mpd.origin = manifest.baseUri;
        mpd.period = [];
        generateInitialQueryString(manifest, '', mpd);

        manifest.Period.forEach((period) => {
            let periodObject = {};
            periodObject.adaptation = [];

            generateInitialQueryString(period, mpd.queryString, periodObject);

            period.AdaptationSet.forEach((adaptationSet) => {
                let adaptationObject = {};
                adaptationObject.representation = [];

                generateInitialQueryString(adaptationSet, periodObject.queryString, adaptationObject);

                adaptationSet.Representation.forEach((representation) => {
                    let representationObject = {};

                    generateInitialQueryString(representation, adaptationObject.queryString, representationObject);

                    adaptationObject.representation.push(representationObject);
                });
                periodObject.adaptation.push(adaptationObject);
            });
            mpd.period.push(periodObject);
        });
    }

    function generateInitialQueryString(src, defaultInitialString, dst) {
        let essentialProperties = src.EssentialProperty;
        if (essentialProperties) {
            essentialProperties.forEach((essentialProperty) => {
                let queryInfo;
                if (essentialProperty.ExtUrlQueryInfo) {
                    queryInfo = essentialProperty.ExtUrlQueryInfo;
                } else {
                    queryInfo = essentialProperty.UrlQueryInfo;
                }
                // queryTemplate useURLUrlQuery queryString includeInRequests sameOriginOnly
                let initialQueryString;
                if (queryInfo && queryInfo.queryString) {
                    if (defaultInitialString && defaultInitialString.length > 0) {
                        initialQueryString = defaultInitialString + '&' + queryInfo.queryString;
                    } else {
                        initialQueryString = queryInfo.queryString;
                    }
                } else {
                    initialQueryString = defaultInitialString;
                }
                dst.queryString = initialQueryString;
            });
        }
    }

    /*
    function buildInitialQueryParams(initialQueryString){
        let params = {};
        const pairs = initialQueryString.split('&');
        for (let pair of pairs) {
            let [key, value] = pair.split('=');
            params[decodeURIComponent(key)] = decodeURIComponent(value);
        }
        return params;
    }

    function buildFinalQueryString(initialQueryParams, queryTemplate) {
        if (queryTemplate === '$querypart$') {
            return Object.entries(initialQueryParams)
                .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
                .join('&');
        } else {
            return queryTemplate.replace(/(\$\$)|\$query:([^$]+)\$|(\$querypart\$)/g, (match, escape, paramName, querypart) => {
                if (escape) {
                    return '$';
                } else if (paramName) {
                    return initialQueryParams[paramName] || '';
                } else if (querypart) {
                    return Object.entries(initialQueryParams)
                        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
                        .join('&');
                }
            });
        }
    }
    */

    function getFinalQueryString(request) {
        if (request.type == 'MediaSegment' || request.type == 'InitializationSegment') {
            if (mpd) {
                let representation = request.representation;
                let adaptation = representation.adaptation;
                let period = adaptation.period;
                let finalQueryString = mpd
                    .period[period.index]
                    .adaptation[adaptation.index]
                    .representation[representation.index]
                    .queryString;
                let canSendToOrigin = !finalQueryString.sameOriginOnly || mpd.origin == request.serviceLocation;
                let inRequest = finalQueryString.includeInRequests.includes('segment');
                if (inRequest && canSendToOrigin) {
                    return finalQueryString.queryParams;
                }
            }
        }
        else if (request.type == 'MPD') {
            if (mpd) {
                let inRequest = ['mpd', 'mpdpatch'].some(r => mpd.queryString.includeInRequests.includes(r));
                if (mpd.queryString && inRequest) {
                    return mpd.queryString.queryParams;
                }
            }
        }
    }

    instance = {
        getFinalQueryString,
        createFinalQueryStrings
    }
    return instance;
}

ExtUrlQueryInfoController.__dashjs_factory_name = 'ExtUrlQueryInfoController';
export default FactoryMaker.getSingletonFactory(ExtUrlQueryInfoController);
