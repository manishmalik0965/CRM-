const CACHE_NAME = 'crm-cache-v2';
const OFFLINE_URL = '/index.html';

// Critical static assets to cache immediately upon service worker installation
const PRECACHE_ASSETS = [
    '/',
    '/index.html',
    '/logo.svg',
    '/logo.png',
    '/robots.txt',
    '/manifest.json'
];

// Perform install & cache core shells
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[Service Worker] Precaching app shell and core assets');
                // Ensure failures during caching do not prevent service worker deployment
                return cache.addAll(PRECACHE_ASSETS).catch((err) => {
                    console.error('[Service Worker] Pre-caching partial failure, continuing registration:', err.message);
                });
            })
            .then(() => self.skipWaiting())
    );
});

// Activate and clean up obsolete caches instantly
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        console.log('[Service Worker] Purging stale obsolete cache:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Cache strategy router:
// 1. App Shell and Navigation: Network-First falling back to index.html (SPA routing shell)
// 2. API Routes: Network-First falling back to offline fallback warning message
// 3. Static Assets & Fonts: Stale-While-Revalidate with dynamic updates
self.addEventListener('fetch', (event) => {
    // Only handle GET requests
    if (event.request.method !== 'GET') {
        return;
    }

    const requestUrl = new URL(event.request.url);

    // Safeguard check: Ignore chrome extensions, non-http, and live HMR web socket updates
    if (!requestUrl.protocol.startsWith('http') || requestUrl.pathname.includes('hot-update') || requestUrl.hostname === 'localhost' && requestUrl.port === '3001') {
        return;
    }

    // Is it an API route?
    const isApiRoute = requestUrl.pathname.startsWith('/api/');
    // Is it a document navigation?
    const isNavigation = event.request.mode === 'navigate';
    // Is it booking list or analytics dashboard related (/api/bookings)?
    const isBookingOrAnalyticsApi = requestUrl.pathname.startsWith('/api/bookings');

    if (isBookingOrAnalyticsApi) {
        // Strategy: Stale-While-Revalidate specifically for booking list & analytics dashboard
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                const fetchPromise = fetch(event.request).then((networkResponse) => {
                    if (networkResponse && (networkResponse.status === 200 || networkResponse.status === 304)) {
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseToCache);
                        });
                    }
                    return networkResponse;
                }).catch((err) => {
                    console.warn('[Service Worker] Background SWR fetch failed for:', requestUrl.pathname, err.message);
                });

                if (cachedResponse) {
                    // Instantly serve cached, while background fetch updates the cache
                    return cachedResponse;
                }

                // If not cached, wait for network
                return fetchPromise;
            })
        );
    } else if (isApiRoute || isNavigation) {
        // Strategy: Network-First
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    // Only cache successful standard requests
                    if (response && response.status === 200) {
                        const responseToCache = response.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseToCache);
                        });
                    }
                    return response;
                })
                .catch((error) => {
                    console.warn('[Service Worker] Network offline. Serving fallback cache for:', requestUrl.pathname);
                    
                    return caches.match(event.request).then((cachedResponse) => {
                        if (cachedResponse) {
                            return cachedResponse;
                        }

                        // For navigation queries, return index.html to allow SPA client routes to work
                        if (isNavigation) {
                            return caches.match(OFFLINE_URL);
                        }

                        // For API queries, return standard json warning
                        return new Response(
                            JSON.stringify({ 
                                success: false, 
                                offline: true, 
                                message: "The CRM is running in native offline mode. Network connection is required for this action." 
                            }), 
                            { 
                                status: 503, 
                                headers: { 'Content-Type': 'application/json' } 
                            }
                        );
                    });
                })
        );
    } else {
        // Strategy: Stale-While-Revalidate (Asset caching)
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                if (cachedResponse) {
                    // Fetch fresh resource in background & update cache dynamically
                    fetch(event.request).then((networkResponse) => {
                        if (networkResponse && networkResponse.status === 200) {
                            caches.open(CACHE_NAME).then((cache) => {
                                cache.put(event.request, networkResponse);
                            });
                        }
                    }).catch(() => { /* offline background updates fail silently */ });
                    
                    return cachedResponse;
                }

                // Not in cache: fetch and store
                return fetch(event.request).then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200 && (networkResponse.type === 'basic' || networkResponse.type === 'cors')) {
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseToCache);
                        });
                    }
                    return networkResponse;
                }).catch(() => {
                    // Default image offline placeholders
                    if (event.request.destination === 'image') {
                        return new Response(
                            '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>', 
                            { headers: { 'Content-Type': 'image/svg+xml' } }
                        );
                    }
                    return new Response('Network Connection offline.', { status: 404, statusText: 'Offline' });
                });
            })
        );
    }
});
