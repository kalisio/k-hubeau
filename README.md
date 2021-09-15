# k-hubeau

[![Latest Release](https://img.shields.io/github/v/tag/kalisio/k-hubeau?sort=semver&label=latest)](https://github.com/kalisio/k-hubeau/releases)
[![Build Status](https://app.travis-ci.com/kalisio/k-hubeau.svg?branch=master)](https://app.travis-ci.com/kalisio/k-hubeau)

A [Krawler](https://kalisio.github.io/krawler/) based service to download data from French open portal [Hub'Eau](https://hubeau.eaufrance.fr/)

## Description

The **k-hubeau** jobs allow to scrape hydrometric data from the following api: [http://hubeau.eaufrance.fr/page/api-hydrometrie](http://hubeau.eaufrance.fr/page/api-hydrometrie).  The downloaded data are stored in a [MongoDB](https://www.mongodb.com/) database and more precisely in 2 collections:
* the `observations` collection stores the observed data:
  * the water level `H` in meter (m)
  * the water flow `Q` in cubic meter per second (m3/s)
* the `stations` collection stores the data of the stations
  
The project consists in 2 jobs:
* the `stations` job scrapes the stations data according a specific cron expression. By default, every day at midnight.
* the `observations` job scrapes the observations according a specific cron expression. By default every 15 minutes.

## Configuration

### Stations

| Variable | Description |
|--- | --- |
| `DB_URL` | The database URL. The default value is `mongodb://127.0.0.1:27017/hubeau` |
| `DEBUG` | Enables debug output. Set it to `krawler*` to enable full output. By default it is undefined. |

### Observations

| Variable | Description |
|--- | --- |
| `DB_URL` | The database URL. The default value is `mongodb://127.0.0.1:27017/hubeau` |
| `TTL` | The observations data time to live. It must be expressed in seconds and the default value is `604 800` (7 days) | 
| `HISTORY` | The duration of the observations data history the job has to download. It must be expressed in milliseconds and the default value is `86 400 000` (1 day) | 
| `TIMEOUT` | The maximum duration of the job. It must be in milliseconds and the default value is `1 800 000` (30 minutes). |
| `DEBUG` | Enables debug output. Set it to `krawler*` to enable full output. By default it is undefined. |

## Deployment

We personally use [Kargo](https://kalisio.github.io/kargo/) to deploy the service.

## Contributing

Please refer to [contribution section](./CONTRIBUTING.md) for more details.

## Authors

This project is sponsored by 

![Kalisio](https://s3.eu-central-1.amazonaws.com/kalisioscope/kalisio/kalisio-logo-black-256x84.png)

## License

This project is licensed under the MIT License - see the [license file](./LICENSE) for details



