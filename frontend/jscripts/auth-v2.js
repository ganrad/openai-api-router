/**
 * Name: Authzn functions
 * Description: This script is a full rewrite of the auth module and contains functions for authenticating AI App Gateway SPA 
 * (UI frontend) users. AI App Gateway security implementation (library) uses jwks-rsa. Required minimal updates to the SPA.
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 10-29-2025
 * Version (Introduced): v2.8.5
 *  
 * Notes:
 */

/**
 * Add here the scopes when obtaining an access token for protected web APIs. For more information, see:
 * https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-browser/docs/resources-and-scopes.md
 */
const protectedResources = {
  aiGateway: {
    scopes: {
      read: [envContext.apiGatewayAppId + '/AiGateway.read'],
      write: [
        envContext.apiGatewayAppId + '/AiGateway.write',
        envContext.apiGatewayAppId + '/AiGateway.ControlPlane.write'
      ]
    },
  }
};

/**
 * Scopes you add here will be prompted for user consent during sign-in.
 * By default, MSAL.js will add OIDC scopes (openid, profile, email) to any login request.
 * For more information about OIDC scopes, visit:
 * https://docs.microsoft.com/en-us/azure/active-directory/develop/v2-permissions-and-consent#openid-connect-scopes
 */
const loginRequest = {
    scopes: [...protectedResources.aiGateway.scopes.read, ...protectedResources.aiGateway.scopes.write]
};

// 1) MSAL config (keep sessionStorage for easy resets)
const msalConfig = {
  auth: {
    clientId: envContext.appClientId,
    authority: `https://login.microsoftonline.com/${envContext.azTenantId}`,
    redirectUri: 'http://localhost:8000/ais-chatbot/ui',
    postLogoutRedirectUri: '/'
  },
  cache: {
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false
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
      }
    }
  }
};

let username = '';
const msalInstance = new msal.PublicClientApplication(msalConfig);

// 2) Handle redirect callbacks early (if you ever use redirect flows)
msalInstance.handleRedirectPromise().then((response) => {
  if (response?.account) {
    msalInstance.setActiveAccount(response.account);
  } else {
    const accts = msalInstance.getAllAccounts();
    if (accts.length) msalInstance.setActiveAccount(accts[0]);
  }
});

// 0 Entry point:
function authenticateUser() {
  if (!isAuthEnabled)
    return;

  const anchorText = document.getElementById('auth-anchor').innerHTML;
  if (anchorText === "Sign-in")
    signIn();
  else
    signOut();
}

function updateHeader(aTitle) {
  const unameDiv = document.getElementById('uname-div');
  const authBtn = document.getElementById('auth-anchor');
  if (aTitle === "Sign-in") {
    console.log(`updateHeader(): Authenticated user: ${username}`);
    unameDiv.innerHTML = '<b>User:</b> ' + username;
    authBtn.innerHTML = "Sign-out";
  }
  else {
    console.log(`updateHeader(): Signed out user: ${username}`);
    unameDiv.innerHTML = "";
    authBtn.innerHTML = "Sign-in";
  };
}

// 3) Login: OIDC scopes only
async function signIn() {
  try {
    const result = await msalInstance.loginPopup({
      scopes: ["openid", "profile", "offline_access", "email"],
      // prompt: "login" // optional to force the sign-in UX
    });

    username = result.account.username;
    console.log(`signIn(): Obtained ID Token for user: ${username}`);
    msalInstance.setActiveAccount(result.account);
    updateHeader("Sign-in");
  }
  catch (error) {
    console.warn(`signIn(): Encountered error while acquiring ID Token: ${error}`);
  };
}

/**
 * Token acquisition: Retrieves an access token.
 */
async function getToken() {
  let token = null;
  try {
    token = await getAccessToken();
    console.log(`getToken(): Obtained UAT for user: ${username}`);
  }
  catch (error) {
    console.warn(`getToken(): Encountered error while acquiring UAT: ${error}`);
  };

  return token;
}

// 4) Helper to get the active account safely
function getActiveAccountOrThrow() {
  const account = msalInstance.getActiveAccount() || msalInstance.getAllAccounts()[0];
  if (!account)
    throw new Error("No account. Call signIn() first.");

  return account;
}

// 5) Token acquisition (test one scope at a time)
async function getAccessToken() {
  const account = getActiveAccountOrThrow();
  const request = {
    scopes: loginRequest.scopes, // <-- while testing, test a single scope
    account,
    forceRefresh: true // <-- For testing, bypass AT cache. Set this to false in production.
  };

  try {
    const resp = await msalInstance.acquireTokenSilent(request);
    logJwt(resp.accessToken);
    return resp.accessToken;
  }
  catch (e) {
    // For testing, ALWAYS fall back to interactive with consent prompt
    console.warn("getAccessToken(): Silent token failed, falling back to popup with consent:", e);
    const resp = await msalInstance.acquireTokenPopup({
      ...request,
      prompt: "consent" // <-- force consent UX
    });
    logJwt(resp.accessToken);
    return resp.accessToken;
  }
}

// 6) Simple token inspector for debugging
function logJwt(token) {
  try {
    const [, payloadB64] = token.split(".");
    const json = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")));
    console.log("logJwt(): Token -> aud:", json.aud, "scp:", json.scp, "iat:", new Date(json.iat * 1000), "exp:", new Date(json.exp * 1000));
  } catch { /* ignore */ }
}

// 7) Logout + clear cache (dev-only convenience)
async function signOut() {
  const account = msalInstance.getActiveAccount();
  await msalInstance.logoutPopup({ account });
  username = '';

  sessionStorage.clear(); // since cacheLocation is sessionStorage
  localStorage.clear();   // if you ever switch to localStorage

  window.location.reload(); // reload the console web page
}