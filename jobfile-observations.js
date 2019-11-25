const krawler = require('@kalisio/krawler')
const hooks = krawler.hooks
const _ = require('lodash')

const config = require('./config')

const dbUrl = process.env.DB_URL || 'mongodb://127.0.0.1:27017/hubeau'

let stations = null

// Create a custom hook to generate tasks
let generateTasks = (options) => {
  return (hook) => {
    let tasks = []
    stations = hook.data.stations
    stations.forEach(station => {
      options.series.forEach(serie => {
        let initialDate = new Date(options.initialTime).toISOString()
        let task = {
          id: station.properties.code_station + '-' + serie,
          initialTime: options.initialTime,
          code_station: station.properties.code_station,
          serie: serie,
          options: {
            url: options.baseUrl + 'code_entite=' + station.properties.code_station + '&grandeur_hydro=' + serie + '&date_debut_obs=' + initialDate + '&size=10000'
          }
        }
        tasks.push(task)
      })
    })
    hook.data.tasks = tasks
    return hook
  }
}
hooks.registerHook('generateTasks', generateTasks)

module.exports = {
  id: 'hubeau-observations',
  store: 'memory',
  options: {
    workersLimit: 2,
    faultTolerant: true,
    timeout: 55 * 60 * 1000
  },
  taskTemplate: {
    id: 'hubeau/observations/<%= taskId %>',
    type: 'http'
  },
  hooks: {
    tasks: {
      before: {
        readMongoCollection: {
          collection: 'hubeau-observations',
          dataPath: 'data.mostRecentObservations',
          query: { 'properties.code_station': '<%= code_station %>', 'properties.<%= serie %>': { $exists: true } },
          sort: { time: -1 },
          limit: 1
        }
      },
      after: {
        readJson: {},
        writeJsonMemory: {
          hook: 'writeJson',
          key: '<%= id %>',
          store: 'memory'
        },
        apply: {
          function: (item) => {
            let features = []
            let lastTime = item.initialTime
            if (item.mostRecentObservations.length === 1) {
              lastTime = item.mostRecentObservations[0].time.getTime()
            }
            _.forEach(item.data.data, (obs) => {
              let timeObsUTC= new Date(obs.date_obs).getTime()
              if (timeObsUTC > lastTime) {
                const station_feature = _.find(stations, (station) => { return station.properties.code_station === item.code_station })
                let observation_feature = { 		  
                  type: 'Feature',
                  time: timeObsUTC,
                  geometry: {
                    type: 'Point',
                    coordinates: [obs.longitude, obs.latitude]
                  },
                  properties: {
                    name: station_feature.properties.libelle_station,
                    code_station: obs.code_station,
                    [obs.grandeur_hydro]: obs.resultat_obs / 1000
                  }
                }
                features.push(observation_feature)
              }
            })
            item.data = features
          }
        },
        writeMongoCollection: {
          chunkSize: 256,
          collection: 'hubeau-observations',
          transform: { unitMapping: { time: { asDate: 'utc' } } }
        },
        clearData: {}
      }
    },
    jobs: {
      before: {
        createStores: [{
          id: 'memory'
        }, {
          id: 'fs',
          options: {
            path: __dirname
          }
        }],
        connectMongo: {
          url: dbUrl,
          // Required so that client is forwarded from job to tasks
          clientPath: 'taskTemplate.client'
        },
        createMongoCollection: {
          clientPath: 'taskTemplate.client',
          collection: 'hubeau-observations',
          indices: [ 
            [{ time: 1 }, { expireAfterSeconds: config.expirationPeriod }], // days in s
            { 'properties.code_station': 1 },
            [{ 'properties.code_station': 1, time: -1 }, { background: true }],
            [{ 'properties.code_station': 1, 'properties.H': 1, time: -1 }, { background: true }],
            [{ 'properties.code_station': 1, 'properties.Q': 1, time: -1 }, { background: true }],
            { 'properties.Q': 1 },
            { 'properties.H': 1 },
            { geometry: '2dsphere' }
          ],
        },
        readMongoCollection: {
          clientPath: 'taskTemplate.client',
          collection: 'hubeau-stations',
          dataPath: 'data.stations'
        },
        generateTasks: {
          baseUrl: 'https://hubeau.eaufrance.fr/api/v1/hydrometrie/observations_tr?',
          series:  ["H", "Q"],
          initialTime: Date.now() - (1 * 12 * 60 * 60 * 1000)  // days in ms
        }
      },
      after: {
        disconnectMongo: {
          clientPath: 'taskTemplate.client'
        },
        removeStores: ['memory', 'fs']
      }
    }
  }
}
