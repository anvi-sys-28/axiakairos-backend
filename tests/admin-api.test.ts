process.env.NODE_ENV = 'test';
import app from '../index';
import http from 'http';

async function runTests() {
  console.log('🧪 Testing Admin & Contact API Endpoints...');
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Health check
    const healthRes = await fetch(`${baseUrl}/api/health`);
    const healthJson = await healthRes.json();
    console.log('✅ Health check:', healthJson.status, 'DB type:', healthJson.database?.type);

    // 2. Submit contact message
    const contactRes = await fetch(`${baseUrl}/api/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Test Enterprise User',
        company: 'Acme Global',
        email: 'test@acme.org',
        message: 'Looking for SAP S/4HANA migration advisory services.',
      }),
    });
    const contactJson = await contactRes.json();
    if (!contactJson.success) throw new Error('Contact message submission failed');
    console.log('✅ Contact form submitted successfully. Message ID:', contactJson.data?.id);
    const createdId = contactJson.data?.id;

    // 3. Admin login failure
    const badLoginRes = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'wrongpassword' }),
    });
    if (badLoginRes.status !== 401) throw new Error('Bad login should return 401');
    console.log('✅ Unauthorized login rejected as expected (401)');

    // 4. Admin login success (admin / admin123)
    const loginRes = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' }),
    });
    const loginJson = await loginRes.json();
    if (!loginJson.success || !loginJson.token) throw new Error('Admin login failed');
    console.log('✅ Admin login succeeded with admin / admin123. Token received.');
    const token = loginJson.token;

    // 5. Fetch messages with auth
    const msgsRes = await fetch(`${baseUrl}/api/admin/messages`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const msgsJson = await msgsRes.json();
    if (!msgsJson.success || !Array.isArray(msgsJson.messages)) throw new Error('Failed to fetch messages');
    console.log(`✅ Admin retrieved ${msgsJson.messages.length} messages. Stats:`, msgsJson.stats);

    // 6. Update message status
    const updateRes = await fetch(`${baseUrl}/api/admin/messages/${createdId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status: 'read' }),
    });
    const updateJson = await updateRes.json();
    if (!updateJson.success) throw new Error('Failed to update status');
    console.log('✅ Updated message status to read');

    // 7. Delete test message
    const deleteRes = await fetch(`${baseUrl}/api/admin/messages/${createdId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const deleteJson = await deleteRes.json();
    if (!deleteJson.success) throw new Error('Failed to delete message');
    console.log('✅ Deleted test message successfully');

    console.log('🎉 ALL BACKEND ADMIN & CONTACT TESTS PASSED!');
    process.exit(0);
  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
