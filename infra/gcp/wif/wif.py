#!/usr/bin/env python3
"""Plan, provision and inspect the dedicated KitLoop GitHub WIF trust boundary."""
import argparse
import json
import re
import shlex
import shutil
import subprocess
import sys

PROJECT = "lab-5-cloud-deployment-514310"
REPOSITORY = "gearstack-studio/kitloop"
# Verified using the GitHub repository API on 2026-11-14.
REPOSITORY_ID = "1442734708"
OWNER_ID = "351405823"
REF = "refs/heads/sprint-1-staging"
WORKFLOW_REF = f"{REPOSITORY}/.github/workflows/wif-auth.yml@{REF}"
ISSUER = "https://token.actions.githubusercontent.com"
MAPPING = {
    "google.subject": "assertion.sub",
    "attribute.repository_id": "assertion.repository_id",
    "attribute.repository_owner_id": "assertion.repository_owner_id",
    "attribute.ref": "assertion.ref",
    "attribute.event_name": "assertion.event_name",
    "attribute.workflow_ref": "assertion.workflow_ref",
}
CONDITION = " && ".join([
    f"assertion.repository_id == '{REPOSITORY_ID}'",
    f"assertion.repository_owner_id == '{OWNER_ID}'",
    f"assertion.ref == '{REF}'",
    "assertion.event_name in ['push', 'workflow_dispatch']",
    f"assertion.workflow_ref == '{WORKFLOW_REF}'",
])
ROLE = "roles/iam.workloadIdentityUser"
APIS = {"iam.googleapis.com", "iamcredentials.googleapis.com", "sts.googleapis.com",
        "cloudresourcemanager.googleapis.com"}


def validate_config(number, pool, provider, account):
    if not re.fullmatch(r"[1-9][0-9]{5,19}", number):
        raise ValueError("Use the actual numeric GCP project number.")
    for value in (pool, provider):
        if not re.fullmatch(r"[a-z][a-z0-9-]{3,31}", value) or value.startswith("gcp-"):
            raise ValueError("Pool/provider IDs must be 4-32 lowercase characters, not gcp-*.")
    if not re.fullmatch(r"kitloop-wif-[a-z0-9-]{1,18}@" + re.escape(PROJECT)
                        + r"\.iam\.gserviceaccount\.com", account):
        raise ValueError("Use a dedicated kitloop-wif-* service account in the lab project.")


def provider_name(number, pool, provider):
    return f"projects/{number}/locations/global/workloadIdentityPools/{pool}/providers/{provider}"


def member_name(number, pool):
    return (f"principalSet://iam.googleapis.com/projects/{number}/locations/global/"
            f"workloadIdentityPools/{pool}/attribute.repository_id/{REPOSITORY_ID}")


def validate_workflow_config(name, account):
    match = re.fullmatch(r"projects/([1-9][0-9]{5,19})/locations/global/"
                         r"workloadIdentityPools/([^/]+)/providers/([^/]+)", name)
    if not match:
        raise ValueError("WIF_PROVIDER must be the full provider resource name.")
    validate_config(*match.groups(), account)


def cloud(*args, json_output=True):
    """No shell, token commands, credential output, or raw error bodies."""
    result = subprocess.run(
        ["gcloud", *args, f"--project={PROJECT}",
         "--format=json" if json_output else "--quiet"],
        capture_output=True, text=True, check=False,
    )
    if result.returncode:
        status = re.search(r"\b(PERMISSION_DENIED|NOT_FOUND|UNAUTHENTICATED|INVALID_ARGUMENT|"
                           r"FAILED_PRECONDITION|RESOURCE_EXHAUSTED|UNAVAILABLE):", result.stderr)
        reason = f" ({status.group(1)})" if status else ""
        hint = "Check operator IAM/API setup."
        if args[:3] == ("iam", "service-accounts", "describe"):
            hint = (f"Verify that {args[3]} exists and the active operator has "
                    "iam.serviceAccounts.get. A missing account can also return PERMISSION_DENIED. "
                    "Have an IAM administrator check the service account inventory before creating it.")
        raise RuntimeError(f"gcloud {' '.join(args[:3])} failed{reason}. {hint}")
    return json.loads(result.stdout) if json_output else None


def binding_present(policy, member):
    return any(binding.get("role") == ROLE and not binding.get("condition")
               and member in binding.get("members", [])
               for binding in policy.get("bindings", []))


def validate_provider(resource, name):
    expected = {
        "name": name, "state": "ACTIVE", "disabled": False,
        "attributeMapping": MAPPING, "attributeCondition": CONDITION,
        "oidc": {"issuerUri": ISSUER, "allowedAudiences": [name]},
    }
    # Missing `disabled` means false in Google API JSON.
    actual = {key: resource.get(key, False if key == "disabled" else None)
              for key in expected}
    if actual != expected:
        raise ValueError("Existing provider differs from the reviewed trust policy. Refusing to overwrite.")


def inventory(args):
    if not shutil.which("gcloud"):
        raise ValueError("Install gcloud, authenticate as an operator and select the lab project.")
    selected = subprocess.run(["gcloud", "config", "get-value", "project"],
                              capture_output=True, text=True, check=True).stdout.strip()
    if selected != PROJECT:
        raise ValueError(f"Active gcloud project must be {PROJECT}.")
    accounts = cloud("auth", "list", "--filter=status:ACTIVE")
    if not accounts:
        raise ValueError("No active operator account.")
    project = cloud("projects", "describe", PROJECT)
    if str(project.get("projectNumber")) != args.project_number:
        raise ValueError("Supplied project number does not match the actual lab project.")
    services = cloud("services", "list", "--enabled")
    enabled = {item["config"]["name"] for item in services}
    if APIS - enabled:
        raise ValueError("Required APIs are disabled: " + ", ".join(sorted(APIS - enabled)))
    account = cloud("iam", "service-accounts", "describe", args.service_account)
    if account.get("disabled"):
        raise ValueError("Verification service account is disabled.")
    pools = cloud("iam", "workload-identity-pools", "list", "--location=global",
                  "--show-deleted")
    pool_name = provider_name(args.project_number, args.pool, args.provider).split("/providers/")[0]
    pool = next((item for item in pools if item["name"] == pool_name), None)
    providers = []
    if pool:
        if pool.get("state") != "ACTIVE" or pool.get("disabled", False):
            raise ValueError("Existing pool is disabled/deleted. Inspect it before proceeding.")
        providers = cloud("iam", "workload-identity-pools", "providers", "list",
                          "--location=global", f"--workload-identity-pool={args.pool}",
                          "--show-deleted")
    name = provider_name(args.project_number, args.pool, args.provider)
    if any(item["name"] != name for item in providers):
        raise ValueError("Pool must be dedicated to this provider. Another provider could spoof mapped attributes.")
    if providers:
        validate_provider(providers[0], name)
    policy = cloud("iam", "service-accounts", "get-iam-policy", args.service_account)
    return bool(pool), bool(providers), binding_present(
        policy, member_name(args.project_number, args.pool))


def mutation_commands(args, present=(False, False, False)):
    pool_exists, provider_exists, binding_exists = present
    name = provider_name(args.project_number, args.pool, args.provider)
    commands = []
    if not pool_exists:
        commands.append(["iam", "workload-identity-pools", "create", args.pool,
                         "--location=global", "--display-name=KitLoop GitHub verification"])
    if not provider_exists:
        commands.append([
            "iam", "workload-identity-pools", "providers", "create-oidc", args.provider,
            "--location=global", f"--workload-identity-pool={args.pool}",
            f"--issuer-uri={ISSUER}", f"--allowed-audiences={name}",
            "--attribute-mapping=" + ",".join(f"{k}={v}" for k, v in MAPPING.items()),
            f"--attribute-condition={CONDITION}",
        ])
    if not binding_exists:
        commands.append([
            "iam", "service-accounts", "add-iam-policy-binding", args.service_account,
            f"--role={ROLE}", f"--member={member_name(args.project_number, args.pool)}",
            "--condition=None",
        ])
    return commands


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["plan", "preflight", "apply", "verify"])
    parser.add_argument("--project-number", required=True)
    parser.add_argument("--pool", required=True)
    parser.add_argument("--provider", required=True)
    parser.add_argument("--service-account", required=True)
    args = parser.parse_args()
    validate_config(args.project_number, args.pool, args.provider, args.service_account)
    name = provider_name(args.project_number, args.pool, args.provider)
    if args.action == "plan":
        for command in mutation_commands(args):
            print(shlex.join(["gcloud", *command, f"--project={PROJECT}"]))
        print("Offline plan only. Inventory and IAM review are required before applying.")
        return
    present = inventory(args)
    print(json.dumps({"pool_exists": present[0], "provider_matches": present[1],
                      "impersonation_binding_exists": present[2]}, indent=2))
    if args.action == "verify" and not all(present):
        raise ValueError("WIF setup is incomplete.")
    if args.action == "apply":
        commands = mutation_commands(args, present)
        if commands:
            if not sys.stdin.isatty():
                raise ValueError("Apply requires an interactive terminal and explicit confirmation.")
            for command in commands:
                print(shlex.join(["gcloud", *command, f"--project={PROJECT}"]))
            expected = f"{PROJECT}/wif-apply"
            if input(f"Type {expected} to apply these changes: ") != expected:
                raise ValueError("Confirmation did not match.")
            for command in commands:
                cloud(*command, json_output=False)
            if not all(inventory(args)):
                raise ValueError("Post-apply verification incomplete. Inspect resources before retrying.")
        print("WIF configuration verified. This does not exercise token exchange.")
    print(f"WIF_PROVIDER={name}\nWIF_SERVICE_ACCOUNT={args.service_account}")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, RuntimeError, subprocess.CalledProcessError, OSError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        sys.exit(1)
