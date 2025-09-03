#!/usr/bin/env bash
set -euo pipefail

# run hydro-stations jobs
krawler ./jobfile-hydro-stations.js
#run hydro-observations jobs
krawler ./jobfile-hydro-observations.js
#run hydro-predictions jobs
krawler ./jobfile-hydro-predictions.js
#run piezo-observations jobs
krawler ./jobfile-piezo-observations.js
#run piezo-stations jobs
krawler ./jobfile-piezo-stations.js