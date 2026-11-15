#!/usr/bin/env python3
"""Read-only plan by default; two reviewed IAM changes require separate authorization."""
import argparse
import copy
import json
import subprocess
from pathlib import Path

PROJECT = "lab-5-cloud-deployment-514310"
NUMBER = "610347790049"
REPO = "gearstack-studio/kitloop"
DEPLOY = f"serviceAccount:kitloop-wif-deploy@{PROJECT}.iam.gserviceaccount.com"
LEGACY = f"serviceAccount:{NUMBER}@cloudbuild.gserviceaccount.com"
COMPUTE = f"{NUMBER}-compute@developer.gserviceaccount.com"
CUSTOM = f"projects/{PROJECT}/roles/kitloopDeployPreflight"
BASE = {
    "cloudbuild.builds.get", "cloudsql.backupRuns.list", "cloudsql.instances.get",
    "resourcemanager.projects.get", "run.operations.get", "run.services.list",
    "serviceusage.services.use",
}
CREATE = "cloudbuild.builds.create"
APPROVAL = "APPROVE-STANDALONE-BUILD-SECURITY"
ACCOUNTS = {f"kitloop-{name}@{PROJECT}.iam.gserviceaccount.com"
            for name in ("build", "run", "migrate")}


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def command(*args):
    return subprocess.check_output(args, text=True).strip()


def read(*args):
    return json.loads(command(*args))


def member_grants(rows, member):
    return [(row["resource"], b) for row in rows
            for b in row.get("policy", {}).get("bindings", [])
            if member in b.get("members", [])]


def validate(state):
    require(state["ancestors"] == [{"id": PROJECT, "type": "project"}],
            "Project hierarchy changed; this plan supports only the standalone lab project.")
    require(state["default"] == COMPUTE, "Default build identity changed; review again.")
    require(state["gate"] == "false", "Deployment gate must remain false.")
    permissions = set(state["role"]["includedPermissions"])
    require(permissions in (BASE, BASE | {CREATE}), "Custom-role permission drift.")
    bindings = [b for b in state["projectIam"]["bindings"] if DEPLOY in b.get("members", [])]
    require(len(bindings) == 1 and bindings[0]["role"] == CUSTOM
            and not bindings[0].get("condition"), "Deployment project-grant drift.")
    custom = [b for b in state["projectIam"]["bindings"] if b["role"] == CUSTOM]
    require(len(custom) == 1 and custom[0]["members"] == [DEPLOY],
            "Custom role has another principal; update would affect unrelated access.")
    legacy = [b for b in state["projectIam"]["bindings"] if LEGACY in b.get("members", [])]
    require(all(b["role"] == "roles/cloudbuild.builds.builder" and not b.get("condition")
                for b in legacy) and len(legacy) <= 1, "Unexpected legacy project privileges.")
    for resource, binding in member_grants(state["legacyAssets"], LEGACY):
        require(resource == f"//cloudresourcemanager.googleapis.com/projects/{PROJECT}"
                and binding["role"] == "roles/cloudbuild.builds.builder"
                and not binding.get("condition"), "Unexpected legacy resource privileges.")
    require(not legacy or CREATE not in permissions,
            "Build-create already granted while legacy Builder remains; stop for security review.")
    for item in state["builds"] + state["triggers"]:
        require(item.get("serviceAccount") and LEGACY[15:] not in item["serviceAccount"],
                "Known or unresolved legacy consumer in queried build/trigger history.")
    # Asset inventory plus authoritative target-account IAM. No broad actAs or token creation.
    require(not state["computeIam"].get("bindings"), "Compute account policy drift; review again.")
    allowed = {
        CUSTOM, "roles/run.developer", "roles/run.invoker", "roles/storage.objectCreator",
        "roles/storage.bucketViewer", "roles/artifactregistry.reader",
        "roles/iam.serviceAccountUser", "roles/iam.serviceAccountOpenIdTokenCreator",
    }
    acts_as = set()
    for resource, binding in member_grants(state["deployAssets"], DEPLOY):
        role = binding["role"]
        require(role in allowed and not binding.get("condition"),
                "Unexpected deployment privilege; inspect role and scope before proceeding.")
        if role == "roles/iam.serviceAccountUser":
            account = resource.rsplit("/", 1)[-1]
            require(account in ACCOUNTS, "Deployment can act as an unintended account.")
            acts_as.add(account)
    require(acts_as == ACCOUNTS, "Named build/runtime/migration actAs inventory incomplete.")
    require('--service-account="projects/$PROJECT/serviceAccounts/$BUILD_SA"'
            in state["releaseScript"]
            and f'BUILD_SA="kitloop-build@${{PROJECT}}.iam.gserviceaccount.com"'
            in state["commonScript"], "Explicit dedicated build identity is missing.")
    return bool(legacy), CREATE in permissions


def collect():
    root = Path(__file__).resolve().parents[3]
    return {
        "ancestors": read("gcloud", "projects", "get-ancestors", PROJECT, "--format=json"),
        "default": command("gcloud", "builds", "get-default-service-account",
                           "--region=asia-southeast1", f"--project={PROJECT}"),
        "gate": command("gh", "variable", "get", "LAB5_DEPLOY_ENABLED", f"--repo={REPO}"),
        "role": read("gcloud", "iam", "roles", "describe", "kitloopDeployPreflight",
                     f"--project={PROJECT}", "--format=json"),
        "projectIam": read("gcloud", "projects", "get-iam-policy", PROJECT, "--format=json"),
        "computeIam": read("gcloud", "iam", "service-accounts", "get-iam-policy", COMPUTE,
                           f"--project={PROJECT}", "--format=json"),
        "legacyAssets": read("gcloud", "asset", "search-all-iam-policies",
                             f"--scope=projects/{NUMBER}", f'--query=policy:"{LEGACY[15:]}"',
                             "--format=json"),
        "deployAssets": read("gcloud", "asset", "search-all-iam-policies",
                             f"--scope=projects/{NUMBER}", f'--query=policy:"{DEPLOY[15:]}"',
                             "--format=json"),
        "releaseScript": (root / "infra/gcp/release.sh").read_text(),
        "commonScript": (root / "infra/gcp/common.sh").read_text(),
        "sourceSha": command("git", "-C", str(root), "rev-parse", "HEAD"),
        "sourceDirty": command("git", "-C", str(root), "status", "--porcelain"),
        "builds": [b for region in ("global", "asia-southeast1")
                   for b in read("gcloud", "builds", "list", f"--region={region}",
                                 f"--project={PROJECT}", "--limit=100", "--format=json(id,serviceAccount)")],
        "triggers": [t for region in ("global", "asia-southeast1")
                     for t in read("gcloud", "builds", "triggers", "list", f"--region={region}",
                                   f"--project={PROJECT}", "--format=json(id,serviceAccount)")],
    }


def approved(review):
    # An ordinary PR approval without explicit risk acceptance is insufficient.
    latest = [r for r in review["reviews"] if r["author"]["login"] == "DEV4952"]
    require(bool(latest), "DEV4952 security review is missing.")
    last = latest[-1]
    require(last["state"] == "APPROVED" and APPROVAL in last["body"]
            and last["commit"]["oid"] == review["headRefOid"],
            "Explicit DEV4952 security approval of the current head is required.")


def apply_changes(state, review, authorization):
    require(authorization == "apply-reviewed-standalone-iam", "Separate IAM authorization required.")
    approved(review)
    require(state["sourceSha"] == review["headRefOid"] and not state["sourceDirty"],
            "Execute only the clean, explicitly reviewed source commit.")
    has_legacy, has_create = validate(state)
    if has_legacy:
        command("gcloud", "projects", "remove-iam-policy-binding", PROJECT,
                f"--member={LEGACY}", "--role=roles/cloudbuild.builds.builder",
                "--condition=None", "--quiet")
    # Stop if authoritative IAM or eventually consistent inventory still shows privileges.
    # No automatic retry, restoration of Builder, or build submission.
    current = collect()
    legacy_remaining, _ = validate(current)
    require(not legacy_remaining and not member_grants(current["legacyAssets"], LEGACY),
            "Legacy grants still visible; stop before granting build-create and recheck later.")
    require(current["computeIam"] == state["computeIam"], "Compute account IAM changed.")
    expected = copy.deepcopy(state["projectIam"]["bindings"])
    for binding in expected:
        if binding["role"] == "roles/cloudbuild.builds.builder":
            binding["members"] = [m for m in binding["members"] if m != LEGACY]
    expected = [b for b in expected if b["members"]]
    canonical = lambda bindings: sorted(json.dumps(b, sort_keys=True) for b in bindings)
    require(canonical(current["projectIam"]["bindings"]) == canonical(expected),
            "Project IAM changed beyond the approved legacy-member removal.")
    if not has_create:
        command("gcloud", "iam", "roles", "update", "kitloopDeployPreflight",
                f"--project={PROJECT}", f"--add-permissions={CREATE}", "--quiet")
    final = collect()
    has_legacy, has_create = validate(final)
    require(not has_legacy and has_create, "Final IAM state mismatch.")
    print("Verified: legacy project Builder absent; minimal build-create granted; gate=false.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--review-pr", type=int)
    parser.add_argument("--authorization")
    args = parser.parse_args()
    # Reject an unauthorized apply before any cloud API call.
    if args.apply:
        require(args.authorization == "apply-reviewed-standalone-iam" and args.review_pr,
                "--apply requires a security-review PR and separate explicit IAM authorization.")
    state = collect()
    legacy, create = validate(state)
    if not args.apply:
        print(json.dumps({"mode": "read-only-plan", "legacyBuilderRemovalPending": legacy,
                          "buildCreateGrantPending": not create, "gate": state["gate"],
                          "defaultComputeIamChange": False,
                          "requires": ["DEV4952 explicit security approval", "separate IAM execution authorization"],
                          "limitations": ["Inventory can lag and excludes external-project grants and group membership.",
                                          "No live default-identity denial or billable build is tested."]}, indent=2))
        return
    review = read("gh", "pr", "view", str(args.review_pr), f"--repo={REPO}",
                  "--json", "headRefOid,reviews")
    apply_changes(state, review, args.authorization)


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, subprocess.CalledProcessError) as error:
        raise SystemExit(str(error))
