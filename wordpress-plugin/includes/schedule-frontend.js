/**
 * schedule-frontend.js
 * Fetches the CURRENT API key from WordPress via AJAX at deletion time,
 * then fires a DELETE request to the Vercel app to de-register the embed.
 * The key is NEVER baked into static HTML — it is always read live.
 *
 * Depends on _sbFrontendCfg (injected by wp_localize_script):
 *   { ajaxUrl: string, nonce: string, appUrl: string }
 */
function sbFireDelete(extraParams) {
    if (typeof _sbFrontendCfg === 'undefined') return;
    var cfg = _sbFrontendCfg;
    var fd = new FormData();
    fd.append('action', 'schedule_get_token');
    fd.append('_ajax_nonce', cfg.nonce);
    fetch(cfg.ajaxUrl, { method: 'POST', body: fd, credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (d) {
            if (!d.success || !d.data) return;
            var params = new URLSearchParams({ apiKey: d.data });
            if (extraParams) {
                Object.keys(extraParams).forEach(function (k) {
                    params.set(k, extraParams[k]);
                });
            }
            fetch(cfg.appUrl + '/api/embed-instances?' + params.toString(), {
                method: 'DELETE',
                keepalive: true,
            }).catch(function () {});
        })
        .catch(function () {});
}
