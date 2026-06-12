import * as userModel from '../models/userModel.js'

export const getUsers = async (req, res) => {
  try {
    const users = await userModel.getAllUsers()

    res.status(200).json({
      message: 'Users retrieved successfully.',
      data: users
    })
  } catch (error) {
    console.error('getUsers error:', error)
    res.status(500).json({ error: 'Internal Server Error.' })
  }
}

export const createUser = async (req, res) => {
  try {
    const { username, password } = req.body

    if (!username || !password) {
      return res.status(400).json({
        error: 'Username and password are required.'
      })
    }

    const user = await userModel.createUser({ username, password })

    res.status(201).json({
      message: 'User created successfully.',
      data: user
    })
  } catch (error) {
    console.error('createUser error:', error)

    if (error.message?.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Username already exists.' })
    }

    res.status(500).json({ error: 'Internal Server Error.' })
  }
}