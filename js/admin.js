import { admin } from './app/admin/admin.js';

((w) => {
    w.invitation = admin.init();
})(window);