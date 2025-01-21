const axios = require('axios');
const auth = require('./serverAuth');

/**
 * Calls the endpoint with authorization bearer token.
 * @param {string} endpoint 
 * @param {string} accessToken 
 */
async function callApi(endpoint, accessToken) {

    const options = {
        headers: {
            Authorization: `Bearer ${accessToken}`
        }
    };

    console.log('Request made to AI Application Gateway at: ' + new Date().toString());

    try {
        const response = await axios.get(endpoint, options);
        return response.data;
    } catch (error) {
        throw error; // Failed to authenticate!
    }
};

async function authenticateSpa(gatewayUri) {
    try {
        // console.log("Passed step 0");
        const authResponse = await auth.getToken(auth.tokenRequest);
        // console.log("Passed step 1");
        const apiResponse = await callApi(gatewayUri, authResponse.accessToken);
        
        console.log(`authenticateSpa(): AI App Gateway Instance Data:\n${JSON.stringify(apiResponse,null,2)}`);
    } catch (error) {
        console.log(`authenticateSpa(): Encountered Exception:\n${error}`);
    };
};

module.exports = authenticateSpa;