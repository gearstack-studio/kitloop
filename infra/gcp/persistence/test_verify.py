import copy
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from unittest.mock import MagicMock
from types import SimpleNamespace

import verify

URL = "https://kitloop-610347790049.asia-southeast1.run.app"
SHA = "a" * 40
RECORD = {"id": "11111111-1111-4111-8111-111111111111", "borrowerId": "private-borrower-id",
          "assetId": "synthetic-asset", "submittedAt": "2026-11-15T00:00:00Z", "status": "PENDING"}
IMAGE = verify.REGISTRY + "@sha256:" + "b" * 64


def evidence(revision="kitloop-aaaaaaaaaaaa-baseline"):
    return {"url": URL, "revision": revision, "imageDigest": IMAGE, "sourceSha": SHA,
            "database": verify.CONNECTION, "recordId": RECORD["id"],
            "recordFingerprint": verify.fingerprint(RECORD), "result": "PASS"}


class PersistenceTests(unittest.TestCase):
    def test_record_replacement_or_status_change_is_detected(self):
        baseline = evidence()
        current = evidence("kitloop-aaaaaaaaaaaa-restart")
        for field in ("id", "borrowerId", "assetId", "submittedAt", "status"):
            with self.subTest(field=field):
                changed = dict(RECORD, **{field: "different"})
                current["recordFingerprint"] = verify.fingerprint(changed)
                with self.assertRaisesRegex(verify.VerificationError, "Persistence mismatch"):
                    verify.compare("after-restart", current, {"baseline": baseline})

    def test_restart_must_reuse_image_but_run_a_new_revision(self):
        baseline = evidence()
        with self.assertRaises(verify.VerificationError):
            verify.compare("after-restart", baseline, {"baseline": baseline})
        restart = evidence("kitloop-aaaaaaaaaaaa-restart")
        verify.compare("after-restart", restart, {"baseline": baseline})
        with self.assertRaises(verify.VerificationError):
            verify.compare("after-restart", dict(restart, imageDigest="other"), {"baseline": baseline})

    def test_phase_order_and_redeploy_proof(self):
        baseline, restart, redeploy = evidence(), evidence("restart"), evidence("redeploy")
        with self.assertRaises(verify.VerificationError):
            verify.compare("after-redeploy", redeploy, {"baseline": baseline})
        history = {"baseline": baseline, "after-restart": restart}
        with self.assertRaises(verify.VerificationError):
            verify.compare("after-redeploy", redeploy, history)
        redeploy["releaseRun"] = "https://github.com/gearstack-studio/kitloop/actions/runs/123"
        verify.compare("after-redeploy", redeploy, history)

    def test_rollback_and_rollforward_must_match_recorded_targets(self):
        baseline, restart, redeploy = evidence(), evidence("restart"), evidence("redeploy")
        history = {"baseline": baseline, "after-restart": restart, "after-redeploy": redeploy}
        verify.compare("after-rollback", baseline, history)
        with self.assertRaises(verify.VerificationError):
            verify.compare("after-rollback", restart, history)
        history["after-rollback"] = baseline
        verify.compare("after-rollforward", redeploy, history)
        with self.assertRaises(verify.VerificationError):
            verify.compare("after-rollforward", restart, history)

    def test_changed_database_or_url_is_rejected(self):
        for field in ("url", "database", "recordId"):
            with self.subTest(field=field), self.assertRaises(verify.VerificationError):
                verify.compare("after-restart", dict(evidence("restart"), **{field: "different"}),
                               {"baseline": evidence()})

    def test_https_origin_validation(self):
        self.assertEqual(verify.origin(URL + "/"), URL)
        for value in ("http://localhost", URL + "/api", URL + "?password=secret", "https://user:secret@example.com"):
            with self.subTest(value=value), self.assertRaises(verify.VerificationError):
                verify.origin(value)

    def test_report_is_exclusive_and_contains_only_selected_fields(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "baseline.json"
            verify.write_report(path, evidence())
            with self.assertRaises(FileExistsError):
                verify.write_report(path, {"result": "FAIL"})
            text = path.read_text()
            self.assertNotIn(RECORD["borrowerId"], text)
            self.assertNotIn(RECORD["assetId"], text)
            self.assertEqual(json.loads(text)["result"], "PASS")

    def test_application_read_prompts_for_credentials_and_logs_out_on_success_or_missing_record(self):
        def response(body, status=200, headers=None):
            stream = io.BytesIO(json.dumps(body).encode())
            stream.status = status
            stream.headers = headers or {}
            return stream

        for found in (True, False):
            jar = MagicMock()
            jar.__iter__.side_effect = lambda: iter([SimpleNamespace(secure=True)])
            client = MagicMock()
            client.open.side_effect = [response({}), response({}), response({}),
                                       response({}, headers={"X-CSRF-Token": "csrf-sentinel"}),
                                       response({"role": "BORROWER"}),
                                       response([RECORD] if found else []), response({}, 204)]
            output = io.StringIO()
            with self.subTest(found=found), patch.object(verify.http.cookiejar, "CookieJar", return_value=jar), \
                    patch.object(verify.urllib.request, "build_opener", return_value=client), \
                    patch("builtins.input", return_value="private-username"), \
                    patch.object(verify.getpass, "getpass", return_value="private-password"), \
                    patch("sys.stdin.isatty", return_value=True), patch("sys.stdout", output):
                if found:
                    self.assertEqual(verify.application_record(URL, RECORD["id"]), RECORD)
                else:
                    with self.assertRaisesRegex(verify.VerificationError, "missing"):
                        verify.application_record(URL, RECORD["id"])
                calls = client.open.call_args_list
                self.assertEqual(calls[5].args[0].get_method(), "GET")
                self.assertTrue(calls[-1].args[0].full_url.endswith("/api/auth/logout"))
                self.assertEqual(calls[-1].args[0].get_method(), "POST")
                self.assertNotIn("private-password", output.getvalue())
                self.assertNotIn("csrf-sentinel", output.getvalue())
                jar.clear.assert_called_once()

    def test_interrupted_report_write_does_not_publish_partial_evidence(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "baseline.json"
            with patch.object(verify.json, "dump", side_effect=OSError("disk full")):
                with self.assertRaises(OSError):
                    verify.write_report(path, evidence())
            self.assertFalse(path.exists())
            self.assertEqual(list(Path(directory).iterdir()), [])

    def cloud_responses(self):
        revision = evidence()["revision"]
        return [{"status": {"traffic": [{"revisionName": revision, "percent": 100}]}},
                {"metadata": {"labels": {"serving.knative.dev/service": "kitloop"},
                              "creationTimestamp": "2026-11-15T00:05:00Z",
                              "annotations": {"run.googleapis.com/cloudsql-instances": verify.CONNECTION}},
                 "status": {"conditions": [{"type": "Ready", "status": "True"}]},
                 "spec": {"containers": [{"image": IMAGE, "env": [{"name": "APP_ORIGIN", "value": URL},
                                                                   {"name": "SECRET", "value": "private-sentinel"}]}]}},
                {"image_summary": {"fully_qualified_digest": IMAGE}},
                {"state": "RUNNABLE", "connectionName": verify.CONNECTION},
                [{"status": "SUCCESSFUL", "id": "7", "endTime": "2026-11-14T20:00:00Z"}]]

    @patch.object(verify, "main_source")
    def test_snapshot_is_traceable_and_sanitized(self, _main_source):
        with patch.object(verify, "cloud", side_effect=self.cloud_responses()):
            report = verify.snapshot(URL, SHA)
        self.assertNotIn("private-sentinel", json.dumps(report))
        self.assertEqual(report["imageDigest"], IMAGE)
        self.assertEqual(report["database"], verify.CONNECTION)

    @patch.object(verify, "main_source")
    def test_snapshot_refuses_split_traffic_wrong_image_origin_and_missing_backup(self, _main_source):
        variants = []
        responses = self.cloud_responses()
        responses[0]["status"]["traffic"] = [{"percent": 50}, {"percent": 50}]
        variants.append(responses)
        responses = self.cloud_responses()
        responses[2]["image_summary"]["fully_qualified_digest"] = "other"
        variants.append(responses)
        responses = self.cloud_responses()
        responses[1]["spec"]["containers"][0]["env"][0]["value"] = "https://other.invalid"
        variants.append(responses)
        responses = self.cloud_responses()
        responses[-1] = []
        variants.append(responses)
        for responses in variants:
            with patch.object(verify, "cloud", side_effect=responses), self.assertRaises(verify.VerificationError):
                verify.snapshot(URL, SHA)

    def test_source_sha_must_be_an_actual_main_ancestor(self):
        for status, expected in (("ahead", True), ("identical", True), ("behind", False), ("diverged", False)):
            response = io.BytesIO(json.dumps({"status": status, "base_commit": {"sha": SHA}}).encode())
            with self.subTest(status=status), patch.object(verify.urllib.request, "urlopen", return_value=response):
                if expected:
                    verify.main_source(SHA)
                else:
                    with self.assertRaises(verify.VerificationError):
                        verify.main_source(SHA)

    def release_response(self):
        run = {"conclusion": "success", "head_branch": "main", "event": "push", "head_sha": SHA,
               "path": ".github/workflows/deploy.yml", "run_attempt": 2,
               "run_started_at": "2026-11-15T00:00:00Z", "updated_at": "2026-11-15T00:10:00Z"}
        jobs = {"jobs": [{"name": "Approved Cloud Run release", "conclusion": "success", "steps": [
            {"name": name, "conclusion": "success"} for name in
            ("Build both immutable images", "Run checked-in database migrations",
             "Deploy candidate, check readiness, then route traffic", "Verify serving revision and HTTP health")]}]}
        return run, jobs

    def test_main_release_requires_real_deployment_not_only_green_ci(self):
        run, jobs = self.release_response()
        with patch.object(verify.urllib.request, "urlopen", side_effect=[io.BytesIO(json.dumps(run).encode()),
                                                                      io.BytesIO(json.dumps(jobs).encode())]):
            self.assertTrue(verify.release_evidence("123", SHA, "2026-11-15T00:05:00Z").endswith("attempts/2"))
        for mutation in ("skipped", "wrong-sha", "missing-step", "old-revision"):
            changed_run, changed_jobs = copy.deepcopy(self.release_response())
            created = "2026-11-15T00:05:00Z"
            if mutation == "skipped":
                changed_jobs["jobs"][0]["conclusion"] = "skipped"
            elif mutation == "wrong-sha":
                changed_run["head_sha"] = "f" * 40
            elif mutation == "missing-step":
                changed_jobs["jobs"][0]["steps"].pop()
            else:
                created = "2026-11-14T00:00:00Z"
            with self.subTest(mutation=mutation), patch.object(verify.urllib.request, "urlopen", side_effect=[
                    io.BytesIO(json.dumps(changed_run).encode()), io.BytesIO(json.dumps(changed_jobs).encode())]):
                with self.assertRaises(verify.VerificationError):
                    verify.release_evidence("123", SHA, created)

    def test_traffic_change_during_capture_does_not_record_pass(self):
        with tempfile.TemporaryDirectory() as directory:
            args = ["verify.py", "baseline", "--url", URL, "--source-sha", SHA,
                    "--request-id", RECORD["id"], "--evidence-dir", directory]
            snapshot = dict(evidence(), revisionCreatedAt="2026-11-15T00:05:00Z")
            with patch("sys.argv", args), patch.object(verify, "snapshot", return_value=snapshot), \
                    patch.object(verify, "application_record", return_value=RECORD), \
                    patch.object(verify, "cloud", return_value={"status": {"traffic": [{"revisionName": "other", "percent": 100}]}}):
                with self.assertRaises(verify.VerificationError):
                    verify.main()
            self.assertFalse((Path(directory) / "baseline.json").exists())
            failed = list(Path(directory).glob("failed-*.json"))
            self.assertEqual(json.loads(failed[0].read_text())["result"], "FAIL")


if __name__ == "__main__":
    unittest.main()
