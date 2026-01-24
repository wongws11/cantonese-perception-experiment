// Service Worker for caching audio files

const CACHE_NAME = 'cantonese-audio-v1';

self.addEventListener('install', (event) => {
	console.log('Service Worker: Installing...');
	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	console.log('Service Worker: Activating...');
	event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
	// Only cache audio files
	if (event.request.url.includes('/audio/') && event.request.url.endsWith('.m4a')) {
		event.respondWith(
			caches.open(CACHE_NAME).then((cache) => {
				return cache.match(event.request).then((cachedResponse) => {
					if (cachedResponse) {
						console.debug(`Cache HIT: ${event.request.url}`);
						return cachedResponse;
					}

					console.debug(`Cache MISS: ${event.request.url}, fetching...`);
					return fetch(event.request)
						.then((networkResponse) => {
							// Only cache successful responses
							if (networkResponse && networkResponse.status === 200) {
								cache.put(event.request, networkResponse.clone());
							}
							return networkResponse;
						})
						.catch((error) => {
							console.error(`Fetch error for ${event.request.url}:`, error);
							// Return cache if available, even if stale
							return cache.match(event.request).catch(() => {
								throw error;
							});
						});
				});
			}),
		);
	} else {
		// For non-audio files, use default fetch
		event.respondWith(fetch(event.request));
	}
});
