const _ = require('lodash')

const dbUrl = process.env.DB_URL || 'mongodb://127.0.0.1:27017/hubeau'

module.exports = {
  id: 'hubeau-stations',
  store: 'fs',
  options: {
    workersLimit: 1,
    faultTolerant: true,
  },
  tasks: [{
    id: 'hubeau/stations',
    type: 'http',
    options: {
      url: 'https://hubeau.eaufrance.fr/api/v1/hydrometrie/referentiel/stations?format=geojson&size=10000'
    }
  }],
  hooks: {
    tasks: {
      after: {
        readJson: {},
        apply: {
          function: (item) => {
            let stations = []
            if (item.data.features) {
              item.data.features.forEach(feature => {
                let name = feature.properties.libelle_station || feature.properties.libelle_site || feature.properties.libelle_commune
                if (feature.properties.en_service === true) {
                  let station = _.cloneDeep(feature)
                  _.set(station, 'properties.name', name)
                  _.set(station, 'properties.code_station', 'CODE_' + feature.properties.code_station)
                  stations.push(station)
                } else console.log('warning: station ' + name + ' is inactive' )
              })
            }
            console.log('Found ' + stations.length + ' active stations')
            item.data = stations
          }
        },
        updateMongoCollection: {
          collection: 'hubeau-stations',
          filter: { 'properties.code_station': '<%= properties.code_station %>' },
          upsert : true,
          chunkSize: 256
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
          collection: 'hubeau-stations',
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
