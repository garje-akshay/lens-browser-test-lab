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
  'content-encoding',
  'content-length',
  'transfer-encoding',
  'strict-transport-security',
  'permissions-policy',
  'feature-policy',
  'referrer-policy',
]);

function proxify(absoluteUrl, reqHost) {
  return `${reqHost}/proxy/fetch?url=${encodeURIComponent(absoluteUrl)}`;
}

function rewriteUrl(val, baseUrl, reqHost) {
  if (
    !val ||
    val.startsWith('javascript:') ||
    val.startsWith('data:') ||
    val.startsWith('blob:') ||
    val.startsWith('#') ||
    val.startsWith('mailto:') ||
    val.startsWith('tel:')
  ) return null;
  try {
    const abs = new URL(val, baseUrl).toString();
    if (!/^https?:\/\//i.test(abs)) return null;
    return proxify(abs, reqHost);
  } catch {
    return null;
  }
}

function rewriteSrcset(val, baseUrl, reqHost) {
  return val
    .split(',')
    .map((part) => {
      const trimmed = part.trim();
      if (!trimmed) return '';
      const [url, ...rest] = trimmed.split(/\s+/);
      const rewritten = rewriteUrl(url, baseUrl, reqHost);
      return [(rewritten || url), ...rest].join(' ');
    })
    .join(', ');
}

function rewriteHtml(html, baseUrl, reqHost) {
  // 1. Strip any inline CSP meta tags — they bypass response-header scrubbing.
  html = html.replace(
    /<meta[^>]+http-equiv=["']?(content-security-policy|x-frame-options)["']?[^>]*>/gi,
    ''
  );
  // 2. Strip any <base> — we don't inject one; rewritten URLs are absolute via the proxy.
  html = html.replace(/<base\s[^>]*>/gi, '');
  // 3. Strip subresource integrity — rewritten responses won't match hashes.
  html = html.replace(/\s+integrity=("|')[^"']*\1/gi, '');
  // 4. Strip crossorigin — the proxy serves same-origin, no CORS needed.
  html = html.replace(/\s+crossorigin(?:=("|')[^"']*\1)?/gi, '');

  // Rewrite src / href / action / formaction / poster / data / xlink:href
  html = html.replace(
    /\b(src|href|action|formaction|poster|data|xlink:href)=("|')([^"']+)\2/gi,
    (m, attr, q, val) => {
      const rewritten = rewriteUrl(val, baseUrl, reqHost);
      return rewritten ? `${attr}=${q}${rewritten}${q}` : m;
    }
  );

  // Rewrite srcset and imagesrcset.
  html = html.replace(
    /\b(srcset|imagesrcset)=("|')([^"']+)\2/gi,
    (m, attr, q, val) => `${attr}=${q}${rewriteSrcset(val, baseUrl, reqHost)}${q}`
  );

  // Rewrite <style>...</style> blocks (url(...) inside).
  html = html.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (m, css) => {
    return m.replace(css, rewriteCss(css, baseUrl, reqHost));
  });

  // Rewrite inline style="..." url(...) references.
  html = html.replace(/\bstyle=("|')([^"']+)\1/gi, (m, q, css) => {
    return `style=${q}${rewriteCss(css, baseUrl, reqHost)}${q}`;
  });

  // Inject the console bridge at the top of <head>.
  const bridgeTag = `<script>(${CONSOLE_BRIDGE.toString()})();</script>`;
  if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/<head[^>]*>/i, (m) => `${m}${bridgeTag}`);
  } else {
    html = bridgeTag + html;
  }
  return html;
}

function rewriteCss(css, baseUrl, reqHost) {
  // url(...) references.
  css = css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, val) => {
    const rewritten = rewriteUrl(val, baseUrl, reqHost);
    return rewritten ? `url(${q}${rewritten}${q})` : m;
  });
  // @import "..." and @import url(...).
  css = css.replace(/@import\s+(['"])([^'"]+)\1/g, (m, q, val) => {
    const rewritten = rewriteUrl(val, baseUrl, reqHost);
    return rewritten ? `@import ${q}${rewritten}${q}` : m;
  });
  return css;
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

// Lightweight reachability probe — just surfaces the same error diagnostics
// as /fetch without streaming a response body. Used by the frontend so it can
// show a friendly overlay before rendering the iframe.
router.get('/probe', async (req, res) => {
  const target = req.query.url;
  if (!target || !/^https?:\/\//i.test(target)) {
    return res.status(400).json({ ok: false, error: 'Invalid url' });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const upstream = await fetch(target, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': req.headers['user-agent'] || 'Mozilla/5.0' },
    });
    // Don't wait for or read the body — just signal reachability.
    try { upstream.body?.cancel?.(); } catch {}
    res.setHeader('access-control-allow-origin', '*');
    return res.json({ ok: true, status: upstream.status });
  } catch (err) {
    const cause = err.cause;
    const code = cause?.code || cause?.errno;
    let detail = err.message || 'unknown';
    if (err.name === 'AbortError') detail = 'Upstream timed out';
    else if (code === 'ENOTFOUND') detail = `DNS lookup failed`;
    else if (code === 'ECONNREFUSED') detail = 'Connection refused';
    else if (code === 'CERT_HAS_EXPIRED') detail = 'TLS certificate expired';
    else if (code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || code === 'DEPTH_ZERO_SELF_SIGNED_CERT') {
      detail = 'TLS certificate invalid';
    }
    else if (cause?.message) detail = cause.message;
    res.setHeader('access-control-allow-origin', '*');
    return res.status(502).json({ ok: false, error: detail });
  } finally {
    clearTimeout(timer);
  }
});

router.get('/fetch', async (req, res) => {
  const target = req.query.url;
  if (!target || !/^https?:\/\//i.test(target)) {
    return res.status(400).send('Invalid url');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const upstream = await fetch(target, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent':
          req.headers['user-agent'] ||
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        accept: req.headers['accept'] || '*/*',
        'accept-language': req.headers['accept-language'] || 'en-US,en;q=0.9',
      },
    });

    for (const [k, v] of upstream.headers.entries()) {
      if (!BLOCKED_HEADERS.has(k.toLowerCase())) res.setHeader(k, v);
    }
    // Permissive CORS so the iframe page can load subresources that request it.
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
    res.setHeader('access-control-allow-headers', '*');

    res.status(upstream.status);

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    // Prefer x-forwarded-proto (Render edge) and fall back to req.protocol. Hosts
    // on *.onrender.com always serve HTTPS at the edge even if the container sees http.
    const fwdProto = (req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
    const host = req.get('host') || '';
    const proto = fwdProto || (/\.onrender\.com$/i.test(host) ? 'https' : req.protocol);
    const reqHost = `${proto}://${host}`;
    const finalUrl = upstream.url || target;

    if (contentType.includes('text/html')) {
      const html = await upstream.text();
      return res.send(rewriteHtml(html, finalUrl, reqHost));
    }
    if (contentType.includes('text/css')) {
      const css = await upstream.text();
      return res.send(rewriteCss(css, finalUrl, reqHost));
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    return res.send(buf);
  } catch (err) {
    // Node's fetch() wraps the real cause in err.cause for network failures.
    const cause = err.cause;
    const code = cause?.code || cause?.errno;
    let detail = err.message || 'unknown';
    if (err.name === 'AbortError') detail = 'Upstream timed out after 25s';
    else if (code === 'ENOTFOUND') detail = `DNS lookup failed for ${cause?.hostname || target}`;
    else if (code === 'ECONNREFUSED') detail = 'Connection refused';
    else if (code === 'CERT_HAS_EXPIRED') detail = 'Upstream TLS certificate expired';
    else if (code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || code === 'DEPTH_ZERO_SELF_SIGNED_CERT') {
      detail = 'Upstream TLS certificate invalid';
    }
    else if (cause?.message) detail = cause.message;
    console.error(`[proxy] ${target} → ${detail}`, cause || err);
    res.status(502).send(`Proxy error: ${detail}`);
  } finally {
    clearTimeout(timer);
  }
});

module.exports = router;
