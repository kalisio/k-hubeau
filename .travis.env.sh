#!/bin/bash

# Build docker with version number only on release
if [[ -z "$TRAVIS_TAG" ]]
then
	export VERSION=latest
	export KRAWLER_BRANCH=master
else
	export VERSION=$(node -p -e "require('./package.json').version")
	export KRAWLER_BRANCH=v$(node -p -e "require('./package.json').peerDependencies['@kalisio/krawler']")
fi