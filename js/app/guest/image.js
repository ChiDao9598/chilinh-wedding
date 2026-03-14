import { progress } from './progress.js';
import { cache } from '../../connection/cache.js';
import { device } from '../../common/device.js';

export const image = (() => {

    /**
     * @type {NodeListOf<HTMLImageElement>|null}
     */
    let images = null;

    /**
     * @type {ReturnType<typeof cache>|null}
     */
    let c = null;

    /**
     * @type {object[]}
     */
    const urlCache = [];

    /**
     * @type {IntersectionObserver|null}
     */
    let observer = null;

    /**
     * @type {Set<HTMLImageElement>}
     */
    const loadedImages = new Set();

    /**
     * @param {string} src 
     * @returns {Promise<HTMLImageElement>}
     */
    const loadedImage = (src) => new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = src;
    });

    /**
     * @param {HTMLImageElement} el 
     * @param {string} src 
     * @returns {Promise<void>}
     */
    const appendImage = (el, src) => loadedImage(src).then((img) => {
        el.width = img.naturalWidth;
        el.height = img.naturalHeight;
        el.classList.remove('opacity-0');
        el.src = img.src;
        img.remove();

        progress.complete('image');
    });

    /**
     * @param {HTMLImageElement} el 
     * @returns {void}
     */
    const getByFetch = (el) => {
        if (loadedImages.has(el)) {
            return;
        }
        
        loadedImages.add(el);
        urlCache.push({
            url: el.getAttribute('data-src'),
            res: (url) => appendImage(el, url),
            rej: (err) => {
                console.error(err);
                progress.invalid('image');
            },
        });
    };

    /**
     * @param {HTMLImageElement} el 
     * @returns {void}
     */
    const getByDefault = (el) => {
        if (loadedImages.has(el)) {
            return;
        }
        
        loadedImages.add(el);
        el.onerror = () => progress.invalid('image');
        el.onload = () => {
            el.width = el.naturalWidth;
            el.height = el.naturalHeight;
            progress.complete('image');
        };

        if (el.complete && el.naturalWidth !== 0 && el.naturalHeight !== 0) {
            progress.complete('image');
        } else if (el.complete) {
            progress.invalid('image');
        }
    };

    /**
     * Setup Intersection Observer for lazy loading
     * @returns {IntersectionObserver}
     */
    const setupObserver = () => {
        // Adjust rootMargin based on device - load earlier on desktop, later on mobile
        const rootMargin = device.isMobile() 
            ? (device.isLowEndDevice() ? '50px' : '200px')
            : '400px';

        return new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    if (!loadedImages.has(img)) {
                        loadImageElement(img);
                    }
                    observer.unobserve(img);
                }
            });
        }, {
            rootMargin,
            threshold: 0.01
        });
    };

    /**
     * Load a single image element
     * @param {HTMLImageElement} el
     * @returns {Promise<void>}
     */
    const loadImageElement = async (el) => {
        urlCache.length = 0;
        
        if (el.hasAttribute('data-src')) {
            getByFetch(el);
            await c.run(urlCache, progress.getAbort());
        } else {
            getByDefault(el);
        }
    };

    /**
     * Check if image is in viewport or above fold
     * @param {HTMLImageElement} el
     * @returns {boolean}
     */
    const isAboveFold = (el) => {
        const rect = el.getBoundingClientRect();
        return rect.top < window.innerHeight * 1.5; // 1.5x viewport height
    };

    /**
     * Prioritize critical images (above fold, high priority)
     * @param {HTMLImageElement[]} imgs
     * @returns {object}
     */
    const categorizeImages = (imgs) => {
        const critical = [];
        const lazy = [];
        
        imgs.forEach((img) => {
            // Images with fetchpriority="high" or above fold are critical
            if (img.hasAttribute('fetchpriority') || isAboveFold(img)) {
                critical.push(img);
            } else {
                lazy.push(img);
            }
        });
        
        return { critical, lazy };
    };

    /**
     * @returns {boolean}
     */
    const hasDataSrc = () => Array.from(images).some((i) => i.hasAttribute('data-src'));

    /**
     * @returns {Promise<void>}
     */
    const load = async () => {
        const imgs = Array.from(images);
        const { critical, lazy } = categorizeImages(imgs);

        // Setup observer for lazy images
        observer = setupObserver();

        /**
         * @param {function} filter 
         * @returns {Promise<void>}
         */
        const runGroup = async (filter) => {
            urlCache.length = 0;
            imgs.filter(filter).forEach((el) => {
                if (!loadedImages.has(el)) {
                    if (el.hasAttribute('data-src')) {
                        getByFetch(el);
                    } else {
                        getByDefault(el);
                    }
                }
            });
            await c.run(urlCache, progress.getAbort());
        };

        // On mobile/low-end devices, be more conservative
        if (device.isLowEndDevice()) {
            // Load only the most critical images (fetchpriority="high")
            await runGroup((el) => el.hasAttribute('fetchpriority'));
            
            // Setup lazy loading for everything else
            imgs.filter((el) => !el.hasAttribute('fetchpriority')).forEach((el) => {
                if (!loadedImages.has(el)) {
                    observer.observe(el);
                }
            });
        } else if (device.isMobile()) {
            // Load critical images first
            await runGroup((el) => critical.includes(el) && el.hasAttribute('fetchpriority'));
            await runGroup((el) => critical.includes(el) && !el.hasAttribute('fetchpriority'));
            
            // Lazy load the rest
            lazy.forEach((el) => {
                if (!loadedImages.has(el)) {
                    observer.observe(el);
                }
            });
        } else {
            // Desktop: Load high priority first, then everything else
            await runGroup((el) => el.hasAttribute('fetchpriority'));
            await runGroup((el) => !el.hasAttribute('fetchpriority'));
        }
    };

    /**
     * @param {string} blobUrl 
     * @returns {void}
     */
    const download = (blobUrl) => {
        c.download(blobUrl, `${window.location.hostname}_image_${Date.now()}`);
    };

    /**
     * @returns {object}
     */
    const init = () => {
        c = cache('image').withForceCache();
        images = document.querySelectorAll('img');
        
        // Only count critical images for initial progress on mobile
        const imgs = Array.from(images);
        if (device.isLowEndDevice()) {
            // Only count fetchpriority images
            imgs.filter((el) => el.hasAttribute('fetchpriority')).forEach(progress.add);
        } else if (device.isMobile()) {
            // Count critical images (above fold + fetchpriority)
            const { critical } = categorizeImages(imgs);
            critical.forEach(progress.add);
        } else {
            // Desktop: count all
            images.forEach(progress.add);
        }

        return {
            load,
            download,
            hasDataSrc,
        };
    };

    return {
        init,
    };
})();