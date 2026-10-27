import express from 'express';
import { apiRouter } from './src/server/routes/index.js';
import { errorHandler } from './src/server/middleware/errorHandler.js';
import { getDatabase } from './src/server/db/connection.js';
import { runMigrations } from './src/server/db/migrate.js';
import { AuthService } from './src/server/auth/authService.js';
import { generateToken } from './src/server/auth/security.js';

async function runTests() {
  console.log('====================================================');
  console.log('   PHASE 22D DOCUMENT SECURITY HARDENING TEST SUITE  ');
  console.log('====================================================\n');

  const db = getDatabase();
  await runMigrations(db);
  await AuthService.seedDemoAccounts(db);

  // Setup Express test instance
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api', apiRouter);
  app.use(errorHandler);

  const server = app.listen(0);
  const port = (server.address() as any).port;
  const baseUrl = `http://localhost:${port}/api/v1`;

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

  try {
    // -------------------------------------------------------------------------
    // Setup Test Fixtures: Two distinct franchises A and B, plus Super Admin
    // -------------------------------------------------------------------------
    const orgA = 'org_doc_test_salem';
    const orgB = 'org_doc_test_madurai';

    // Ensure Org A exists
    const existingOrgA = await db.query<any>('SELECT id FROM organizations WHERE id = ?', [orgA]);
    if (existingOrgA.length === 0) {
      await db.execute(
        `INSERT INTO organizations (id, code, name, type, status) VALUES (?, 'FRAN-SALEM-DOC', 'Salem Legal Doc Branch', 'franchise', 'active')`,
        [orgA]
      );
    }

    // Ensure Org B exists
    const existingOrgB = await db.query<any>('SELECT id FROM organizations WHERE id = ?', [orgB]);
    if (existingOrgB.length === 0) {
      await db.execute(
        `INSERT INTO organizations (id, code, name, type, status) VALUES (?, 'FRAN-MADURAI-DOC', 'Madurai Legal Doc Branch', 'franchise', 'active')`,
        [orgB]
      );
    }

    // Use seeded service svc_gst_reg
    const svcId = 'svc_gst_reg';

    // Create Clients for Org A & Org B
    const clientAId = `cli_doc_a_${Date.now()}`;
    const clientBId = `cli_doc_b_${Date.now()}`;
    await db.execute(
      `INSERT INTO clients (id, client_number, franchise_id, first_name, last_name, full_name, phone, email, city, district, state, status)
       VALUES (?, 'CLI-A-${Date.now()}', ?, 'Ravi', 'Kumar', 'Ravi Kumar', '+919888811111', 'ravi.doc@test.internal', 'Salem', 'Salem', 'Tamil Nadu', 'active')`,
      [clientAId, orgA]
    );
    await db.execute(
      `INSERT INTO clients (id, client_number, franchise_id, first_name, last_name, full_name, phone, email, city, district, state, status)
       VALUES (?, 'CLI-B-${Date.now()}', ?, 'Suresh', 'Rajan', 'Suresh Rajan', '+919888822222', 'suresh.doc@test.internal', 'Madurai', 'Madurai', 'Tamil Nadu', 'active')`,
      [clientBId, orgB]
    );

    // Create Users & Tokens
    const runId = Date.now();
    const userAId = `usr_doc_a_${runId}`;
    const emailA = `owner.salem.doc_${runId}@test.internal`;
    await db.execute(
      `INSERT INTO users (id, organization_id, email, password_hash, first_name, last_name, status)
       VALUES (?, ?, ?, 'hash', 'Salem', 'DocUser', 'active')`,
      [userAId, orgA, emailA]
    );
    await db.execute(
      `INSERT INTO user_roles (user_id, role_id) VALUES (?, 'role_franchise_owner')`,
      [userAId]
    );
    const tokenA = generateToken({
      userId: userAId,
      email: emailA,
      organizationId: orgA,
      roles: ['franchise_owner'],
      permissions: ['service_applications:read', 'service_applications:write'],
      tokenVersion: 1,
    });

    const userBId = `usr_doc_b_${runId}`;
    const emailB = `owner.madurai.doc_${runId}@test.internal`;
    await db.execute(
      `INSERT INTO users (id, organization_id, email, password_hash, first_name, last_name, status)
       VALUES (?, ?, ?, 'hash', 'Madurai', 'DocUser', 'active')`,
      [userBId, orgB, emailB]
    );
    await db.execute(
      `INSERT INTO user_roles (user_id, role_id) VALUES (?, 'role_franchise_owner')`,
      [userBId]
    );
    const tokenB = generateToken({
      userId: userBId,
      email: emailB,
      organizationId: orgB,
      roles: ['franchise_owner'],
      permissions: ['service_applications:read', 'service_applications:write'],
      tokenVersion: 1,
    });

    const adminToken = generateToken({
      userId: 'usr_super_admin_001',
      email: 'admin@lbsc.internal',
      organizationId: null,
      roles: ['super_admin'],
      permissions: ['service_applications:read', 'service_applications:write'],
      tokenVersion: 1,
    });

    // Create a Service Application for Franchise A
    const appAId = `app_doc_test_${runId}`;
    await db.execute(
      `INSERT INTO service_applications (id, application_number, franchise_id, client_id, service_id, status, priority)
       VALUES (?, ?, ?, ?, ?, 'SUBMITTED', 'normal')`,
      [appAId, `APP-DOC-${runId}`, orgA, clientAId, svcId]
    );

    // Create Document placeholders for appA
    const docPdfId = `doc_pdf_${Date.now()}`;
    const docPngId = `doc_png_${Date.now()}`;
    const docJpegId = `doc_jpeg_${Date.now()}`;
    const docUrlId = `doc_url_${Date.now()}`;
    const docSecId = `doc_sec_${Date.now()}`;

    for (const [id, name] of [
      [docPdfId, 'Aadhaar Card PDF'],
      [docPngId, 'PAN Card PNG'],
      [docJpegId, 'Applicant Photo JPEG'],
      [docUrlId, 'External Cloud Document'],
      [docSecId, 'Security Testing Document'],
    ]) {
      await db.execute(
        `INSERT INTO service_application_documents (id, application_id, document_name, is_required, status)
         VALUES (?, ?, ?, 1, 'MISSING')`,
        [id, appAId, name]
      );
    }

    // Prepare File Buffers & Base64
    const validPdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF', 'utf-8');
    const validPdfBase64 = validPdfBuffer.toString('base64');
    const validPdfDataUrl = `data:application/pdf;base64,${validPdfBase64}`;

    // Valid PNG: 8-byte signature + basic IHDR chunk
    const validPngBuffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG magic
      0x00, 0x00, 0x00, 0x0d, // IHDR length
      0x49, 0x48, 0x44, 0x52, // IHDR
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00,
      0x1f, 0x15, 0xc4, 0x89,
    ]);
    const validPngBase64 = validPngBuffer.toString('base64');
    const validPngDataUrl = `data:image/png;base64,${validPngBase64}`;

    // Valid JPEG: SOI (FF D8) + APP0 (FF E0 00 10 4A 46 49 46)
    const validJpegBuffer = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
      0x00, 0x48, 0x00, 0x00, 0xff, 0xd9,
    ]);
    const validJpegBase64 = validJpegBuffer.toString('base64');
    const validJpegDataUrl = `data:image/jpeg;base64,${validJpegBase64}`;

    console.log('--- TEST GROUP 1: Valid PDF Upload ---');
    {
      const res = await fetch(`${baseUrl}/service-applications/${appAId}/documents/${docPdfId}/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          file_name: 'aadhaar_card.pdf',
          file_type: 'application/pdf',
          file_size: validPdfBuffer.length,
          file_data: validPdfDataUrl,
        }),
      });

      const body = await res.json();
      assert(
        res.status === 200 &&
          body.success === true &&
          body.data.status === 'UPLOADED' &&
          body.data.file_type === 'application/pdf' &&
          body.data.file_name === 'aadhaar_card.pdf',
        'Valid PDF upload accepted and status set to UPLOADED with canonical MIME'
      );
    }

    console.log('\n--- TEST GROUP 2: Valid PNG and JPEG Upload ---');
    {
      // 2A: Valid PNG
      const resPng = await fetch(`${baseUrl}/service-applications/${appAId}/documents/${docPngId}/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          file_name: 'pan_card.png',
          file_type: 'image/png',
          file_data: validPngDataUrl,
        }),
      });
      const bodyPng = await resPng.json();
      assert(
        resPng.status === 200 &&
          bodyPng.success === true &&
          bodyPng.data.status === 'UPLOADED' &&
          bodyPng.data.file_type === 'image/png',
        'Valid PNG upload accepted with image/png MIME and status UPLOADED'
      );

      // 2B: Valid JPEG
      const resJpeg = await fetch(`${baseUrl}/service-applications/${appAId}/documents/${docJpegId}/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          file_name: 'photo.jpg',
          file_type: 'image/jpeg',
          file_data: validJpegDataUrl,
        }),
      });
      const bodyJpeg = await resJpeg.json();
      assert(
        resJpeg.status === 200 &&
          bodyJpeg.success === true &&
          bodyJpeg.data.status === 'UPLOADED' &&
          bodyJpeg.data.file_type === 'image/jpeg',
        'Valid JPEG upload accepted with image/jpeg MIME and status UPLOADED'
      );
    }

    console.log('\n--- TEST GROUP 3: Oversized Upload Rejected ---');
    {
      // 3A: Declared file_size > 5MB
      const resDeclared = await fetch(`${baseUrl}/service-applications/${appAId}/documents/${docSecId}/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          file_name: 'oversized_declared.pdf',
          file_type: 'application/pdf',
          file_size: 6 * 1024 * 1024, // 6MB
          file_data: validPdfDataUrl,
        }),
      });
      const bodyDeclared = await resDeclared.json();
      assert(
        resDeclared.status === 400 && bodyDeclared.error?.message?.includes('exceeds maximum permitted limit'),
        'Upload with declared file_size > 5MB rejected with HTTP 400'
      );

      // 3B: Actual decoded payload > 5MB (simulate 5.2MB buffer)
      const largePdfHeader = Buffer.from('%PDF-1.4\n', 'utf-8');
      const largeBody = Buffer.alloc(5.2 * 1024 * 1024, 0x20); // 5.2 MB
      const largePdfBuffer = Buffer.concat([largePdfHeader, largeBody]);
      const largePdfBase64 = largePdfBuffer.toString('base64');

      const resDecoded = await fetch(`${baseUrl}/service-applications/${appAId}/documents/${docSecId}/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          file_name: 'oversized_actual.pdf',
          file_type: 'application/pdf',
          file_data: `data:application/pdf;base64,${largePdfBase64}`,
        }),
      });
      const bodyDecoded = await resDecoded.json();
      assert(
        resDecoded.status === 400 && bodyDecoded.error?.message?.includes('exceeds maximum permitted limit'),
        'Upload with decoded payload > 5MB rejected with HTTP 400'
      );
    }

    console.log('\n--- TEST GROUP 4: Malformed Base64 Rejected ---');
    {
      // 4A: Arbitrary non-base64 characters
      const resNonBase64 = await fetch(`${baseUrl}/service-applications/${appAId}/documents/${docSecId}/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          file_name: 'corrupted.pdf',
          file_type: 'application/pdf',
          file_data: 'data:application/pdf;base64,not-valid-base64!@#$%^&*()',
        }),
      });
      const bodyNonBase64 = await resNonBase64.json();
      assert(
        resNonBase64.status === 400 && bodyNonBase64.error?.message?.includes('Malformed base64'),
        'Malformed base64 characters rejected with HTTP 400'
      );

      // 4B: Invalid base64 length / padding
      const resBadLength = await fetch(`${baseUrl}/service-applications/${appAId}/documents/${docSecId}/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          file_name: 'bad_length.pdf',
          file_type: 'application/pdf',
          file_data: 'abcde', // length % 4 === 1
        }),
      });
      const bodyBadLength = await resBadLength.json();
      assert(
        resBadLength.status === 400 && bodyBadLength.error?.message?.includes('Malformed base64'),
        'Malformed base64 invalid quantum length rejected with HTTP 400'
      );

      // 4C: Malformed data URL format
      const resBadDataUrl = await fetch(`${baseUrl}/service-applications/${appAId}/documents/${docSecId}/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          file_name: 'bad_data_url.pdf',
          file_type: 'application/pdf',
          file_data: 'data:application/pdf;plain,no_base64_marker',
        }),
      });
      const bodyBadDataUrl = await resBadDataUrl.json();
      assert(
        resBadDataUrl.status === 400 && bodyBadDataUrl.error?.message?.includes('Malformed data URL'),
        'Malformed data URL without base64 indicator rejected with HTTP 400'
      );
    }

    console.log('\n--- TEST GROUP 5: MIME and Magic-Byte Mismatch Rejected ---');
    {
      // 5A: Declared PDF, but bytes are PNG
      const resPdfPngMismatch = await fetch(`${baseUrl}/service-applications/${appAId}/documents/${docSecId}/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          file_name: 'fake.pdf',
          file_type: 'application/pdf',
          file_data: validPngDataUrl, // PNG bytes disguised as PDF
        }),
      });
      const bodyPdfPngMismatch = await resPdfPngMismatch.json();
      assert(
        resPdfPngMismatch.status === 400 && bodyPdfPngMismatch.error?.message?.includes('Mismatched file type'),
        'Declared application/pdf with PNG magic bytes rejected with HTTP 400'
      );

      // 5B: Declared PNG, but bytes are JPEG
      const resPngJpegMismatch = await fetch(`${baseUrl}/service-applications/${appAId}/documents/${docSecId}/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          file_name: 'fake.png',
          file_type: 'image/png',
          file_data: validJpegDataUrl, // JPEG bytes disguised as PNG
        }),
      });
      const bodyPngJpegMismatch = await resPngJpegMismatch.json();
      assert(
        resPngJpegMismatch.status === 400 && bodyPngJpegMismatch.error?.message?.includes('Mismatched file type'),
        'Declared image/png with JPEG magic bytes rejected with HTTP 400'
      );

      // 5C: Non-allowed MIME type (e.g. text/plain or executable)
      const plainTextBase64 = Buffer.from('echo "malicious script"', 'utf-8').toString('base64');
      const resDisallowedType = await fetch(`${baseUrl}/service-applications/${appAId}/documents/${docSecId}/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          file_name: 'script.sh',
          file_type: 'application/x-sh',
          file_data: `data:application/x-sh;base64,${plainTextBase64}`,
        }),
      });
      const bodyDisallowedType = await resDisallowedType.json();
      assert(
        resDisallowedType.status === 400 &&
          (bodyDisallowedType.error?.message?.includes('only PDF, PNG, and JPEG') ||
            bodyDisallowedType.error?.message?.includes('Invalid file extension')),
        'Disallowed file type / script rejected with HTTP 400'
      );

      // 5D: File extension mismatch (file_name ends in .pdf but content is JPEG)
      const resExtMismatch = await fetch(`${baseUrl}/service-applications/${appAId}/documents/${docSecId}/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          file_name: 'mismatch.pdf',
          file_type: 'image/jpeg',
          file_data: validJpegDataUrl,
        }),
      });
      const bodyExtMismatch = await resExtMismatch.json();
      assert(
        resExtMismatch.status === 400 && bodyExtMismatch.error?.message?.includes('Mismatched file type'),
        'File extension mismatch (.pdf with JPEG content) rejected with HTTP 400'
      );
    }

    console.log('\n--- TEST GROUP 6: javascript/data/file URL Rejected ---');
    {
      // 6A: javascript: scheme
      const resJs = await fetch(`${baseUrl}/service-applications/${appAId}/documents/${docSecId}/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          file_name: 'xss.pdf',
          file_url: 'javascript:alert(document.cookie)',
        }),
      });
      const bodyJs = await resJs.json();
      assert(
        resJs.status === 400 && bodyJs.error?.message?.includes('Unsafe URL scheme'),
        'javascript: scheme rejected with HTTP 400'
      );

      // 6B: data: scheme in file_url
      const resData = await fetch(`${baseUrl}/service-applications/${appAId}/documents/${docSecId}/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          file_name: 'data_uri.pdf',
          file_url: 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
        }),
      });
      const bodyData = await resData.json();
      assert(
        resData.status === 400 && bodyData.error?.message?.includes('Unsafe URL scheme'),
        'data: scheme in file_url rejected with HTTP 400'
      );

      // 6C: file: scheme
      const resFile = await fetch(`${baseUrl}/service-applications/${appAId}/documents/${docSecId}/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          file_name: 'passwd.pdf',
          file_url: 'file:///etc/passwd',
        }),
      });
      const bodyFile = await resFile.json();
      assert(
        resFile.status === 400 && bodyFile.error?.message?.includes('Unsafe URL scheme'),
        'file:/// scheme rejected with HTTP 400'
      );

      // 6D: Arbitrary external redirect to untrusted host
      const resUntrusted = await fetch(`${baseUrl}/service-applications/${appAId}/documents/${docSecId}/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          file_name: 'external_exploit.pdf',
          file_url: 'https://attacker-phishing-portal.evil/login',
        }),
      });
      const bodyUntrusted = await resUntrusted.json();
      assert(
        resUntrusted.status === 400 && bodyUntrusted.error?.message?.includes('External document host'),
        'Arbitrary external untrusted domain in file_url rejected with HTTP 400'
      );
    }

    console.log('\n--- TEST GROUP 7: Legitimate Download Still Works ---');
    {
      // 7A: Legitimate file_data download
      const resDownloadData = await fetch(`${baseUrl}/service-applications/${appAId}/documents/${docPdfId}/download`, {
        headers: {
          Authorization: `Bearer ${tokenA}`,
        },
      });

      const contentType = resDownloadData.headers.get('content-type');
      const contentDisposition = resDownloadData.headers.get('content-disposition');
      const nosniff = resDownloadData.headers.get('x-content-type-options');
      const csp = resDownloadData.headers.get('content-security-policy');
      const downloadedBuffer = Buffer.from(await resDownloadData.arrayBuffer());

      assert(
        resDownloadData.status === 200 &&
          contentType === 'application/pdf' &&
          Boolean(contentDisposition?.includes('attachment')) &&
          Boolean(contentDisposition?.includes('aadhaar_card.pdf')) &&
          nosniff === 'nosniff' &&
          csp === "default-src 'none'" &&
          downloadedBuffer.equals(validPdfBuffer),
        'Legitimate file_data download streams correct binary with security headers and 200 OK'
      );

      // 7B: Upload valid trusted cloud storage URL and verify redirect
      const validCloudUrl = 'https://storage.googleapis.com/lbsc-secure-documents/aadhaar_001.pdf';
      const resUploadUrl = await fetch(`${baseUrl}/service-applications/${appAId}/documents/${docUrlId}/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          file_name: 'cloud_document.pdf',
          file_url: validCloudUrl,
        }),
      });
      const bodyUploadUrl = await resUploadUrl.json();
      assert(
        resUploadUrl.status === 200 && bodyUploadUrl.data.file_url === validCloudUrl,
        'Legitimate trusted storage URL upload succeeds'
      );

      // Download endpoint redirects safely
      const resDownloadUrl = await fetch(`${baseUrl}/service-applications/${appAId}/documents/${docUrlId}/download`, {
        headers: {
          Authorization: `Bearer ${tokenA}`,
        },
        redirect: 'manual', // Do not automatically follow redirect to inspect 302
      });

      assert(
        resDownloadUrl.status === 302 && resDownloadUrl.headers.get('location') === validCloudUrl,
        'Legitimate trusted file_url download performs HTTP 302 redirect to valid cloud target'
      );
    }

    console.log('\n--- TEST GROUP 8: Tenant & RBAC Isolation Protection Intact ---');
    {
      // 8A: Franchise B user cannot upload document to Franchise A application
      const resCrossUpload = await fetch(`${baseUrl}/service-applications/${appAId}/documents/${docPdfId}/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenB}`, // Org B user
        },
        body: JSON.stringify({
          file_name: 'cross_tamper.pdf',
          file_type: 'application/pdf',
          file_data: validPdfDataUrl,
        }),
      });
      assert(
        resCrossUpload.status === 403,
        'Cross-franchise document upload denied with HTTP 403 Forbidden'
      );

      // 8B: Franchise B user cannot download document from Franchise A application
      const resCrossDownload = await fetch(`${baseUrl}/service-applications/${appAId}/documents/${docPdfId}/download`, {
        headers: {
          Authorization: `Bearer ${tokenB}`, // Org B user
        },
      });
      assert(
        resCrossDownload.status === 403,
        'Cross-franchise document download denied with HTTP 403 Forbidden'
      );

      // 8C: Super Admin can download document across franchises
      const resAdminDownload = await fetch(`${baseUrl}/service-applications/${appAId}/documents/${docPdfId}/download`, {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });
      assert(
        resAdminDownload.status === 200,
        'Super Admin can download document across franchises with HTTP 200 OK'
      );
    }

    console.log('\n====================================================');
    console.log(`TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${totalTests - passedTests}`);
    console.log('====================================================');

    server.close();
    if (passedTests === totalTests) {
      process.exit(0);
    } else {
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal test runner error:', err);
    server.close();
    process.exit(1);
  }
}

runTests();
