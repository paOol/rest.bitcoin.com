import * as express from "express"
const RateLimit = require("express-rate-limit")

// Set max requests per minute
const maxRequests = process.env.RATE_LIMIT_MAX_REQUESTS ? parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) : 60

// Unique route mapped to its rate limit
const uniqueRateLimits: any = {}

const routeRateLimit = function(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  // Disable rate limiting if 0 passed from RATE_LIMIT_MAX_REQUESTS
  if (maxRequests === 0) return next()

  // TODO: Auth: Set or disable rate limit if authenticated user

  // Current route
  const path = req.baseUrl + req.path
  const route = path.split("/").slice(0,4).join("/")

  // Create new RateLimit if none exists for this route
  if (!uniqueRateLimits[route]) {
    uniqueRateLimits[route] = new RateLimit({
      windowMs: 60 * 1000, // 1 minute window
      delayMs: 0, // disable delaying - full speed until the max limit is reached
      max: maxRequests, // start blocking after maxRequests
      handler: function(req: express.Request, res: express.Response /*next*/) {
        res.format({
          json: function() {
            res.status(500).json({
              error: "Too many requests. Limits are 60 requests per minute."
            })
          }
        })
      }
    })
  }

  // Call rate limit for this route
  uniqueRateLimits[route](req, res, next)
}

export {
  routeRateLimit
}
