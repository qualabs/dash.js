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

import { SfItem } from '@svta/cml-structured-field-values';

/**
 * Mapping of mediaType to object type parameter according to CMCD v2 spec
 * Inner List parameters use tokens: v=video, a=audio
 */
const OBJECT_TYPE_PARAMS = {
    video: { v: true },
    audio: { a: true }
};

/**
 * Builds an Inner List with token identifier for a CMCD key
 *
 * @param {Object} values - Object with values per media type { video: number, audio: number }
 * @param {number|null} rounding - Rounding factor (e.g., 100 to round to multiples of 100)
 * @returns {SfItem[]|null} - Array of SfItem for Inner List, or null if no valid values
 *
 * @example
 * // Generates Inner List for buffer level
 * buildInnerListWithTokenIdentifier({ video: 1523, audio: 2100 }, 100)
 * // Returns: [SfItem(1500, {v: true}), SfItem(2100, {a: true})]
 * // Which encodeCmcd serializes as: "(1500;v 2100;a)"
 */
function buildInnerListWithTokenIdentifier(values, rounding = null) {
    if (!values) {return null;}

    const items = [];

    for (const [mediaType, value] of Object.entries(values)) {
        if (value == null || (typeof value === 'number' && isNaN(value))) {continue;}

        const params = OBJECT_TYPE_PARAMS[mediaType];
        if (!params) {continue;}

        const finalValue = rounding && typeof value === 'number'
            ? Math.round(value / rounding) * rounding
            : value;

        items.push(new SfItem(finalValue, params));
    }

    return items.length > 0 ? items : null;
}

export { buildInnerListWithTokenIdentifier, OBJECT_TYPE_PARAMS };
