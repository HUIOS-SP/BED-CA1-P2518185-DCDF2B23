import express from 'express'
import cors from 'cors'

import userRoutes from './src/routes/userRoutes.js'
import armyRoutes from './src/routes/armyRoutes.js'

const app = express()
const PORT = process.env.PORT || 3000

app.use(cors())
app.use(express.json())

app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Leviathan API is running'
  })
})

app.use('/users', userRoutes)
app.use('/armies', armyRoutes)

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`)
})