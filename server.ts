import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';

import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));

const TERMUX_DB_PATH = '/data/data/com.termux/files/home/projects/smart-family-medicine-cabinet/药品.json';

app.get('/api/server-db', (req, res) => {
  try {
    if (fs.existsSync(TERMUX_DB_PATH)) {
      const data = fs.readFileSync(TERMUX_DB_PATH, 'utf-8');
      res.json({ success: true, data });
    } else {
      res.json({ success: false, message: 'File not found on server', data: null });
    }
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/server-db', (req, res) => {
  try {
    const { data } = req.body;
    const dir = path.dirname(TERMUX_DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    // ensure data is a string
    const stringData = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    fs.writeFileSync(TERMUX_DB_PATH, stringData, 'utf-8');
    res.json({ success: true, message: 'Saved to server successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Vite middleware for development
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Determine dist path robustly
    const distPath = __dirname; // Since server.cjs is IN the dist folder
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
