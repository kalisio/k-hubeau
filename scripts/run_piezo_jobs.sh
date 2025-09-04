#!/usr/bin/env bash
set -euo pipefail

#run piezo-stations jobs
krawler ./jobfile-piezo-stations.js
#run piezo-observations jobs
krawler ./jobfile-piezo-observations.js