import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// In-memory store for rate limiting (Note: resets on serverless cold starts)
const rateLimit = new Map<string, { count: number; timestamp: number }>();

// Simple bot patterns
const BOT_AGENTS = [
  'bot', 'spider', 'crawl', 'headless', 'puppeteer', 'selenium', 
  'python-requests', 'node-fetch', 'axios', 'curl', 'wget'
];

export function proxy(request: NextRequest) {
  // 0. Handle favicon.ico to prevent 404 logs in some environments
  if (request.nextUrl.pathname === '/favicon.ico') {
    return NextResponse.next();
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || request.headers.get('x-real-ip') || '127.0.0.1';
  const userAgent = request.headers.get('user-agent')?.toLowerCase() || '';
  const now = Date.now();

  // 1. Basic Bot Detection
  const isBot = BOT_AGENTS.some(bot => userAgent.includes(bot));
  if (isBot && !userAgent.includes('googlebot')) { // Allow Googlebot for SEO
    console.warn(`[Security] Blocked suspected bot: ${userAgent} from IP: ${ip}`);
    return new NextResponse('Access Denied: Automated requests not allowed.', { status: 403 });
  }

  // 2. Rate Limiting (100 requests per 10 minutes per IP)
  const windowMs = 10 * 60 * 1000;
  const maxRequests = 100;

  const currentLimit = rateLimit.get(ip);

  if (!currentLimit || (now - currentLimit.timestamp) > windowMs) {
    rateLimit.set(ip, { count: 1, timestamp: now });
  } else {
    currentLimit.count++;
    if (currentLimit.count > maxRequests) {
      console.warn(`[Security] Rate limit exceeded for IP: ${ip}`);
      return new NextResponse('Too many requests. Please try again later.', { status: 429 });
    }
  }

  // Clean up old entries periodically (every 1000 requests)
  if (rateLimit.size > 1000) {
    const threshold = now - windowMs;
    for (const [key, value] of rateLimit.entries()) {
      if (value.timestamp < threshold) {
        rateLimit.delete(key);
      }
    }
  }

  return NextResponse.next();
}

// Apply middleware to sensitive routes
export const config = {
  matcher: [
    '/', 
    '/api/:path*', 
    '/_next/data/:path*'
  ],
};
