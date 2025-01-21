/**
 * Configuration object to be passed to MSAL instance on creation.
 * For a full list of MSAL.js configuration parameters, visit:
 * https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-browser/docs/configuration.md
 */
const msalConfig = {
    auth: {
        clientId: envContext.appClientId, // This is the ONLY mandatory field that you need to supply.
        authority: 'https://login.microsoftonline.com/' + envContext.azTenantId, // Replace the placeholder with your tenant name/ID
        redirectUri: 'http://localhost:8000/ais-chatbot/ui', // You must register this URI on Azure Portal/App Registration. Defaults to window.location.href e.g. http://localhost:3000/,
        postLogoutRedirectUri: '/', // Indicates the page to navigate after logout.
    },
    cache: {
        cacheLocation: 'sessionStorage', // Configures cache location. "sessionStorage" is more secure, but "localStorage" gives you SSO.
        storeAuthStateInCookie: false, // set this to true if you have to support IE
    },
    system: {
        loggerOptions: {
            loggerCallback: (level, message, containsPii) => {
                if (containsPii) {
                    return;
                }
                switch (level) {
                    case msal.LogLevel.Error:
                        console.error(message);
                        return;
                    case msal.LogLevel.Info:
                        console.info(message);
                        return;
                    case msal.LogLevel.Verbose:
                        console.debug(message);
                        return;
                    case msal.LogLevel.Warning:
                        console.warn(message);
                        return;
                    default:
                        return;
                }
            },
        },
    },
};

/**
 * Add here the scopes when obtaining an access token for protected web APIs. For more information, see:
 * https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-browser/docs/resources-and-scopes.md
 */
const protectedResources = {
    apiGateway: {
        scopes: {
            read: [envContext.apiGatewayAppId + '/ApiGateway.Read'], // ['api://Enter_the_Web_Api_Application_Id_Here/ApiGateway.Read'],
            write: [envContext.apiGatewayAppId + '/ApiGateway.ReadWrite'] // ['api://Enter_the_Web_Api_Application_Id_Here/ApiGateway.ReadWrite'],
        },
    },
};

/**
 * Scopes you add here will be prompted for user consent during sign-in.
 * By default, MSAL.js will add OIDC scopes (openid, profile, email) to any login request.
 * For more information about OIDC scopes, visit:
 * https://docs.microsoft.com/en-us/azure/active-directory/develop/v2-permissions-and-consent#openid-connect-scopes
 */
const loginRequest = {
    scopes: [...protectedResources.apiGateway.scopes.read, ...protectedResources.apiGateway.scopes.write],
};

// Create the main myMSALObj instance
// configuration parameters are located at authConfig.js
const myMSALObj = new msal.PublicClientApplication(msalConfig);

let username = '';

function selectAccount() {
    /**
     * See here for more info on account retrieval:
     * https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-common/docs/Accounts.md
     */

    const currentAccounts = myMSALObj.getAllAccounts();
    if (!currentAccounts || currentAccounts.length < 1) {
        return;
    } else if (currentAccounts.length > 1) {
        // Add your account choosing logic here
        console.warn('Multiple accounts detected.');
    } else if (currentAccounts.length === 1) {
        username = currentAccounts[0].username;
    }
}

function updateHeader(aTitle) {
    const unameDiv = document.getElementById('uname-div');
    const authBtn = document.getElementById('auth-anchor');
    if ( aTitle === "Sign-in" ) {
        console.log(`Authenticated user: ${username}`);
        unameDiv.innerHTML = '<b>User:</b> ' + username;
        authBtn.innerHTML = "Sign-out";
    }
    else {
        console.log(`Signed out user: ${username}`);
        unameDiv.innerHTML = "";
        authBtn.innerHTML = "Sign-in";
    };
}

function authenticateUser() {
    if ( ! isAuthEnabled )
        return;

    const anchorText = document.getElementById('auth-anchor').innerHTML;
    if ( anchorText === "Sign-in")
        signIn();
    else
        signOut();
}

function handleResponse(response) {
    /**
     * To see the full list of response object properties, visit:
     * https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-browser/docs/request-response-object.md#response
     */

    if (response !== null) {
        username = response.account.username;
        // console.log(`Authenticated user: ${username}`);
        updateHeader("Sign-in");
    } else {
        selectAccount();
    }
}

function signIn() {
    /**
     * You can pass a custom request object below. This will override the initial configuration. For more information, visit:
     * https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-browser/docs/request-response-object.md#request
     */

    myMSALObj
        .loginPopup({
            ...loginRequest,
            redirectUri: msalConfig.auth.redirectUri,
        })
        .then(handleResponse)
        .catch((error) => {
            console.log(error);
        });
}

/**
 * Retrieves an access token.
 */
async function getToken() {
    let tokenResponse;

    if (typeof getTokenPopup === 'function') {
        tokenResponse = await getTokenPopup({
            scopes: [...protectedResources.apiGateway.scopes.read],
            redirectUri: msalConfig.auth.redirectUri, // '/redirect'
        });
    } else {
        tokenResponse = await getTokenRedirect({
            scopes: [...protectedResources.apiGateway.scopes.read],
        });
    }

    if (!tokenResponse) {
        return null;
    }

    console.log(`Obtained token for user: ${username}`);
    return tokenResponse.accessToken;
}

async function getTokenPopup(request) {
    /**
     * See here for more information on account retrieval:
     * https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-common/docs/Accounts.md
     */
    request.account = myMSALObj.getAccountByUsername(username);
    return myMSALObj.acquireTokenSilent(request).catch((error) => {
        console.warn(error);
        console.warn('silent token acquisition fails. acquiring token using popup');
        if (error instanceof msal.InteractionRequiredAuthError) {
            // fallback to interaction when silent call fails
            return myMSALObj
                .acquireTokenPopup(request)
                .then((response) => {
                    return response;
                })
                .catch((error) => {
                    console.error(error);
                });
        } else {
            console.warn(error);
        }
    });
}

function signOut() {
    /**
     * You can pass a custom request object below. This will override the initial configuration. For more information, visit:
     * https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-browser/docs/request-response-object.md#request
     */

    // Choose which account to logout from by passing a username.
    const logoutRequest = {
        account: myMSALObj.getAccountByUsername(username),
    };
    myMSALObj.logoutPopup(logoutRequest).then(() => {
        window.location.reload();
    });
    // updateHeader("Sign-out");
}

selectAccount();