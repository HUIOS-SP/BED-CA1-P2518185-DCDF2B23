import express from 'express'
import cors from 'cors'

import userRoutes from './src/routes/userRoutes.js'
import userArmyRoutes from './src/routes/userArmyRoutes.js'
import recruitRoutes from './src/routes/recruitRoutes.js'
import tradeRoutes from './src/routes/tradeRoutes.js'
import turnRoutes from './src/routes/turnRoutes.js'
import campaignProgressRoutes from './src/routes/campaignProgressRoutes.js'
import battleRoutes from './src/routes/battleRoutes.js'
import armyLogRoutes from './src/routes/armyLogRoutes.js'
import campaignRoutes from './src/routes/campaignRoutes.js'


const app = express()
const PORT = process.env.PORT || 3000

// Middleware shared by every route.
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: false }))

// Simple health check.
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Leviathan API is running'
  })
})

// one route file is tied to one controller and one model
app.use('/users', userRoutes)
app.use('/users', userArmyRoutes)
app.use('/users', recruitRoutes)
app.use('/users', tradeRoutes)
app.use('/users', turnRoutes)
app.use('/users', campaignProgressRoutes)
app.use('/users', battleRoutes)
app.use('/users', armyLogRoutes)
app.use('/campaigns', campaignRoutes)

const server = app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`API docs at http://localhost:${PORT}/api-docs`);
});
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Try a different port by setting the PORT environment variable.`);
    process.exit(1);
  }
  throw err;
});
