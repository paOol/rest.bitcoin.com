/*
  Handle authorization for bypassing rate limits.
*/

"use strict"

const passport = require("passport")
const BasicStrategy = require("passport-http").BasicStrategy

// Used for debugging and iterrogating JS objects.
const util = require("util")
util.inspect.defaultOptions = { depth: 1 }

let _this

class AuthMW {
  constructor() {
    _this = this

    // Initialize passport for 'basic' authentication.
    passport.use(
      new BasicStrategy({ passReqToCallback: true }, function(
        req,
        username,
        password,
        done
      ) {
        //console.log(`passport: ${util.inspect(passport)}`)
        //console.log(`_this: ${util.inspect(_this)}`)
        //console.log(`req: ${util.inspect(req)}`)
        console.log(`username: ${username}`)
        console.log(`password: ${password}`)

        // Create the req.locals property if it does not yet exist.
        if (!req.locals) req.locals = {}

        if (username === "BITBOX") {
          // Success
          req.locals.rateLimit = true
        } else {
          req.locals.rateLimit = false
        }

        console.log(`req.locals: ${util.inspect(req.locals)}`)

        return done(null, true)
      })
    )
  }

  // Middleware called by the route.
  mw() {
    return passport.authenticate("basic", {
      session: false
    })
  }
}

module.exports = AuthMW
