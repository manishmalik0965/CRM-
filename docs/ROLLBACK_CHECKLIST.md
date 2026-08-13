# Enterprise Production Rollback Checklist

## Rollback Trigger Criteria
- Unresolved 5xx error rate exceeding 1% for 5 consecutive minutes.
- Database connection failure or unrecoverable schema deadlock.
- Security vulnerability identified in deployed release bundle.
- Critical workflow breakage impacting booking management or auth.

## Emergency Rollback Execution
1. **Traffic Redirection:** Immediately route 100% of live traffic to the previous stable Cloud Run revision.
2. **Database Schema Verification:** Confirm if database migrations were backward-compatible. If necessary, execute rollback migration script or restore database backup snapshot.
3. **Environment Lock:** Pause automated GitHub Actions deployments (`.github/workflows/ci-cd.yml`).
4. **Cache & Proxy Purge:** Invalidate CDN/Nginx cache headers if static assets were replaced.
5. **Post-Rollback Health Checks:**
   - [ ] Verify `/api/health` returns `200 OK`.
   - [ ] Verify user session login and token generation.
   - [ ] Execute `npm run restore:verify` to confirm database state integrity.
6. **Incident Retrospective:** Document root cause and log events in system incident register.
