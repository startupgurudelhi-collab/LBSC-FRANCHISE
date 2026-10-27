import express, { type Request, type Response } from 'express';
import http from 'http';
import { apiRouter } from './src/server/routes/index.js';
import { errorHandler } from './src/server/middleware/errorHandler.js';
import { securityHeaders, createSecurityHeadersMiddleware } from './src/server/middleware/securityHeaders.js';
import { createCorsMiddleware, validateProductionCorsOrigin } from './src/server/middleware/corsConfig.js';
import {
  createRateLimiter,
  resetAllRateLimits,
  authRateLimiter,
  leadIntakeRateLimiter,
  efilinggRateLimiter,
} from './src/server/middleware/rateLimiter.js';
import { getDatabase } from './src/server/db/connection.js';
import { runMigrations } from './src/server/db/migrate.js';
import { AuthService } from './src/server/auth/authService.js';
import { parseEnv } from './src/server/config/env.js';

interface HttpResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: any;
  rawText: string;
}

function makeRequest(
  server: http.Server,
  path: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: any;
  } = {}
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    if (!addr || typeof addr === 'string') {
      return reject(new Error('Server not listening on a port'));
    }

    const payload = options.body ? JSON.stringify(options.body) : undefined;
    const reqHeaders: Record<string, string> = {
      ...(options.headers || {}),
    };

    if (payload && !reqHeaders['Content-Type']) {
      reqHeaders['Content-Type'] = 'application/json';
    }
    if (payload && !reqHeaders['Content-Length']) {
      reqHeaders['Content-Length'] = Buffer.byteLength(payload).toString();
    }

    const req = http.request(
      {
        host: '127.0.0.1',
        port: addr.port,
        path,
        method: options.method || 'GET',
        headers: reqHeaders,
      },
      (res) => {
        let rawData = '';
        res.on('data', (chunk) => {
          rawData += chunk;
        });
        res.on('end', () => {
          let parsed: any;
          try {
            parsed = JSON.parse(rawData);
          } catch {
            parsed = rawData;
          }
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            body: parsed,
            rawText: rawData,
          });
        });
      }
    );

    req.on('error', reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

async function runTests() {
  console.log('====================================================');
  console.log('   PHASE 22F SECURITY HEADERS, CORS & RATE LIMITING  ');
  console.log('====================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, details?: string) {
    totalTests++;
    if (condition) {
      console.log(`  [PASS] ${testName}`);
      passedTests++;
    } else {
      console.error(`  [FAIL] ${testName}`);
      if (details) console.error(`         Details: ${details}`);
    }
  }

  // Initialize DB and migrations
  const db = getDatabase();
  await runMigrations(db);
  await AuthService.seedDemoAccounts(db);

  // Setup Express test app with complete Phase 22F security stack
  const app = express();
  app.use(securityHeaders);
  app.use(createCorsMiddleware('https://app.lbsc.in,https://portal.lbsc.in', false));
  app.use(express.json({ limit: '10mb' }));
  app.use('/api', apiRouter);
  app.use(errorHandler);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    // =========================================================================
    // GROUP 1: Security Headers Verification
    // =========================================================================
    console.log('--- TEST GROUP 1: Security Headers ---');

    // 1A: Check default security headers in app
    const resHeaders = await makeRequest(server, '/api/health');
    assert(
      resHeaders.headers['x-content-type-options'] === 'nosniff',
      'X-Content-Type-Options: nosniff header is present'
    );
    assert(
      resHeaders.headers['x-frame-options'] === 'SAMEORIGIN',
      'X-Frame-Options: SAMEORIGIN header is present (protects iframe while allowing same-origin)'
    );
    assert(
      resHeaders.headers['referrer-policy'] === 'strict-origin-when-cross-origin',
      'Referrer-Policy: strict-origin-when-cross-origin header is present'
    );

    // 1B: Production HSTS header verification
    const prodApp = express();
    prodApp.use(createSecurityHeadersMiddleware(true));
    prodApp.get('/test-prod', (req, res) => res.json({ ok: true }));
    const prodServer = http.createServer(prodApp);
    await new Promise<void>((resolve) => prodServer.listen(0, '127.0.0.1', resolve));

    const prodRes = await makeRequest(prodServer, '/test-prod');
    assert(
      prodRes.headers['strict-transport-security'] === 'max-age=31536000; includeSubDomains',
      'Strict-Transport-Security (HSTS) header is present in production',
      prodRes.headers['strict-transport-security'] as string
    );
    assert(
      prodRes.headers['x-content-type-options'] === 'nosniff',
      'Production headers include X-Content-Type-Options'
    );
    assert(
      prodRes.headers['x-frame-options'] === 'SAMEORIGIN',
      'Production headers include X-Frame-Options'
    );
    prodServer.close();

    // =========================================================================
    // GROUP 2: CORS Configuration & Enforcement
    // =========================================================================
    console.log('\n--- TEST GROUP 2: CORS Configuration & Origin Enforcement ---');

    // 2A: Production wildcard '*' rejected
    try {
      validateProductionCorsOrigin('*');
      assert(false, 'Production wildcard CORS origin must be rejected');
    } catch (err: any) {
      assert(
        err.message.includes("CORS_ORIGIN cannot be '*' (wildcard)"),
        'Production wildcard CORS is rejected by validateProductionCorsOrigin',
        err.message
      );
    }

    try {
      createCorsMiddleware('*', true);
      assert(false, 'createCorsMiddleware must reject wildcard in production');
    } catch (err: any) {
      assert(
        err.message.includes("CORS_ORIGIN cannot be '*' (wildcard)"),
        'createCorsMiddleware rejects wildcard in production mode',
        err.message
      );
    }

    // 2B: Production empty CORS rejected
    try {
      validateProductionCorsOrigin('');
      assert(false, 'Production empty CORS origin must be rejected');
    } catch (err: any) {
      assert(
        err.message.includes('An explicit configured frontend origin is required'),
        'Production empty CORS origin rejected with explicit requirement message',
        err.message
      );
    }

    // 2C: parseEnv rejects wildcard CORS in production
    try {
      parseEnv({
        NODE_ENV: 'production',
        JWT_SECRET: 'super_secure_production_jwt_secret_key_exceeding_32_characters_1234567890!',
        CORS_ORIGIN: '*',
      });
      assert(false, 'parseEnv in production must reject wildcard CORS');
    } catch (err: any) {
      assert(
        err.message.includes("CORS_ORIGIN cannot be '*' (wildcard)"),
        'parseEnv in production rejects wildcard CORS',
        err.message
      );
    }

    // 2D: Configured production origin is accepted & disallowed origin is rejected
    const prodCorsApp = express();
    prodCorsApp.use(createCorsMiddleware('https://app.lbsc.in,https://admin.lbsc.in', true));
    prodCorsApp.get('/test-cors', (req, res) => res.json({ allowed: true }));
    const prodCorsServer = http.createServer(prodCorsApp);
    await new Promise<void>((resolve) => prodCorsServer.listen(0, '127.0.0.1', resolve));

    // Request from configured origin
    const allowedOriginRes = await makeRequest(prodCorsServer, '/test-cors', {
      headers: { Origin: 'https://app.lbsc.in' },
    });
    assert(
      allowedOriginRes.headers['access-control-allow-origin'] === 'https://app.lbsc.in',
      'Configured production origin is accepted (Access-Control-Allow-Origin returned)',
      allowedOriginRes.headers['access-control-allow-origin'] as string
    );
    assert(
      allowedOriginRes.headers['access-control-allow-credentials'] === 'true',
      'Configured production origin sets credentials header'
    );

    // Request from disallowed origin
    const disallowedOriginRes = await makeRequest(prodCorsServer, '/test-cors', {
      headers: { Origin: 'https://malicious-attacker.com' },
    });
    assert(
      disallowedOriginRes.headers['access-control-allow-origin'] === undefined,
      'Disallowed origin is rejected (No Access-Control-Allow-Origin returned)',
      disallowedOriginRes.headers['access-control-allow-origin'] as string
    );
    prodCorsServer.close();

    // =========================================================================
    // GROUP 3: Login and Register Rate Limiting
    // =========================================================================
    console.log('\n--- TEST GROUP 3: Login & Register Rate Limiting ---');

    // 3A: Create isolated test app with custom fast rate limiter for testing rate limit behavior
    const rateLimitTestApp = express();
    rateLimitTestApp.use(express.json());
    resetAllRateLimits();

    const fastAuthLimiter = createRateLimiter({
      name: 'fast-auth',
      maxRequests: 3,
      windowMs: 10000,
      message: 'Too many authentication attempts. Please try again later.',
      keyGenerator: (req) => req.headers['x-test-ip'] as string || 'test-client',
    });

    rateLimitTestApp.post('/auth/test-login', fastAuthLimiter, (req, res) => {
      res.json({ success: true, message: 'Login ok' });
    });

    const rlServer = http.createServer(rateLimitTestApp);
    await new Promise<void>((resolve) => rlServer.listen(0, '127.0.0.1', resolve));

    // Make 3 requests within limit
    const rl1 = await makeRequest(rlServer, '/auth/test-login', {
      method: 'POST',
      headers: { 'x-test-ip': 'client-login-1' },
      body: {},
    });
    const rl2 = await makeRequest(rlServer, '/auth/test-login', {
      method: 'POST',
      headers: { 'x-test-ip': 'client-login-1' },
      body: {},
    });
    const rl3 = await makeRequest(rlServer, '/auth/test-login', {
      method: 'POST',
      headers: { 'x-test-ip': 'client-login-1' },
      body: {},
    });

    assert(
      rl1.status === 200 && rl2.status === 200 && rl3.status === 200,
      'Normal requests below limit succeed with 200'
    );
    assert(
      rl3.headers['x-ratelimit-remaining'] === '0',
      'X-RateLimit-Remaining decrements to 0 on 3rd request'
    );

    // 4th request must return 429
    const rl4 = await makeRequest(rlServer, '/auth/test-login', {
      method: 'POST',
      headers: { 'x-test-ip': 'client-login-1' },
      body: {},
    });

    assert(
      rl4.status === 429,
      'Login rate limit exceeded returns HTTP 429 Too Many Requests',
      `Got status ${rl4.status}`
    );
    assert(
      rl4.body?.error?.code === 'TOO_MANY_REQUESTS',
      '429 response contains TOO_MANY_REQUESTS error code',
      rl4.body?.error?.code
    );
    assert(
      Boolean(rl4.headers['retry-after']),
      '429 response includes Retry-After header',
      rl4.headers['retry-after'] as string
    );

    // Different client key continues to succeed (isolation)
    const rlDifferentClient = await makeRequest(rlServer, '/auth/test-login', {
      method: 'POST',
      headers: { 'x-test-ip': 'client-login-2' },
      body: {},
    });
    assert(
      rlDifferentClient.status === 200,
      'Different client IP below limit is not blocked'
    );
    rlServer.close();

    // 3B: Verify rate limiting directly on the API auth route
    resetAllRateLimits('auth');
    // Rapidly submit requests to /api/v1/auth/login using unique IP
    let hitRateLimitOnAuthLogin = false;
    for (let i = 0; i < 15; i++) {
      const resp = await makeRequest(server, '/api/v1/auth/login', {
        method: 'POST',
        headers: { 'x-forwarded-for': '198.51.100.5' },
        body: { email: 'wrong@example.com', password: 'wrongpassword' },
      });
      if (resp.status === 429) {
        hitRateLimitOnAuthLogin = true;
        break;
      }
    }
    assert(
      hitRateLimitOnAuthLogin,
      'POST /api/v1/auth/login returns 429 when rate limit exceeded'
    );

    // 3C: Verify rate limiting on /api/v1/auth/register
    let hitRateLimitOnAuthRegister = false;
    for (let i = 0; i < 15; i++) {
      const resp = await makeRequest(server, '/api/v1/auth/register', {
        method: 'POST',
        headers: { 'x-forwarded-for': '198.51.100.6' },
        body: { email: `reg_${i}@example.com`, password: 'password123', firstName: 'A', lastName: 'B' },
      });
      if (resp.status === 429) {
        hitRateLimitOnAuthRegister = true;
        break;
      }
    }
    assert(
      hitRateLimitOnAuthRegister,
      'POST /api/v1/auth/register returns 429 when rate limit exceeded'
    );

    // =========================================================================
    // GROUP 4: Lead Intake Webhook Rate Limiting
    // =========================================================================
    console.log('\n--- TEST GROUP 4: Public Lead-Intake Webhook Rate Limiting ---');

    resetAllRateLimits('lead-intake');
    let hitRateLimitOnLeadIntake = false;
    for (let i = 0; i < 35; i++) {
      const resp = await makeRequest(server, '/api/v1/integrations/lead-intake/webhook', {
        method: 'POST',
        headers: { 'x-forwarded-for': '198.51.100.10' },
        body: {
          full_name: 'Webhook Lead',
          phone: '+919876543210',
          service_code: 'GST_REG',
        },
      });
      if (resp.status === 429) {
        hitRateLimitOnLeadIntake = true;
        break;
      }
    }
    assert(
      hitRateLimitOnLeadIntake,
      'POST /api/v1/integrations/lead-intake/webhook returns 429 when rate limit exceeded'
    );

    // =========================================================================
    // GROUP 5: Efilingg Webhook Rate Limiting
    // =========================================================================
    console.log('\n--- TEST GROUP 5: Efilingg Webhook Rate Limiting ---');

    resetAllRateLimits('efilingg');
    let hitRateLimitOnEfilingg = false;
    for (let i = 0; i < 35; i++) {
      const resp = await makeRequest(server, '/api/v1/integrations/efilingg/webhook', {
        method: 'POST',
        headers: { 'x-forwarded-for': '198.51.100.20' },
        body: {
          event_type: 'ORDER_STATUS_CHANGED',
          efilingg_order_id: 'EF-TEST-123',
        },
      });
      if (resp.status === 429) {
        hitRateLimitOnEfilingg = true;
        break;
      }
    }
    assert(
      hitRateLimitOnEfilingg,
      'POST /api/v1/integrations/efilingg/webhook returns 429 when rate limit exceeded'
    );

    // =========================================================================
    // GROUP 6: Normal Requests Below Limit Still Work
    // =========================================================================
    console.log('\n--- TEST GROUP 6: Normal Requests Below Limit Still Work ---');

    // Health check works
    const healthRes = await makeRequest(server, '/api/health');
    assert(
      healthRes.status === 200 && healthRes.body?.data?.status === 'healthy',
      'Normal request to /api/health succeeds with 200 and healthy status'
    );

    // Valid login works below rate limit
    const validLoginRes = await makeRequest(server, '/api/v1/auth/login', {
      method: 'POST',
      headers: { 'x-forwarded-for': '198.51.100.50' },
      body: {
        email: 'admin@lbsc.internal',
        password: 'SuperAdminPassword123!',
      },
    });
    assert(
      validLoginRes.status === 200 && validLoginRes.body?.success === true,
      'Valid super admin login succeeds under rate limit',
      validLoginRes.rawText
    );
    const superAdminToken = validLoginRes.body?.data?.token;

    // Authenticated /me endpoint works without rate limiter block
    const meRes = await makeRequest(server, '/api/v1/auth/me', {
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        'x-forwarded-for': '198.51.100.50',
      },
    });
    assert(
      meRes.status === 200 && meRes.body?.data?.email === 'admin@lbsc.internal',
      'Internal authenticated API (/auth/me) works cleanly without unneeded rate limiting'
    );

    // =========================================================================
    // GROUP 7: RBAC & Tenant Isolation Remains Intact
    // =========================================================================
    console.log('\n--- TEST GROUP 7: RBAC & Tenant Isolation Intact ---');

    // Franchise owner login
    const franchiseLoginRes = await makeRequest(server, '/api/v1/auth/login', {
      method: 'POST',
      headers: { 'x-forwarded-for': '198.51.100.60' },
      body: {
        email: 'owner.salem.a@demo.lbsc.internal',
        password: 'SalemPass123!',
      },
    });
    assert(
      franchiseLoginRes.status === 200 &&
        franchiseLoginRes.body?.data?.user?.organizationId === 'org_salem_001',
      'Franchise Owner logs in successfully'
    );
    const franchiseToken = franchiseLoginRes.body?.data?.token;

    // Franchise user querying Super Admin only endpoint (/jobs/status) should be 403 Forbidden
    const forbiddenRes = await makeRequest(server, '/api/v1/jobs/status', {
      headers: {
        Authorization: `Bearer ${franchiseToken}`,
        'x-forwarded-for': '198.51.100.60',
      },
    });
    assert(
      forbiddenRes.status === 403,
      'Franchise user blocked from Super-Admin-only endpoint with HTTP 403 Forbidden',
      `Got status ${forbiddenRes.status}`
    );

    // Super Admin accessing Super Admin endpoint (/jobs/status) should be 200 OK
    const superAdminJobs = await makeRequest(server, '/api/v1/jobs/status', {
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        'x-forwarded-for': '198.51.100.50',
      },
    });
    assert(
      superAdminJobs.status === 200 && superAdminJobs.body?.success === true,
      'Super Admin retains full access to administrative endpoints (HTTP 200 OK)'
    );

  } finally {
    server.close();
  }

  console.log('\n====================================================');
  console.log(`TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${totalTests - passedTests}`);
  console.log('====================================================');

  if (totalTests !== passedTests) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal error running Phase 22F tests:', err);
  process.exit(1);
});
