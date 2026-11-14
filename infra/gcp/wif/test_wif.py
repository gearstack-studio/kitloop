"""Offline policy-model and provisioning regression tests. No Google credentials needed."""
import argparse
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import textwrap
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import wif

NUMBER = "123456789012"  # Synthetic fixture, never a deployment default.
ACCOUNT = f"kitloop-wif-verifier@{wif.PROJECT}.iam.gserviceaccount.com"
ARGS = argparse.Namespace(action="apply", project_number=NUMBER, pool="test-pool",
                          provider="test-provider", service_account=ACCOUNT)
NAME = wif.provider_name(NUMBER, ARGS.pool, ARGS.provider)
MEMBER = wif.member_name(NUMBER, ARGS.pool)
ROOT = Path(__file__).resolve().parents[3]


def provider():
    return {"name": NAME, "state": "ACTIVE", "attributeMapping": dict(wif.MAPPING),
            "attributeCondition": wif.CONDITION,
            "oidc": {"issuerUri": wif.ISSUER, "allowedAudiences": [NAME]}}


def claims():
    return {"repository_id": wif.REPOSITORY_ID, "repository_owner_id": wif.OWNER_ID,
            "ref": wif.REF, "event_name": "push", "workflow_ref": wif.WORKFLOW_REF,
            "sub": f"repo:{wif.REPOSITORY}:ref:{wif.REF}", "iss": wif.ISSUER, "aud": NAME}


def policy_model(assertion, *, audience=NAME, oidc_permission=True,
                 member=MEMBER, credentials=True, condition=wif.CONDITION):
    # Only our constant expression is evaluated. This models the == / in / && subset;
    # it does not validate JWT signatures, Google's CEL implementation, STS or IAM.
    if not credentials or not oidc_permission or member != MEMBER:
        return False
    if assertion.get("iss") != wif.ISSUER or assertion.get("aud") != audience:
        return False
    try:
        return bool(eval(condition.replace("&&", "and"), {"__builtins__": {}},
                         {"assertion": SimpleNamespace(**assertion)}))
    except AttributeError:
        return False


class TrustTests(unittest.TestCase):
    def test_authorized_events(self):
        for event in ("push", "workflow_dispatch"):
            with self.subTest(event=event):
                self.assertTrue(policy_model(dict(claims(), event_name=event)))

    def test_each_identity_restriction_rejects_untrusted_claims(self):
        cases = {
            "fork": {"repository_id": "999999"},
            "different_repository": {"repository_id": "1442734709"},
            "different_owner": {"repository_owner_id": "999999"},
            "feature_branch": {"ref": "refs/heads/feat/6-wif-integration"},
            "tag": {"ref": "refs/tags/sprint-1-staging"},
            "pr": {"event_name": "pull_request"},
            "pr_target": {"event_name": "pull_request_target"},
            "another_workflow": {"workflow_ref": wif.WORKFLOW_REF.replace("wif-auth", "other")},
            "workflow_on_feature": {"workflow_ref": wif.WORKFLOW_REF.replace("sprint-1-staging", "feature")},
            "wrong_audience": {"aud": "https://github.com/gearstack-studio"},
            "wrong_issuer": {"iss": "https://example.invalid"},
        }
        for case, changes in cases.items():
            with self.subTest(case=case):
                self.assertFalse(policy_model(dict(claims(), **changes)))

    def test_missing_required_claims_fail_closed(self):
        for key in claims():
            if key == "sub":  # Mapped by Google, but not part of this condition expression.
                continue
            with self.subTest(claim=key):
                assertion = claims()
                del assertion[key]
                self.assertFalse(policy_model(assertion))

    def test_missing_permission_binding_or_credentials(self):
        for changes in ({"oidc_permission": False}, {"member": "principalSet://wrong"},
                        {"credentials": False}):
            with self.subTest(changes=changes):
                self.assertFalse(policy_model(claims(), **changes))

    def test_each_condition_clause_is_security_relevant(self):
        changes = [{"repository_id": "other"}, {"repository_owner_id": "other"},
                   {"ref": "refs/heads/main"}, {"event_name": "pull_request"},
                   {"workflow_ref": "other"}]
        clauses = wif.CONDITION.split(" && ")
        for index, change in enumerate(changes):
            with self.subTest(clause=index):
                weakened = " && ".join(clauses[:index] + clauses[index + 1:])
                self.assertTrue(policy_model(dict(claims(), **change), condition=weakened))
                self.assertFalse(policy_model(dict(claims(), **change)))


class SetupTests(unittest.TestCase):
    def test_provider_drift_is_rejected(self):
        mutations = [lambda p: p.update(disabled=True), lambda p: p.update(state="DELETED"),
                     lambda p: p.update(attributeCondition="true"),
                     lambda p: p["attributeMapping"].update({"attribute.repository_id": "'1442734708'"}),
                     lambda p: p["oidc"].update(issuerUri="https://example.invalid"),
                     lambda p: p["oidc"].update(allowedAudiences=[NAME, "other"])]
        wif.validate_provider(provider(), NAME)
        for mutate in mutations:
            changed = provider()
            mutate(changed)
            with self.subTest(resource=changed), self.assertRaises(ValueError):
                wif.validate_provider(changed, NAME)

    def test_configuration_rejects_wrong_project_accounts_and_invalid_ids(self):
        wif.validate_config(NUMBER, ARGS.pool, ARGS.provider, ACCOUNT)
        for values in [("not-a-number", ARGS.pool, ARGS.provider, ACCOUNT),
                       (NUMBER, "gcp-unsafe", ARGS.provider, ACCOUNT),
                       (NUMBER, "test;echo", ARGS.provider, ACCOUNT),
                       (NUMBER, ARGS.pool, ARGS.provider, wif.PROJECT + "@example.invalid"),
                       (NUMBER, ARGS.pool, ARGS.provider, ACCOUNT.replace("kitloop-wif-verifier", "kitloop-run"))]:
            with self.subTest(values=values), self.assertRaises(ValueError):
                wif.validate_config(*values)

    def test_workflow_variables_required_and_validated(self):
        wif.validate_workflow_config(NAME, ACCOUNT)
        for name, account in [("", ACCOUNT), (NAME, ""), (NAME + "/extra", ACCOUNT)]:
            with self.subTest(name=name), self.assertRaises(ValueError):
                wif.validate_workflow_config(name, account)

    def test_plan_uses_exact_condition_audience_and_scoped_binding(self):
        commands = wif.mutation_commands(ARGS)
        self.assertEqual(len(commands), 3)
        self.assertIn("--attribute-condition=" + wif.CONDITION, commands[1])
        self.assertIn("--allowed-audiences=" + NAME, commands[1])
        self.assertIn("--member=" + MEMBER, commands[2])
        self.assertIn("--role=roles/iam.workloadIdentityUser", commands[2])
        self.assertEqual(wif.mutation_commands(ARGS, (True, True, True)), [])
        self.assertEqual(len(wif.mutation_commands(ARGS, (True, False, False))), 2)

    def test_binding_requires_exact_member_role_and_unconditional_grant(self):
        binding = {"role": wif.ROLE, "members": [MEMBER]}
        self.assertTrue(wif.binding_present({"bindings": [binding]}, MEMBER))
        for change in ({"role": "roles/viewer"}, {"members": ["allUsers"]},
                       {"condition": {"expression": "false"}}):
            self.assertFalse(wif.binding_present({"bindings": [dict(binding, **change)]}, MEMBER))

    def inventory_responses(self, providers=None):
        return [[{"account": "operator@example.invalid"}], {"projectNumber": NUMBER},
                [{"config": {"name": api}} for api in wif.APIS], {"email": ACCOUNT},
                [{"name": NAME.split("/providers/")[0], "state": "ACTIVE"}],
                [provider()] if providers is None else providers,
                {"bindings": [{"role": wif.ROLE, "members": [MEMBER]}]}]

    @patch.object(wif.shutil, "which", return_value="/fake/gcloud")
    @patch.object(wif.subprocess, "run", return_value=SimpleNamespace(stdout=wif.PROJECT))
    def test_inventory_accepts_existing_exact_setup(self, _run, _which):
        with patch.object(wif, "cloud", side_effect=self.inventory_responses()):
            self.assertEqual(wif.inventory(ARGS), (True, True, True))

    @patch.object(wif.shutil, "which", return_value="/fake/gcloud")
    @patch.object(wif.subprocess, "run", return_value=SimpleNamespace(stdout=wif.PROJECT))
    def test_shared_pool_is_rejected(self, _run, _which):
        other = dict(provider(), name=NAME + "-other")
        with patch.object(wif, "cloud", side_effect=self.inventory_responses([provider(), other])):
            with self.assertRaisesRegex(ValueError, "dedicated"):
                wif.inventory(ARGS)

    @patch.object(wif.shutil, "which", return_value="/fake/gcloud")
    @patch.object(wif.subprocess, "run", return_value=SimpleNamespace(stdout=wif.PROJECT))
    def test_inventory_rejects_project_api_and_identity_errors(self, _run, _which):
        for index, replacement in [(0, []), (1, {"projectNumber": "999999999999"}),
                                   (2, []), (3, {"disabled": True}),
                                   (4, [{"name": NAME.split("/providers/")[0], "state": "DELETED"}])]:
            responses = self.inventory_responses()
            responses[index] = replacement
            with self.subTest(index=index), patch.object(wif, "cloud", side_effect=responses):
                with self.assertRaises(ValueError):
                    wif.inventory(ARGS)

    @patch.object(wif.shutil, "which", return_value="/fake/gcloud")
    @patch.object(wif.subprocess, "run", return_value=SimpleNamespace(stdout="wrong-project"))
    def test_wrong_active_project_stops_before_cloud_inventory(self, _run, _which):
        with patch.object(wif, "cloud") as cloud:
            with self.assertRaisesRegex(ValueError, "Active gcloud project"):
                wif.inventory(ARGS)
            cloud.assert_not_called()

    def test_gcloud_error_is_not_treated_as_resource_absence(self):
        result = subprocess.CompletedProcess([], 1, "", "sensitive diagnostic fixture")
        with patch.object(wif.subprocess, "run", return_value=result):
            with self.assertRaises(RuntimeError) as error:
                wif.cloud("iam", "workload-identity-pools", "list")
            self.assertNotIn("sensitive", str(error.exception))

    def test_apply_confirmation_and_retry(self):
        argv = ["wif.py", "apply", "--project-number", NUMBER, "--pool", ARGS.pool,
                "--provider", ARGS.provider, "--service-account", ACCOUNT]
        for interactive, confirmation in [(False, ""), (True, "wrong")]:
            with patch("sys.argv", argv), patch.object(wif, "inventory", return_value=(False,) * 3), \
                    patch("sys.stdin.isatty", return_value=interactive), \
                    patch("builtins.input", return_value=confirmation), patch("sys.stdout", io.StringIO()), \
                    patch.object(wif, "cloud") as cloud:
                with self.assertRaises(ValueError):
                    wif.main()
                cloud.assert_not_called()
        with patch("sys.argv", argv), patch.object(wif, "inventory", side_effect=[(False,) * 3, (True,) * 3]), \
                patch("sys.stdin.isatty", return_value=True), \
                patch("builtins.input", return_value=wif.PROJECT + "/wif-apply"), \
                patch("sys.stdout", io.StringIO()), patch.object(wif, "cloud") as cloud:
            wif.main()
            self.assertEqual(cloud.call_count, 3)

    def test_repeated_apply_is_a_noop_and_failed_mutation_stops_sequence(self):
        argv = ["wif.py", "apply", "--project-number", NUMBER, "--pool", ARGS.pool,
                "--provider", ARGS.provider, "--service-account", ACCOUNT]
        with patch("sys.argv", argv), patch.object(wif, "inventory", return_value=(True,) * 3), \
                patch("builtins.input") as prompt, patch("sys.stdout", io.StringIO()), \
                patch.object(wif, "cloud") as cloud:
            wif.main()
            prompt.assert_not_called()
            cloud.assert_not_called()
        with patch("sys.argv", argv), patch.object(wif, "inventory", return_value=(False,) * 3), \
                patch("sys.stdin.isatty", return_value=True), \
                patch("builtins.input", return_value=wif.PROJECT + "/wif-apply"), \
                patch("sys.stdout", io.StringIO()), \
                patch.object(wif, "cloud", side_effect=RuntimeError("API failed")) as cloud:
            with self.assertRaises(RuntimeError):
                wif.main()
            self.assertEqual(cloud.call_count, 1)


class WorkflowTests(unittest.TestCase):
    def test_readonly_workflow_script_checks_real_response_and_writes_safe_summary(self):
        import re
        workflow = (ROOT / ".github/workflows/wif-auth.yml").read_text()
        blocks = re.findall(r"python3 - <<'PY'\n(.*?)\n\s*PY", workflow, re.S)
        code = compile(textwrap.dedent(blocks[1]), "<workflow>", "exec")
        valid = {"projectId": wif.PROJECT, "projectNumber": NUMBER, "lifecycleState": "ACTIVE"}
        cases = [(0, valid, True), (0, dict(valid, projectNumber="999999999999"), False),
                 (0, dict(valid, projectId="other"), False),
                 (0, dict(valid, lifecycleState="DELETE_REQUESTED"), False), (1, {}, False)]
        for returncode, response, accepted in cases:
            with self.subTest(response=response), tempfile.TemporaryDirectory() as directory:
                summary = Path(directory) / "summary.md"
                env = {"WIF_PROVIDER": NAME, "GITHUB_STEP_SUMMARY": str(summary),
                       "GITHUB_SHA": "0123456789abcdef", "GITHUB_REF": wif.REF,
                       "GITHUB_EVENT_NAME": "push"}
                result = subprocess.CompletedProcess([], returncode, json.dumps(response),
                                                     "sensitive diagnostic fixture")
                with patch.dict(os.environ, env), patch.object(subprocess, "run", return_value=result) as run:
                    if accepted:
                        exec(code, {})
                        self.assertIn("Result: PASS", summary.read_text())
                        self.assertIn(env["GITHUB_SHA"], summary.read_text())
                    else:
                        with self.assertRaises(SystemExit) as error:
                            exec(code, {})
                        self.assertNotIn("sensitive", str(error.exception))
                        self.assertFalse(summary.exists())
                    self.assertEqual(run.call_args.args[0], ["gcloud", "projects", "describe",
                                     wif.PROJECT, "--project=" + wif.PROJECT, "--format=json"])

    def test_inline_workflow_python_compiles(self):
        import re
        workflow = (ROOT / ".github/workflows/wif-auth.yml").read_text()
        blocks = re.findall(r"python3 - <<'PY'\n(.*?)\n\s*PY", workflow, re.S)
        self.assertEqual(len(blocks), 2)
        for block in blocks:
            compile(textwrap.dedent(block), "<workflow>", "exec")

    def test_workflow_boundary_and_credential_exclusions(self):
        workflow = (ROOT / ".github/workflows/wif-auth.yml").read_text()
        self.assertNotIn("pull_request", workflow)
        self.assertIn("branches: [sprint-1-staging]", workflow)
        self.assertEqual(workflow.count("id-token: write"), 1)
        self.assertIn("persist-credentials: false", workflow)
        self.assertIn("audience: ${{ vars.WIF_PROVIDER }}", workflow)
        self.assertNotIn("credentials_json", workflow)
        self.assertNotIn("print-access-token", workflow)
        ci = (ROOT / ".github/workflows/pull-request-ci.yml").read_text()
        self.assertNotIn("id-token:", ci)
        self.assertIn("unittest discover -s infra/gcp/wif", ci)
        for filename in (".gitignore", ".dockerignore", ".gcloudignore"):
            with self.subTest(file=filename):
                self.assertIn("**/gha-creds-*.json", (ROOT / filename).read_text())


if __name__ == "__main__":
    unittest.main()
