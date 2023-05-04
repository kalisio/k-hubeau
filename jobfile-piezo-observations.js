import _ from 'lodash'
import { hooks } from '@kalisio/krawler'

const outputDir = './output'

// Configuration
const dbUrl = process.env.DB_URL || 'mongodb://127.0.0.1:27017/hubeau'
const ttl = parseInt(process.env.TTL) || (7 * 24 * 60 * 60)  // duration in seconds
const history =  parseInt(process.env.HISTORY) || 86400000 // duration in miliseconds (must be full days)
const timeout = parseInt(process.env.TIMEOUT) || (30 * 60 * 1000) // duration in miliseconds

let dictstations = null
let total=null



// Create a custom hook to generate tasks
let generateTasks = (options) => {
  // We need to reset the total counter for each job
  return (hook) => {
    total=0
    let tasks = []
    hook.data.batch.forEach(liststation => {
      let station = null
      let str_code_station = ""
      _.forEach(Object.keys(liststation), (code_station) => {
        str_code_station += code_station+","
      })
      // Initial date is today minus the history and we want it in yyyy-mm-dd format
      let initialDate = new Date(new Date() - history).toISOString().slice(0, 10)

      // We remove the last character of the string (it's a ,) 
      str_code_station = str_code_station.substring(0, str_code_station.length - 1)
      let id=hook.data.batch.indexOf(liststation)
      // console.log("\nTask "+id+" : "+str_code_station)

      let task = {
        initialDate: initialDate,
        id : hook.data.batch.indexOf(liststation),
        options: {

          url:  options.baseUrl + 'bss_id=' + str_code_station + '&date_debut_mesure=' + initialDate + '&fields=bss_id,date_mesure,profondeur_nappe,niveau_eau_ngf&size=20000',
        }
      }
      tasks.push(task)
    })
    console.log('Generated ' + tasks.length + ' tasks')
    hook.data.tasks = tasks
    return hook
  }
}


// Create a custom hook to process data
let processData = (options) => {
  return (hook) => {
    let item = hook.data
    let dataToSave=[]
    if (item.data.count >20000) {
      let station = item.options.url.split("bss_id=")[1].split("&")[0].split(",")
      console.log('Too many results for task ' + item.id.substring(13) + ' : ' + item.data.count+ " should be less than 20000")
      console.log("Request had : "+station.length+" stations : "+station) 
    }
    _.forEach(item.data.data, (obs) => {
      let timeObs= new Date(obs.date_mesure)
      let station=dictstations[obs.bss_id]
      

      // We check if the new observation is more recent than the last_obs of the station
      if (timeObs > new Date(station.last_obs)){
        let observation_feature = {
          type: 'Feature',
          time: timeObs.toISOString(),
          geometry: station.geometry,
          properties: {
            bss_id: obs.bss_id,
            profondeur_nappe: obs.profondeur_nappe,
            niveau_eau_ngf : obs.niveau_eau_ngf
          }
        }
        dataToSave.push(observation_feature)
      }
    })
    if (dataToSave.length > 0) {
      total+=dataToSave.length
      console.log(dataToSave.length + ' new observations found by task ' + item.id.substring(13) + ' [total : '+total+']')
    }
    item.data = dataToSave

    return hook
    }
}



hooks.registerHook('processData', processData)
hooks.registerHook('generateTasks', generateTasks)

export default {
  id: 'hubeau-piezo-observations',
  store: 'memory',
  options: {
    workersLimit: 45,
    faultTolerant: true,
    timeout: timeout
  },
  taskTemplate: {
    id: 'observations/<%= taskId %>',
    type: 'http',
    attemptsLimit : 5
  },
  hooks: {
    tasks: {
      after: {
        readJson: {},
        processData: {},
        writeMongoCollection: {
          chunkSize: 256,
          collection: 'hubeau-piezo-observations',
          transform: { unitMapping: { time: { asDate: 'utc' } } },
          dataPath: 'data.data'
        },
        clearData: {}
      },
      error: {
        apply: {
          function: (item) => {
            console.error('Error for task ' + item.id.substring(13) + ' : ' + item.error)
            console.error("Request had : "+item.options.url.split("bss_id=")[1].split("&")[0].split(",").length+" stations")
          }
         }
      }
    },
    jobs: {
      before: {
        createStores: [{
          id: 'memory'
        }, {
          id: 'fs',
          options: {
            path: outputDir
          }
        }],
        connectMongo: {
          url: dbUrl,
          // Required so that client is forwarded from job to tasks
          clientPath: 'taskTemplate.client'
        },
        createMongoCollection: {
          clientPath: 'taskTemplate.client',
          collection: 'hubeau-piezo-observations',
          indices: [ 
            [{ time: 1 }, { expireAfterSeconds: ttl }], // days in s
            { 'properties.bss_id': 1 },
            [{ 'properties.bss_id': 1, time: -1 }, { background: true }],
            [{ 'properties.bss_id': 1, 'properties.P': 1, time: -1 }, { background: true }],
            { 'properties.P': 1 },
            { geometry: '2dsphere' }
          ],
        },
        getStations:{
          hook: 'readMongoCollection',
          clientPath: 'taskTemplate.client',
          collection: 'hubeau-piezo-stations',
          dataPath: 'data.stations',
          query: {
            'properties.in_service': true
          }
        },
        createDict:{
          hook: 'apply',
          function: (item) => {
            // We create a dictionnary of stations, with the code of the station as a key
            dictstations={}
            _.forEach(item.stations, (station) => {
              // In the dictstations we add the name of the station, and its geometry (its coordinates) but without the crs section
              // created with the code of the station as a key,
              // we also prepare the date of the last observation which is currently unknown
              let actualTime = Date.now()
              // console.log(station.geometry.type)
              dictstations[station.properties.bss_id] = { 
                geometry: {type :station.geometry.type, coordinates: station.geometry.coordinates}, 
                // last obs is the 00:00:00 of the day before the actual time
                last_obs: new Date(actualTime - actualTime % (history) - (history)).toISOString()}
            })
          }
        },
        lastStoredObs:{
          hook: 'createMongoAggregation',
          clientPath: 'taskTemplate.client',
          collection: 'hubeau-piezo-observations',
          dataPath: 'data.lastObs',
          pipeline: [
            { $group: {
              '_id': '$properties.bss_id',
              'last_obs': { '$max': '$time' },
          }},
          { $project: { _id: 0, bss_id: '$_id', last_obs: 1 } },
          { $sort: { last_obs: -1 } }
        ]
        },
        FinalDict:{
          hook: 'apply',
          function: (item) => {
            // We convert item.lastObs into a dict with the station code as a key and the date of the last observation as a value
            item.lastObs = _.keyBy(item.lastObs, 'bss_id')


            _.forEach(Object.keys(dictstations), (bss_id) => {
              let station = dictstations[bss_id]
              if(item.lastObs[bss_id] !== undefined){
                // We recover the date of the last observation by converting it into a timestamp
                station.last_obs = new Date(item.lastObs[bss_id].last_obs).getTime()
              }
            })
            console.log("Number of stations : "+Object.keys(dictstations).length)
            let batch = [[]]
            // We devide the dictstations into several sub-lists, so that each list contains at most size observations
            _.forEach(Object.keys(dictstations), (code_station) => {
              let station = dictstations[code_station]
              // Limit of 200 stations per request imposed by the hub'eau API
              if (Object.keys( batch[batch.length-1]).length < 200){
                // We add the station to the last sub-dict of batch, with the station code as a key and the station dict as a value
                batch[batch.length-1][code_station] = station
              }
              else{
                // We add the station to a new sub-dict of batch
                batch.push({[code_station]: station});
              }
            })
            item.batch=batch
          }
        },
        generateTasks: {
          baseUrl: 'https://hubeau.eaufrance.fr/api/v1/niveaux_nappes/chroniques_tr?',
        },
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
