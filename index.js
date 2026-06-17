import express from 'express'
import cors from 'cors'

import userRoutes from './src/routes/userRoutes.js'
import armyRoutes from './src/routes/armyRoutes.js'
import userArmyRoutes from './src/routes/userArmyRoutes.js'
import recruitRoutes from './src/routes/recruitRoutes.js'
import tradeRoutes from './src/routes/tradeRoutes.js'
import turnRoutes from './src/routes/turnRoutes.js'
import campaignProgressRoutes from './src/routes/campaignProgressRoutes.js'
import battleRoutes from './src/routes/battleRoutes.js'
import armyLogRoutes from './src/routes/armyLogRoutes.js'
import campaignRoutes from './src/routes/campaignRoutes.js'

// Create the Express app and choose a port from .env if provided.
const app = express()
const PORT = process.env.PORT || 3000

// Middleware shared by every route.
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: false }))

// Simple health check route for browser/Postman testing.
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
app.use('/armies', armyRoutes)
app.use('/campaigns', campaignRoutes)

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`)
})
