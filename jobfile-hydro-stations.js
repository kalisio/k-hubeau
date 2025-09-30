import _ from 'lodash'
import winston from 'winston'

const DB_URL = process.env.DB_URL || 'mongodb://127.0.0.1:27017/hubeau'

export default {
  id: 'hubeau-hydro-stations',
  store: 'memory',
  options: {
    workersLimit: 1,
    faultTolerant: true,
  },
  tasks: [{
    id: 'stations',
    type: 'http',
    options: {
      url: 'https://hubeau.eaufrance.fr/api/v2/hydrometrie/referentiel/stations?format=geojson&size=10000'
    }
  }],
  hooks: {
    tasks: {
      after: {
        readJson: {},
        apply: {
          function: (item) => {
            let stations = []
            for (const feature of _.get(item.data, 'features', [])) {
              let name = feature.properties.libelle_station || feature.properties.libelle_site || feature.properties.libelle_commune
              let station = _.cloneDeep(feature)
              _.set(station, 'properties.name', name)
              _.set(station, 'properties.code_station', '#' + feature.properties.code_station)  // prefix the code to disable automatic data conversion
              stations.push(station)
            }
            item.data = stations
          }
        },
        log: (logger, item) => { logger.info(`Found ${item.data.length} stations`)},
        updateMongoCollection: {
          collection: 'hubeau-hydro-stations',
          filter: { 'properties.code_station': '<%= properties.code_station %>' },
          upsert : true,
          chunkSize: 256
        },
        clearData: {}
      }
    },
    jobs: {
      before: {
        createStores: { id: 'memory' },
        connectMongo: {
          url: DB_URL,
          clientPath: 'taskTemplate.client'
        },
        createLogger: {
          loggerPath: 'taskTemplate.logger',
          Console: {
            format: winston.format.printf(log => winston.format.colorize().colorize(log.level, `${log.level}: ${log.message}`)),
            level: 'verbose'
          }
        },
        createMongoCollection: {
          clientPath: 'taskTemplate.client',
          collection: 'hubeau-hydro-stations',
          indices: [
            [{ 'properties.code_station': 1 }, { unique: true }],
            { geometry: '2dsphere' }
          ]
        }
      },
      after: {
        disconnectMongo: {
          clientPath: 'taskTemplate.client'
        },
        removeLogger: {
          loggerPath: 'taskTemplate.logger'
        },
        removeStores: [ 'memory' ]
      },
      error: {
        disconnectMongo: {
          clientPath: 'taskTemplate.client'
        },
        removeLogger: {
          loggerPath: 'taskTemplate.logger'
        },
        removeStores: [ 'memory' ]
      }
    }
  }
}
