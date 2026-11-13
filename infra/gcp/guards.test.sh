#!/usr/bin/env bash
# Offline regression tests for the GCP release tooling. No cloud call is possible: a file-backed fake
# gcloud and curl on PATH record every invocation, while real jq evaluates Cloud Run v1-shaped JSON.
# State-changing actions run through a real pseudo-terminal (util-linux `script`) so the typed
# confirmation is exercised. Requires bash, jq, script and sha256sum (Linux, Cloud Shell or CI).
set -euo pipefail
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
for tool in jq script sha256sum git; do
  command -v "$tool" >/dev/null 2>&1 || { printf 'FAIL: %s is required (run on Linux, Cloud Shell or CI)\n' "$tool" >&2; exit 1; }
done

PROJECT=lab-5-cloud-deployment-514310
ORIGIN=https://kitloop-123456789012.asia-southeast1.run.app
SHA1=0123456789ab SHA2=111111111111 SHA3=222222222222 SHA4=333333333333
work="$(mktemp -d)"
trap 'rm -rf -- "$work"' EXIT
mkdir -p "$work/bin"
export FAKE_STATE="$work/state" FAKE_LOG="$work/calls.log"
export PATH="$work/bin:$PATH" SHELL=/bin/bash

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
  'auth print-identity-token') echo fake-identity-token ;;
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
      deploy) arg image >"$S/jobs/$job.image" ;;
      delete) rm -f "$S/jobs/$job."* ;;
      describe) [[ -f "$S/jobs/$job.image" ]] || fail "Cannot find job [$job]."; cat "$S/jobs/$job.latest" 2>/dev/null || true ;;
      execute)
        [[ -f "$S/jobs/$job.image" ]] || fail "Cannot find job [$job]."
        n=$(( $(cat "$S/jobs/$job.count" 2>/dev/null || echo 0) + 1 )); echo "$n" >"$S/jobs/$job.count"
        name="$job-x$n"; echo "$name" >"$S/jobs/$job.latest"
        outcome="$(cat "$S/jobs/$job.outcome" 2>/dev/null || echo success)"
        jq -n --arg name "$name" --arg job "$job" --arg image "$(cat "$S/jobs/$job.image")" --arg t "$(stamp)" --arg outcome "$outcome" '
          {apiVersion:"run.googleapis.com/v1", kind:"Execution",
           metadata:{name:$name, namespace:"123456789012", labels:{"run.googleapis.com/job":$job}},
           spec:{parallelism:1, taskCount:1,
                 template:{spec:{containers:[{image:$image}], maxRetries:0, timeoutSeconds:"600"}}},
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
# Fake curl: 200 unless the URL matches curl-fail; 403 for an unauthenticated call to a private service.
url="${*: -1}" auth=no
for a in "$@"; do [[ "$a" != @- ]] || { IFS= read -r header || true; [[ "$header" != 'Authorization: Bearer '* ]] || auth=yes; }; done
printf 'curl auth=%s %s\n' "$auth" "$url" >>"$FAKE_LOG"
if [[ -f "$FAKE_STATE/curl-fail" ]] && grep -qF -f "$FAKE_STATE/curl-fail" <<<"$url"; then printf 503
elif [[ "$auth" == no && ! -f "$FAKE_STATE/public" ]]; then printf 403
else printf 200; fi
FAKE
chmod +x "$work/bin/gcloud" "$work/bin/curl"

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
revision_for() { jq -r --arg sha "$1" '.status.traffic[] | select(.revisionName | startswith("kitloop-" + $sha)) | .revisionName' \
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

# --- Build source restrictions --------------------------------------------------------------------
repo="$work/repo"
git init -q -b main "$repo"
git -C "$repo" -c user.name=test -c user.email=test@example.invalid commit -q --allow-empty -m init
OUT="$(cd "$repo" && bash "$script_dir/release.sh" build </dev/null 2>&1)" && RC=0 || RC=$?
refused 'build from unreviewed branch'; out_has 'Build from one of' 'build from main was not refused'
git -C "$repo" checkout -q -b sprint-1-staging
OUT="$(cd "$repo" && bash "$script_dir/release.sh" build </dev/null 2>&1)" && RC=0 || RC=$?
refused 'build of unpushed commit'; out_has 'is not on origin/sprint-1-staging' 'unpushed commit was not refused'
pass 'build requires an allowed branch and a pushed commit'

printf 'PASS: all GCP release guard tests\n'
