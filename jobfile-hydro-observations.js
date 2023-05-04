import _ from 'lodash'
import { hooks } from '@kalisio/krawler'

const outputDir = './output'

// Configuration
const dbUrl = process.env.DB_URL || 'mongodb://127.0.0.1:27017/hubeau'
const ttl = parseInt(process.env.TTL) || (7 * 24 * 60 * 60)  // duration in seconds
const history =  parseInt(process.env.HISTORY) || (1 * 24 * 60 * 60 * 1000) // duration in miliseconds
const timeout = parseInt(process.env.TIMEOUT) || (30 * 60 * 1000) // duration in miliseconds

let dictstations = null
let total = null



// Create a custom hook to generate tasks
let generateTasks = (options) => {
  // We need to reset the total counter for each job
  return (hook) => {
    total=0
    let tasks = []
    hook.data.batch.forEach(liststation => {
      let str_code_station = ""
      let initialDate = new Date().getTime()
      _.forEach(Object.keys(liststation), (code_station) => {
        // We remove the first character of the code_station (it's a #)
        str_code_station += code_station.substring(1)+","
        // We find the smallest last_obs
        if (liststation[code_station].last_obs < initialDate) {
          initialDate = liststation[code_station].last_obs
        }

      })
      // We convert the date in ISOString
      initialDate = new Date(initialDate).toISOString()

      // We remove the last character of the string (it's a ,) 
      str_code_station = str_code_station.substring(0, str_code_station.length - 1)
      let id=hook.data.batch.indexOf(liststation)

      
      // console.log("\nTask "+id+" : "+str_code_station)

      let task = {
        initialDate: initialDate,
        id : hook.data.batch.indexOf(liststation),
        options: {

          url:  options.baseUrl + 'code_entite=' + str_code_station + '&date_debut_obs=' + initialDate + '&fields=code_station,date_obs,resultat_obs,grandeur_hydro&size=20000',
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
      let station = item.options.url.split("code_entite=")[1].split("&")[0].split(",")
      console.log('Too many results for task ' + item.id.substring(13) + ' : ' + item.data.count+ " should be less than 20000")
      console.log("Request had : "+station.length+" stations : "+station) 
      let m=0
      _.forEach(station, (code_station) => {
        m=m+dictstations["#"+code_station].est
        console.log("stations"+code_station+" had an estimation of "+dictstations["#"+code_station].est +" last obs : "+dictstations["#"+code_station].last_obs + " total : "+m+" count : "+dictstations["#"+code_station].real_count)
      })
    }
    _.forEach(item.data.data, (obs) => {
      let timeObs= new Date(obs.date_obs)
      let station=dictstations["#"+obs.code_station]
      

      // We check if the new observation is more recent than the last stored observation of the station
        if(obs.grandeur_hydro == "H" && timeObs > new Date(station.last_H) || obs.grandeur_hydro == "Q" && timeObs > new Date(station.last_Q)){
          dictstations["#"+obs.code_station].real_count++
          let observation_feature = {
            type: 'Feature',
            time: timeObs.toISOString(),
            geometry: station.geometry,
            properties: {
              name: station.name,
              code_station: "#"+obs.code_station,
              [obs.grandeur_hydro]: obs.resultat_obs / 1000
            }
          }
        dataToSave.push(observation_feature)
      }
    })
    if (dataToSave.length > 0) {
      total += dataToSave.length
      console.log(dataToSave.length + ' new observations found by task ' + item.id.substring(13) + ' [total: ' + total + ']')
    }
    item.data = dataToSave
    
    return hook
    }
}



hooks.registerHook('processData', processData)
hooks.registerHook('generateTasks', generateTasks)

export default {
  id: 'hubeau-hydro-observations',
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
          collection: 'hubeau-hydro-observations',
          transform: { unitMapping: { time: { asDate: 'utc' } } },
          dataPath: 'data.data'
        },
        clearData: {}
      },
      error: {
        apply: {
          function: (item) => {
            console.error('Error for task ' + item.id.substring(13) + ' : ' + item.error)
            console.error("[task "+ item.id.substring(13) +"] had : "+item.options.url.split("code_entite=")[1].split("&")[0].split(",").length+" stations ["+item.options.url.split("code_entite=")[1].split("&")[0].split(",") +"]")
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
          collection: 'hubeau-hydro-observations',
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
        getStations:{
          hook: 'readMongoCollection',
          clientPath: 'taskTemplate.client',
          collection: 'hubeau-hydro-stations',
          dataPath: 'data.stations'
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
              dictstations[station.properties.code_station] = { 
                name: station.properties.libelle_station, 
                geometry: {type :station.geometry.type, coordinates: station.geometry.coordinates}, 
                last_H: actualTime - history,
                last_Q: null,
                est: Math.round((actualTime-(actualTime - history)) / 300000)*2,
                real_count: 0} // real_count is the number of observations that we actually got from the api
            })
          
            console.log("Searching for stored observations in the database")
          }
        },
        lastStoredH:{
          hook: 'createMongoAggregation',
          clientPath: 'taskTemplate.client',
          collection: 'hubeau-hydro-observations',
          dataPath: 'data.lastH',
          pipeline: [
            {
              $match: {
                'properties.H': { $exists: true }
              }
            },
            {
              $group: {
                '_id': '$properties.code_station',
                'last_H': { '$max': {
                  $cond: {
                    if: { $eq: ['$properties.H', null] },
                    then: null,
                    else: '$time'
                    }
                  }
                },
              }
            },
            {
              $project: {
                _id: 0,
                code_station: '$_id',
                last_H: 1
              }
            },
            {
              $sort: {
                last_H: -1
              }
            }
          ]
        },
        lastStoredQ:{
          hook: 'createMongoAggregation',
          clientPath: 'taskTemplate.client',
          collection: 'hubeau-hydro-observations',
          dataPath: 'data.lastQ',
          pipeline: [
            {$match: {'properties.Q': { $exists: true }}},
            {
              $group: {
                '_id': '$properties.code_station',
                'last_Q': { '$max': {
                  $cond: {
                    if: { $eq: ['$properties.Q', null] },
                    then: null,
                    else: '$time'
                    }
                  }
                },
              }
            },
            {
              $project: {
                _id: 0,
                code_station: '$_id',
                last_Q: 1
              }
            },
            {
              $sort: {
                last_Q: -1
              }
            }
          ]
        },
        FinalDict:{
          hook: 'apply',
          function: (item) => {
            // We convert item.lastH and lastQ into a dict with the station code as a key and the date of the last observation as a value
            console.log('Search ended')
            item.lastH = _.keyBy(item.lastH, 'code_station')
            item.lastQ = _.keyBy(item.lastQ, 'code_station')


            _.forEach(Object.keys(dictstations), (code_station) => {
              let station = dictstations[code_station]
              if (item.lastH[code_station] !== undefined) {
                station.last_H = item.lastH[code_station].last_H
              }
              if (item.lastQ[code_station] !== undefined) {
                station.last_Q = item.lastQ[code_station].last_Q
              }
              // We keep the most ancient date between the last observation of H and the last observation of Q as the date of the last observation
              // if there is no observation of Q, we keep the date of the last observation of H
              if (dictstations[code_station].last_Q!==null){
                station.last_obs = Math.min(station.last_H, station.last_Q)
              }
              else{
                station.last_obs = station.last_H
              }
            
              // We recover the date of the last observation by converting it into a timestamp
              station.last_obs = new Date(station.last_obs).getTime()

              // We calculate the number of observations that we estimate to receive (it's a maximum)
              // Assuming that observations are made every 5 minutes, whether they are observations of Q AND H
              // And that the station is active

              // Still not the most optimized, because a station on which there are no observations in the DB will have an estimate of 576 (288 for Q and 288 for H) if history = 1 day
              // But a station that has had an observation in the DB, we will not take history but the date of the last observation which may be older than history
              station.est = Math.round((Date.now() - station.last_obs) / 300000)*2
            })

            console.log("Number of stations : "+Object.keys(dictstations).length)
            // We sort the dictstations in descending order of the `est` field while keeping the keys
            dictstations = _.fromPairs(_.orderBy(_.toPairs(dictstations), [([key, value]) => value.est], ['desc']))
            let size = 17000  // Limit is 20000 but we leave a margin juste in case
            let batch = [[]]
            let batchChunkTotal=0

            // We have an estimate of the number of observations that we will receive for each station
            // but we also need an estimate of the total number of observations that we will receive in the batch 

            // We group together the stations that have roughly the same number of observations to receive
            let lastStationEst=dictstations[Object.keys(dictstations)[0]].est
            _.forEach(Object.keys(dictstations), (code_station) => {
              let estimation=dictstations[code_station].est
              // console.log('estimation', estimation)
              if (batchChunkTotal + estimation < size && Object.keys( batch[batch.length-1]).length < 570 && Math.abs(estimation - lastStationEst) <= 70){
                // We add the station to the last sub-dict of batch, with the station code as a key and the station dict as a value
                batch[batch.length-1][code_station] = dictstations[code_station]
                batchChunkTotal += estimation
              }
              else{
                // We add the station to a new sub-dict of batch
                // if(estimation!=lastStationEst){
                //   console.log('new batch because of estimation')
                // }
                // if(batchChunkTotal + estimation >= size){
                //   console.log('new batch because of size')
                // }
                // if(Object.keys( batch[batch.length-1]).length >= 570){
                //   console.log('new batch because of number of stations')
                // }
                
                batch.push({[code_station]: dictstations[code_station]});
                batchChunkTotal = estimation
                lastStationEst=estimation
              }
              
            })       
            item.batch=batch
          }
        },
        generateTasks: {
          baseUrl: 'https://hubeau.eaufrance.fr/api/v1/hydrometrie/observations_tr?',
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
