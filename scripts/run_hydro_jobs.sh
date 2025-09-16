#!/usr/bin/env bash
set -euo pipefail

# run hydro-stations jobs
krawler ./jobfile-hydro-stations.js
#run hydro-observations jobs
krawler ./jobfile-hydro-observations.js
