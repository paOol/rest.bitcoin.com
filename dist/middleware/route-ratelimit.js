"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var RateLimit = require("express-rate-limit");
// Used for debugging.
var util = require("util");
util.inspect.defaultOptions = { depth: 3 };
// Set max requests per minute
var maxRequests = process.env.RATE_LIMIT_MAX_REQUESTS
    ? parseInt(process.env.RATE_LIMIT_MAX_REQUESTS)
    : 60;
// Unique route mapped to its rate limit
var uniqueRateLimits = {};
var routeRateLimit = function (req, res, next) {
    // Disable rate limiting if 0 passed from RATE_LIMIT_MAX_REQUESTS
    if (maxRequests === 0)
        return next();
    // TODO: Auth: Set or disable rate limit if authenticated user
    // Current route
    var path = req.baseUrl + req.path;
    var route = req.method +
        path
            .split("/")
            .slice(0, 4)
            .join("/");
    // Create new RateLimit if none exists for this route
    if (!uniqueRateLimits[route]) {
        uniqueRateLimits[route] = new RateLimit({
            windowMs: 60 * 1000,
            delayMs: 0,
            max: maxRequests,
            handler: function (req, res /*next*/) {
                res.status(429); // https://github.com/Bitcoin-com/rest.bitcoin.com/issues/330
                return res.json({
                    error: "Too many requests. Limits are 60 requests per minute."
                });
            }
        });
    }
    // Call rate limit for this route
    uniqueRateLimits[route](req, res, next);
};
exports.routeRateLimit = routeRateLimit;
