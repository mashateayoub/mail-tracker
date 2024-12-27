const express = require('express');
const { v4: uuidv4 } = require('uuid');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: false }));

// 1) Initialize the SQLite DB
const db = new sqlite3.Database(path.join(__dirname, 'mail-tracker.db'), (err) => {
  if (err) {
    console.error('Error opening SQLite database:', err);
  } else {
    console.log('Connected to SQLite database.');

    // Create the tables if they don't exist
    db.run(`
      CREATE TABLE IF NOT EXISTS pixels (
        id TEXT PRIMARY KEY,
        name TEXT,
        createdAt TEXT
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pixelId TEXT,
        time TEXT,
        ip TEXT,
        userAgent TEXT
      )
    `);
  }
});

// 2) Dashboard: list all pixels
app.get('/', (req, res) => {
  const query = 'SELECT * FROM pixels ORDER BY createdAt DESC';
  db.all(query, [], (err, pixels) => {
    if (err) {
      return res.status(500).send('Error querying pixels.');
    }
    res.render('index', { pixels });
  });
});

// 3) Create a new pixel
app.post('/create', (req, res) => {
  const { name } = req.body;
  const pixelId = uuidv4();
  const createdAt = new Date().toISOString();

  const insertPixel = 'INSERT INTO pixels (id, name, createdAt) VALUES (?, ?, ?)';
  db.run(insertPixel, [pixelId, name || `Pixel-${pixelId.slice(0, 8)}`, createdAt], (err) => {
    if (err) {
      console.error('Error inserting pixel:', err);
      return res.status(500).send('Error creating pixel.');
    }
    res.redirect('/');
  });
});

// 4) Tracker route: returns a 1×1 PNG and logs the request
app.get('/tracker/:id.png', (req, res) => {
  const pixelId = req.params.id;

  // Check if the pixel ID exists
  const selectPixel = 'SELECT * FROM pixels WHERE id = ?';
  db.get(selectPixel, [pixelId], (err, pixel) => {
    if (err) {
      console.error('Error looking up pixel:', err);
      return res.status(500).send('Error retrieving pixel.');
    }
    if (!pixel) {
      return res.status(404).send('Pixel not found');
    }

    // Log the open
    const time = new Date().toISOString();
    const ip = req.ip;
    const userAgent = req.headers['user-agent'] || '';

    const insertLog = 'INSERT INTO logs (pixelId, time, ip, userAgent) VALUES (?, ?, ?, ?)';
    db.run(insertLog, [pixelId, time, ip, userAgent], (logErr) => {
      if (logErr) {
        console.error('Error inserting log:', logErr);
      }
      // Return 1×1 transparent PNG
      const pngBase64 =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWNgYGD4DwABBAEAzrfLDwAAAABJRU5ErkJggg==';
      const imageBuffer = Buffer.from(pngBase64, 'base64');

      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Content-Length': imageBuffer.length
      });
      res.end(imageBuffer);
    });
  });
});

// 5) View logs for a specific pixel
app.get('/logs/:id', (req, res) => {
  const pixelId = req.params.id;

  // Grab the pixel info
  const selectPixel = 'SELECT * FROM pixels WHERE id = ?';
  db.get(selectPixel, [pixelId], (err, pixel) => {
    if (err) {
      console.error('Error retrieving pixel:', err);
      return res.status(500).send('Error retrieving pixel.');
    }
    if (!pixel) {
      return res.status(404).send('Pixel not found');
    }

    // Grab the logs for that pixel
    const selectLogs = 'SELECT * FROM logs WHERE pixelId = ? ORDER BY time DESC';
    db.all(selectLogs, [pixelId], (logsErr, logs) => {
      if (logsErr) {
        console.error('Error retrieving logs:', logsErr);
        return res.status(500).send('Error retrieving logs.');
      }
      res.render('logs', { pixel, logs });
    });
  });
});

// 6) Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
