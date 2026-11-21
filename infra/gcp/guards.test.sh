#!/usr/bin/env bash
# Offline regression tests for the GCP release tooling. No cloud call is possible: a file-backed fake
# gcloud and curl on PATH record every invocation, while real jq evaluates Cloud Run v1-shaped JSON.
# State-changing actions run through a real pseudo-terminal (util-linux `script`) so the typed
# confirmation is exercised. Requires bash, jq, script and sha256sum (Linux, Cloud Shell or CI).
# Fake ID tokens are unsigned JWT-shaped strings with real aud/email claims, so the fake Cloud Run can
# reject a service-account token whose audience is not the canonical service URL.
set -euo pipefail
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
for tool in jq script sha256sum git base64; do
  command -v "$tool" >/dev/null 2>&1 || { printf 'FAIL: %s is required (run on Linux, Cloud Shell or CI)\n' "$tool" >&2; exit 1; }
done
# Manual-mode tests must not inherit a CI runner's automated-release or credential settings.
unset KITLOOP_AUTOMATED_RELEASE DEPLOY_SERVICE_ACCOUNT GOOGLE_APPLICATION_CREDENTIALS CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE

PROJECT=lab-5-cloud-deployment-514310
ORIGIN=https://kitloop-123456789012.asia-southeast1.run.app
DEPLOY_SA="kitloop-wif-deploy@$PROJECT.iam.gserviceaccount.com"
export FAKE_SHA_SUFFIX=0000000000000000000000000000
SHA1="0123456789ab$FAKE_SHA_SUFFIX" SHA2="111111111111$FAKE_SHA_SUFFIX" SHA3="222222222222$FAKE_SHA_SUFFIX"
SHA4="333333333333$FAKE_SHA_SUFFIX" SHA5="444444444444$FAKE_SHA_SUFFIX" SHA6="555555555555$FAKE_SHA_SUFFIX"
work="$(mktemp -d)"
trap 'rm -rf -- "$work"' EXIT
mkdir -p "$work/bin"
export FAKE_STATE="$work/state" FAKE_LOG="$work/calls.log" FAKE_ORIGIN="$ORIGIN" FAKE_DEPLOY_SA="$DEPLOY_SA"
export PATH="$work/bin:$PATH" SHELL=/bin/bash

# fake-jwt AUDIENCE EMAIL [EXP_OFFSET_SECONDS]: unsigned Google-shaped ID token. The signature segment is a
# sentinel so the suite can prove tokens never reach output or command-line arguments.
cat >"$work/bin/fake-jwt" <<'FAKE'
#!/usr/bin/env bash
set -euo pipefail
b64url() { base64 -w0 | tr '+/' '-_' | tr -d '='; }
now="$(date +%s)"
header="$(printf '%s' '{"alg":"RS256","kid":"fake","typ":"JWT"}' | b64url)"
payload="$(jq -cn --arg aud "$1" --arg email "$2" --argjson now "$now" --argjson offset "${3:-3600}" '
  {iss:"https://accounts.google.com", aud:$aud, azp:$email, email:$email, email_verified:true,
   iat:$now, exp:($now + $offset), sub:"100000000000000000001"}' | b64url)"
printf '%s.%s.FAKESIGSENTINEL\n' "$header" "$payload"
FAKE
# fake-jwt-claims TOKEN: prints the decoded payload, or nothing for a malformed token.
cat >"$work/bin/fake-jwt-claims" <<'FAKE'
#!/usr/bin/env bash
IFS=. read -r _ p _ <<<"${1:-}"
p="${p//-/+}"; p="${p//_//}"
case $(( ${#p} % 4 )) in 2) p+='==' ;; 3) p+='=' ;; esac
base64 -d <<<"$p" 2>/dev/null || true
FAKE

cat >"$work/bin/gcloud" <<'FAKE'
#!/usr/bin/env bash
# Fake gcloud: deterministic, file-backed and offline.
set -euo pipefail
S="$FAKE_STATE"
printf 'gcloud %s\n' "$*" >>"$FAKE_LOG"
ARGS=("$@")
arg() { local a; for a in "${ARGS[@]}"; do [[ "$a" == "--$1="* ]] && { printf '%s' "${a#*=}"; return 0; }; done; return 1; }
has() { local a; for a in "${ARGS[@]}"; do [[ "$a" == "--$1" ]] && return 0; done; return 1; }
fail() { printf 'ERROR: (gcloud) %s\n' "$*" >&2; exit 1; }
stamp() { date -u +%Y-%m-%dT%H:%M:%SZ; }
svc() { jq "$@" "$S/service.json" >"$S/tmp.json" && mv "$S/tmp.json" "$S/service.json"; }
case "$1 $2" in
  'config get-value') cat "$S/project" ;;
  'auth list') echo operator@example.invalid ;;
  'auth print-identity-token')
    # A Cloud Shell user account gets a gcloud-audience user token, which Cloud Run accepts. From WIF
    # external-account credentials this command sets no Cloud Run audience, so Cloud Run rejects the token.
    if [[ -n "${CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE:-}" ]]; then
      fake-jwt 32555940559.apps.googleusercontent.com "$FAKE_DEPLOY_SA"
    else
      fake-jwt 32555940559.apps.googleusercontent.com operator@example.invalid
    fi ;;
  'auth print-access-token')
    # External-account credentials: STS exchange, then generateAccessToken for the impersonated account.
    creds="${CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE:-}"
    [[ -n "$creds" && -r "$creds" ]] || fail 'You do not currently have an active account selected.'
    [[ ! -f "$S/access-fail" ]] || fail 'There was a problem refreshing auth tokens: STS token exchange was denied.'
    sa="$(jq -r '(.service_account_impersonation_url // "")
      | capture("/serviceAccounts/(?<sa>[^:/]+):generateAccessToken$").sa // empty' "$creds")"
    [[ -n "$sa" ]] || fail 'The external account does not impersonate a service account.'
    printf 'ya29.FAKEACCESSSENTINEL-%s\n' "$sa" ;;
  'projects describe') echo 123456789012 ;;
  'projects remove-iam-policy-binding'|'secrets remove-iam-policy-binding') echo "$*" >>"$S/revoked" ;;
  'artifacts docker')
    [[ "$3 $4" == 'images describe' ]] || fail "unexpected: $*"
    printf '%s@sha256:%s\n' "${5%:*}" "$(printf '%s' "$5" | sha256sum | cut -c1-64)" ;;
  'sql instances')
    case "$3" in
      describe)
        if [[ "$(arg format)" == json ]]; then
          jq --arg ip PRIVATE '{name:"kitloop-pg",state:"RUNNABLE",ipAddresses:[{type:$ip}],settings:{userLabels:.}}' "$S/sql-labels.json"
        else echo RUNNABLE; fi ;;
      patch)
        kv="$(arg update-labels)"
        jq --arg k "${kv%%=*}" --arg v "${kv#*=}" '.[$k] = $v' "$S/sql-labels.json" >"$S/tmp.json"
        mv "$S/tmp.json" "$S/sql-labels.json" ;;
      *) fail "unexpected: $*" ;;
    esac ;;
  'run jobs')
    job="${4:-}"
    case "$3" in
      deploy)
        arg image >"$S/jobs/$job.image"
        { arg command || true; } >"$S/jobs/$job.command"; { arg args || true; } >"$S/jobs/$job.args" ;;
      delete) rm -f "$S/jobs/$job."* ;;
      list)
        [[ ! -f "$S/jobs-list-fail" ]] || fail 'Jobs could not be listed.'
        for f in "$S"/jobs/*.image; do [[ -e "$f" ]] && basename "$f" .image; done; true ;;
      describe) [[ -f "$S/jobs/$job.image" ]] || fail "Cannot find job [$job]."; cat "$S/jobs/$job.latest" 2>/dev/null || true ;;
      execute)
        [[ -f "$S/jobs/$job.image" ]] || fail "Cannot find job [$job]."
        n=$(( $(cat "$S/jobs/$job.count" 2>/dev/null || echo 0) + 1 )); echo "$n" >"$S/jobs/$job.count"
        name="$job-x$n"; echo "$name" >"$S/jobs/$job.latest"
        outcome="$(cat "$S/jobs/$job.outcome" 2>/dev/null || echo success)"
        if [[ "$job" == kitloop-rollback-check ]]; then
          # Models lifecycle-cli rollback-check --require-zero against the fake database: exit 0 only for zero rows.
          [[ ! -f "$S/rollback-check-unavailable" ]] || fail "Execution [$name] could not start: Cloud SQL connection failed."
          [[ "$(cat "$S/db-lifecycle-rows" 2>/dev/null || echo 0)" == 0 ]] || outcome=failed
          if [[ -f "$S/rollback-check-malformed" ]]; then printf '{"status": {"succeededCount": 1' >"$S/executions/$name.json"; exit 0; fi
        fi
        jq -n --arg name "$name" --arg job "$job" --arg image "$(cat "$S/jobs/$job.image")" --arg t "$(stamp)" --arg outcome "$outcome" \
          --arg command "$(cat "$S/jobs/$job.command" 2>/dev/null)" --arg args "$(cat "$S/jobs/$job.args" 2>/dev/null)" '
          {apiVersion:"run.googleapis.com/v1", kind:"Execution",
           metadata:{name:$name, namespace:"123456789012", labels:{"run.googleapis.com/job":$job}},
           spec:{parallelism:1, taskCount:1,
                 template:{spec:{containers:[{image:$image} +
                   (if $command == "" then {} else {command:($command | split(","))} end) +
                   (if $args == "" then {} else {args:($args | split(","))} end)], maxRetries:0, timeoutSeconds:"600"}}},
           status:({observedGeneration:1, startTime:$t, completionTime:$t} +
             (if $outcome == "success"
              then {succeededCount:1, conditions:[{type:"Completed", status:"True"}]}
              else {failedCount:1, conditions:[{type:"Completed", status:"False", reason:"ContainerError"}]} end))}
        ' >"$S/executions/$name.json"
        [[ "$outcome" == success ]] || fail "Execution [$name] failed." ;;
      executions) [[ -f "$S/executions/$5.json" ]] || fail "no execution $5"; cat "$S/executions/$5.json" ;;
      *) fail "unexpected: $*" ;;
    esac ;;
  'run revisions')
    [[ "$3" == describe && -f "$S/revisions/$4.json" ]] || fail "Cannot find revision [${4:-}]."
    cat "$S/revisions/$4.json" ;;
  'run deploy')
    [[ "$3" == kitloop ]] || fail "unexpected service $3"
    revision="kitloop-$(arg revision-suffix)"
    [[ ! -f "$S/revisions/$revision.json" ]] || fail "Revision $revision already exists."
    ready=True; [[ ! -f "$S/next-revision-unready" ]] || ready=False
    jq -n --arg r "$revision" --arg image "$(arg image)" --arg env "$(arg set-env-vars)" --arg ready "$ready" '
      {apiVersion:"serving.knative.dev/v1", kind:"Revision",
       metadata:{name:$r, labels:{"serving.knative.dev/service":"kitloop"}},
       spec:{containers:[{image:$image,
         env:($env | split(",") | map(index("=") as $i | {name:.[:$i], value:.[$i+1:]}))}]},
       status:{conditions:[{type:"Ready", status:$ready}]}}' >"$S/revisions/$revision.json"
    [[ "$ready" == True ]] || fail "Revision $revision is not ready."
    if [[ ! -f "$S/service.json" ]]; then
      ! has no-traffic || fail '--no-traffic not supported when creating a new service.'
      has no-allow-unauthenticated || has allow-unauthenticated || fail 'Would prompt: allow unauthenticated invocations?'
      ! has allow-unauthenticated || touch "$S/public"
      jq -n --arg r "$revision" '
        {metadata:{name:"kitloop", annotations:{"run.googleapis.com/urls":
           ("[\"https://kitloop-123456789012.asia-southeast1.run.app\",\"https://kitloop-abc123xyz-as.a.run.app\"]")}},
         status:{url:"https://kitloop-abc123xyz-as.a.run.app", latestReadyRevisionName:$r, latestCreatedRevisionName:$r,
                 traffic:[{revisionName:$r, percent:100, latestRevision:true}]}}' >"$S/service.json"
    else
      ! has no-allow-unauthenticated || rm -f "$S/public"   # real gcloud removes allUsers here
      ! has allow-unauthenticated || touch "$S/public"
      svc --arg r "$revision" '.status.latestReadyRevisionName = $r | .status.latestCreatedRevisionName = $r'
      if has no-traffic; then
        if tag="$(arg tag)"; then
          svc --arg r "$revision" --arg tag "$tag" '.status.traffic = ([.status.traffic[] | select(.tag != $tag)] +
            [{revisionName:$r, percent:0, tag:$tag, url:("https://" + $tag + "---kitloop-abc123xyz-as.a.run.app")}])'
        fi
      elif jq -e 'any(.status.traffic[]; .latestRevision == true)' "$S/service.json" >/dev/null; then
        svc --arg r "$revision" '.status.traffic = [{revisionName:$r, percent:100, latestRevision:true}]'
      fi
    fi ;;
  'run services')
    case "$3" in
      list) [[ ! -f "$S/service.json" ]] || echo kitloop ;;
      describe) [[ -f "$S/service.json" ]] || fail 'Cannot find service [kitloop].'; cat "$S/service.json" ;;
      get-iam-policy)
        if [[ -f "$S/public" ]]; then echo '{"bindings":[{"role":"roles/run.invoker","members":["allUsers"]}]}'; else echo '{}'; fi ;;
      add-iam-policy-binding) [[ "$(arg member)" == allUsers ]] && touch "$S/public" ;;
      remove-iam-policy-binding) rm -f "$S/public" ;;
      update-traffic)
        if remove="$(arg remove-tags)"; then   # removes a tag URL; percentages are unchanged
          svc --arg tag "$remove" '.status.traffic |= map(select(.tag != $tag))'; exit 0
        fi
        target="$(arg to-revisions)"; target="${target%=100}"
        [[ -f "$S/revisions/$target.json" ]] || fail "Revision $target not found."
        svc --arg r "$target" '.status.traffic = ([{revisionName:$r, percent:100}] +
          [.status.traffic[] | select(.tag != null) | .percent = 0])' ;;
      *) fail "unexpected: $*" ;;
    esac ;;
  *) printf 'UNEXPECTED CLOUD CALL: %s\n' "$*" >&2; exit 99 ;;
esac
FAKE

cat >"$work/bin/curl" <<'FAKE'
#!/usr/bin/env bash
# Fake curl. Tokens are read from stdin (--header @-) and are never logged.
# IAM Credentials: requires the deployment account's impersonated access token, the deployment account as
# target and a non-empty audience, then answers according to $FAKE_STATE/iam-mode (default ok).
# Cloud Run: 503 if the URL matches curl-fail; 403 without a token on a private service; 401 for a
# service-account token whose audience is not the canonical service URL (candidate tag URLs included).
args=("$@") url="${*: -1}" auth=no header='' bearer='' data=''
for ((i = 0; i < ${#args[@]}; i++)); do
  case "${args[i]}" in
    @-) IFS= read -r header || true ;;
    --data-binary) data="${args[i + 1]:-}" ;;
  esac
done
[[ "$header" != 'Authorization: Bearer '* ]] || { auth=yes; bearer="${header#Authorization: Bearer }"; }
http_error() { printf 'curl: (22) The requested URL returned error: %s\n' "$1" >&2; exit 22; }
if [[ "$url" == https://iamcredentials.googleapis.com/* ]]; then
  target="${url#*/serviceAccounts/}" method="${url##*:}"
  target="${target%:*}"
  audience="$(jq -r '.audience // ""' <<<"$data" 2>/dev/null || true)"
  printf 'curl iam %s sa=%s audience=%s\n' "$method" "$target" "$audience" >>"$FAKE_LOG"
  [[ "$method" == generateIdToken ]] || http_error 404
  [[ "$bearer" == "ya29.FAKEACCESSSENTINEL-$FAKE_DEPLOY_SA" ]] || http_error 401
  [[ "$target" == "$FAKE_DEPLOY_SA" ]] || http_error 403
  [[ -n "$audience" ]] || http_error 400
  token_for() { jq -cn --arg t "$(fake-jwt "$@")" '{token: $t}'; }
  case "$(cat "$FAKE_STATE/iam-mode" 2>/dev/null || echo ok)" in
    ok) token_for "$audience" "$target" ;;
    denied) http_error 403 ;;                     # missing iam.serviceAccounts.getOpenIdToken
    unavailable) http_error 503 ;;
    empty) echo '{}' ;;
    blank) echo '{"token":""}' ;;
    garbage) echo '<html>upstream proxy error</html>' ;;
    malformed) echo '{"token":"not-a-jwt"}' ;;
    wrong-audience) token_for "https://candidate---kitloop-abc123xyz-as.a.run.app" "$target" ;;
    wrong-account) token_for "$audience" "kitloop-run@lab-5-cloud-deployment-514310.iam.gserviceaccount.com" ;;
    expired) token_for "$audience" "$target" -60 ;;
    *) http_error 500 ;;
  esac
  exit 0
fi
printf 'curl auth=%s %s\n' "$auth" "$url" >>"$FAKE_LOG"
status=200
if [[ -f "$FAKE_STATE/curl-fail" ]] && grep -qF -f "$FAKE_STATE/curl-fail" <<<"$url"; then status=503
elif [[ "$auth" == no ]]; then [[ -f "$FAKE_STATE/public" ]] || status=403
else
  claims="$(fake-jwt-claims "$bearer")"
  [[ -n "$claims" ]] || claims='{}'
  aud="$(jq -r '.aud // ""' <<<"$claims" 2>/dev/null || true)"
  email="$(jq -r '.email // ""' <<<"$claims" 2>/dev/null || true)"
  printf 'cloudrun aud=%s email=%s url=%s\n' "$aud" "$email" "$url" >>"$FAKE_LOG"
  if [[ "$email" == *.gserviceaccount.com ]]; then
    [[ "$aud" == "$FAKE_ORIGIN" ]] || status=401
  elif [[ "$aud" != 32555940559.apps.googleusercontent.com || -z "$email" ]]; then
    status=401
  fi
fi
if [[ "$url" == */api/version ]]; then
  [[ "$status" == 200 ]] || http_error "$status"
  if [[ -f "$FAKE_STATE/version-override" ]]; then
    commit="$(cat "$FAKE_STATE/version-override")"
  else
    revision="$(jq -r --arg base "${url%/api/version}" '
      .status.traffic[] | select(.url == $base or (.percent > 0 and .url == null)) | .revisionName
    ' "$FAKE_STATE/service.json" | tail -n1)"
    prefix="${revision#kitloop-}"
    commit="${prefix:0:12}$FAKE_SHA_SUFFIX"
  fi
  jq -cn --arg commit "$commit" '{commit: $commit}'
else
  printf '%s' "$status"
fi
FAKE
chmod +x "$work/bin/gcloud" "$work/bin/curl" "$work/bin/fake-jwt" "$work/bin/fake-jwt-claims"

reset_state() {
  rm -rf -- "$FAKE_STATE"
  mkdir -p "$FAKE_STATE/jobs" "$FAKE_STATE/executions" "$FAKE_STATE/revisions"
  echo "$PROJECT" >"$FAKE_STATE/project"
  echo '{}' >"$FAKE_STATE/sql-labels.json"
  : >"$FAKE_LOG"
}
fail_test() {
  printf 'FAIL: %s\n--- output ---\n%s\n--- calls ---\n' "$1" "$OUT" >&2
  cat "$FAKE_LOG" >&2
  exit 1
}
pass() { printf 'PASS: %s\n' "$1"; }
# run ANSWER|- COMMAND...: '-' runs without a terminal; otherwise ANSWER is typed into a pseudo-terminal.
run() {
  local answer="$1" cmd
  shift
  : >"$FAKE_LOG"
  set +e
  if [[ "$answer" == - ]]; then
    OUT="$("$@" </dev/null 2>&1)"
  else
    printf -v cmd '%q ' "$@"
    OUT="$(printf '%s\n' "$answer" | script -qec "$cmd" /dev/null 2>&1)"
  fi
  RC=$?
  set -e
}
release() { local action="$1"; run "$PROJECT/$action" bash "$script_dir/release.sh" "$@"; }
ok() { [[ $RC -eq 0 ]] || fail_test "$1 (exit $RC)"; }
refused() { [[ $RC -ne 0 ]] || fail_test "$1 (unexpected success)"; }
out_has() { [[ "$OUT" == *"$1"* ]] || fail_test "$2"; }
log_has() { grep -qF -- "$1" "$FAKE_LOG" || fail_test "$2"; }
log_lacks() { ! grep -qF -- "$1" "$FAKE_LOG" || fail_test "$2"; }
serving() { jq -r '[.status.traffic[] | select(.percent > 0) | "\(.revisionName)=\(.percent)"] | join(",")' "$FAKE_STATE/service.json"; }
revision_for() { local sha="$1"; jq -r --arg prefix "${sha:0:12}" '.status.traffic[] | select(.revisionName | startswith("kitloop-" + $prefix + "-")) | .revisionName' \
  "$FAKE_STATE/service.json" | head -n1; }

# --- Mutation guards ---------------------------------------------------------------------------------
reset_state
run - bash "$script_dir/prepare.sh" registry
refused 'noninteractive prepare'; out_has 'interactive terminal' 'noninteractive mutation was not refused'
log_lacks 'repositories create' 'noninteractive run reached a cloud mutation'
pass 'noninteractive mutation is refused'

echo wrong-project >"$FAKE_STATE/project"
run - bash "$script_dir/prepare.sh" registry
refused 'wrong project'; out_has 'Active gcloud project is not' 'wrong project was not refused'
log_lacks 'repositories create' 'wrong project reached a cloud mutation'
echo "$PROJECT" >"$FAKE_STATE/project"
pass 'wrong active project is refused'

run "$PROJECT/registry-typo" bash "$script_dir/prepare.sh" registry
refused 'mismatched confirmation'; out_has 'Confirmation did not match' 'mismatched confirmation was accepted'
log_lacks 'repositories create' 'mismatched confirmation reached a cloud mutation'
pass 'mismatched typed confirmation is refused'

# --- First production release in the documented order ---------------------------------------------
release deploy "$SHA1"
refused 'deploy before migration'; out_has 'kitloop-migrate' 'deploy without migration was not refused'
log_lacks 'gcloud run deploy' 'deploy without migration reached Cloud Run'

release migrate "$SHA1"
ok 'first migration'; out_has 'Verified completed kitloop-migrate execution' 'migration was not verified'
log_has 'run jobs deploy kitloop-migrate' 'migration job was not deployed'; log_has "--command= --args=" 'migration entrypoint override not reset'

release deploy "$SHA1"
refused 'deploy before bootstrap'; out_has 'No verified production bootstrap' 'first deploy without bootstrap was not refused'
log_lacks 'gcloud run deploy' 'deploy without bootstrap reached Cloud Run'
pass 'first deployment requires migration and a verified bootstrap'

echo failed >"$FAKE_STATE/jobs/kitloop-bootstrap.outcome"
release bootstrap "$SHA1"
refused 'failed bootstrap'; log_lacks 'sql instances patch' 'failed bootstrap was recorded'
[[ "$(jq -r '.kitloop_bootstrap // ""' "$FAKE_STATE/sql-labels.json")" == '' ]] || fail_test 'failed bootstrap left a record'
release deploy "$SHA1"
refused 'deploy after failed bootstrap'; log_lacks 'gcloud run deploy' 'deploy after failed bootstrap reached Cloud Run'
pass 'failed bootstrap is not recorded and still blocks deployment'

rm -f "$FAKE_STATE/jobs/kitloop-bootstrap.outcome"
release bootstrap "$SHA1"
ok 'bootstrap'; log_has '--args=dist/bootstrap-cli.js' 'bootstrap did not use the production CLI'
log_has 'BOOTSTRAP_INPUT=kitloop-bootstrap-input:1' 'bootstrap did not receive BOOTSTRAP_INPUT'
[[ "$(jq -r '.kitloop_bootstrap' "$FAKE_STATE/sql-labels.json")" == kitloop-bootstrap-x2 ]] || fail_test 'bootstrap execution was not recorded'
pass 'verified bootstrap execution is recorded on Cloud SQL'

# README order: revoke manifest access and delete the one-time job before deploying.
run "$PROJECT/bootstrap-revoke" bash "$script_dir/prepare.sh" bootstrap-revoke
ok 'bootstrap-revoke'; [[ -s "$FAKE_STATE/revoked" ]] || fail_test 'bootstrap access was not revoked'
gcloud run jobs delete kitloop-bootstrap --project="$PROJECT" --region=asia-southeast1 >/dev/null

release deploy "$SHA1"
ok 'first deploy after documented bootstrap cleanup'
log_has '--no-allow-unauthenticated' 'first deploy was not private'
log_has "APP_ORIGIN=$ORIGIN," 'first deploy did not use the canonical origin'
log_lacks 'placeholder' 'a placeholder origin was used'; log_lacks 'kitloop-bootstrap' 'deploy depended on the bootstrap job'
log_lacks 'run services update ' 'first deploy created an extra env-only revision'
[[ ! -f "$FAKE_STATE/public" ]] || fail_test 'first deploy made the service public'
first="$(revision_for "$SHA1")"; [[ "$(serving)" == "$first=100" ]] || fail_test "unexpected traffic $(serving)"
pass 'first deployment works after bootstrap job deletion, private, canonical APP_ORIGIN'

run - bash "$script_dir/verify.sh" public
refused 'public verify while private'; out_has 'HTTP 403' 'private service passed public checks'
run - bash "$script_dir/verify.sh" private
ok 'private verify'; out_has "Serving revision: $first (100%)" 'serving revision not reported'
log_has "curl auth=yes $ORIGIN/api/ready" 'private readiness not checked on canonical URL'
log_has 'auth print-identity-token' 'manual private check no longer uses the operator identity token'
log_lacks 'curl iam ' 'manual private check called IAM Credentials'
log_has "cloudrun aud=32555940559.apps.googleusercontent.com email=operator@example.invalid url=$ORIGIN/api/ready" \
  'manual private check did not send the operator token'
release publish
ok 'publish'; [[ -f "$FAKE_STATE/public" ]] || fail_test 'publish did not grant public access'
log_has "curl auth=no $ORIGIN/api/ready" 'public readiness was not checked'
pass 'verify reports serving revision; publish grants access only after private checks'

# --- Subsequent releases ---------------------------------------------------------------------------
release migrate "$SHA2"; ok 'second migration'
release deploy "$SHA2"
ok 'second deploy'
second="$(revision_for "$SHA2")"
log_has '--no-traffic' 'new revision received traffic before checks'; log_has "--tag=candidate" 'candidate tag missing'
log_lacks 'allow-unauthenticated' 'redeploy changed invoker settings'; log_lacks 'remove-iam-policy-binding' 'redeploy removed access'
log_lacks 'kitloop-bootstrap' 'subsequent release required bootstrap'; log_lacks 'placeholder' 'a placeholder origin was used'
check_line="$(grep -n 'curl auth=yes https://candidate---' "$FAKE_LOG" | tail -n1 | cut -d: -f1 || true)"
route_line="$(grep -n 'update-traffic' "$FAKE_LOG" | head -n1 | cut -d: -f1 || true)"
[[ -n "$check_line" && -n "$route_line" && "$check_line" -lt "$route_line" ]] || fail_test 'traffic moved before candidate checks'
log_has 'auth print-identity-token' 'manual candidate check no longer uses the operator identity token'
log_lacks 'curl iam ' 'manual candidate check called IAM Credentials'
[[ -f "$FAKE_STATE/public" ]] || fail_test 'redeploy removed public access'
[[ "$(serving)" == "$second=100" ]] || fail_test "unexpected traffic $(serving)"
jq -e --arg o "$ORIGIN" '.spec.containers[0].env | any(.name == "APP_ORIGIN" and .value == $o)' \
  "$FAKE_STATE/revisions/$second.json" >/dev/null || fail_test 'new revision has the wrong APP_ORIGIN'
pass 'subsequent release: no bootstrap, public access preserved, traffic moved only after candidate checks'

release migrate "$SHA3"; ok 'third migration'
echo 'https://candidate---' >"$FAKE_STATE/curl-fail"
release deploy "$SHA3"
refused 'candidate failing readiness'; out_has 'traffic was not changed' 'failed candidate message missing'
log_lacks 'update-traffic' 'failed candidate received traffic'
[[ "$(serving)" == "$second=100" && -f "$FAKE_STATE/public" ]] || fail_test 'failed candidate changed traffic or access'
rm -f "$FAKE_STATE/curl-fail"
pass 'failed candidate never receives traffic; previous revision keeps serving'

rm -f "$FAKE_STATE/revisions/kitloop-${SHA3:0:12}-"*.json
echo "$SHA2" >"$FAKE_STATE/version-override"
release deploy "$SHA3"
refused 'candidate reporting a different commit'
out_has "did not report expected commit $SHA3" 'candidate SHA mismatch was not reported'
log_lacks 'update-traffic' 'candidate with the wrong SHA received traffic'
[[ "$(serving)" == "$second=100" ]] || fail_test 'candidate SHA mismatch changed traffic'
rm -f "$FAKE_STATE/version-override"
pass 'candidate SHA mismatch leaves the previous revision serving'

# --- Migration gates -------------------------------------------------------------------------------
echo failed >"$FAKE_STATE/jobs/kitloop-migrate.outcome"
release migrate "$SHA4"
refused 'failed migration'
release deploy "$SHA4"
refused 'deploy after failed migration'; out_has 'did not complete successfully' 'failed migration did not stop deploy'
log_lacks 'gcloud run deploy' 'failed migration reached Cloud Run'
rm -f "$FAKE_STATE/jobs/kitloop-migrate.outcome"
release migrate "$SHA4"; ok 'fourth migration'
release deploy "$SHA2"
refused 'deploy with another commit migration'; log_lacks 'gcloud run deploy' 'mismatched migration digest reached Cloud Run'
latest="$(cat "$FAKE_STATE/jobs/kitloop-migrate.latest")"
jq 'del(.status.completionTime, .status.succeededCount) | .status.conditions = [{type:"Completed", status:"Unknown"}]' \
  "$FAKE_STATE/executions/$latest.json" >"$work/running.json"
cp "$FAKE_STATE/executions/$latest.json" "$work/completed.json"; cp "$work/running.json" "$FAKE_STATE/executions/$latest.json"
release deploy "$SHA4"
refused 'deploy while migration still running'; log_lacks 'gcloud run deploy' 'running migration reached Cloud Run'
cp "$work/completed.json" "$FAKE_STATE/executions/$latest.json"
pass 'failed, mismatched and incomplete migrations stop deployment'

# --- Rollback and later redeploy ------------------------------------------------------------------
release rollback "$first"
ok 'rollback'; [[ "$(serving)" == "$first=100" ]] || fail_test "rollback traffic $(serving)"
out_has "Serving revision: $first (100%)" 'rollback did not report the serving revision'
jq '.spec.containers[0].env |= map(if .name == "APP_ORIGIN" then .value = "https://placeholder.invalid" else . end) |
  .metadata.name = "kitloop-unsafe-1"' "$FAKE_STATE/revisions/$second.json" >"$FAKE_STATE/revisions/kitloop-unsafe-1.json"
release rollback kitloop-unsafe-1
refused 'unsafe rollback'; out_has 'is not a ready kitloop revision' 'unsafe APP_ORIGIN revision was accepted'
log_lacks 'update-traffic' 'unsafe rollback changed traffic'
release rollback kitloop-missing-1
refused 'missing rollback target'; log_lacks 'update-traffic' 'missing rollback target changed traffic'
[[ "$(serving)" == "$first=100" ]] || fail_test 'rejected rollback changed traffic'
pass 'rollback rejects unsafe or missing revisions and reports actual traffic'

release deploy "$SHA4"
ok 'deploy after rollback pin'; [[ "$(serving)" == "$(revision_for "$SHA4")=100" ]] || fail_test "deploy left traffic pinned: $(serving)"
[[ -f "$FAKE_STATE/public" ]] || fail_test 'deploy after rollback removed public access'
pass 'a later deployment moves traffic away from a rollback-pinned revision'

# --- Automated GitHub WIF release: Cloud Run ID token through IAM Credentials ----------------------
# deploy.yml runs release.sh with KITLOOP_AUTOMATED_RELEASE=1 and the external_account credential file
# written by google-github-actions/auth. A disposable clean checkout satisfies the trusted-context guard.
fourth="$(revision_for "$SHA4")"
trusted="$work/trusted"
git init -q -b main "$trusted"
git -C "$trusted" -c user.name=test -c user.email=test@example.invalid commit -q --allow-empty -m release
git -C "$trusted" update-ref refs/remotes/origin/main "$(git -C "$trusted" rev-parse HEAD)"
# write_creds FILE SERVICE_ACCOUNT: the shape google-github-actions/auth writes (no real secret inside).
write_creds() {
  jq -n --arg sa "$2" '{type:"external_account",
    audience:"//iam.googleapis.com/projects/610347790049/locations/global/workloadIdentityPools/kitloop-github-deploy/providers/github",
    subject_token_type:"urn:ietf:params:oauth:token-type:jwt", token_url:"https://sts.googleapis.com/v1/token",
    service_account_impersonation_url:("https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/" + $sa + ":generateAccessToken"),
    credential_source:{url:"https://pipelines.actions.example.invalid/idtoken",
      headers:{Authorization:"Bearer FAKEGHAREQUESTSENTINEL"}, format:{type:"json", subject_token_field_name:"value"}}}' >"$1"
}
creds="$work/gha-creds.json"
write_creds "$creds" "$DEPLOY_SA"
write_creds "$work/other-creds.json" "kitloop-run@$PROJECT.iam.gserviceaccount.com"
auto_env=(KITLOOP_AUTOMATED_RELEASE=1 GITHUB_ACTIONS=true GITHUB_EVENT_NAME=push
  GITHUB_REPOSITORY=gearstack-studio/kitloop GITHUB_REPOSITORY_ID=1442734708 GITHUB_REPOSITORY_OWNER_ID=351405823
  GITHUB_REF=refs/heads/main GITHUB_REF_PROTECTED=true
  GITHUB_WORKFLOW_REF=gearstack-studio/kitloop/.github/workflows/deploy.yml@refs/heads/main
  "GITHUB_SHA=$(git -C "$trusted" rev-parse HEAD)" "DEPLOY_SERVICE_ACCOUNT=$DEPLOY_SA"
  "GOOGLE_APPLICATION_CREDENTIALS=$creds" "CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE=$creds")
# auto COMMAND...: no terminal, automated mode, from the trusted checkout. Prefix `env VAR=VALUE` to override.
auto() {
  : >"$FAKE_LOG"
  set +e
  OUT="$(cd "$trusted" && env "${auto_env[@]}" "$@" </dev/null 2>&1)"
  RC=$?
  set -e
}
# Access token, ID token signature and GitHub request token sentinels must never reach output or argv.
no_secrets() {
  local secret
  for secret in FAKEACCESSSENTINEL FAKESIGSENTINEL FAKEGHAREQUESTSENTINEL; do
    [[ "$OUT" != *"$secret"* ]] || fail_test "$1: a token or credential value reached the output"
    log_lacks "$secret" "$1: a token or credential value was passed as a command argument"
  done
}
line_of() { grep -nF -- "$1" "$FAKE_LOG" | head -n1 | cut -d: -f1 || true; }

release migrate "$SHA5"; ok 'fifth migration'
auto bash "$script_dir/release.sh" deploy "$SHA5"
ok 'automated deploy with a WIF-minted ID token'
fifth="$(revision_for "$SHA5")"
log_lacks 'auth print-identity-token' 'automated release used gcloud print-identity-token'
log_has "curl iam generateIdToken sa=$DEPLOY_SA audience=$ORIGIN" \
  'ID token was not minted by IAM Credentials for the deployment account and canonical audience'
log_has "cloudrun aud=$ORIGIN email=$DEPLOY_SA url=https://candidate---" \
  'candidate-tag request did not carry a canonical-audience deployment token'
iam_line="$(line_of 'curl iam generateIdToken')"; check_line="$(line_of 'curl auth=yes https://candidate---')"
route_line="$(line_of 'update-traffic')"
[[ -n "$iam_line" && -n "$check_line" && -n "$route_line" && "$iam_line" -lt "$check_line" && "$check_line" -lt "$route_line" ]] ||
  fail_test 'automated order must be: mint ID token, check candidate, route traffic'
[[ "$(serving)" == "$fifth=100" ]] || fail_test "unexpected traffic $(serving)"
no_secrets 'automated deploy'
pass 'automated candidate check uses IAM Credentials generateIdToken with the canonical service audience'

auto bash -c 'source "$1"; identity_token "$2" >/dev/null' _ "$script_dir/common.sh" \
  'https://candidate---kitloop-abc123xyz-as.a.run.app'
refused 'tag URL as audience'; out_has 'audience must be the canonical' 'tag URL audience was accepted'
log_lacks 'curl iam ' 'tag URL audience reached IAM Credentials'
auto bash -c 'source "$1"; identity_token >/dev/null' _ "$script_dir/common.sh"
refused 'missing audience'; out_has 'audience must be the canonical' 'missing audience was accepted'
log_lacks 'curl iam ' 'missing audience reached IAM Credentials'
pass 'identity_token rejects a missing or non-canonical audience before any token request'

release migrate "$SHA6"; ok 'sixth migration'
before="$(serving)"
deploy6=(bash "$script_dir/release.sh" deploy "$SHA6")
# auto_refused NAME EXPECTED_MESSAGE COMMAND...: the candidate is refused and traffic stays on the previous revision.
auto_refused() {
  local name="$1" message="$2"
  shift 2
  auto "$@"
  refused "$name"; out_has "$message" "$name: unexpected failure reason"
  out_has 'ERROR:' "$name: no error reported"
  log_lacks 'update-traffic' "$name: traffic moved"
  log_lacks 'curl auth=yes https://candidate---' "$name: candidate was called without a valid token"
  [[ "$(serving)" == "$before" ]] || fail_test "$name: traffic changed to $(serving)"
  no_secrets "$name"
  rm -f "$FAKE_STATE/revisions/kitloop-${SHA6:0:12}-"*.json   # a retry within the same second reuses the suffix
  pass "automated candidate refused, previous revision kept: $name"
}
auto_refused 'deployment account variable mismatch' 'Unexpected deployment service account' \
  env "DEPLOY_SERVICE_ACCOUNT=kitloop-run@$PROJECT.iam.gserviceaccount.com" "${deploy6[@]}"
auto_refused 'deployment account variable missing' 'Unexpected deployment service account' \
  env DEPLOY_SERVICE_ACCOUNT= "${deploy6[@]}"
auto_refused 'credential file missing' 'credential file is unavailable' \
  env CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE= "${deploy6[@]}"
auto_refused 'credential file impersonates another account' 'targets the wrong identity' \
  env "GOOGLE_APPLICATION_CREDENTIALS=$work/other-creds.json" "CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE=$work/other-creds.json" \
  "${deploy6[@]}"
log_lacks 'curl iam ' 'wrong-identity credentials reached IAM Credentials'
touch "$FAKE_STATE/access-fail"
auto_refused 'WIF access token unavailable' 'Could not obtain a WIF-backed access token' "${deploy6[@]}"
rm -f "$FAKE_STATE/access-fail"
for mode in denied unavailable; do
  echo "$mode" >"$FAKE_STATE/iam-mode"
  auto_refused "IAM Credentials HTTP error ($mode)" 'IAM Credentials could not generate' "${deploy6[@]}"
done
log_has "curl iam generateIdToken sa=$DEPLOY_SA audience=$ORIGIN" 'error path did not target the deployment account and canonical audience'
for mode in empty blank garbage; do
  echo "$mode" >"$FAKE_STATE/iam-mode"
  auto_refused "IAM Credentials response without a token ($mode)" 'IAM Credentials returned no ID token' "${deploy6[@]}"
done
echo malformed >"$FAKE_STATE/iam-mode"
auto_refused 'IAM Credentials malformed token' 'IAM Credentials returned an invalid ID token' "${deploy6[@]}"
for mode in wrong-audience wrong-account expired; do
  echo "$mode" >"$FAKE_STATE/iam-mode"
  auto_refused "ID token claims ($mode)" 'not for the canonical Cloud Run audience' "${deploy6[@]}"
done
rm -f "$FAKE_STATE/iam-mode"

echo 'https://candidate---' >"$FAKE_STATE/curl-fail"
auto "${deploy6[@]}"
refused 'automated candidate failing readiness'; out_has 'traffic was not changed' 'failed automated candidate message missing'
log_lacks 'update-traffic' 'failed automated candidate received traffic'
[[ "$(serving)" == "$before" ]] || fail_test 'failed automated candidate changed traffic'
no_secrets 'automated candidate failing readiness'
rm -f "$FAKE_STATE/curl-fail" "$FAKE_STATE/revisions/kitloop-${SHA6:0:12}-"*.json
pass 'automated candidate with a valid token but failing readiness never receives traffic'

# Private verification and rollback in the deploy job use the same flow against the canonical URL.
rm -f "$FAKE_STATE/public"
auto bash "$script_dir/verify.sh" private
ok 'automated private verify'
log_has "curl iam generateIdToken sa=$DEPLOY_SA audience=$ORIGIN" 'automated private verify did not mint through IAM Credentials'
log_has "cloudrun aud=$ORIGIN email=$DEPLOY_SA url=$ORIGIN/api/ready" 'automated private readiness used the wrong token'
log_lacks 'auth print-identity-token' 'automated private verify used gcloud print-identity-token'
no_secrets 'automated private verify'
echo denied >"$FAKE_STATE/iam-mode"
auto bash "$script_dir/verify.sh" private
refused 'automated private verify without getOpenIdToken'; out_has 'IAM Credentials could not generate' 'IAM denial not reported'
log_lacks "curl auth=yes $ORIGIN" 'private service was called without a valid token'
no_secrets 'automated private verify denied'
rm -f "$FAKE_STATE/iam-mode"
auto bash "$script_dir/release.sh" rollback "$fourth"
ok 'automated rollback'; [[ "$(serving)" == "$fourth=100" ]] || fail_test "automated rollback traffic $(serving)"
log_has "curl iam generateIdToken sa=$DEPLOY_SA audience=$ORIGIN" 'automated rollback verification did not mint through IAM Credentials'
no_secrets 'automated rollback'
touch "$FAKE_STATE/public"
pass 'automated private verification and rollback use the WIF ID-token flow; IAM denial fails closed'

# --- Build source restrictions --------------------------------------------------------------------
repo="$work/repo"
git init -q -b scratch "$repo"
git -C "$repo" -c user.name=test -c user.email=test@example.invalid commit -q --allow-empty -m init
OUT="$(cd "$repo" && bash "$script_dir/release.sh" build </dev/null 2>&1)" && RC=0 || RC=$?
refused 'build from unreviewed branch'; out_has 'Build from one of' 'build from scratch was not refused'
git -C "$repo" checkout -q -b main
OUT="$(cd "$repo" && bash "$script_dir/release.sh" build </dev/null 2>&1)" && RC=0 || RC=$?
refused 'build of unpushed commit'; out_has 'is not on origin/main' 'unpushed commit was not refused'
pass 'build requires an allowed branch and a pushed commit'

# --- Request lifecycle rollout (PR #72 P1) --------------------------------------------------------
# Revisions deployed by this release.sh declare REQUEST_LIFECYCLE_WRITES; a pre-lifecycle revision (8b6e5a9 and
# earlier) does not, and cannot read DECLINED/CANCELLED/EXPIRED rows. State here: $fourth serves, SHA6 is migrated.
[[ "$(serving)" == "$fourth=100" ]] || fail_test "unexpected traffic before lifecycle cases: $(serving)"
jq -e '.spec.containers[0].env | any(.name == "REQUEST_LIFECYCLE_WRITES" and .value == "disabled")' \
  "$FAKE_STATE/revisions/$fourth.json" >/dev/null || fail_test 'deploy did not declare REQUEST_LIFECYCLE_WRITES=disabled by default'
pass 'deploy declares REQUEST_LIFECYCLE_WRITES=disabled (phase 1) unless told otherwise'

export KITLOOP_REQUEST_LIFECYCLE_WRITES=yes
release deploy "$SHA6"
refused 'invalid lifecycle setting'; out_has 'must be enabled or disabled' 'invalid lifecycle setting was not reported'
log_lacks 'gcloud run deploy' 'invalid lifecycle setting reached Cloud Run'
unset KITLOOP_REQUEST_LIFECYCLE_WRITES
pass 'an invalid KITLOOP_REQUEST_LIFECYCLE_WRITES value is refused before deployment'

# Pre-lifecycle rollback gate (PR #72 re-review P1). The fake database holds $FAKE_STATE/db-lifecycle-rows lifecycle-only
# request rows; the fake kitloop-rollback-check job succeeds only when that count is 0, like
# 'lifecycle-cli rollback-check --require-zero'. Every blocked case must leave traffic untouched.
pre=kitloop-prelifecycle-1 pre2=kitloop-prelifecycle-2
for name in "$pre" "$pre2"; do
  jq --arg name "$name" '.metadata.name = $name | .spec.containers[0].env |= map(select(.name != "REQUEST_LIFECYCLE_WRITES"))' \
    "$FAKE_STATE/revisions/$fourth.json" >"$FAKE_STATE/revisions/$name.json"
done
rows() { echo "$1" >"$FAKE_STATE/db-lifecycle-rows"; }
blocked() {  # blocked LABEL EXPECTED_MESSAGE SERVING_BEFORE
  refused "$1"; out_has "$2" "$1: refusal message missing"
  log_lacks 'update-traffic' "$1: traffic was changed"
  [[ "$(serving)" == "$3" ]] || fail_test "$1: traffic changed to $(serving)"
  out_has 'Traffic was not changed' "$1: refusal did not say traffic was unchanged"
}
check_args="--args=dist/lifecycle-cli.js,rollback-check,--require-zero,--expect-database=kitloop"
fourth_image="$(jq -r '.spec.containers[0].image' "$FAKE_STATE/revisions/$fourth.json")"

# The reviewer's sequence first, from a clean state: phase 2 writes lifecycle rows, the service rolls back to phase 1
# (writes off, rows stay), then a rollback to the pre-lifecycle revision is attempted.
rows 0
export KITLOOP_REQUEST_LIFECYCLE_WRITES=enabled
release deploy "$SHA6"
ok 'phase 2 over a phase-1 revision'
sixth="$(revision_for "$SHA6")"
[[ "$(serving)" == "$sixth=100" ]] || fail_test "phase 2 traffic $(serving)"
jq -e '.spec.containers[0].env | any(.name == "REQUEST_LIFECYCLE_WRITES" and .value == "enabled")' \
  "$FAKE_STATE/revisions/$sixth.json" >/dev/null || fail_test 'phase 2 revision does not declare REQUEST_LIFECYCLE_WRITES=enabled'
unset KITLOOP_REQUEST_LIFECYCLE_WRITES
pass 'phase 2 deploys over a phase-1 revision and declares REQUEST_LIFECYCLE_WRITES=enabled'
rows 1   # phase 2 wrote a DECLINED request
release rollback "$fourth"
ok 'phase 2 -> phase 1'; [[ "$(serving)" == "$fourth=100" ]] || fail_test "traffic $(serving)"
log_lacks 'kitloop-rollback-check' 'phase 2 -> phase 1 ran the pre-lifecycle check'
pass 'ALLOWED: phase 2 -> phase 1 (lifecycle-aware target)'

# Final audit regression: after phase 2 -> phase 1 the phase-2 revision still holds the candidate tag at 0% traffic.
# Cloud Run keeps tags across update-traffic, and a tag URL is invokable like the service, so that revision can still
# write lifecycle rows after a zero-row check and after the switch. It must count as a lifecycle writer.
jq -e --arg r "$sixth" 'any(.status.traffic[]; .revisionName == $r and .tag == "candidate" and .percent == 0)' \
  "$FAKE_STATE/service.json" >/dev/null || fail_test 'precondition: phase-2 revision should still hold the candidate tag'
for n in 1 0; do
  rows "$n"
  release rollback "$pre"
  blocked "phase 2 -> phase 1 -> pre-lifecycle ($n rows) while phase 2 keeps a tag URL" \
    "reachable through tag 'candidate'" "$fourth=100"
  log_lacks 'run jobs execute' 'a check ran while a tagged phase-2 revision could still write lifecycle rows'
done
pass 'BLOCKED: pre-lifecycle rollback while a 0%-traffic tagged revision has lifecycle writes enabled (audit regression)'
"$work/bin/gcloud" run services update-traffic kitloop --project="$PROJECT" --region=asia-southeast1 --remove-tags=candidate
jq -e '[.status.traffic[] | select(.tag == "candidate")] | length == 0' "$FAKE_STATE/service.json" >/dev/null || \
  fail_test 'operator tag removal did not take effect in the fake'

rows 1   # the rows written by phase 2 remain
release rollback "$pre"
blocked 'phase 2 -> phase 1 -> pre-lifecycle with lifecycle rows' 'database compatibility check did not pass' "$fourth=100"
log_has 'run jobs execute kitloop-rollback-check' 'the check did not run'
pass 'BLOCKED: phase 2 -> phase 1 -> pre-lifecycle while the rows written by phase 2 remain (re-review regression)'

rows 0
release rollback "$pre"
ok 'phase 1 -> pre-lifecycle with verified zero rows'; [[ "$(serving)" == "$pre=100" ]] || fail_test "traffic $(serving)"
log_has "run jobs deploy kitloop-rollback-check" 'the database check job was not deployed'
log_has "$check_args" 'the check did not run rollback-check --require-zero against the kitloop database'
log_has "--image=$fourth_image" 'the check did not use the serving lifecycle-aware image'
log_has "--service-account=kitloop-run@$PROJECT.iam.gserviceaccount.com" 'the check did not use the runtime identity'
log_has '--set-secrets=DATABASE_URL=kitloop-database-url:1' 'the check did not use the service database secret'
check_line="$(grep -n 'run jobs execute kitloop-rollback-check' "$FAKE_LOG" | head -n1 | cut -d: -f1 || true)"
route_line="$(grep -n 'update-traffic' "$FAKE_LOG" | head -n1 | cut -d: -f1 || true)"
[[ -n "$check_line" && -n "$route_line" && "$check_line" -lt "$route_line" ]] || fail_test 'traffic moved before the database check'
pass 'ALLOWED: phase 1 -> pre-lifecycle after a fresh zero-row database check (check runs before update-traffic)'

release rollback "$pre"
ok 'no-op rollback'; log_lacks 'update-traffic' 'no-op rollback changed traffic'; log_lacks 'kitloop-rollback-check' 'no-op ran a check'
pass 'ALLOWED: rollback to the revision already serving 100% changes nothing and needs no check'

release rollback "$pre2"
blocked 'pre-lifecycle -> pre-lifecycle without a lifecycle-aware image' 'No lifecycle-aware revision is serving' "$pre=100"
log_lacks 'run jobs execute' 'a check ran without a lifecycle-aware image'
export KITLOOP_ROLLBACK_CHECK_REVISION="$fourth"
release rollback "$pre2"
ok 'pre-lifecycle -> pre-lifecycle with an explicit check image'; [[ "$(serving)" == "$pre2=100" ]] || fail_test "traffic $(serving)"
log_has "--image=$fourth_image" 'KITLOOP_ROLLBACK_CHECK_REVISION image was not used for the check'
unset KITLOOP_ROLLBACK_CHECK_REVISION
pass 'pre-lifecycle -> pre-lifecycle still requires the check; KITLOOP_ROLLBACK_CHECK_REVISION only selects its image'

export KITLOOP_REQUEST_LIFECYCLE_WRITES=enabled
release deploy "$SHA6"
refused 'phase 2 over a pre-lifecycle revision'; out_has 'Deploy this commit with KITLOOP_REQUEST_LIFECYCLE_WRITES=disabled first' \
  'phase 2 over a pre-lifecycle revision was not explained'
log_lacks 'gcloud run deploy' 'phase 2 over a pre-lifecycle revision reached Cloud Run'
[[ "$(serving)" == "$pre2=100" ]] || fail_test 'refused phase 2 changed traffic'
unset KITLOOP_REQUEST_LIFECYCLE_WRITES
pass 'BLOCKED: lifecycle writes cannot be enabled while a pre-lifecycle revision serves'

release rollback "$fourth"
ok 'pre-lifecycle -> phase 1'; log_lacks 'kitloop-rollback-check' 'a lifecycle-aware target ran the pre-lifecycle check'

rows 2
release rollback "$pre"
blocked 'phase 1 -> pre-lifecycle with lifecycle rows' 'database compatibility check did not pass' "$fourth=100"
log_has 'run jobs execute kitloop-rollback-check' 'the check did not run'
pass 'BLOCKED: phase 1 -> pre-lifecycle when the check reports lifecycle rows'

rows 0; touch "$FAKE_STATE/rollback-check-unavailable"
release rollback "$pre"
blocked 'check unavailable' 'database compatibility check did not pass' "$fourth=100"
rm -f "$FAKE_STATE/rollback-check-unavailable"
pass 'BLOCKED: the database check cannot run (database unreachable)'

touch "$FAKE_STATE/rollback-check-malformed"
release rollback "$pre"
blocked 'malformed check execution' 'could not be verified as a successful zero-row check' "$fourth=100"
rm -f "$FAKE_STATE/rollback-check-malformed"
pass 'BLOCKED: the check execution cannot be verified (malformed output)'

touch "$FAKE_STATE/jobs-list-fail"
release rollback "$pre"
blocked 'jobs cannot be listed' 'Cannot list Cloud Run jobs' "$fourth=100"
rm -f "$FAKE_STATE/jobs-list-fail"
echo "$fourth_image" >"$FAKE_STATE/jobs/kitloop-reconcile.image"
release rollback "$pre"
blocked 'reconciliation job present' 'reconciliation job kitloop-reconcile exists' "$fourth=100"
log_lacks 'run jobs execute' 'a check ran while a lifecycle writer existed'
rm -f "$FAKE_STATE/jobs/kitloop-reconcile."*
pass 'BLOCKED: a reconciliation job (another lifecycle writer) exists or jobs cannot be listed'

release rollback "$sixth"
ok 'phase 1 -> phase 2 revision'; [[ "$(serving)" == "$sixth=100" ]] || fail_test "traffic $(serving)"
rows 1   # phase 2 wrote a DECLINED request
release rollback "$pre"
blocked 'phase 2 -> pre-lifecycle with lifecycle rows' 'has lifecycle writes enabled' "$sixth=100"
log_lacks 'run jobs execute' 'phase 2 -> pre-lifecycle ran a check that writes could invalidate'
rows 0
release rollback "$pre"
blocked 'phase 2 -> pre-lifecycle even with zero rows' 'has lifecycle writes enabled' "$sixth=100"
pass 'BLOCKED: phase 2 -> pre-lifecycle (writes could add rows after any check)'

rows 1
release rollback "$fourth"
ok 'phase 2 -> phase 1 again'; [[ "$(serving)" == "$fourth=100" ]] || fail_test "traffic $(serving)"

for confirmation in no-lifecycle-rows yes; do
  export KITLOOP_CONFIRM_PRE_LIFECYCLE_ROLLBACK="$confirmation"
  release rollback "$pre"
  blocked "operator confirmation $confirmation with lifecycle rows" 'database compatibility check did not pass' "$fourth=100"
done
touch "$FAKE_STATE/rollback-check-unavailable"
release rollback "$pre"
blocked 'operator confirmation without a database check' 'database compatibility check did not pass' "$fourth=100"
rm -f "$FAKE_STATE/rollback-check-unavailable"
unset KITLOOP_CONFIRM_PRE_LIFECYCLE_ROLLBACK
pass 'BLOCKED: an operator confirmation never substitutes for a verified zero-row check'

if git -C "$script_dir" cat-file -e '8b6e5a95f34ecb71df2bb0ccc4a836fa156264cf^{commit}' 2>/dev/null; then
  release deploy 8b6e5a95f34ecb71df2bb0ccc4a836fa156264cf
  refused 'deploy of pre-lifecycle code'; out_has 'predates the request lifecycle' 'pre-lifecycle deploy was not explained'
  log_lacks 'gcloud run deploy' 'pre-lifecycle code reached Cloud Run through deploy'; log_lacks 'update-traffic' 'pre-lifecycle deploy changed traffic'
  pass 'BLOCKED: deploying pre-lifecycle code (8b6e5a9); it may only return through the checked rollback'
else
  printf 'SKIP: commit 8b6e5a9 is not in this checkout (shallow clone); pre-lifecycle deploy case not run\n'
fi

printf 'PASS: all GCP release guard tests\n'
