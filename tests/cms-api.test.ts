import { strict as assert } from 'assert';
import app from '../index';
import http from 'http';

async function testCMSApi() {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(3099, resolve));

  try {
    console.log('🧪 Testing CMS Admin API Endpoints...');

    // 1. Test public /api/content
    const pubRes = await fetch('http://localhost:3099/api/content');
    assert.equal(pubRes.status, 200);
    const pubJson = await pubRes.json();
    assert.equal(pubJson.success, true);
    console.log('✅ Public /api/content endpoint working');

    // 2. Login as admin to get token
    const loginRes = await fetch('http://localhost:3099/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' }),
    });
    const loginJson = await loginRes.json();
    assert.equal(loginJson.success, true);
    const token = loginJson.token;
    console.log('✅ Admin login succeeded, token acquired');

    // 3. Test GET /api/admin/cms
    const getRes = await fetch('http://localhost:3099/api/admin/cms', {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(getRes.status, 200);
    const getJson = await getRes.json();
    assert.equal(getJson.success, true);
    console.log('✅ GET /api/admin/cms retrieved data');

    // 4. Test PUT /api/admin/cms
    const putRes = await fetch('http://localhost:3099/api/admin/cms', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        status: 'published',
        lastPublished: new Date().toISOString(),
        testTimestamp: Date.now(),
      }),
    });
    assert.equal(putRes.status, 200);
    const putJson = await putRes.json();
    assert.equal(putJson.success, true);
    console.log('✅ PUT /api/admin/cms persisted content successfully');

    console.log('🎉 ALL CMS API TESTS PASSED!');
  } finally {
    server.close();
  }
}

testCMSApi().catch((err) => {
  console.error('❌ CMS Test failed:', err);
  process.exit(1);
});
