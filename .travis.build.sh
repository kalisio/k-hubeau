#!/bin/bash

# Source the environment to define Krawler and image versions
source .travis.env.sh
echo Building $IMAGE_NAME:stations-$IMAGE_TAG with Krawler-$KRAWLER_TAG
echo Building $IMAGE_NAME:observations-$IMAGE_TAG with Krawler-$KRAWLER_TAG

# Build the images
docker build --build-arg KRAWLER_TAG=$KRAWLER_TAG -f dockerfile.stations -t $IMAGE_NAME:stations-$IMAGE_TAG .
docker build --build-arg KRAWLER_TAG=$KRAWLER_TAG -f dockerfile.observations -t $IMAGE_NAME:observations-$IMAGE_TAG .

# Publish the images
docker login -u="$DOCKER_USER" -p="$DOCKER_PASSWORD"
docker push $IMAGE_NAME:stations-$IMAGE_TAG
docker push $IMAGE_NAME:observations-$IMAGE_TAG
