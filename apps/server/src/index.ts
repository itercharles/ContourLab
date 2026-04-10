import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';

const app: Express = express();
const port = process.env.PORT ?? 4000;

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'webtps-api' });
});

app.listen(port, () => {
  console.log(`WebTPS API server running on port ${port}`);
});

export default app;
