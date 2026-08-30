#!/usr/bin/env bash
set -euo pipefail

resource_group="sociobot"
app_name="sf-tutor-session-trace"
registry="sociobotregistry"
source_sha="${1:-$(git rev-parse HEAD)}"

if [[ ! "$source_sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Usage: $0 [40-character commit SHA]" >&2
  exit 2
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Commit the repair before deploying it." >&2
  exit 2
fi

image="${registry}.azurecr.io/${app_name}:${source_sha:0:12}"

az acr build \
  --registry "$registry" \
  --image "${app_name}:${source_sha:0:12}" \
  --build-arg "BUILD_SHA=$source_sha" \
  .

resource_id="$(az containerapp show \
  --resource-group "$resource_group" \
  --name "$app_name" \
  --query id \
  --output tsv)"
patch_body="$(jq --compact-output --arg image "$image" \
  '.properties.template.containers[0].image = $image' \
  deploy/containerapp.json)"

az rest \
  --method patch \
  --uri "https://management.azure.com${resource_id}?api-version=2024-03-01" \
  --headers "Content-Type=application/json" \
  --body "$patch_body" \
  --output none

deployed="false"
for _ in $(seq 1 60); do
  ready_image="$(az containerapp show \
    --resource-group "$resource_group" \
    --name "$app_name" \
    --query properties.template.containers[0].image \
    --output tsv)"
  running_status="$(az containerapp show \
    --resource-group "$resource_group" \
    --name "$app_name" \
    --query properties.runningStatus \
    --output tsv)"
  health="$(curl --silent --show-error \
    https://tutor-session-trace.sociobot.in/health || true)"
  live_sha="$(jq --raw-output '.build // empty' <<<"$health" 2>/dev/null || true)"
  if [[ "$ready_image" == "$image" && "$running_status" == "Running" && "$live_sha" == "$source_sha" ]]; then
    deployed="true"
    break
  fi
  sleep 5
done

if [[ "$deployed" != "true" ]]; then
  echo "The new image did not become healthy with build $source_sha." >&2
  exit 1
fi

actual="$(az containerapp show \
  --resource-group "$resource_group" \
  --name "$app_name" \
  --output json)"

jq --exit-status --arg image "$image" '
  .properties.configuration.activeRevisionsMode == "Single" and
  .properties.template.scale.minReplicas == 1 and
  .properties.template.scale.maxReplicas == 1 and
  .properties.template.containers[0].image == $image and
  (.properties.template.containers[0].volumeMounts | any(
    .volumeName == "data" and .mountPath == "/data"
  )) and
  (.properties.template.volumes | any(
    .name == "data" and
    .storageName == "data-tutor-session-trace" and
    .storageType == "AzureFile"
  ))
' <<<"$actual" >/dev/null

revisions_converged="false"
for _ in $(seq 1 60); do
  active_revisions="$(az containerapp revision list \
    --resource-group "$resource_group" \
    --name "$app_name" \
    --query '[?properties.active]' \
    --output json)"
  if jq --exit-status \
    'length == 1 and .[0].properties.trafficWeight == 100' \
    <<<"$active_revisions" >/dev/null; then
    revisions_converged="true"
    break
  fi
  sleep 5
done
if [[ "$revisions_converged" != "true" ]]; then
  echo "Container Apps did not converge to one active revision." >&2
  exit 1
fi

jq --exit-status --arg sha "$source_sha" \
  '.status == "ok" and .build == $sha' <<<"$health" >/dev/null

echo "Deployed and verified $source_sha"
