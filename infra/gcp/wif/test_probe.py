"""Regression tests ensure hosted probes require the expected real denial reason."""
import base64
import contextlib
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import urllib.error

import probe

PROVIDER = "projects/610347790049/locations/global/workloadIdentityPools/kitloop-github-verify/providers/github-oidc"
ACCOUNT = "kitloop-wif-verifier@lab-5-cloud-deployment-514310.iam.gserviceaccount.com"


class HostedProbeTests(unittest.TestCase):
    def execute(self, name, replies, *, permission=True, accepted=True):
        with tempfile.TemporaryDirectory() as directory:
            summary = Path(directory) / "summary.md"
            env = {"GITHUB_REF": probe.PROBE_REF, "GITHUB_EVENT_NAME": "push",
                   "GITHUB_SHA": "synthetic-test-sha", "GITHUB_STEP_SUMMARY": str(summary),
                   "WIF_PROVIDER": PROVIDER, "WIF_SERVICE_ACCOUNT": ACCOUNT}
            if permission:
                env.update(ACTIONS_ID_TOKEN_REQUEST_URL="https://example.invalid/oidc?existing=value",
                           ACTIONS_ID_TOKEN_REQUEST_TOKEN="sensitive-fixture")
            output = io.StringIO()
            with patch.dict(os.environ, env, clear=True), \
                    patch.object(probe.urllib.request, "urlopen", side_effect=replies) as request, \
                    contextlib.redirect_stdout(output):
                if accepted:
                    probe.run_probe(name)
                    self.assertTrue(summary.exists())
                    self.assertIn("PASS", output.getvalue())
                else:
                    with self.assertRaises((RuntimeError, ValueError)):
                        probe.run_probe(name)
                    self.assertFalse(summary.exists())
                self.assertNotIn("sensitive-fixture", output.getvalue())
                return request.call_count

    def token(self, audience=PROVIDER):
        claims = {"aud": audience, "ref": probe.PROBE_REF, "event_name": "push"}
        payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip("=")
        return io.BytesIO(json.dumps({"value": "header." + payload + ".signature"}).encode())

    def denial(self, code="unauthorized_client", description="The given credential is rejected by the attribute condition."):
        body = json.dumps({"error": code, "error_description": description + " sensitive-fixture"})
        return urllib.error.HTTPError(probe.STS, 400, "denied", None, io.BytesIO(body.encode()))

    def test_expected_attribute_condition_denial(self):
        self.assertEqual(self.execute("untrusted-ref", [self.token(), self.denial()]), 2)

    def test_expected_audience_denial(self):
        token = self.token("https://example.invalid/kitloop-wif-denied")
        denial = self.denial("invalid_grant", "The audience in the ID Token is not allowed.")
        self.assertEqual(self.execute("wrong-audience", [token, denial]), 2)

    def test_network_and_unrelated_failures_are_not_policy_evidence(self):
        for reply in [urllib.error.URLError("unreachable"),
                      self.denial("invalid_target", "Provider not found")]:
            with self.subTest(reply=type(reply).__name__):
                self.execute("untrusted-ref", [self.token(), reply], accepted=False)

    def test_unexpected_exchange_success_fails_probe(self):
        self.execute("untrusted-ref", [self.token(), io.BytesIO(b'{"access_token":"sensitive-fixture"}')],
                     accepted=False)

    def test_missing_permission_is_checked_on_host(self):
        self.assertEqual(self.execute("missing-oidc-permission", [], permission=False), 0)
        self.execute("missing-oidc-permission", [], accepted=False)

    def test_exchange_probe_without_oidc_permission_does_not_claim_sts_denial(self):
        self.assertEqual(self.execute("untrusted-ref", [], permission=False, accepted=False), 0)

    def test_hosted_probe_workflow_boundary(self):
        root = Path(__file__).resolve().parents[3]
        workflow = (root / ".github/workflows/wif-negative.yml").read_text()
        self.assertIn("branches: [feat/6-wif-integration]", workflow)
        self.assertNotIn("pull_request", workflow)
        self.assertEqual(workflow.count("id-token: write"), 1)
        self.assertIn("probe: [untrusted-ref, wrong-audience]", workflow)


if __name__ == "__main__":
    unittest.main()
