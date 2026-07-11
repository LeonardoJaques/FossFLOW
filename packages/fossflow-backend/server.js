import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pg from 'pg';

// Load environment variables
dotenv.config();

const { Pool } = pg;

const app = express();
const PORT = process.env.BACKEND_PORT || 3001;

// Configuration from environment variables
const STORAGE_ENABLED = process.env.ENABLE_SERVER_STORAGE === 'true';
const ENABLE_GIT_BACKUP = process.env.ENABLE_GIT_BACKUP === 'true';

const pool = STORAGE_ENABLED
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : null;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check / Storage status endpoint
app.get('/api/storage/status', (req, res) => {
  res.json({
    enabled: STORAGE_ENABLED,
    gitBackup: ENABLE_GIT_BACKUP,
    version: '1.0.0'
  });
});

// Only enable storage endpoints if storage is enabled
if (STORAGE_ENABLED) {
  async function initDb(retries = 10, delay = 3000) {
    for (let i = 1; i <= retries; i++) {
      try {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS diagrams (
            id         TEXT PRIMARY KEY,
            name       TEXT,
            data       JSONB NOT NULL,
            size       INTEGER NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
          )
        `);
        console.log('Diagrams table ready');
        return;
      } catch (err) {
        console.error(`DB attempt ${i}/${retries} failed: ${err.message}`);
        if (i === retries) throw err;
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  initDb().catch((err) => {
    console.error('Failed to initialize database:', err);
  });

  // List all diagrams
  app.get('/api/diagrams', async (req, res) => {
    try {
      const { rows } = await pool.query(
        'SELECT id, name, size, updated_at FROM diagrams ORDER BY updated_at DESC'
      );
      const diagrams = rows.map((row) => ({
        id: row.id,
        name: row.name,
        lastModified: row.updated_at,
        size: row.size
      }));
      console.log(`Returning ${diagrams.length} diagrams`);
      res.json(diagrams);
    } catch (error) {
      console.error('Error listing diagrams:', error);
      res.status(500).json({ error: 'Failed to list diagrams', details: error.message });
    }
  });

  // Get specific diagram
  app.get('/api/diagrams/:id', async (req, res) => {
    const diagramId = req.params.id;
    console.log(`[GET /api/diagrams/${diagramId}] Loading diagram...`);

    try {
      const { rows } = await pool.query('SELECT data FROM diagrams WHERE id = $1', [diagramId]);
      if (!rows.length) {
        console.error(`[GET /api/diagrams/${diagramId}] Diagram not found`);
        return res.status(404).json({ error: 'Diagram not found' });
      }

      const data = rows[0].data;
      console.log(`[GET /api/diagrams/${diagramId}] Successfully loaded, items: ${data.items?.length || 0}`);
      res.json(data);
    } catch (error) {
      console.error(`[GET /api/diagrams/${diagramId}] Error reading diagram:`, error);
      res.status(500).json({ error: 'Failed to read diagram' });
    }
  });

  // Save or update diagram
  app.put('/api/diagrams/:id', async (req, res) => {
    const diagramId = req.params.id;
    console.log(`[PUT /api/diagrams/${diagramId}] Saving diagram...`);

    try {
      const data = {
        ...req.body,
        id: diagramId,
        lastModified: new Date().toISOString()
      };
      const name = data.name || data.title || 'Untitled Diagram';
      const size = Buffer.byteLength(JSON.stringify(data));

      const iconCount = data.icons?.length || 0;
      const importedIconCount = (data.icons || []).filter((icon) => icon.collection === 'imported').length;
      console.log(`[PUT /api/diagrams/${diagramId}]   Items: ${data.items?.length || 0}, Icons: ${iconCount} (${importedIconCount} imported)`);

      await pool.query(
        `INSERT INTO diagrams (id, name, data, size, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (id) DO UPDATE SET name = $2, data = $3, size = $4, updated_at = NOW()`,
        [diagramId, name, data, size]
      );
      console.log(`[PUT /api/diagrams/${diagramId}] Successfully saved`);

      // Git backup if enabled
      if (ENABLE_GIT_BACKUP) {
        // TODO: Implement git commit
        console.log('[PUT] Git backup not yet implemented');
      }

      res.json({ success: true, id: diagramId });
    } catch (error) {
      console.error(`[PUT /api/diagrams/${diagramId}] Error saving diagram:`, error);
      res.status(500).json({ error: 'Failed to save diagram' });
    }
  });

  // Delete diagram
  app.delete('/api/diagrams/:id', async (req, res) => {
    try {
      const { rowCount } = await pool.query('DELETE FROM diagrams WHERE id = $1', [req.params.id]);
      if (rowCount === 0) {
        return res.status(404).json({ error: 'Diagram not found' });
      }
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting diagram:', error);
      res.status(500).json({ error: 'Failed to delete diagram' });
    }
  });

  // Create a new diagram
  app.post('/api/diagrams', async (req, res) => {
    try {
      const id = req.body.id || `diagram_${Date.now()}`;

      const { rows: existing } = await pool.query('SELECT 1 FROM diagrams WHERE id = $1', [id]);
      if (existing.length) {
        return res.status(409).json({ error: 'Diagram already exists' });
      }

      const nowIso = new Date().toISOString();
      const data = {
        ...req.body,
        id,
        created: nowIso,
        lastModified: nowIso
      };
      const name = data.name || data.title || 'Untitled Diagram';
      const size = Buffer.byteLength(JSON.stringify(data));

      await pool.query(
        `INSERT INTO diagrams (id, name, data, size, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())`,
        [id, name, data, size]
      );

      res.status(201).json({ success: true, id });
    } catch (error) {
      console.error('Error creating diagram:', error);
      res.status(500).json({ error: 'Failed to create diagram' });
    }
  });

} else {
  // Storage disabled - return appropriate responses
  app.get('/api/diagrams', (req, res) => {
    res.status(503).json({ error: 'Server storage is disabled' });
  });

  app.get('/api/diagrams/:id', (req, res) => {
    res.status(503).json({ error: 'Server storage is disabled' });
  });

  app.put('/api/diagrams/:id', (req, res) => {
    res.status(503).json({ error: 'Server storage is disabled' });
  });

  app.delete('/api/diagrams/:id', (req, res) => {
    res.status(503).json({ error: 'Server storage is disabled' });
  });

  app.post('/api/diagrams', (req, res) => {
    res.status(503).json({ error: 'Server storage is disabled' });
  });
}

// Start server
app.listen(PORT, () => {
  console.log(`FossFLOW Backend Server running on port ${PORT}`);
  console.log(`Server storage: ${STORAGE_ENABLED ? 'ENABLED' : 'DISABLED'}`);
  if (STORAGE_ENABLED) {
    console.log(`Git backup: ${ENABLE_GIT_BACKUP ? 'ENABLED' : 'DISABLED'}`);
  }
});
