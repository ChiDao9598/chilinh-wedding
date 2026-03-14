export const device = (() => {
    /**
     * Check if device is mobile
     * @returns {boolean}
     */
    const isMobile = () => {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
            || window.innerWidth <= 768;
    };

    /**
     * Check if device has slow connection
     * @returns {boolean}
     */
    const isSlowConnection = () => {
        if ('connection' in navigator && navigator.connection) {
            const conn = navigator.connection;
            const effectiveType = conn.effectiveType;
            return effectiveType === 'slow-2g' || effectiveType === '2g' || effectiveType === '3g';
        }
        return false;
    };

    /**
     * Get device memory (GB)
     * @returns {number}
     */
    const getMemory = () => {
        if ('deviceMemory' in navigator) {
            return navigator.deviceMemory;
        }
        return 4; // default assumption
    };

    /**
     * Check if device is low-end
     * @returns {boolean}
     */
    const isLowEndDevice = () => {
        return isMobile() && (getMemory() <= 2 || isSlowConnection());
    };

    return {
        isMobile,
        isSlowConnection,
        getMemory,
        isLowEndDevice,
    };
})();
