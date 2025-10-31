/**
 * Name: AI Application Gateway/Router auth config module.
 * Description: This module is used to configure passport.js OpenID connect library (Bearer Strategy).
 *
 * IMPORTANT:
 * Make sure the delegated and application permissions configured in the 'passportConfig' variable and listed under 'protectedRoutes.apigateway' 
 * attribute are configured in Microsoft Entra.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 07-29-2024
 * Version: 2.0 (Introduced)
 *
 * Notes:
 * ID10292025: ganrad: v2.8.5: (Deprecated) This script is deprecated & no longer used. Refer to 'securityConfig.js' script.
 */

const env = process.env;

const passportConfig = {
    credentials: {
        tenantID: env.AZURE_TENANT_ID,
        clientID: env.API_GATEWAY_CLIENT_ID
    },
    metadata: {
        authority: "login.microsoftonline.com",
        discovery: ".well-known/openid-configuration",
        version: "v2.0"
    },
    settings: {
        validateIssuer: true,
        passReqToCallback: true,
        loggingLevel: "info",
        loggingNoPII: true,
    },
    protectedRoutes: {
        apigateway: {
            endpoint: "/api/v1/dev/aigateway/",
            delegatedPermissions: {
                read: ["ApiGateway.Read", "ApiGateway.ReadWrite"],
                write: ["ApiGateway.ReadWrite"]
            },
            applicationPermissions: {
                read: ["ApiGateway.Read.All", "ApiGateway.ReadWrite.All"],
                write: ["ApiGateway.ReadWrite.All"]
            }
        }
    }
}

module.exports = passportConfig;
