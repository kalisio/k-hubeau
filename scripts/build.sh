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
while getopts "prv" option; do
    case $option in
        p) # publish
            PUBLISH=true
            ;;
        r) # report outcome to slack
            load_env_files "$WORKSPACE_DIR/development/common/SLACK_WEBHOOK_JOBS.enc.env"
            trap 'slack_ci_report "$ROOT_DIR" "$JOB_ID" "$?" "$SLACK_WEBHOOK_JOBS"' EXIT
            ;;
        *)
            ;;
    esac
done

shift $((OPTIND-1))
JOB_ID="$1"

## Init workspace
##

init_job_infos "$ROOT_DIR"

JOB=$(get_job_name)
VERSION=$(get_job_version)
KRAWLER_VERSION=$(get_job_krawler_version)
GIT_TAG=$(get_job_tag)

if [[ -z "$GIT_TAG" ]]; then
    echo "About to build ${JOB} development version based on krawler development version..."
else
    echo "About to build ${JOB} v${VERSION} based on krawler ${KRAWLER_VERSION}..."
fi

load_env_files "$WORKSPACE_DIR/development/common/kalisio_dockerhub.enc.env" "$WORKSPACE_DIR/development/common/SLACK_WEBHOOK_JOBS.enc.env"
load_value_files "$WORKSPACE_DIR/development/common/KALISIO_DOCKERHUB_PASSWORD.enc.value"

## Build container
##

JOB_VARIANT="$2"
IMAGE_NAME="kalisio/$JOB"
if [[ -z "$GIT_TAG" ]]; then
    IMAGE_TAG="$JOB_VARIANT-latest"
    KRAWLER_TAG=latest
else
    IMAGE_TAG="$JOB_VARIANT-$VERSION"
    KRAWLER_TAG=$KRAWLER_VERSION
fi

begin_group "Building container ..."

docker login --username "$KALISIO_DOCKERHUB_USERNAME" --password-stdin < "$KALISIO_DOCKERHUB_PASSWORD"
# DOCKER_BUILDKIT is here to be able to use Dockerfile specific dockerginore (job.Dockerfile.dockerignore)
DOCKER_BUILDKIT=1 docker build \
    --build-arg KRAWLER_TAG=$KRAWLER_TAG \
    -f dockerfile."$JOB_VARIANT" \
    -t "$IMAGE_NAME:$IMAGE_TAG" \
    "$WORKSPACE_DIR/$JOB"

if [ "$PUBLISH" = true ]; then
    docker push "$IMAGE_NAME:$IMAGE_TAG"
fi

docker logout

end_group "Building container ..."
