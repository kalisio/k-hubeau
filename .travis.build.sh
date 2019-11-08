#!/bin/bash
source .travis.env.sh

echo Building k-hubeau $TAG with Krawler $KRAWLER_TAG

# Build Stations image
docker build --build-arg KRAWLER_TAG=$KRAWLER_TAG -f dockerfile.stations -t kalisio/k-hubeau:stations-$TAG
# Build Observations image
docker build --build-arg KRAWLER_TAG=$KRAWLER_TAG -f dockerfile.observations -t kalisio/k-hubeau:observations-$TAG

# Push the built images to Docker hub
docker login -u="$DOCKER_USER" -p="$DOCKER_PASSWORD"
docker push kalisio/k-hubeau:stations-$TAG
docker push kalisio/k-hubeau:observations-$TAG
