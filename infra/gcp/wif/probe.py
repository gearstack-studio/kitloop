#!/usr/bin/env python3
"""Hosted denial probes against the existing WIF provider; tokens stay in memory."""
import argparse
import base64
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

from wif import validate_workflow_config

PROBE_REF = "refs/heads/feat/6-wif-integration"
STS = "https://sts.googleapis.com/v1/token"


def record(probe, result):
    message = f"PASS {probe}: {result}"
    print(message)
    with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as summary:
        summary.write(f"## Hosted WIF negative probe\n\n{message}\n\n")
        summary.write(f"Tested commit: {os.environ['GITHUB_SHA']}\n\n")
        summary.write(f"Ref: {os.environ['GITHUB_REF']}\n")


def run_probe(probe):
    if (os.environ.get("GITHUB_REF") != PROBE_REF
            or os.environ.get("GITHUB_EVENT_NAME") != "push"):
        raise ValueError("Denial probes must run on a feature-branch push.")
    if probe == "missing-oidc-permission":
        if any(os.environ.get(key) for key in
               ("ACTIONS_ID_TOKEN_REQUEST_URL", "ACTIONS_ID_TOKEN_REQUEST_TOKEN")):
            raise ValueError("Runner unexpectedly exposes OIDC request capability.")
        record(probe, "GitHub runner withheld OIDC request capability")
        return
    provider = os.environ.get("WIF_PROVIDER", "")
    validate_workflow_config(provider, os.environ.get("WIF_SERVICE_ACCOUNT", ""))
    audience = provider if probe == "untrusted-ref" else "https://example.invalid/kitloop-wif-denied"
    request_url = os.environ.get("ACTIONS_ID_TOKEN_REQUEST_URL")
    request_token = os.environ.get("ACTIONS_ID_TOKEN_REQUEST_TOKEN")
    if not request_url or not request_token:
        raise ValueError("OIDC request capability is missing; STS rejection was not exercised.")
    separator = "&" if "?" in request_url else "?"
    oidc_request = urllib.request.Request(
        request_url + separator + urllib.parse.urlencode({"audience": audience}),
        headers={"Authorization": "Bearer " + request_token},
    )
    try:
        with urllib.request.urlopen(oidc_request, timeout=30) as response:
            jwt = json.load(response)["value"]
    except (urllib.error.URLError, KeyError, ValueError):
        raise RuntimeError("GitHub OIDC issuance failed; no STS rejection evidence collected.") from None
    # Check context without logging the token. Google validates its signature during exchange.
    encoded = jwt.split(".")[1]
    claims = json.loads(base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)))
    if (claims.get("aud") != audience or claims.get("ref") != PROBE_REF
            or claims.get("event_name") != "push"):
        raise ValueError("Issued token claims do not match the requested negative probe.")
    body = {
        "audience": "//iam.googleapis.com/" + provider,
        "grantType": "urn:ietf:params:oauth:grant-type:token-exchange",
        "requestedTokenType": "urn:ietf:params:oauth:token-type:access_token",
        "subjectTokenType": "urn:ietf:params:oauth:token-type:jwt",
        "scope": "https://www.googleapis.com/auth/cloud-platform",
        "subjectToken": jwt,
    }
    exchange = urllib.request.Request(STS, json.dumps(body).encode(),
                                      {"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(exchange, timeout=30):
            raise RuntimeError("Unexpected successful STS exchange for an unauthorized identity.")
    except urllib.error.HTTPError as error:
        response = json.load(error)
        description = response.get("error_description", "").lower()
        code = response.get("error")
        if error.code not in (400, 403):
            raise RuntimeError("Unexpected STS HTTP failure; denial was not verified.") from None
        if probe == "untrusted-ref":
            expected = code in ("unauthorized_client", "invalid_grant") and "attribute condition" in description
            result = "Google STS rejected the signed feature-branch identity by attribute condition"
        else:
            expected = code == "invalid_grant" and "audience" in description
            result = "Google STS rejected the signed token's unauthorized audience"
        if not expected:
            safe_code = code if code in ("invalid_grant", "invalid_target", "unauthorized_client",
                                         "invalid_request", "access_denied") else "other"
            reason = "audience" if "audience" in description else "other"
            raise RuntimeError(f"STS denial mismatch (HTTP {error.code}, code {safe_code}, reason {reason}); "
                               f"expected {probe}.") from None
        record(probe, result)
    except urllib.error.URLError:
        raise RuntimeError("STS network request failed; no policy denial was verified.") from None


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("probe", choices=["untrusted-ref", "wrong-audience", "missing-oidc-permission"])
    try:
        run_probe(parser.parse_args().probe)
    except RuntimeError as error:
        print(f"FAIL: {error}", file=sys.stderr)
        sys.exit(1)
    except (ValueError, OSError, IndexError):
        # Network responses and tokens are deliberately excluded from diagnostic output.
        print("FAIL: hosted probe did not establish its expected denial; inspect the failed step and configuration.",
              file=sys.stderr)
        sys.exit(1)
