#!/usr/bin/env python3
"""Capture sanitized, read-only cloud/application evidence for issue #40."""
import argparse
import datetime as dt
import getpass
import hashlib
import http.cookiejar
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request

PROJECT = "lab-5-cloud-deployment-514310"
REGION = "asia-southeast1"
CONNECTION = f"{PROJECT}:{REGION}:kitloop-pg"
REGISTRY = f"{REGION}-docker.pkg.dev/{PROJECT}/kitloop/kitloop-app"
PHASES = ("baseline", "after-restart", "after-redeploy", "after-rollback", "after-rollforward")


class VerificationError(ValueError):
    """A safe, operator-facing diagnostic without raw API responses."""


def require(condition, message):
    if not condition:
        raise VerificationError(message)


def origin(value):
    url = urllib.parse.urlsplit(value)
    require(url.scheme == "https" and bool(url.hostname) and not url.username and not url.password
            and url.port in (None, 443) and url.path in ("", "/") and not url.query and not url.fragment,
            "Use the application's HTTPS origin without credentials, path or query.")
    return value.rstrip("/")


def cloud(*args):
    result = subprocess.run(["gcloud", *args, f"--project={PROJECT}", "--format=json"],
                            capture_output=True, text=True, check=False)
    require(result.returncode == 0, f"Read-only gcloud {' '.join(args[:3])} failed; check operator access.")
    return json.loads(result.stdout)


def serving_revision(service):
    traffic = [item for item in service.get("status", {}).get("traffic", []) if item.get("percent", 0) > 0]
    require(len(traffic) == 1 and traffic[0]["percent"] == 100,
            "Exactly one revision must serve 100% of traffic.")
    return traffic[0].get("revisionName", "")


def main_source(sha):
    request = urllib.request.Request(
        f"https://api.github.com/repos/gearstack-studio/kitloop/compare/{sha}...main",
        headers={"User-Agent": "KitLoop-Episode8"},
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        comparison = json.load(response)
    require(comparison.get("status") in ("identical", "ahead")
            and comparison.get("base_commit", {}).get("sha") == sha,
            "Source SHA must identify an actual commit in main's history.")


def snapshot(url, sha):
    require(bool(re.fullmatch(r"[0-9a-f]{40}", sha)), "Use a full 40-character source SHA.")
    main_source(sha)
    service = cloud("run", "services", "describe", "kitloop", f"--region={REGION}")
    revision = serving_revision(service)
    require(revision.startswith(f"kitloop-{sha[:12]}-"), "Serving revision does not match the source SHA prefix.")
    data = cloud("run", "revisions", "describe", revision, f"--region={REGION}")
    require(any(item.get("type") == "Ready" and item.get("status") == "True"
                for item in data.get("status", {}).get("conditions", [])), "Serving revision is not ready.")
    require(data.get("metadata", {}).get("labels", {}).get("serving.knative.dev/service") == "kitloop",
            "Revision belongs to an unexpected service.")
    containers = data.get("spec", {}).get("containers", [])
    require(len(containers) == 1, "Expected the combined KitLoop production container.")
    image = containers[0].get("image", "")
    require(bool(re.fullmatch(re.escape(REGISTRY) + r"@sha256:[0-9a-f]{64}", image)),
            "Serving image must be an immutable KitLoop application digest.")
    require([item.get("value") for item in containers[0].get("env", []) if item.get("name") == "APP_ORIGIN"] == [url],
            "Requested URL does not match the serving revision's APP_ORIGIN.")
    attached = data.get("metadata", {}).get("annotations", {}).get("run.googleapis.com/cloudsql-instances", "")
    require(CONNECTION in attached.split(","), "Revision does not attach the expected Cloud SQL instance.")
    artifact = cloud("artifacts", "docker", "images", "describe", f"{REGISTRY}:{sha[:12]}")
    require(artifact.get("image_summary", {}).get("fully_qualified_digest") == image,
            "Artifact Registry's source tag does not match the serving image digest.")
    sql = cloud("sql", "instances", "describe", "kitloop-pg")
    require(sql.get("state") == "RUNNABLE" and sql.get("connectionName") == CONNECTION,
            "Expected Cloud SQL instance is not RUNNABLE.")
    backups = cloud("sql", "backups", "list", "--instance=kitloop-pg")
    successful = [item for item in backups if item.get("status") == "SUCCESSFUL"]
    require(bool(successful), "No successful Cloud SQL backup found; review backup state before testing.")
    latest = max(successful, key=lambda item: item.get("endTime", ""))
    return {"url": url, "revision": revision, "revisionCreatedAt": data["metadata"]["creationTimestamp"],
            "imageDigest": image, "sourceSha": sha,
            "database": CONNECTION, "backupId": str(latest["id"]), "backupCompletedAt": latest.get("endTime")}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def application_record(url, record_id):
    jar = http.cookiejar.CookieJar()
    client = urllib.request.build_opener(NoRedirect(), urllib.request.HTTPCookieProcessor(jar))

    def request(path, body=None, csrf=None):
        headers = {"Origin": url, "Accept": "application/json"}
        if body is not None:
            headers["Content-Type"] = "application/json"
        if csrf:
            headers["X-CSRF-Token"] = csrf
        req = urllib.request.Request(url + path, None if body is None else json.dumps(body).encode(), headers)
        try:
            return client.open(req, timeout=20)
        except urllib.error.HTTPError as error:
            raise VerificationError(f"Application {path} returned HTTP {error.code}.") from None
        except urllib.error.URLError:
            raise VerificationError("Application connection failed.") from None

    for path in ("/", "/api/health", "/api/ready"):
        with request(path) as response:
            require(response.status == 200, "Public application and readiness must return HTTP 200.")
    require(sys.stdin.isatty(), "Run interactively. Credentials are prompted and never written to evidence.")
    username = input("Synthetic borrower username: ")
    password = getpass.getpass("Borrower password (hidden): ")
    csrf = None
    try:
        with request("/api/auth/login", {"username": username, "password": password}) as response:
            require(response.status == 200, "Login must return HTTP 200.")
            csrf = response.headers.get("X-CSRF-Token")
            require(bool(csrf), "Login did not return a CSRF token.")
        del password
        require(any(cookie.secure for cookie in jar), "Production login did not issue a Secure cookie.")
        with request("/api/auth/me") as response:
            require(json.load(response).get("role") == "BORROWER", "Use a synthetic borrower account.")
        with request("/api/requests/mine") as response:
            records = json.load(response)
        matches = [item for item in records if item.get("id") == record_id]
        require(len(matches) == 1, "The selected record is missing from this borrower's request history.")
        return matches[0]
    finally:
        if csrf:
            try:
                with request("/api/auth/logout", {}, csrf) as response:
                    require(response.status == 204, "Logout failed.")
            except ValueError:
                print("WARNING: logout failed; end the synthetic session through the UI.", file=sys.stderr)
        jar.clear()


def release_evidence(run_id, sha, created_at):
    require(bool(re.fullmatch(r"[1-9][0-9]*", run_id)), "Provide the real successful deployment run ID.")
    url = f"https://api.github.com/repos/gearstack-studio/kitloop/actions/runs/{run_id}"
    req = urllib.request.Request(url, headers={"User-Agent": "KitLoop-Episode8"})
    with urllib.request.urlopen(req, timeout=20) as response:
        data = json.load(response)
    require(data.get("conclusion") == "success" and data.get("head_branch") == "main"
            and data.get("event") == "push" and data.get("head_sha") == sha
            and data.get("path") == ".github/workflows/deploy.yml",
            "Deployment run must be a successful main push for the serving source SHA.")
    jobs_url = url + f"/attempts/{data['run_attempt']}/jobs?per_page=100"
    request = urllib.request.Request(jobs_url, headers={"User-Agent": "KitLoop-Episode8"})
    with urllib.request.urlopen(request, timeout=20) as response:
        jobs = json.load(response)
    deploy = [job for job in jobs["jobs"] if job.get("name") == "Approved Cloud Run release"]
    require(len(deploy) == 1 and deploy[0].get("conclusion") == "success",
            "Deployment job must have succeeded; a skipped deployment is not evidence.")
    required_steps = {"Build both immutable images", "Run checked-in database migrations",
                      "Deploy candidate, check readiness, then route traffic", "Verify serving revision and HTTP health"}
    passed = {step["name"] for step in deploy[0].get("steps", []) if step.get("conclusion") == "success"}
    require(required_steps <= passed, "Deployment run is missing successful build/migration/deploy/verify steps.")
    parse = lambda value: dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    require(parse(data["run_started_at"]) <= parse(created_at) <= parse(data["updated_at"]),
            "Serving revision was not created during the referenced deployment attempt.")
    return f"https://github.com/gearstack-studio/kitloop/actions/runs/{run_id}/attempts/{data['run_attempt']}"


def fingerprint(record):
    keys = ("id", "borrowerId", "assetId", "submittedAt", "status")
    require(all(isinstance(record.get(key), str) and record[key] for key in keys),
            "Request response is missing required persisted fields.")
    return hashlib.sha256(json.dumps({key: record[key] for key in keys}, sort_keys=True).encode()).hexdigest()


def compare(phase, current, history):
    if phase == "baseline":
        require(not history, "Baseline already exists; use a separate evidence directory for a new test.")
        return
    baseline = history.get("baseline")
    require(bool(baseline) and baseline.get("result") == "PASS", "Capture a passing baseline first.")
    for key in ("url", "database", "recordId", "recordFingerprint"):
        require(current[key] == baseline[key], f"Persistence mismatch in {key}.")
    if phase == "after-restart":
        require(current["revision"] != baseline["revision"], "Restart evidence needs a new serving revision/process.")
        require(current["imageDigest"] == baseline["imageDigest"] and current["sourceSha"] == baseline["sourceSha"],
                "The controlled restart must reuse the baseline image and source SHA.")
    elif phase == "after-redeploy":
        restart = history.get("after-restart")
        require(bool(restart), "Capture the restart check before the redeploy check.")
        require(current["revision"] not in (baseline["revision"], restart["revision"]),
                "Redeploy evidence needs another serving revision.")
        require(bool(current.get("releaseRun")), "Redeploy evidence requires a verified main deployment run.")
    elif phase == "after-rollback":
        require("after-redeploy" in history, "Verify the redeployment before rollback.")
        for key in ("revision", "imageDigest", "sourceSha"):
            require(current[key] == baseline[key], "Rollback must return to the recorded baseline revision.")
    else:
        require("after-rollback" in history and "after-redeploy" in history, "Verify rollback before roll-forward.")
        for key in ("revision", "imageDigest", "sourceSha"):
            require(current[key] == history["after-redeploy"][key], "Roll-forward must restore the recorded redeploy revision.")


def write_report(path, report):
    descriptor, temporary = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}-")
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as output:
            json.dump(report, output, indent=2)
            output.write("\n")
            output.flush()
            os.fsync(output.fileno())
        # Publish only a complete file. link() fails if evidence already exists.
        os.link(temporary, path)
    finally:
        os.unlink(temporary)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("phase", choices=PHASES)
    parser.add_argument("--url", required=True)
    parser.add_argument("--source-sha", required=True)
    parser.add_argument("--request-id", required=True)
    parser.add_argument("--evidence-dir", required=True, type=Path)
    parser.add_argument("--release-run")
    args = parser.parse_args()
    url = origin(args.url)
    require(bool(re.fullmatch(r"[0-9a-fA-F-]{36}", args.request_id)), "Use the synthetic request UUID shown in the UI.")
    directory = args.evidence_dir.resolve()
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / f"{args.phase}.json"
    require(not target.exists(), "This phase already has evidence; it will not be overwritten.")
    report = {"phase": args.phase, "recordId": args.request_id,
              "observedAt": dt.datetime.now(dt.timezone.utc).isoformat(), "result": "FAIL"}
    try:
        history = {phase: json.loads((directory / f"{phase}.json").read_text(encoding="utf-8"))
                   for phase in PHASES if (directory / f"{phase}.json").exists()}
        report.update(snapshot(url, args.source_sha))
        if args.phase == "after-redeploy":
            report["releaseRun"] = release_evidence(args.release_run or "", args.source_sha, report["revisionCreatedAt"])
        report["recordFingerprint"] = fingerprint(application_record(url, args.request_id))
        latest = cloud("run", "services", "describe", "kitloop", f"--region={REGION}")
        require(serving_revision(latest) == report["revision"], "Serving traffic changed during capture; retry this phase.")
        compare(args.phase, report, history)
        report["result"] = "PASS"
        write_report(target, report)
        print(f"PASS {args.phase}: record and cloud snapshot captured in {target}")
    except Exception:
        # Failure reports never contain exception text, API responses, passwords or cookies.
        report["result"] = "FAIL"
        write_report(directory / f"failed-{args.phase}-{os.urandom(4).hex()}.json", report)
        raise


if __name__ == "__main__":
    try:
        main()
    except VerificationError as error:
        print(f"FAIL: {error} No persistence PASS recorded for this attempt.", file=sys.stderr)
        sys.exit(1)
    except (ValueError, OSError, KeyError, TypeError, subprocess.SubprocessError):
        print("FAIL: verification did not complete; check URL, operator access, phase prerequisites and record availability."
              " No persistence PASS has been recorded for this attempt.", file=sys.stderr)
        sys.exit(1)
