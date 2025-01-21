#!/usr/bin/env node

// read in env settings

// require('dotenv').config();

const yargs = require('yargs');
// const fetch = require('./fetch');
const authenticateSpa = require('./auth/authSpa');

const options = yargs
    .usage('Usage: --op <operation_name>')
    .option('op', { alias: 'operation', describe: 'operation name', type: 'string', demandOption: true })
    .argv;

async function main() {
    console.log(`You have selected: ${options.op}`);

    switch (yargs.argv['op']) {
        case 'instanceinfo':

            try {
                const response = await authenticateSpa('http://x.x.x.x:8080/api/v1/dev/apirouter/instanceinfo');
            } catch (error) {
                console.log(error);
            }

            break;
        default:
            console.log('Select an operation first');
            break;
    }
};

main();