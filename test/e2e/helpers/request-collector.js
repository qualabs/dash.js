import {
    decodeCmcdFromUrl,
    decodeCmcdFromHeaders,
    decodeCmcdFromBody,
    isManifestRequest,
    isSegmentRequest,
    isInitSegmentRequest,
    CMCD_HEADER_NAMES,
} from './cmcd-decoder.js';

const MEDIA_PATTERNS = [
    '**/*.mpd*',
    '**/*.m4s*',
    '**/*.m4v*',
    '**/*.m4a*',
    '**/*.mp4*',
];

export class CmcdRequestCollector {
    constructor() {
        this.queryRequests = [];
        this.headerRequests = [];
        this.eventPosts = [];
        this._resolvers = [];
    }

    async attach(page, options = {}) {
        this.page = page;

        for (const pattern of MEDIA_PATTERNS) {
            await page.route(pattern, (route, request) => {
                const url = request.url();

                // Check for query mode CMCD
                if (url.includes('CMCD=')) {
                    const cmcd = decodeCmcdFromUrl(url);
                    if (cmcd && Object.keys(cmcd).length > 0) {
                        this.queryRequests.push({ url, cmcd, timestamp: Date.now() });
                        this._notifyResolvers('query');
                    }
                }

                // Check for header mode CMCD
                const headers = request.headers();
                const cmcdHeaders = {};
                for (const name of CMCD_HEADER_NAMES) {
                    if (headers[name]) {
                        cmcdHeaders[name] = headers[name];
                    }
                }

                if (Object.keys(cmcdHeaders).length > 0) {
                    const cmcd = decodeCmcdFromHeaders(cmcdHeaders);
                    if (cmcd && Object.keys(cmcd).length > 0) {
                        this.headerRequests.push({
                            url,
                            cmcd,
                            headers: cmcdHeaders,
                            timestamp: Date.now()
                        });
                        this._notifyResolvers('header');
                    }
                }

                route.continue();
            });
        }

        // Intercept event target POSTs
        if (options.eventTargetUrls) {
            for (const targetUrl of options.eventTargetUrls) {
                await page.route(
                    url => url.href.startsWith(targetUrl),
                    async (route, request) => {
                        if (request.method() === 'POST') {
                            const body = request.postData();
                            const contentType = request.headers()['content-type'];
                            if (body) {
                                const cmcd = decodeCmcdFromBody(body);
                                this.eventPosts.push({
                                    url: request.url(),
                                    cmcd,
                                    body,
                                    contentType,
                                    timestamp: Date.now()
                                });
                                this._notifyResolvers('event');
                            }
                        }
                        await route.fulfill({ status: 200, body: '' });
                    }
                );
            }
        }
    }

    _notifyResolvers(type) {
        this._resolvers = this._resolvers.filter(r => {
            if (r.type !== type) return true;
            const requests = this._getRequestsByType(r.type);
            if (requests.length >= r.count) {
                r.resolve(requests);
                return false;
            }
            return true;
        });
    }

    _getRequestsByType(type) {
        switch (type) {
            case 'query': return this.queryRequests;
            case 'header': return this.headerRequests;
            case 'event': return this.eventPosts;
            default: return [];
        }
    }

    waitForRequests(type, count, timeout = 15000) {
        const requests = this._getRequestsByType(type);
        if (requests.length >= count) {
            return Promise.resolve(requests);
        }

        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                this._resolvers = this._resolvers.filter(r => r !== entry);
                resolve(this._getRequestsByType(type));
            }, timeout);

            const entry = {
                type,
                count,
                resolve: (result) => {
                    clearTimeout(timer);
                    resolve(result);
                }
            };
            this._resolvers.push(entry);
        });
    }

    getQueryManifestRequests() {
        return this.queryRequests.filter(r => isManifestRequest(r.url));
    }

    getQuerySegmentRequests() {
        return this.queryRequests.filter(r => isSegmentRequest(r.url));
    }

    getQueryInitSegmentRequests() {
        return this.queryRequests.filter(r => isInitSegmentRequest(r.url));
    }

    getHeaderManifestRequests() {
        return this.headerRequests.filter(r => isManifestRequest(r.url));
    }

    getHeaderSegmentRequests() {
        return this.headerRequests.filter(r => isSegmentRequest(r.url));
    }

    getHeaderInitSegmentRequests() {
        return this.headerRequests.filter(r => isInitSegmentRequest(r.url));
    }

    clear() {
        this.queryRequests = [];
        this.headerRequests = [];
        this.eventPosts = [];
    }
}
