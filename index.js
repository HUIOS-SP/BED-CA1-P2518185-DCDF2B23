import express from 'express'
import cors from 'cors'

import userRoutes from './src/routes/userRoutes.js'
import armyRoutes from './src/routes/armyRoutes.js'
import campaignRoutes from './src/routes/campaignRoutes.js'

const app = express()
const PORT = process.env.PORT || 3000

// Parse common request formats once here so every route gets the same setup
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: false }))

// Tiny health check for Postman, tests, or a quick "is this thing alive?" check
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Leviathan API is running'
  })
})

// Route files stay grouped by domain so index.js does not become router soup
app.use('/users', userRoutes)
app.use('/users', armyRoutes)
app.use('/campaigns', campaignRoutes)

// If no route matched, fail clearly instead of returning Express's default HTML page
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found.' })
})

// Unexpected errors land here after controllers call next(error)
app.use((error, req, res, next) => {
  // Express identifies malformed JSON with this error type, so the client gets a useful 400
  if (error && error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON body.' })
  }

  console.error('Unhandled request error:', error)
  res.status(500).json({ error: 'Internal Server Error.' })
})

const server = app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`)
})

// A friendly port message beats a giant stack trace when another server is already running
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Try a different port by setting the PORT environment variable.`)
    process.exit(1)
  }
  throw err
})
