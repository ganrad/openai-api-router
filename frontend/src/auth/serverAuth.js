const msal = require('@azure/msal-node');

const { msalConfig, protectedResources } = require('./serverAuthConfig');

/**
 * With client credentials flows permissions need to be granted in the portal by a tenant administrator.
 * The scope is always in the format '<resource-appId-uri>/.default'. For more, visit:
 * https://docs.microsoft.com/azure/active-directory/develop/v2-oauth2-client-creds-grant-flow
 */
const tokenRequest = {
    scopes: [`${protectedResources.apiGateway.scopes}/.default`],
};

/**
 * Initialize a confidential client application. For more info, visit:
 * https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-node/docs/initialize-confidential-client-application.md
 */

const cca = new msal.ConfidentialClientApplication(msalConfig);

/**
 * Acquires token with client credentials.
 * @param {object} tokenRequest
 */
async function getToken(tokenRequest) {
    console.log(`getToken(): ${JSON.stringify(tokenRequest)}`);
    return await cca.acquireTokenByClientCredential(tokenRequest);
}

module.exports = {
    tokenRequest: tokenRequest,
    getToken: getToken,
};