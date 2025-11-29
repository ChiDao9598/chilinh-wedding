import { guest } from './app/guest/guest.js';

((w) => {
    w.invitation = guest.init();
})(window);