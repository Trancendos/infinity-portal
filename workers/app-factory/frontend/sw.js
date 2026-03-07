// Infinity Worker IDE - Service Worker v5.1
// Enables offline functionality and app-like experience

const CACHE_NAME = 'infinity-worker-v5.1';
const OFFLINE_URL = '/offline';

// Core assets to cache immediately
const PRECACHE_ASSETS = [
    '/',
    '/ide',
    '/health',
    '/manifest.json',
    '/offline'
];

// API routes that should always go to network
const NETWORK_ONLY = [
    '/api/generate',
    '/api/mobile/build',
    '/api/deploy',
    '/api/git'
];

// Install event - cache core assets
self.addEventListener('install', (event) => {
    console.log('[SW] Installing Infinity Worker Service Worker');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Precaching core assets');
                return cache.addAll(PRECACHE_ASSETS);
            })
            .then(() => self.skipWaiting())
            .catch((error) => {
                console.error('[SW] Precache failed:', error);
            })
    );
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating new service worker');
    
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name !== CACHE_NAME)
                        .map((name) => {
                            console.log('[SW] Deleting old cache:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => self.clients.claim())
    );
});

// Fetch event - network first with cache fallback
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    
    // Skip non-GET requests
    if (event.request.method !== 'GET') {
        return;
    }
    
    // Skip cross-origin requests
    if (url.origin !== self.location.origin) {
        return;
    }
    
    // Network only for API routes
    if (NETWORK_ONLY.some(route => url.pathname.startsWith(route))) {
        event.respondWith(
            fetch(event.request)
                .catch(() => {
                    return new Response(
                        JSON.stringify({ error: 'Offline - API unavailable' }),
                        { 
                            status: 503,
                            headers: { 'Content-Type': 'application/json' }
                        }
                    );
                })
        );
        return;
    }
    
    // Network first, cache fallback for other requests
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Clone response for caching
                if (response.ok) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            })
            .catch(() => {
                return caches.match(event.request)
                    .then((cachedResponse) => {
                        if (cachedResponse) {
                            return cachedResponse;
                        }
                        
                        // Return offline page for navigation requests
                        if (event.request.mode === 'navigate') {
                            return caches.match(OFFLINE_URL);
                        }
                        
                        return new Response('Offline', { status: 503 });
                    });
            })
    );
});

// Background sync for offline actions
self.addEventListener('sync', (event) => {
    console.log('[SW] Background sync:', event.tag);
    
    if (event.tag === 'sync-projects') {
        event.waitUntil(syncProjects());
    }
});

// Push notifications (future feature)
self.addEventListener('push', (event) => {
    if (event.data) {
        const data = event.data.json();
        
        event.waitUntil(
            self.registration.showNotification(data.title || 'Infinity Worker', {
                body: data.body || 'New notification',
                icon: '/static/icons/icon-192x192.png',
                badge: '/static/icons/icon-72x72.png',
                data: data.data
            })
        );
    }
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    
    event.waitUntil(
        clients.openWindow(event.notification.data?.url || '/ide')
    );
});

// Helper function for background sync
async function syncProjects() {
    try {
        // Get pending offline actions from IndexedDB
        // This would be implemented with actual IndexedDB storage
        console.log('[SW] Syncing offline projects...');
    } catch (error) {
        console.error('[SW] Sync failed:', error);
    }
}

// Message handler for client communication
self.addEventListener('message', (event) => {
    if (event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data.type === 'CACHE_URLS') {
        event.waitUntil(
            caches.open(CACHE_NAME).then((cache) => {
                return cache.addAll(event.data.urls);
            })
        );
    }
});

console.log('[SW] Infinity Worker Service Worker loaded');
