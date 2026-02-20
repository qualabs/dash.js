import {CMCD_HEADER_FIELDS, decodeCmcd, fromCmcdHeaders } from '@svta/cml-cmcd';

export const CMCD_HEADER_NAMES = CMCD_HEADER_FIELDS.map(field=>field.toLowerCase());

export function decodeCmcdFromUrl(url) {
    try {
        const urlObj = new URL(url);
        const cmcdParam = urlObj.searchParams.get('CMCD');
        if (!cmcdParam) return null;
        return decodeCmcd(cmcdParam);
    } catch {
        return null;
    }
}

export function decodeCmcdFromHeaders(headers) {
    try {
        return fromCmcdHeaders(headers);
    } catch {
        return null;
    }
}

export function decodeCmcdFromBody(body) {
    try {
        return decodeCmcd(body);
    } catch {
        return null;
    }
}

export function isManifestRequest(url) {
    return /\.mpd/i.test(url);
}

export function isSegmentRequest(url) {
    return /\.(m4s|m4v|m4a|mp4)/i.test(url);
}

export function isInitSegmentRequest(url) {
    return /_0\.(m4s|m4v|m4a|mp4)/i.test(url);
}
