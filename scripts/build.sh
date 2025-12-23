#!/usr/bin/env bash
set -euo pipefail
# set -x

THIS_FILE=$(readlink -f "${BASH_SOURCE[0]}")
THIS_DIR=$(dirname "$THIS_FILE")
ROOT_DIR=$(dirname "$THIS_DIR")
WORKSPACE_DIR="$(dirname "$ROOT_DIR")"

. "$THIS_DIR/kash/kash.sh"

## Parse options
##

PUBLISH=false
JOB_VARIANT=
WORKFLOW_JOB_ID=
RUN_SONAR=false
while getopts "pr:v:" option; do
    case $option in
        s) # enable SonarQube analysis and publish code quality & coverage results
            RUN_SONAR=true
            ;;
        p) # publish
            PUBLISH=true
            ;;
        r) # report outcome to slack
            WORKFLOW_JOB_ID=$OPTARG
            load_env_files "$WORKSPACE_DIR/development/common/SLACK_WEBHOOK_JOBS.enc.env"
            trap 'slack_ci_report "$ROOT_DIR" "$WORKFLOW_JOB_ID $JOB_VARIANT" "$?" "$SLACK_WEBHOOK_JOBS"' EXIT
            ;;      
        v) # job variant
            JOB_VARIANT=$OPTARG
            ;;
        *)
            ;;
    esac
done

## Init workspace
##

load_env_files "$WORKSPACE_DIR/development/common/kalisio_dockerhub.enc.env"
load_value_files "$WORKSPACE_DIR/development/common/KALISIO_DOCKERHUB_PASSWORD.enc.value"
. "$WORKSPACE_DIR/development/workspaces/jobs/jobs.sh" k-hubeau

## Build job
##

build_job \
    "$ROOT_DIR" \
    "kalisio" \
    "$JOB_VARIANT" \
    "$KALISIO_DOCKERHUB_URL" \
    "$KALISIO_DOCKERHUB_USERNAME" \
    "$KALISIO_DOCKERHUB_PASSWORD" \
    "$PUBLISH"

cd "$ROOT_DIR" && sonar-scanner