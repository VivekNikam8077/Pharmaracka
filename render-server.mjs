import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const distDir = path.join(__dirname, 'dist');
app.use(express.static(distDir));

app.get('*', (req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

const port = Number.parseInt(process.env.PORT || '10000', 10) || 10000;
app.listen(port, '0.0.0.0', () => {
  console.log(`Officely UI serving dist on http://0.0.0.0:${port}`);
});
