# Cloudflare Setup (Free Plan)

Vexara uses **Cloudflare as a reverse proxy** in front of your nginx/Docker stack.
Cloudflare terminates SSL, caches static assets globally, provides DDoS protection,
and compresses responses with Brotli — all on the free plan.

---

## 1. Add your domain to Cloudflare

1. Go to https://dash.cloudflare.com → **Add a Site**
2. Enter your domain → select **Free plan**
3. Cloudflare scans your existing DNS records. Import them.
4. Change your domain's nameservers at your registrar to the two Cloudflare nameservers shown.
5. Wait for propagation (usually < 30 min).

---

## 2. DNS records

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | `@` | `<your-server-IP>` | **Proxied (orange cloud)** |
| A | `www` | `<your-server-IP>` | **Proxied (orange cloud)** |
| A | `admin` | `<your-server-IP>` | Proxied or DNS-only |

> **Orange cloud = traffic routes through Cloudflare.**
> This is required for caching and DDoS protection to work.

---

## 3. SSL/TLS settings

In **SSL/TLS → Overview**:

- Mode: **Full (strict)**
  - "Flexible" sends HTTP to your origin — insecure.
  - "Full (strict)" requires a valid cert on origin (your Let's Encrypt cert in nginx).

In **SSL/TLS → Edge Certificates**:

- ✅ Always Use HTTPS
- ✅ Automatic HTTPS Rewrites
- Minimum TLS Version: **TLS 1.2**
- ✅ TLS 1.3

---

## 4. Cache Rules (replaces deprecated Page Rules)

Go to **Caching → Cache Rules → Create rule**.

### Rule 1 — Cache static assets forever

- **When**: URI Path matches `/_next/static/*`
- **Then**: Cache eligibility = **Eligible for cache**
- Edge TTL: **1 year** (override origin)
- Browser TTL: **1 year**

### Rule 2 — Never cache API responses

- **When**: URI Path starts with `/api/`
- **Then**: Cache eligibility = **Bypass cache**

### Rule 3 — Short cache for HTML pages

- **When**: URI Path matches `/*` AND does NOT contain `/api/` AND does NOT contain `/_next/static/`
- **Then**: Cache eligibility = **Eligible for cache**
- Edge TTL: **60 seconds**
- Browser TTL: **0** (always revalidate in browser, serve from Cloudflare edge)

---

## 5. Speed settings

Go to **Speed → Optimization**:

- ✅ **Auto Minify** — JavaScript, CSS, HTML
- ✅ **Brotli** — Cloudflare re-encodes responses with Brotli for supporting browsers
- ✅ **HTTP/2** (enabled by default)
- ✅ **HTTP/3 / QUIC** — enable for mobile perf gains

---

## 6. Network settings

Go to **Network**:

- ✅ **HTTP/2 to Origin** — keeps persistent connections from Cloudflare to nginx
  (nginx keepalive is already configured for this)

---

## 7. Security settings

Go to **Security → Settings**:

- Security Level: **Medium**
- Bot Fight Mode: ✅ (free, blocks known bad bots)

Go to **Security → WAF**:

- Managed rules are on paid plans, but **Rate Limiting** rules are available:
  - Create a rule: path `/api/auth/*`, 10 requests per minute per IP → Block

---

## 8. Origin SSL certificate (already handled)

Your nginx config uses Let's Encrypt certificates. Cloudflare in **Full (strict)** mode
will validate the cert on origin. No changes needed.

If you ever want to remove Let's Encrypt dependency, you can use a **Cloudflare Origin Certificate**
(free, 15-year cert, only valid for Cloudflare → origin traffic):

1. **SSL/TLS → Origin Server → Create Certificate**
2. Download the cert + key
3. Place them in your server and update `nginx.conf.template` SSL cert paths

---

## 9. Verify it's working

After setup, check:

```bash
curl -I https://yourdomain.com/_next/static/chunks/main.js
```

You should see:
```
CF-Cache-Status: HIT       ← served from Cloudflare edge cache
Cache-Control: public, max-age=31536000, immutable
```

For API calls:
```bash
curl -I https://yourdomain.com/api/nexus/me
```

You should see:
```
CF-Cache-Status: BYPASS    ← never cached, always hits origin
Cache-Control: no-store, no-cache, must-revalidate
```

---

## What you get on the free plan

| Feature | Free |
|---------|------|
| Global CDN (300+ PoPs) | ✅ |
| DDoS protection (unmetered) | ✅ |
| Brotli compression | ✅ |
| HTTP/2 + HTTP/3 | ✅ |
| SSL certificates | ✅ |
| Cache Rules (basic) | ✅ (10 rules) |
| Bot Fight Mode | ✅ |
| Analytics | ✅ |
| WAF managed rules | ❌ (paid) |
| Workers | 100k req/day free |
