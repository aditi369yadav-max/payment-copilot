import winston from 'winston';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(({ level, message, timestamp, ...meta }) => {
      const m = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
      return `${timestamp} ${level}: ${message}${m}`;
    })
  ),
  transports: [new winston.transports.Console()],
});
