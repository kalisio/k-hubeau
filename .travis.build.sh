#!/bin/bash
source .travis.env.sh

echo Building k-hubeau $VERSION with Krawler $KRAWLER_BRANCH

# Build Stations image
docker build --build-arg KRAWLER_BRANCH=$KRAWLER_BRANCH -f dockerfile.stations -t kalisio/k-hubeau-stations .
docker tag kalisio/k-hubeau-stations kalisio/k-hubeau:stations-$VERSION
# Build Observations image
docker build --build-arg KRAWLER_BRANCH=$KRAWLER_BRANCH -f dockerfile.observations -t kalisio/k-hubeau-observations .
docker tag kalisio/k-hubeau-observations kalisio/k-hubeau:observations-$VERSION

# Push the built images to Docker hub
docker login -u="$DOCKER_USER" -p="$DOCKER_PASSWORD"
docker push kalisio/k-hubeau:stations-$VERSION
docker push kalisio/k-hubeau:observations-$VERSION