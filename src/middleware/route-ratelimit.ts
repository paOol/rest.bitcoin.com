import * as express from "express"
const RateLimit = require("express-rate-limit")

// Used for debugging.
const util = require("util")
util.inspect.defaultOptions = { depth: 3 }

// Set max requests per minute
const maxRequests = process.env.RATE_LIMIT_MAX_REQUESTS
  ? parseInt(process.env.RATE_LIMIT_MAX_REQUESTS)
  : 60

// Pro-tier rate limits are 10x the freemium limits.
const PRO_RPM = 10 * maxRequests

// Unique route mapped to its rate limit
const uniqueRateLimits: any = {}

interface Request extends express.Request {
  locals: any
}

const routeRateLimit = function(
  req: Request,
  res: express.Response,
  next: express.NextFunction
) {
  if (req.locals)
    console.log(`route-ratelimit req.locals: ${util.inspect(req.locals)}`)

  // Disable rate limiting if 0 passed from RATE_LIMIT_MAX_REQUESTS
  if (maxRequests === 0) return next()

  // TODO: Auth: Set or disable rate limit if authenticated user

  // Current route
  const path = req.baseUrl + req.path
  const route =
    req.method +
    path
      .split("/")
      .slice(0, 4)
      .join("/")

  // This boolean value is passed from the auth.js middleware.
  const proRateLimits = req.locals.rateLimit

  // Freemium level rate limits
  if (!proRateLimits) {
    console.log(`applying rate limits`)
    // Create new RateLimit if none exists for this route
    if (!uniqueRateLimits[route]) {
      uniqueRateLimits[route] = new RateLimit({
        windowMs: 60 * 1000, // 1 minute window
        delayMs: 0, // disable delaying - full speed until the max limit is reached
        max: maxRequests, // start blocking after maxRequests
        handler: function(
          req: express.Request,
          res: express.Response /*next*/
        ) {
          res.status(429) // https://github.com/Bitcoin-com/rest.bitcoin.com/issues/330
          return res.json({
            error: `Too many requests. Limits are ${maxRequests} requests per minute.`
          })
        }
      })
    }

    // Call rate limit for this route
    uniqueRateLimits[route](req, res, next)

  // Pro level rate limits
  } else {

    // Create new RateLimit if none exists for this route
    if (!uniqueRateLimits[route]) {
      uniqueRateLimits[route] = new RateLimit({
        windowMs: 60 * 1000, // 1 minute window
        delayMs: 0, // disable delaying - full speed until the max limit is reached
        max: PRO_RPM, // start blocking after maxRequests
        handler: function(
          req: express.Request,
          res: express.Response /*next*/
        ) {
          res.status(429) // https://github.com/Bitcoin-com/rest.bitcoin.com/issues/330
          return res.json({
            error: `Too many requests. Limits are ${PRO_RPM} requests per minute.`
          })
        }
      })
    }

    console.log(`user passed proper auth. skipping rate limits`)
    return next()
  }
}

export { routeRateLimit }
