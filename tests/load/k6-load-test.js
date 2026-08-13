import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 20 }, // Ramp-up to 20 virtual users
    { duration: '1m', target: 50 },  // Sustained peak load of 50 VUs
    { duration: '30s', target: 0 },  // Ramp-down to 0
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests must complete within 500ms
    http_req_failed: ['rate<0.01'],   // Error rate must be less than 1%
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  // 1. Health check endpoint
  const healthRes = http.get(`${BASE_URL}/api/health`);
  check(healthRes, {
    'health status is 200': (r) => r.status === 200,
  });

  // 2. Authentication Login endpoint
  const payload = JSON.stringify({
    email: 'manishmalik0965@gmail.com',
    password: 'Admin@123',
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-ID': 'legacy-tenant-1',
    },
  };

  const loginRes = http.post(`${BASE_URL}/api/auth/login`, payload, params);
  check(loginRes, {
    'login response is 200': (r) => r.status === 200,
    'has access token': (r) => JSON.parse(r.body).accessToken !== undefined,
  });

  if (loginRes.status === 200) {
    const token = JSON.parse(loginRes.body).accessToken;
    const authParams = {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-Tenant-ID': 'legacy-tenant-1',
      },
    };

    // 3. User Profile endpoint
    const profileRes = http.get(`${BASE_URL}/api/auth/me`, authParams);
    check(profileRes, {
      'profile status is 200': (r) => r.status === 200,
    });
  }

  sleep(1);
}
