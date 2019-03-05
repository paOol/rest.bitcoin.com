"use strict"

import * as express from "express"
import * as requestUtils from "./services/requestUtils"
import * as bitbox from "./services/bitbox"
const logger = require("./logging.js")
import axios from "axios"
const routeUtils = require("./route-utils")

// Used for processing error messages before sending them to the user.
const util = require("util")
util.inspect.defaultOptions = { depth: 1 }

const router: express.Router = express.Router()
//const BitboxHTTP = bitbox.getInstance()

const FREEMIUM_INPUT_SIZE = 20

router.get("/", root)
router.get("/detailsByHash/:hash", detailsByHashSingle)
router.post("/detailsByHash", detailsByHashBulk)
router.get(
  "/detailsByHeight/:height",
  detailsByHeightSingle
)
router.post("/detailsByHeight", detailsByHeightBulk)

function root(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  return res.json({ status: "block" })
}

// Call the insight server to get block details based on the hash.
async function detailsByHashSingle(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  try {
    const hash = req.params.hash

    // Reject if hash is empty
    if (!hash || hash === "") {
      res.status(400)
      return res.json({ error: "hash must not be empty" })
    }

    const response = await axios.get(
      `${process.env.BITCOINCOM_BASEURL}block/${hash}`
    )

    const parsed = response.data
    return res.json(parsed)
  } catch (error) {
    // Write out error to error log.
    //logger.error(`Error in block/detailsByHash: `, error)

    if (error.response && error.response.status === 404) {
      res.status(404)
      return res.json({ error: "Not Found" })
    }

    res.status(500)
    return res.json({ error: util.inspect(error) })
  }
}

async function detailsByHashBulk(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  try {
    const hashes = req.body.hashes

    // Reject if hashes is not an array.
    if (!Array.isArray(hashes)) {
      res.status(400)
      return res.json({
        error: "hashes needs to be an array. Use GET for single address."
      })
    }

    // Enforce no more than 20 addresses.
    if (hashes.length > FREEMIUM_INPUT_SIZE) {
      res.status(429) // https://github.com/Bitcoin-com/rest.bitcoin.com/issues/330
      return res.json({
        error: `Array too large. Max ${FREEMIUM_INPUT_SIZE} hashes`
      })
    }

    // Validate each hash in the array.
    for (let i = 0; i < hashes.length; i++) {
      const thisHash = hashes[i]

      if (thisHash.length !== 64) {
        res.status(400)
        return res.json({
          error: `Invalid hash. Double check your hash is valid: ${thisHash}`
        })
      }
    }

    // Loop through each hash and creates an array of promises
    const axiosPromises = hashes.map(async (hash: any) => {
      return axios.get(`${process.env.BITCOINCOM_BASEURL}block/${hash}`)
    })

    // Wait for all parallel promises to return.
    const axiosResult: Array<any> = await axios.all(axiosPromises)

    // Extract the data component from the axios response.
    const result = axiosResult.map(x => x.data)
    //console.log(`result: ${util.inspect(result)}`)

    res.status(200)
    return res.json(result)
  } catch (error) {
    // Write out error to error log.
    //logger.error(`Error in block/detailsByHash: `, error)

    if (error.response && error.response.status === 404) {
      res.status(404)
      return res.json({ error: "Not Found" })
    }

    res.status(500)
    return res.json({ error: util.inspect(error) })
  }
}

// Call the Full Node to get block hash based on height, then call the Insight
// server to get details from that hash.
async function detailsByHeightSingle(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  try {
    const height = req.params.height

    // Reject if id is empty
    if (!height || height === "") {
      res.status(400)
      return res.json({ error: "height must not be empty" })
    }

    const {
      BitboxHTTP,
      username,
      password,
      requestConfig
    } = routeUtils.setEnvVars()

    requestConfig.data.id = "getblockhash"
    requestConfig.data.method = "getblockhash"
    requestConfig.data.params = [parseInt(height)]

    const response = await BitboxHTTP(requestConfig)

    const hash = response.data.result
    //console.log(`hash: ${hash}`)

    // Call detailsByHashSingle now that the hash has been retrieved.
    req.params.hash = hash
    return detailsByHashSingle(req, res, next)
  } catch (error) {
    // Write out error to error log.
    //logger.error(`Error in control/getInfo: `, error)

    res.status(500)
    return res.json({ error: util.inspect(error) })
  }
}

async function detailsByHeightBulk(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  try {
    let heights = req.body.heights

    // Reject if heights is not an array.
    if (!Array.isArray(heights)) {
      res.status(400)
      return res.json({
        error: "heights needs to be an array. Use GET for single height."
      })
    }

    // Enforce no more than 20 addresses.
    if (heights.length > FREEMIUM_INPUT_SIZE) {
      res.status(429) // https://github.com/Bitcoin-com/rest.bitcoin.com/issues/330
      return res.json({
        error: `Array too large. Max ${FREEMIUM_INPUT_SIZE} heights`
      })
    }

    logger.debug(`Executing detailsByHeight with these heights: `, heights)

    // Validate each element in the address array.
    for(let i=0; i < heights.length; i++) {
      const thisHeight = heights[i]

      // Reject if id is empty
      if (!thisHeight || thisHeight === "") {
        res.status(400)
        return res.json({ error: "height must not be empty" })
      }
    }

    const {
      BitboxHTTP,
      username,
      password,
      requestConfig
    } = routeUtils.setEnvVars()

    // Loop through each height and creates an array of requests to call in parallel
    const promises = heights.map(async (height: any) => {

      requestConfig.data.id = "getblockhash"
      requestConfig.data.method = "getblockhash"
      requestConfig.data.params = [parseInt(height)]

      const response = await BitboxHTTP(requestConfig)

      const hash = response.data.result

      const axiosResult = await axios.get(`${process.env.BITCOINCOM_BASEURL}block/${hash}`)

      return axiosResult.data
    })

    // Wait for all parallel Insight requests to return.
    let result: Array<any> = await axios.all(promises)

    res.status(200)
    return res.json(result)

  } catch (error) {
    // Write out error to error log.
    //logger.error(`Error in block/detailsByHash: `, error)

    if (error.response && error.response.status === 404) {
      res.status(404)
      return res.json({ error: "Not Found" })
    }

    res.status(500)
    return res.json({ error: util.inspect(error) })
  }
}

module.exports = {
  router,
  testableComponents: {
    root,
    detailsByHashSingle,
    detailsByHashBulk,
    detailsByHeightSingle,
    detailsByHeightBulk
  }
}
