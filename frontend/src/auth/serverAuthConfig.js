/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Configuration object to be passed to MSAL instance on creation.
 * For a full list of MSAL Node configuration parameters, visit:
 * https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-node/docs/configuration.md
 */

const msalConfig = {
    auth: {
        clientId: 'Application (client) ID of app registration in Microsoft Entra admin center - this value is a GUID',
        authority: 'Replace the placeholder with your tenant subdomain',
        clientSecret: 'Client secret generated from the app registration in Microsoft Entra admin center'
        // clientCertificate: {
        //     thumbprint:  process.env.CERT_THUMBPRINT || 'YOUR_CERT_THUMBPRINT', // replace with thumbprint obtained during step 2 above
        //     privateKey: fs.readFileSync(process.env.CERT_PRIVATE_KEY_FILE || 'PATH_TO_YOUR_PRIVATE_KEY_FILE'), // e.g. c:/Users/diego/Desktop/example.key
        // },
    },
    system: {
        loggerOptions: {
            loggerCallback(loglevel, message, containsPii) {
                console.log(message);
            },
            piiLoggingEnabled: false,
            logLevel: 'Info',
        },
    },
};

const protectedResources = {
    apiGateway: { // Set the App ID URI of the AI App Gateway App Registration
        scopes: 'Set the App ID URI of the AI App Gateway App Registration'
    },
};

module.exports = {
    msalConfig,
    protectedResources,
};