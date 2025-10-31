/**
 * Name: AI Application Gateway/Router auth config module.
 * Description: This module is used for securing the AI Gateway using OAuth + PKCE + OpenID Connect (Bearer Strategy).
 *
 * IMPORTANT:
 * Make sure the user delegated and application permissions configured in the 'securityConfig' variable and listed under 
 * 'protectedRoutes.aigateway' attribute are configured in Microsoft Entra ID.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 10-25-2025
 * Version (Introduced): 2.8.5
 *
 * Notes:
 */

// IMPORTANT:
// Update the permission values (if needed) based on AI Gateway App Registration 'API permissions' configured in MSFT Entra ID
const permissionsConfig = {
    RouterReadPermission: "AiGateway.read", // Allows read access to all gateway resources
    RouterWritePermission: "AiGateway.write", // Allows write (Post) / inferencing access to models/agents
    ControlPlaneWritePermission: "AiGateway.ControlPlane.write" // Allows read and write access to resources exposed via control plane
}

const env = process.env;

const securityConfig = {
    credentials: {
        tenantID: env.AZURE_TENANT_ID,
        clientID: env.API_GATEWAY_CLIENT_ID
    },
    metadata: {
        authority: "https://login.microsoftonline.com",
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
        aigateway: {
            endpoint: "/api/v1/dev/aigateway/",
            delegatedPermissions: { // OAuth code flow user delegated permissions
                read: permissionsConfig.RouterReadPermission,
                write: permissionsConfig.RouterWritePermission,
                controlPlaneWrite: permissionsConfig.ControlPlaneWritePermission
            },
            applicationPermissions: { // OAuth client credentials flow app role permissions
                read: "", // "AiGateway.read",
                write: "", // "AiGateway.write"
                controlPlaneWrite: "" // "AiGateway.ControlPlane.write"
            }
        }
    }
}

module.exports = {
    permissionsConfig,
    securityConfig
};
