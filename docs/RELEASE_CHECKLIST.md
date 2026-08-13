# Enterprise Release Checklist

## Release Candidate Sign-Off
- [ ] Version number bumped in `package.json`.
- [ ] Automated Test Suite passes with 100% success rate:
  - Unit Tests (`npm run test:unit`)
  - REST API Tests (`npm run test:api`)
  - DB Isolation Tests (`npm run test:db`)
  - Playwright E2E Tests (`npm run test:e2e`)
  - Security Audit (`npm run security-check`)
  - Backup/Restore Integrity (`npm run backup:verify` & `npm run restore:verify`)
- [ ] Rate limit configuration validated for shared IP / corporate proxy users (`X-Tenant-ID` and token keys).
- [ ] SMTP email delivery verified using test reservation template.
- [ ] Release Notes generated detailing new features, bug fixes, and security patches.
- [ ] Tag git commit release (e.g. `v1.0.0`) and trigger production deploy.
