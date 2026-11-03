## Backend verification: FEAT-03 / FEAT-04

Verified on 2026-11-03 (Asia/Bangkok), branch `test/sprint-1-integration-verification`, based on staging `d94831f`.

- [x] Borrow request validation, valid/invalid/duplicate submissions
- [x] Concurrent requests: one accepted per borrower/asset; different borrowers can compete without reservation
- [x] BR-05 scoped request queue/read, checkout authorization, and loan reads
- [x] Checkout input, role, session, Origin and CSRF validation
- [x] Duplicate/concurrent checkout protection, including competing requests/custodians
- [x] Real PostgreSQL rollback fault injection, unchanged availability/queue, and clean retry
- [x] Exactly one ACTIVE loan and consistent catalog/queue/loan reads
- [x] Full backend regression and build
- [x] Actual logs, JSON test results, and integration report

Results: **24/24 focused tests**, **55/55 full backend regression tests**, **0 failed, 0 skipped/pending**, backend TypeScript build passed. Counts overlap; 55 is the full regression total. Test database cleanup verified against preflight, including temporary trigger/schema removal. No development database writes or reseeding were performed during verification.

Report: [Sprint 1 Integration & Verification](../../../docs/sprints/sprint-1/integration-verification-report.md).
Evidence: [focused log](logs/feat-03-04.log), [regression log](logs/backend-regression.log), [Vitest JSON](backend-results.json), [build log](logs/backend-build.log), [preflight](preflight.json), [postflight](postflight.json).

BR-05 caveat: private queue/checkout/loan access is scoped; the shared discovery catalog follows the provisional SDS interpretation, with the existing FEAT-02 C1 conflict still requiring team resolution. No later-sprint return/reporting behavior is claimed.

The teammate-reported Playwright 23/23 result was not rerun here. The local staging baseline already includes the Playwright PR #20 merge commit; please reconcile this backend evidence with its CI/browser evidence before final report approval and release. Keep the issue open until review and all acceptance gates are complete.

This handoff records the verification results; review, issue closure, merge, and release remain separate actions.
