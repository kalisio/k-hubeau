# k-hubeau

[![Build Status](https://travis-ci.org/kalisio/k-hubeau.png?branch=master)](https://travis-ci.org/kalisio/k-hubeau)

A [Krawler](https://kalisio.github.io/krawler/) based service to download data from French open portal [Hub'Eau](https://hubeau.eaufrance.fr/)

## Getting started



## Configuration

### Stations

| Variable | Description |
|--- | --- |
| `DB_URL` | The database URL. The default value is `mongodb://127.0.0.1:27017/hubeau` |

### Observations

| Variable | Description |
|--- | --- |
| `DB_URL` | The database URL. The default value is `mongodb://127.0.0.1:27017/hubeau` |
| `TTL` | The observations data time to live. It must be expressed in seconds and the default value is `604 800` (7 days) | 
| `HISTORY` | The duration of the observations data history the job has to download. It must be expressed in milliseconds and the default value is `86 400 000` (1 day) | 
| `TIMEOUT` | The maximum duration of the job. It must be in milliseconds and the default value is `1 800 000` (30 minutes). |

## Deployment

-TODO-

## Contributing

Please read CONTRIBUTING.md for details on our code of conduct, and the process for submitting pull requests to us.

## Versioning

We use [SemVer](https://semver.org/) for versioning. For the versions available, see the tags on this repository.

## Authors

This project is sponsored by 

![Kalisio](https://s3.eu-central-1.amazonaws.com/kalisioscope/kalisio/kalisio-logo-black-256x84.png)

## License

This project is licensed under the MIT License - see the [license file](./LICENCE) for details



