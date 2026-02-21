const CMCD_HEADER_NAMES = [
    'cmcd-object',
    'cmcd-request',
    'cmcd-session',
    'cmcd-status',
];

function isManifestRequest(url) {
    return /\.mpd/i.test(url);
}

function isSegmentRequest(url) {
    return /\.(m4s|m4v|m4a|mp4)/i.test(url);
}

function isInitSegmentRequest(url) {
    return /_0\.(m4s|m4v|m4a|mp4)/i.test(url);
}

function isMediaRequest(url) {
    return isManifestRequest(url) || isSegmentRequest(url);
}

function extractCmcdParam(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.searchParams.get('CMCD');
    } catch {
        return null;
    }
}

/**
 * Collects raw CMCD data from outgoing XHR requests by monkey-patching
 * XMLHttpRequest prototype methods. Stores raw strings/headers without
 * parsing — validation functions in the tests handle both parsing and
 * validation in a single pass.
 *
 * For event target URLs, intercepts POST requests and simulates a 200
 * response to prevent actual network calls.
 */
class CmcdRequestCollector {

    constructor() {
        this.queryRequests = [];
        this.headerRequests = [];
        this.eventPosts = [];
        this._resolvers = [];
        this._eventTargetUrls = [];
        this._origOpen = null;
        this._origSetRequestHeader = null;
        this._origSend = null;
    }

    /**
     * Install XHR patches to start collecting CMCD data.
     * @param {object} [options]
     * @param {string[]} [options.eventTargetUrls] - URLs to intercept as event POSTs
     */
    attach(options = {}) {
        this._eventTargetUrls = options.eventTargetUrls || [];

        const self = this;

        this._origOpen = XMLHttpRequest.prototype.open;
        this._origSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
        this._origSend = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.open = function (method, url) {
            this._cmcd_method = method;
            this._cmcd_url = typeof url === 'string' ? url : String(url);
            this._cmcd_headers = {};
            return self._origOpen.apply(this, arguments);
        };

        XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
            if (this._cmcd_headers) {
                this._cmcd_headers[name.toLowerCase()] = value;
            }
            return self._origSetRequestHeader.apply(this, arguments);
        };

        XMLHttpRequest.prototype.send = function (body) {
            const url = this._cmcd_url || '';
            const method = (this._cmcd_method || 'GET').toUpperCase();
            const headers = this._cmcd_headers || {};

            // Event target POST interception
            const isEventTarget = self._eventTargetUrls.some(
                (target) => url.startsWith(target)
            );

            if (isEventTarget && method === 'POST') {
                const contentType = headers['content-type'] || '';
                self.eventPosts.push({
                    url,
                    body,
                    contentType,
                    timestamp: Date.now(),
                });
                self._notifyResolvers('event');

                // Simulate 200 response matching XHRLoader expectations
                const xhr = this;
                setTimeout(() => {
                    try {
                        Object.defineProperty(xhr, 'status', { value: 200, configurable: true });
                        Object.defineProperty(xhr, 'statusText', { value: 'OK', configurable: true });
                        Object.defineProperty(xhr, 'readyState', { value: 4, configurable: true });
                        Object.defineProperty(xhr, 'responseURL', { value: url, configurable: true });
                        Object.defineProperty(xhr, 'response', { value: '', configurable: true });
                        Object.defineProperty(xhr, 'responseText', { value: '', configurable: true });
                        xhr.getAllResponseHeaders = () => '';

                        if (typeof xhr.onload === 'function') {
                            xhr.onload.call(xhr);
                        }
                        if (typeof xhr.onloadend === 'function') {
                            xhr.onloadend.call(xhr);
                        }
                    } catch (e) {
                        // Silently ignore simulation errors
                    }
                }, 0);
                return;
            }

            // Passive collection for media requests
            if (isMediaRequest(url)) {
                // Query mode — store raw CMCD param string
                if (url.includes('CMCD=')) {
                    const cmcdParam = extractCmcdParam(url);
                    if (cmcdParam) {
                        self.queryRequests.push({ url, cmcdParam, timestamp: Date.now() });
                        self._notifyResolvers('query');
                    }
                }

                // Header mode — store raw CMCD header strings
                const cmcdHeaders = {};
                for (const name of CMCD_HEADER_NAMES) {
                    if (headers[name]) {
                        cmcdHeaders[name] = headers[name];
                    }
                }
                if (Object.keys(cmcdHeaders).length > 0) {
                    self.headerRequests.push({
                        url,
                        headers: cmcdHeaders,
                        timestamp: Date.now(),
                    });
                    self._notifyResolvers('header');
                }
            }

            return self._origSend.apply(this, arguments);
        };
    }

    /**
     * Remove XHR patches and stop collecting.
     */
    detach() {
        if (this._origOpen) {
            XMLHttpRequest.prototype.open = this._origOpen;
        }
        if (this._origSetRequestHeader) {
            XMLHttpRequest.prototype.setRequestHeader = this._origSetRequestHeader;
        }
        if (this._origSend) {
            XMLHttpRequest.prototype.send = this._origSend;
        }
        this._origOpen = null;
        this._origSetRequestHeader = null;
        this._origSend = null;
    }

    /**
     * Wait until at least `count` requests of the given type have been collected.
     * @param {'query'|'header'|'event'} type
     * @param {number} count
     * @param {number} [timeout=15000]
     * @returns {Promise<Array>}
     */
    waitForRequests(type, count, timeout = 15000) {
        const requests = this._getRequestsByType(type);
        if (requests.length >= count) {
            return Promise.resolve(requests);
        }

        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                this._resolvers = this._resolvers.filter((r) => r !== entry);
                resolve(this._getRequestsByType(type));
            }, timeout);

            const entry = {
                type,
                count,
                resolve: (result) => {
                    clearTimeout(timer);
                    resolve(result);
                },
            };
            this._resolvers.push(entry);
        });
    }

    // Query mode filters
    getQueryManifestRequests() {
        return this.queryRequests.filter((r) => isManifestRequest(r.url));
    }

    getQuerySegmentRequests() {
        return this.queryRequests.filter((r) => isSegmentRequest(r.url));
    }

    getQueryInitSegmentRequests() {
        return this.queryRequests.filter((r) => isInitSegmentRequest(r.url));
    }

    // Header mode filters
    getHeaderManifestRequests() {
        return this.headerRequests.filter((r) => isManifestRequest(r.url));
    }

    getHeaderSegmentRequests() {
        return this.headerRequests.filter((r) => isSegmentRequest(r.url));
    }

    getHeaderInitSegmentRequests() {
        return this.headerRequests.filter((r) => isInitSegmentRequest(r.url));
    }

    clear() {
        this.queryRequests = [];
        this.headerRequests = [];
        this.eventPosts = [];
    }

    _getRequestsByType(type) {
        switch (type) {
            case 'query':
                return this.queryRequests;
            case 'header':
                return this.headerRequests;
            case 'event':
                return this.eventPosts;
            default:
                return [];
        }
    }

    _notifyResolvers(type) {
        this._resolvers = this._resolvers.filter((r) => {
            if (r.type !== type) return true;
            const requests = this._getRequestsByType(r.type);
            if (requests.length >= r.count) {
                r.resolve(requests);
                return false;
            }
            return true;
        });
    }
}

export default CmcdRequestCollector;
