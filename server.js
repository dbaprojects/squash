require('dotenv').config();
const express = require('express');
const session = require('express-session');
const MemoryStore = require('memorystore')(session);
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-prod',
  resave: false,
  saveUninitialized: false,
  store: new MemoryStore({ checkPeriod: 86400000 }),  // prune expired sessions daily
  cookie: {
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000  // 7 days
  }
}));

app.use(express.static(path.join(__dirname, 'docs')));

// API routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api', require('./routes/players'));
app.use('/api', require('./routes/events'));
app.use('/api', require('./routes/templates'));
app.use('/api', require('./routes/signups'));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'docs', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Squash Club running at http://localhost:${PORT}`);
  console.log(`Backend: ${process.env.DB_BACKEND || 'sqlite'}`);
});
