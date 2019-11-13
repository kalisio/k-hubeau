#!/bin/bash

# Define image name
IMAGE_NAME="$TRAVIS_REPO_SLUG"

# Build docker with version number only on release
if [[ -z "$TRAVIS_TAG" ]]
then
	export IMAGE_TAG=latest
	export KRAWLER_TAG=latest
else
	export IMAGE_TAG=$(node -p -e "require('./package.json').version")
	export KRAWLER_TAG=v$(node -p -e "require('./package.json').peerDependencies['@kalisio/krawler']")
fi
