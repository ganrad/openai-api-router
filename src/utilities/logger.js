/**
 * Name: Logging module
 * Description: A common module for logging AI Services component messages.  Use additional transports as 
 * needed.  Refer to documentation at https://github.com/winstonjs 
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 04-27-2024
 *
 * Notes:
 *
 */

const { createLogger, format, transports } = require('winston');
const { colorize, combine, printf, splat, timestamp } = format;

const logFormat = printf(({ level, message, timestamp }) => {
    return `${timestamp} [${level}] ${message}`;
});

const wlogger = createLogger({
  level: process.env.API_GATEWAY_LOG_LEVEL ?? 'info',
  format: combine(
    colorize({level: true, colors: {info: "green", warn: "yellow", error: "red"}}),
    timestamp({format: "DD-MMM-YYYY HH:mm:ss"}),
    splat(),
    logFormat,
  ),
  transports: [new transports.Console()]
});

module.exports = wlogger;
