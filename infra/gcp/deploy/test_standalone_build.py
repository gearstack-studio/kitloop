import copy
import contextlib
import io
import unittest
from unittest.mock import patch

import standalone_build as s


def fixture(legacy=True, create=False):
    project = {"bindings": [{"role": s.CUSTOM, "members": [s.DEPLOY]}]}
    if legacy:
        project["bindings"].append({"role": "roles/cloudbuild.builds.builder", "members": [s.LEGACY]})
    return {
        "ancestors": [{"id": s.PROJECT, "type": "project"}], "default": s.COMPUTE,
        "gate": "false", "role": {"includedPermissions": sorted(s.BASE | ({s.CREATE} if create else set()))},
        "projectIam": project, "computeIam": {"etag": "same"},
        "legacyAssets": [{"resource": f"//cloudresourcemanager.googleapis.com/projects/{s.PROJECT}",
                          "policy": {"bindings": [project["bindings"][-1]]}}] if legacy else [],
        "deployAssets": [{"resource": "//iam.googleapis.com/projects/p/serviceAccounts/" + a,
                          "policy": {"bindings": [{"role": "roles/iam.serviceAccountUser", "members": [s.DEPLOY]}]}}
                         for a in sorted(s.ACCOUNTS)],
        "releaseScript": '--service-account="projects/$PROJECT/serviceAccounts/$BUILD_SA"',
        "commonScript": 'BUILD_SA="kitloop-build@${PROJECT}.iam.gserviceaccount.com"',
        "sourceSha": "a" * 40, "sourceDirty": "",
        "builds": [{"serviceAccount": "projects/p/serviceAccounts/kitloop-build@p"}], "triggers": [],
    }


def review():
    return {"headRefOid": "a" * 40, "reviews": [{"author": {"login": "DEV4952"},
            "state": "APPROVED", "body": s.APPROVAL, "commit": {"oid": "a" * 40}}]}


class StandaloneBuildTests(unittest.TestCase):
    def test_initial_and_completed_states(self):
        self.assertEqual(s.validate(fixture()), (True, False))
        self.assertEqual(s.validate(fixture(False, True)), (False, True))

    def test_privileged_default_path_is_rejected(self):
        with self.assertRaises(RuntimeError):
            s.validate(fixture(True, True))

    def test_gate_hierarchy_and_identity_drift(self):
        for key, value in [("gate", "true"), ("default", "legacy"),
                           ("ancestors", [{"id": "another", "type": "project"}]),
                           ("releaseScript", "gcloud builds submit .")]:
            state = fixture(); state[key] = value
            with self.subTest(key=key), self.assertRaises(RuntimeError): s.validate(state)

    def test_extra_role_permissions_or_beneficiaries_are_rejected(self):
        state = fixture(); state["role"]["includedPermissions"].append("iam.serviceAccounts.getAccessToken")
        with self.assertRaises(RuntimeError): s.validate(state)
        state = fixture(); state["projectIam"]["bindings"][0]["members"].append("user:someone@example.com")
        with self.assertRaises(RuntimeError): s.validate(state)

    def test_unintended_actas_or_token_creation_is_rejected(self):
        for role in ["roles/iam.serviceAccountUser", "roles/iam.serviceAccountTokenCreator"]:
            state = fixture()
            state["deployAssets"].append({"resource": "//iam.googleapis.com/projects/p/serviceAccounts/" + s.COMPUTE,
                "policy": {"bindings": [{"role": role, "members": [s.DEPLOY]}]}})
            with self.subTest(role=role), self.assertRaises(RuntimeError): s.validate(state)

    def test_other_legacy_grants_are_rejected(self):
        state = fixture(); state["legacyAssets"][0]["resource"] = "//storage.googleapis.com/another"
        with self.assertRaises(RuntimeError): s.validate(state)

    def test_legacy_or_unresolved_consumer_blocks_removal(self):
        for account in [None, s.LEGACY[15:]]:
            state = fixture(); state["triggers"] = [{"serviceAccount": account}]
            with self.subTest(account=account), self.assertRaises(RuntimeError): s.validate(state)

    def test_ordinary_or_stale_review_does_not_authorize(self):
        for key, value in [("body", "Looks good"), ("state", "CHANGES_REQUESTED"),
                           ("commit", {"oid": "b" * 40}), ("author", {"login": "someone"})]:
            r = review(); r["reviews"][0][key] = value
            with self.subTest(key=key), self.assertRaises(RuntimeError): s.approved(r)

    def test_no_mutations_without_execution_authorization_or_reviewed_source(self):
        for authorization, state in [(None, fixture()), ("apply-reviewed-standalone-iam", fixture())]:
            if authorization: state["sourceDirty"] = " M changed.py"
            with patch.object(s, "command") as call, self.assertRaises(RuntimeError):
                s.apply_changes(state, review(), authorization)
            call.assert_not_called()

    def test_revoke_failure_never_grants_create(self):
        with patch.object(s, "command", side_effect=RuntimeError("denied")) as call:
            with self.assertRaises(RuntimeError): s.apply_changes(fixture(), review(), "apply-reviewed-standalone-iam")
            self.assertEqual(call.call_count, 1)
            self.assertIn("remove-iam-policy-binding", call.call_args.args)

    def test_stale_asset_inventory_stops_before_grant(self):
        after = fixture(False); after["legacyAssets"] = copy.deepcopy(fixture()["legacyAssets"])
        with patch.object(s, "command") as call, patch.object(s, "collect", return_value=after):
            with self.assertRaises(RuntimeError): s.apply_changes(fixture(), review(), "apply-reviewed-standalone-iam")
            self.assertEqual(call.call_count, 1)

    def test_only_revoke_then_minimal_grant_and_no_build_or_compute_mutation(self):
        with patch.object(s, "command") as call, patch.object(s, "collect", side_effect=[fixture(False), fixture(False, True)]):
            with contextlib.redirect_stdout(io.StringIO()):
                s.apply_changes(fixture(), review(), "apply-reviewed-standalone-iam")
        self.assertEqual(call.call_count, 2)
        self.assertIn("remove-iam-policy-binding", call.call_args_list[0].args)
        self.assertIn("--add-permissions=" + s.CREATE, call.call_args_list[1].args)
        for invocation in call.call_args_list:
            self.assertNotIn("builds", invocation.args)
            self.assertNotIn(s.COMPUTE, invocation.args)


if __name__ == "__main__":
    unittest.main()
