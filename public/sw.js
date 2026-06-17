const CACHE_NAME = 'crm-cache-v1';
const OFFLINE_URL = '/index.html';

// Critical assets to cache on install
const PRECACHE_ASSETS = [
    '/',
    '/index.html',
    '/logo.svg',
    '/logo.png',
    '/robots.txt'
];

// Perform install & precaching
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[Service Worker] Pre-caching critical assets');
                return cache.addAll(PRECACHE_ASSETS);
            })
            .then(() => self.skipWaiting())
    );
});

// Activate & clean up outdated caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        console.log('[Service Worker] Deleting outdated cache:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Helper to check if request is a static asset or document
function isStaticAsset(url) {
    const pathname = url.pathname;
    return (
        pathname.includes('.') && 
        !pathname.startsWith('/api') && 
        !pathname.includes('chrome-extension')
    );
}

// Fetch routing strategies:
// 1. Documents & API: Network-First (with immediate cache fallback)
// 2. Static Assets: Stale-While-Revalidate (load from cache instantly, update cache in background)
self.addEventListener('fetch', (event) => {
    // Skip non-GET requests, Chrome extensions, or hot module updates
    if (event.request.method !== 'GET' || event.request.url.startsWith('chrome-extension://') || event.request.url.includes('hot-update')) {
        return;
    }

    const requestUrl = new URL(event.request.url);

    // Strategy 1: Network-First (API calls and navigations)
    if (requestUrl.pathname.startsWith('/api') || event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    // Check if we received a valid response
                    if (response && response.status === 200 && response.type === 'basic') {
                        // Cache a copy of the fresh API page / document
                        const responseToCache = response.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseToCache);
                        });
                    }
                    return response;
                })
                .catch(() => {
                    console.log('[Service Worker] Fetch failed, returning cached fallback for:', requestUrl.pathname);
                    return caches.match(event.request).then((cachedResponse) => {
                        if (cachedResponse) {
                            return cachedResponse;
                        }
                        // Fallback to offline entry HTML if it's a page navigation
                        if (event.request.mode === 'navigate') {
                            return caches.match(OFFLINE_URL);
                        }
                        // Return offline error response for api calls when offline
                        return new Response(
                            JSON.stringify({ error: "Offline: Intermittent connectivity detected." }), 
                            { 
                                status: 503, 
                                headers: { 'Content-Type': 'application/json' } 
                            }
                        );
                    });
                })
        );
    } else {
        // Strategy 2: Stale-While-Revalidate (Assets, CSS, Bundles, Images)
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                if (cachedResponse) {
                    // Fetch fresh resource in background & update cache
                    fetch(event.request).then((networkResponse) => {
                        if (networkResponse && networkResponse.status === 200) {
                            caches.open(CACHE_NAME).then((cache) => {
                                cache.put(event.request, networkResponse);
                            });
                        }
                    }).catch(() => {/* Ignore background sync failures */});
                    
                    return cachedResponse;
                }

                // If not cached, fetch from network and cache for next time
                return fetch(event.request).then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200 && (networkResponse.type === 'basic' || networkResponse.type === 'cors')) {
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseToCache);
                        });
                    }
                    return networkResponse;
                }).catch(() => {
                    // Fallback to placeholder image or general resource
                    if (event.request.destination === 'image') {
                        return new Response(
                            '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>', 
                            { headers: { 'Content-Type': 'image/svg+xml' } }
                        );
                    }
                });
            })
        );
    }
});
