import _ from 'lodash'
import { hooks } from '@kalisio/krawler'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Configuration
const dbUrl = process.env.DB_URL || 'mongodb://127.0.0.1:27017/hubeau'
const ttl = parseInt(process.env.TTL) || (7 * 24 * 60 * 60)  // duration in seconds
const history =  parseInt(process.env.HISTORY) || (1 * 24 * 60 * 60 * 1000) // duration in miliseconds
const timeout = parseInt(process.env.TIMEOUT) || (30 * 60 * 1000) // duration in miliseconds

let stations = null

// Create a custom hook to generate tasks
let generateTasks = (options) => {
  return (hook) => {
    let tasks = []
    stations = hook.data.stations
    stations.forEach(station => {
      let initialDate = new Date(options.initialTime).toISOString()
      let task = {
        id: station.properties.code_station,
        initialTime: options.initialTime,
        codeStation: station.properties.code_station,
        options: {
          url: options.baseUrl + 'code_entite=' + station.properties.code_station.substring(1) + '&date_debut_obs=' + initialDate + '&fields=date_obs,resultat_obs,grandeur_hydro&size=10000'
        }
      }
      tasks.push(task)
    })
    hook.data.tasks = tasks
    return hook
  }
}
hooks.registerHook('generateTasks', generateTasks)

export default {
  id: 'hubeau-observations',
  store: 'fs',
  options: {
    workersLimit: 2,
    faultTolerant: true,
    timeout: timeout
  },
  taskTemplate: {
    id: 'hubeau/observations/<%= taskId %>',
    type: 'http'
  },
  hooks: {
    tasks: {
      before: {
        readMostRecentH: {
          hook: 'readMongoCollection',
          collection: 'hubeau-observations',
          dataPath: 'data.mostRecentH',
          query: { 'properties.code_station': '<%= codeStation %>', 'properties.H': { $exists: true } },
          sort: { time: -1 },
          limit: 1
        },
        readMostRecentQ: {
          hook: 'readMongoCollection',
          collection: 'hubeau-observations',
          dataPath: 'data.mostRecentQ',
          query: { 'properties.code_station': '<%= codeStation %>', 'properties.Q': { $exists: true } },
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
            let lastQ = item.mostRecentQ.length === 1 ? item.mostRecentQ[0].time.getTime() : item.initialTime
            let lastH = item.mostRecentH.length === 1 ? item.mostRecentH[0].time.getTime() : item.initialTime
            _.forEach(item.data.data, (obs) => {
              let timeObs= new Date(obs.date_obs).getTime()
              if (((obs.grandeur_hydro === 'Q') && (timeObs > lastQ)) || ((obs.grandeur_hydro === 'H') && (timeObs > lastH))) {
                const station_feature = _.find(stations, (station) => { return station.properties.code_station === item.codeStation })
                let observation_feature = { 		  
                  type: 'Feature',
                  time: timeObs,
                  geometry: {
                    type: 'Point',
                    coordinates: station_feature.geometry.coordinates
                  },
                  properties: {
                    name: station_feature.properties.libelle_station,
                    code_station: item.codeStation,
                    [obs.grandeur_hydro]: obs.resultat_obs / 1000
                  }
                }
                features.push(observation_feature)
              }
            })
            if (features.length > 0) console.log('Found ' + features.length + ' new observations on station ' + item.codeStation)
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
            [{ time: 1 }, { expireAfterSeconds: ttl }], // days in s
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
          initialTime: Date.now() - history
        }
      },
      after: {
        disconnectMongo: {
          clientPath: 'taskTemplate.client'
        },
        removeStores: ['memory', 'fs']
      },
      error: {
        disconnectMongo: {
          clientPath: 'taskTemplate.client'
        },
        removeStores: ['memory', 'fs']
    }
    }
  }
}
