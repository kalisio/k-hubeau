const krawler = require('@kalisio/krawler')
const hooks = krawler.hooks
const moment = require('moment')
const fs = require('fs')
const path = require('path')
const _ = require('lodash')

// Configuration
const dbUrl = process.env.DB_URL || 'mongodb://127.0.0.1:27017/kano'
const baseUrl = process.env.PREDIKT_URL || 'http://localhost:5000/predict'
const modelsPath = process.env.PREDIKT_MODELS_PATH || path.join('..', 'predikt', 'models', 'output', 'water_level_rnn', 'multiple', '24H')
const ttl = parseInt(process.env.TTL) || (7 * 24 * 60 * 60)  // duration in seconds
const timeout = parseInt(process.env.TIMEOUT) || (30 * 60 * 1000) // duration in miliseconds
const variable = process.env.VARIABLE || 'HP' 
const collection = 'hubeau-observations'
// Read available models
const models = fs.readdirSync(modelsPath)
  .filter(model => model.endsWith('.json'))
  .map(model => path.basename(model, '.json'))

// Create a custom hook to generate tasks
let generateTasks = (options) => {
  return (hook) => {
    let tasks = []
    models.forEach(model => {
      const code_station = `#${model}`
      tasks.push({
        id: code_station,
        options: {
          url: `${options.baseUrl}/${model}`
        }
      })
    })
    hook.data.tasks = tasks
    return hook
  }
}
hooks.registerHook('generateTasks', generateTasks)

module.exports = {
  id: 'hubeau-predictions',
  store: 'fs',
  options: {
    workersLimit: 2,
    faultTolerant: true,
    timeout: timeout
  },
  taskTemplate: {
    id: 'hubeau/predictions/<%= taskId %>',
    type: 'http'
  },
  hooks: {
    tasks: {
      before: {
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
            const predictionFeature = item.data
            const times = _.get(predictionFeature, 'forecastTime.H', [])
            const values = _.get(predictionFeature, 'properties.H', [])
            let features = []
            _.forEach(times, (time, index) => {
              // Use prediction feature as a template
              let feature = _.pick(predictionFeature, ['type', 'geometry', 'runTime', 'properties.code_station'])
              _.set(feature, 'time', time)
              _.set(feature, `properties.${variable}`, values[index])
              features.push(feature)
            })
            if (features.length > 0) console.log('Found ' + features.length + ' new predictions on station ' + _.get(predictionFeature, 'properties.code_station'))
            item.data = features
          }
        },
        writeMongoCollection: {
          chunkSize: 256,
          collection,
          transform: { unitMapping: { time: { asDate: 'utc' }, runTime: { asDate: 'utc' } } }
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
          collection,
          indices: [ 
            [{ time: 1 }, { expireAfterSeconds: ttl }], // days in s
            { 'properties.code_station': 1 },
            [{ 'properties.code_station': 1, time: -1 }, { background: true }],
            [{ 'properties.code_station': 1, 'properties.H': 1, time: -1 }, { background: true }],
            { 'properties.H': 1 },
            { geometry: '2dsphere' }
          ],
        },
        generateTasks: {
          baseUrl,
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
