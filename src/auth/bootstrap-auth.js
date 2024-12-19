/**
 * Name: AI Application Gateway/Router Auth bootstrap module
 * Description: This module is used to authenticate users/client apps using passport.js library.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 07-29-2024
 * Version: 2.0 (Introduced)
 *
 * Notes:
 * ID09272024: ganrad: (Bugfix) Bearer strategy object should only be instantiated when auth=true.
 * ID11192024: ganrad: (Enhancement) a) Support User + Client App OR Client App only authentication. b) Bypass Auth check for 
 * 'healthz' endpoint.
 */

const passport = require('passport');
const passportAzureAd = require('passport-azure-ad');
const authConfig = require('./config');

const path = require('path');
const scriptName = path.basename(__filename);
const logger = require('../utilities/logger');

// ID11192024.sn
function isAuthCheckRequiredForUri(req) {
  if ( req.path === '/healthz' ) // No auth check required for '/healthz' endpoint
    return false;

  return true;
}
// ID11192024.en

function initAuth(app, endpoint) {
  logger.log({ level: "info", message: "[%s] initAuth(): Protected endpoint: [%s]", splat: [scriptName, endpoint] });

  const bearerStrategy = new passportAzureAd.BearerStrategy({ // ID09272024.n
    identityMetadata: `https://${authConfig.metadata.authority}/${authConfig.credentials.tenantID}/${authConfig.metadata.version}/${authConfig.metadata.discovery}`,
    issuer: `https://${authConfig.metadata.authority}/${authConfig.credentials.tenantID}/${authConfig.metadata.version}`,
    clientID: authConfig.credentials.clientID,
    audience: authConfig.credentials.clientID, // audience is this API application
    validateIssuer: authConfig.settings.validateIssuer,
    passReqToCallback: authConfig.settings.passReqToCallback,
    loggingLevel: authConfig.settings.loggingLevel,
    loggingNoPII: authConfig.settings.loggingNoPII,
  }, (req, token, done) => {

    /**
     * Below you can do extended token validation and check for additional claims, such as:
     * - check if the caller's tenant is in the allowed tenants list via the 'tid' claim (for multi-tenant applications)
     * - check if the caller's account is homed or guest via the 'acct' optional claim
     * - check if the caller belongs to right roles or groups via the 'roles' or 'groups' claim, respectively
     *
     * Bear in mind that you can do any of the above checks within the individual routes and/or controllers as well.
     * For more information, visit: https://docs.microsoft.com/azure/active-directory/develop/access-tokens#validate-the-user-has-permission-to-access-this-data
     */


    /**
     * Lines below verifies if the caller's client ID is in the list of allowed clients.
     * This ensures only the applications with the right client ID can access this API.
     * To do so, we use "azp" claim in the access token. Uncomment the lines below to enable this check.
     */

    // const myAllowedClientsList = [
    //     /* add here the client IDs of the applications that are allowed to call this API */
    // ]

    // if (!myAllowedClientsList.includes(token.azp)) {
    //     return done(new Error('Unauthorized'), {}, "Client not allowed");
    // }


    /**
     * Access tokens that have neither the 'scp' (for delegated permissions) nor
     * 'roles' (for application permissions) claim are not to be honored.
     */
    if (!token.hasOwnProperty('scp') && !token.hasOwnProperty('roles')) {
      return done(new Error('Unauthorized'), null, "No delegated or app permission claims found");
    }

    /**
     * If needed, pass down additional user info to route using the second argument below.
     * This information will be available in the req.user object.
     */
    const userInfo = {
      name: token.name,
      email: token.preferred_username,
    };
    return done(null, userInfo, token);
  });

  app.use(passport.initialize());

  passport.use(bearerStrategy);

  app.use(endpoint, (req, res, next) => {
    logger.log({
      level: "info", message: "[%s] initAuth(): Auth check ...\n  Request ID: %s\n  URL: %s\n  Base URL: %s\n  Path: %s",
      splat: [scriptName, req.id, req.originalUrl, req.baseUrl, req.path]
    });

    if ( ! isAuthCheckRequiredForUri(req) ) // ID11192024.n
      return next();

    passport.authenticate('oauth-bearer', {
      session: false,

      /**
       * If you are building a multi-tenant application and you need supply the tenant ID or name dynamically,
       * uncomment the line below and pass in the tenant information. For more information, see:
       * https://github.com/AzureAD/passport-azure-ad#423-options-available-for-passportauthenticate
       */

      // tenantIdOrName: <some-tenant-id-or-name>

    }, (err, user, info) => {
      if (err) {
        /**
         * An error occurred during authorization. Either pass the error to the next function
         * for Express error handler to handle, or send a response with the appropriate status code.
         */
        return res.status(401).json({ error: err.message });
      }

      // ID11192024.sn
      if (!user) {
        if (info && (info.aud === authConfig.credentials.clientID))
          // access token payload will be available in req.authInfo downstream
          req.authInfo = info; // store the auth info in request object
        else
          return res.status(401).json({ error: "Invalid Auth token. User Auth and Client App. Auth failed! Unable to process request." });
      }
      else {
        req.user = user; // store the user info in request object
        req.authInfo = info;
      };
      // ID11192024.en

      logger.log({ level: "info", message: "[%s] initAuth():\n  Request ID: [%s]\n  Auth. Info: [%s]\n  User Info: [%s]", splat: [scriptName, req.id, req.authInfo, req.user] });
      return next();
    })(req, res, next);
  }); // end of middleware
  logger.log({ level: "info", message: "[%s] initAuth(): Initialized passport for authenticating users/apps using Azure Entra ID (OP)", splat: [scriptName] });
}

module.exports = initAuth;