import http from 'http';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { apiRouter } from './routes/api';
import { env } from './config/env';
import { errorHandler } from './lib/errors';
import { initializeSocketServer } from './lib/socket';

const app = express();
const server = http.createServer(app);

app.use(
  helmet({
    crossOriginResourcePolicy: false,
  }),
);
app.use(
  cors({
    origin: env.clientOrigin,
    credentials: true,
  }),
);
app.use(morgan('dev'));
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api', apiRouter);
app.use(errorHandler);

initializeSocketServer(server, env.clientOrigin);

server.listen(env.port, () => {
  console.log(`Hustle-Arena API listening on ${env.port}`);
});
