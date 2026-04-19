const express = require('express');
const router = express.Router();

// Minimal rewriting proxy so iframe mode can load sites that set
// X-Frame-Options: DENY or a restrictive CSP. We strip those headers and
// rewrite href/src/action attributes in returned HTML so sub-resources
// (CSS, JS, images, forms) go back through /proxy/fetch too.
//
// For local QA only — do NOT expose publicly without auth + allowlist,
// since the endpoint is effectively an open relay.

const BLOCKED_HEADERS = new Set([
  'x-frame-options',
  'content-security-policy',
  'content-security-policy-report-only',
  'cross-origin-opener-policy',
  'cross-origin-embedder-policy',
  'cross-origin-resource-policy',
  'content-encoding', // upstream may be gzipped; we've already decoded
  'content-length',
  'transfer-encoding',
]);

function proxify(absoluteUrl, reqHost) {
  return `${reqHost}/proxy/fetch?url=${encodeURIComponent(absoluteUrl)}`;
}

function rewriteHtml(html, baseUrl, reqHost) {
  const origin = new URL(baseUrl).origin;
  // Remove any existing <base> so our injected one wins.
  html = html.replace(/<base\s[^>]*>/gi, '');
  // Rewrite absolute URLs and root-relative URLs in attributes.
  // src=, href=, action= — both quoted forms.
  html = html.replace(
    /\b(src|href|action)=("|')([^"'>\s]+)\2/gi,
    (m, attr, q, val) => {
      if (val.startsWith('javascript:') || val.startsWith('data:') || val.startsWith('#') || val.startsWith('mailto:')) {
        return m;
      }
      try {
        const abs = new URL(val, baseUrl).toString();
        return `${attr}=${q}${proxify(abs, reqHost)}${q}`;
      } catch {
        return m;
      }
    }
  );
  // Inject <base> + console bridge. The bridge forwards console.*,
  // window.onerror, and unhandledrejection up to the parent window so the
  // Log panel in iframe mode can display them.
  const baseTag = `<base href="${origin}/">`;
  const bridgeTag = `<script>(${CONSOLE_BRIDGE.toString()})();</script>`;
  const injected = baseTag + bridgeTag;
  if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/<head[^>]*>/i, (m) => `${m}${injected}`);
  } else {
    html = injected + html;
  }
  return html;
}

// Runs inside the proxied page. Keep it standalone (no closures), since it's
// serialized via .toString().
function CONSOLE_BRIDGE() {
  try {
    var parent = window.parent;
    if (!parent || parent === window) return;
    var send = function (level, source, message, extra) {
      try {
        parent.postMessage(
          { __btl: true, level: level, source: source, message: String(message), extra: extra || null, ts: Date.now() },
          '*'
        );
      } catch (e) {}
    };
    ['log', 'info', 'warn', 'error', 'debug'].forEach(function (lvl) {
      var orig = console[lvl];
      console[lvl] = function () {
        try {
          var parts = [];
          for (var i = 0; i < arguments.length; i++) {
            var a = arguments[i];
            parts.push(typeof a === 'string' ? a : JSON.stringify(a, null, 0));
          }
          send(lvl, 'console', parts.join(' '));
        } catch (e) {}
        if (orig) return orig.apply(console, arguments);
      };
    });
    window.addEventListener('error', function (e) {
      send('error', 'window.onerror', e.message, { filename: e.filename, lineno: e.lineno });
    });
    window.addEventListener('unhandledrejection', function (e) {
      send('error', 'unhandledrejection', (e.reason && e.reason.message) || String(e.reason));
    });
  } catch (e) {}
}

router.get('/fetch', async (req, res) => {
  const target = req.query.url;
  if (!target || !/^https?:\/\//i.test(target)) {
    return res.status(400).send('Invalid url');
  }
  try {
    const upstream = await fetch(target, {
      redirect: 'follow',
      headers: {
        'user-agent':
          req.headers['user-agent'] ||
          'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
        accept: req.headers['accept'] || '*/*',
        'accept-language': req.headers['accept-language'] || 'en-US,en;q=0.9',
      },
    });

    // Copy headers except the blocked ones.
    for (const [k, v] of upstream.headers.entries()) {
      if (!BLOCKED_HEADERS.has(k.toLowerCase())) res.setHeader(k, v);
    }
    res.status(upstream.status);

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const reqHost = `${req.protocol}://${req.get('host')}`;
    const finalUrl = upstream.url || target;

    if (contentType.includes('text/html')) {
      const html = await upstream.text();
      return res.send(rewriteHtml(html, finalUrl, reqHost));
    }
    if (contentType.includes('text/css')) {
      let css = await upstream.text();
      // Rewrite url(...) references in CSS.
      css = css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, val) => {
        if (val.startsWith('data:')) return m;
        try {
          const abs = new URL(val, finalUrl).toString();
          return `url(${q}${proxify(abs, reqHost)}${q})`;
        } catch {
          return m;
        }
      });
      return res.send(css);
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    return res.send(buf);
  } catch (err) {
    res.status(502).send(`Proxy error: ${err.message}`);
  }
});

module.exports = router;
