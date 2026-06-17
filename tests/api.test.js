// BY AI
import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { setTimeout as wait } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import {
  BATTLE_TRIGGER_ENEMY_AUTO_ATTACK,
  BATTLE_TRIGGER_MANUAL,
  CAMPAIGNS,
  ENEMY_ATTACK_AT_TURN,
  UNIT_TYPES
} from '../src/constants/gameBalance.js'
import {
  ARMY_NAME_MAX_LENGTH,
  USERNAME_MAX_LENGTH
} from '../src/constants/validation.js'

const testFilePath = fileURLToPath(import.meta.url)
const testDirectory = dirname(testFilePath)
const projectRoot = resolve(testDirectory, '..')
const databaseFile = join(testDirectory, 'tmp-api-test.db')
const databaseUrl = 'file:./tests/tmp-api-test.db'
const port = 3200 + Math.floor(Math.random() * 500)
const baseUrl = `http://localhost:${port}`

let serverProcess
let serverOutput = ''
let serverErrorOutput = ''

function removeDatabaseFiles() {
  const databaseFiles = [
    databaseFile,
    `${databaseFile}-shm`,
    `${databaseFile}-wal`
  ]

  for (const filePath of databaseFiles) {
    if (existsSync(filePath)) {
      rmSync(filePath, { force: true })
    }
  }
}

function runNodeCommand(args) {
  execFileSync(process.execPath, args, {
    cwd: projectRoot,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl
    },
    stdio: 'pipe'
  })
}

function runDatabaseScript(script) {
  runNodeCommand(['--input-type=module', '-e', script])
}

function setupDatabase() {
  runNodeCommand(['node_modules/drizzle-kit/bin.cjs', 'push'])
  runNodeCommand(['src/db/seed.js'])
}

async function startServer() {
  serverProcess = spawn(process.execPath, ['index.js'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      PORT: String(port)
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })

  serverProcess.stdout.on('data', (chunk) => {
    serverOutput = serverOutput + chunk.toString()
  })

  serverProcess.stderr.on('data', (chunk) => {
    serverErrorOutput = serverErrorOutput + chunk.toString()
  })

  await waitForServer()
}

async function waitForServer() {
  let lastError = ''

  for (let attempt = 1; attempt <= 40; attempt++) {
    try {
      const response = await fetch(`${baseUrl}/`)

      if (response.status === 200) {
        return
      }
    } catch (error) {
      lastError = error.message
    }

    await wait(250)
  }

  throw new Error(
    `Server did not become ready. Last error: ${lastError}\n` +
    `stdout: ${serverOutput}\n` +
    `stderr: ${serverErrorOutput}`
  )
}

async function stopServer() {
  if (serverProcess) {
    serverProcess.kill()
    await wait(500)
  }
}

async function request(path, options = {}) {
  const fetchOptions = {
    method: 'GET',
    headers: {}
  }

  if (options.method) {
    fetchOptions.method = options.method
  }

  if (options.body !== undefined) {
    fetchOptions.headers['Content-Type'] = 'application/json'
    fetchOptions.body = JSON.stringify(options.body)
  }

  if (options.form !== undefined) {
    fetchOptions.headers['Content-Type'] = 'application/x-www-form-urlencoded'
    fetchOptions.body = new URLSearchParams(options.form).toString()
  }

  const response = await fetch(`${baseUrl}${path}`, fetchOptions)
  const text = await response.text()
  let body = null

  if (text.length > 0) {
    body = JSON.parse(text)
  }

  return {
    status: response.status,
    body,
    text,
    contentType: response.headers.get('content-type')
  }
}

async function rawRequest(path, options = {}) {
  const fetchOptions = {
    method: options.method || 'GET',
    headers: options.headers || {}
  }

  if (options.rawBody !== undefined) {
    fetchOptions.body = options.rawBody
  }

  const response = await fetch(`${baseUrl}${path}`, fetchOptions)
  const text = await response.text()

  return {
    status: response.status,
    text
  }
}

function assertStatus(result, expectedStatus) {
  assert.equal(
    result.status,
    expectedStatus,
    `Expected ${expectedStatus}, got ${result.status}. Body: ${JSON.stringify(result.body)}`
  )
}

function findRowByName(rows, fieldName, expectedName) {
  return rows.find((row) => row[fieldName] === expectedName)
}

function createUniqueName(prefix) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`
}

async function createUser(body = {}) {
  const username = body.username || createUniqueName('user')
  const password = body.password || 'password123'
  const requestBody = {
    username,
    password
  }

  if (body.armyName !== undefined) {
    requestBody.armyName = body.armyName
  }

  const result = await request('/users', {
    method: 'POST',
    body: requestBody
  })

  assertStatus(result, 201)

  return result
}

function setGameCompletedForUser(userId, gameCompleted) {
  runDatabaseScript(`
    const { eq } = await import('drizzle-orm')
    const { db } = await import('./src/db/db.js')
    const { armies, armyCampaignProgress } = await import('./src/db/schema.js')

    const [army] = await db
      .select()
      .from(armies)
      .where(eq(armies.userId, ${Number(userId)}))

    await db
      .update(armyCampaignProgress)
      .set({ gameCompleted: ${Boolean(gameCompleted)} })
      .where(eq(armyCampaignProgress.armyId, army.id))
  `)
}

function deleteCampaignProgressForUser(userId) {
  runDatabaseScript(`
    const { eq } = await import('drizzle-orm')
    const { db } = await import('./src/db/db.js')
    const { armies, armyCampaignProgress } = await import('./src/db/schema.js')

    const [army] = await db
      .select()
      .from(armies)
      .where(eq(armies.userId, ${Number(userId)}))

    await db
      .delete(armyCampaignProgress)
      .where(eq(armyCampaignProgress.armyId, army.id))
  `)
}

function deleteArmyForUser(userId) {
  runDatabaseScript(`
    const { eq } = await import('drizzle-orm')
    const { db } = await import('./src/db/db.js')
    const { armies } = await import('./src/db/schema.js')

    await db.delete(armies).where(eq(armies.userId, ${Number(userId)}))
  `)
}

function setCurrentEnemySequenceForUser(userId, sequence) {
  runDatabaseScript(`
    const { eq } = await import('drizzle-orm')
    const { db } = await import('./src/db/db.js')
    const { armies, armyCampaignProgress } = await import('./src/db/schema.js')

    const [army] = await db
      .select()
      .from(armies)
      .where(eq(armies.userId, ${Number(userId)}))

    await db
      .update(armyCampaignProgress)
      .set({ currentEnemySequence: ${Number(sequence)} })
      .where(eq(armyCampaignProgress.armyId, army.id))
  `)
}

// Moves an army to a seeded campaign for campaign-production integration tests.
function setCampaignForUser(userId, campaignNumber) {
  runDatabaseScript(`
    const { eq } = await import('drizzle-orm')
    const { db } = await import('./src/db/db.js')
    const { armies, armyCampaignProgress, campaigns } = await import('./src/db/schema.js')

    const [army] = await db
      .select()
      .from(armies)
      .where(eq(armies.userId, ${Number(userId)}))
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.campaignNumber, ${Number(campaignNumber)}))

    await db
      .update(armyCampaignProgress)
      .set({
        campaignId: campaign.id,
        currentEnemySequence: 1,
        turnsOnCurrentEnemy: 0,
        gameCompleted: false
      })
      .where(eq(armyCampaignProgress.armyId, army.id))
  `)
}

// Changes one seeded rate to verify that the API rejects corrupted campaign data.
function setCampaignManpowerGain(campaignNumber, manpowerGainPerTurn) {
  runDatabaseScript(`
    const { eq } = await import('drizzle-orm')
    const { db } = await import('./src/db/db.js')
    const { campaigns } = await import('./src/db/schema.js')

    await db
      .update(campaigns)
      .set({ manpowerGainPerTurn: ${Number(manpowerGainPerTurn)} })
      .where(eq(campaigns.campaignNumber, ${Number(campaignNumber)}))
  `)
}

function assertSuccessShape(result) {
  const keys = Object.keys(result.body).sort()

  assert.deepEqual(keys, ['data', 'message'])
}

before(async () => {
  removeDatabaseFiles()
  setupDatabase()
  await startServer()
})

after(async () => {
  await stopServer()
  removeDatabaseFiles()
})

test('Leviathan API detailed workflow and edge cases', async (t) => {
  let userId
  let username

  await t.test('health check works', async () => {
    const result = await request('/')

    assertStatus(result, 200)
    assert.equal(result.body.message, 'Leviathan API is running')
  })

  await t.test('middleware rejects invalid route ids', async () => {
    const invalidUser = await request('/users/not-a-number')
    const invalidCampaign = await request('/campaigns/not-a-number/enemies')

    assertStatus(invalidUser, 400)
    assert.equal(invalidUser.body.error, 'Invalid user id.')

    assertStatus(invalidCampaign, 400)
    assert.equal(invalidCampaign.body.error, 'Invalid campaign id.')
  })

  await t.test('user creation validates input and starts a new game', async () => {
    const missingBody = await request('/users', { method: 'POST' })
    assertStatus(missingBody, 400)
    assert.equal(missingBody.body.error, 'Username and password are required.')

    const blankArmyName = await request('/users', {
      method: 'POST',
      body: {
        username: 'blank_army_user',
        password: 'password123',
        armyName: '   '
      }
    })
    assertStatus(blankArmyName, 400)
    assert.equal(blankArmyName.body.error, 'Army name must be a non-empty string.')

    username = `api_user_${Date.now()}`
    const created = await request('/users', {
      method: 'POST',
      body: {
        username,
        password: 'password123',
        armyName: 'Test Legion'
      }
    })

    assertStatus(created, 201)
    assert.equal(
      created.body.message,
      'User created successfully. Starting army created and Unix Wars started.'
    )
    assert.equal(typeof created.body.data.id, 'number')
    assert.equal(created.body.data.username, username)
    assert.equal(created.body.data.army.armyName, 'Test Legion')
    assert.equal(created.body.data.army.createdAt, undefined)
    assert.notEqual(created.body.data.army.updatedAt, undefined)
    assert.equal(created.body.data.state.resources.manpower, 120)
    assert.equal(created.body.data.state.resources.ducats, 180)
    assert.equal(created.body.data.state.resources.flour, 120)
    assert.equal(created.body.data.state.resources.supply, 100)
    assert.equal(created.body.data.state.resources.morale, 50)
    assert.equal(created.body.data.state.campaignProgress.currentTurn, 1)
    assert.equal(created.body.data.state.campaignProgress.gameCompleted, false)
    assert.equal(created.body.data.state.campaignProgress.campaignName, 'Unix Wars')
    assert.equal(created.body.data.state.campaignProgress.currentEnemySequence, 1)
    assert.equal(created.body.data.state.campaignProgress.turnsOnCurrentEnemy, 0)

    const artillery = findRowByName(created.body.data.state.units, 'unitName', 'artillery')
    const fieldGuns = findRowByName(created.body.data.state.equipment, 'equipmentName', 'field_guns')

    assert.equal(artillery.quantity, 0)
    assert.equal(fieldGuns.quantity, 8)

    userId = created.body.data.id

    const duplicate = await request('/users', {
      method: 'POST',
      body: {
        username,
        password: 'password123'
      }
    })
    assertStatus(duplicate, 409)
    assert.equal(duplicate.body.error, 'Username already exists.')

    const maximumArmyName = 'A'.repeat(ARMY_NAME_MAX_LENGTH)
    const maximumArmy = await createUser({
      username: createUniqueName('maximum_army'),
      armyName: maximumArmyName
    })
    assert.equal(maximumArmy.body.data.army.armyName, maximumArmyName)

    const oversizedArmy = await request('/users', {
      method: 'POST',
      body: {
        username: createUniqueName('oversized_army'),
        password: 'password123',
        armyName: 'A'.repeat(ARMY_NAME_MAX_LENGTH + 1)
      }
    })
    assertStatus(oversizedArmy, 400)
    assert.equal(
      oversizedArmy.body.error,
      `Army name must be ${ARMY_NAME_MAX_LENGTH} characters or fewer.`
    )
  })

  await t.test('user, army, and army state can be read', async () => {
    const user = await request(`/users/${userId}`)
    const army = await request(`/users/${userId}/army`)
    const state = await request(`/users/${userId}/army/state`)

    assertStatus(user, 200)
    assert.equal(user.body.data.username, username)

    assertStatus(army, 200)
    assert.equal(army.body.data.armyName, 'Test Legion')
    assert.equal(army.body.data.reinforcementRate, undefined)
    assert.equal(army.body.data.equipmentRate, undefined)

    assertStatus(state, 200)
    assert.equal(state.body.data.army.userId, userId)
    assert.match(state.contentType, /^application\/json/)
    assert.deepEqual(Object.keys(state.body.data).sort(), [
      'army',
      'campaignProgress',
      'equipment',
      'resources',
      'units'
    ])
    assert.notEqual(state.body.data.resources, null)
    assert.notEqual(state.body.data.campaignProgress, null)

  })

  await t.test('armies cannot be independently created or deleted', async () => {
    const createArmy = await rawRequest(`/users/${userId}/army`, {
      method: 'POST',
      rawBody: JSON.stringify({ armyName: 'Second Army' }),
      headers: { 'Content-Type': 'application/json' }
    })
    const deleteArmy = await rawRequest(`/users/${userId}/army`, {
      method: 'DELETE'
    })

    assert.equal(createArmy.status, 404)
    assert.equal(deleteArmy.status, 404)

    const armyStillExists = await request(`/users/${userId}/army`)
    assertStatus(armyStillExists, 200)
    assert.equal(armyStillExists.body.data.userId, userId)
  })

  await t.test('user and army update routes validate and save changes', async () => {
    const blankUsername = await request(`/users/${userId}`, {
      method: 'PUT',
      body: {
        username: '   '
      }
    })
    assertStatus(blankUsername, 400)
    assert.equal(blankUsername.body.error, 'Username is required.')

    username = `${username}_updated`
    const updatedUser = await request(`/users/${userId}`, {
      method: 'PUT',
      body: {
        username
      }
    })
    assertStatus(updatedUser, 200)
    assert.equal(updatedUser.body.data.username, username)

    const blankArmyName = await request(`/users/${userId}/army`, {
      method: 'PUT',
      body: {
        armyName: ''
      }
    })
    assertStatus(blankArmyName, 400)
    assert.equal(blankArmyName.body.error, 'Army name is required.')

    const oversizedArmyName = await request(`/users/${userId}/army`, {
      method: 'PUT',
      body: {
        armyName: 'A'.repeat(ARMY_NAME_MAX_LENGTH + 1)
      }
    })
    assertStatus(oversizedArmyName, 400)
    assert.equal(
      oversizedArmyName.body.error,
      `Army name must be ${ARMY_NAME_MAX_LENGTH} characters or fewer.`
    )

    const updatedArmy = await request(`/users/${userId}/army`, {
      method: 'PUT',
      body: {
        armyName: 'Updated Legion'
      }
    })
    assertStatus(updatedArmy, 200)
    assert.equal(updatedArmy.body.data.armyName, 'Updated Legion')
  })

  await t.test('recruit route covers validation, affordability, and success', async () => {
    const missingUnit = await request(`/users/${userId}/army/recruit`, {
      method: 'POST',
      body: {
        quantity: 1
      }
    })
    assertStatus(missingUnit, 400)
    assert.equal(missingUnit.body.error, 'unitName is required.')

    const invalidQuantity = await request(`/users/${userId}/army/recruit`, {
      method: 'POST',
      body: {
        unitName: 'infantry',
        quantity: 0
      }
    })
    assertStatus(invalidQuantity, 400)
    assert.equal(invalidQuantity.body.error, 'Quantity must be a positive integer.')

    const unknownUnit = await request(`/users/${userId}/army/recruit`, {
      method: 'POST',
      body: {
        unitName: 'dragon',
        quantity: 1
      }
    })
    assertStatus(unknownUnit, 404)
    assert.equal(unknownUnit.body.error, 'Unit type not found.')

    const tooManyUnits = await request(`/users/${userId}/army/recruit`, {
      method: 'POST',
      body: {
        unitName: 'infantry',
        quantity: 999
      }
    })
    assertStatus(tooManyUnits, 422)
    assert.equal(tooManyUnits.body.error, 'Insufficient manpower.')

    const recruited = await request(`/users/${userId}/army/recruit`, {
      method: 'POST',
      body: {
        unitName: 'artillery',
        quantity: 4
      }
    })
    assertStatus(recruited, 200)
    assert.equal(recruited.body.message, 'Units recruited successfully.')

    const artillery = findRowByName(recruited.body.data.units, 'unitName', 'artillery')
    const fieldGuns = findRowByName(recruited.body.data.equipment, 'equipmentName', 'field_guns')

    assert.equal(artillery.quantity, 4)
    assert.equal(fieldGuns.quantity, 0)
    assert.equal(recruited.body.data.resources.manpower, 40)
  })

  await t.test('trade route covers validation, affordability, buying, and selling', async () => {
    const badTradeType = await request(`/users/${userId}/army/trade`, {
      method: 'POST',
      body: {
        tradeType: 'borrow',
        item: 'flour',
        quantity: 1
      }
    })
    assertStatus(badTradeType, 400)
    assert.equal(badTradeType.body.error, 'tradeType must be buy or sell.')

    const badItem = await request(`/users/${userId}/army/trade`, {
      method: 'POST',
      body: {
        tradeType: 'buy',
        item: 'iron',
        quantity: 1
      }
    })
    assertStatus(badItem, 400)
    assert.equal(badItem.body.error, 'item must be flour or supply.')

    const badQuantity = await request(`/users/${userId}/army/trade`, {
      method: 'POST',
      body: {
        tradeType: 'buy',
        item: 'flour',
        quantity: -1
      }
    })
    assertStatus(badQuantity, 400)
    assert.equal(badQuantity.body.error, 'Quantity must be a positive integer.')

    const tooExpensive = await request(`/users/${userId}/army/trade`, {
      method: 'POST',
      body: {
        tradeType: 'buy',
        item: 'supply',
        quantity: 1000
      }
    })
    assertStatus(tooExpensive, 422)
    assert.equal(tooExpensive.body.error, 'Insufficient ducats.')

    const boughtFlour = await request(`/users/${userId}/army/trade`, {
      method: 'POST',
      body: {
        tradeType: 'buy',
        item: 'flour',
        quantity: 5
      }
    })
    assertStatus(boughtFlour, 200)
    assert.equal(boughtFlour.body.data.resources.flour, 125)
    assert.equal(boughtFlour.body.data.resources.ducats, 170)

    const soldSupply = await request(`/users/${userId}/army/trade`, {
      method: 'POST',
      body: {
        tradeType: 'sell',
        item: 'supply',
        quantity: 3
      }
    })
    assertStatus(soldSupply, 200)
    assert.equal(soldSupply.body.data.resources.supply, 97)
    assert.equal(soldSupply.body.data.resources.ducats, 173)
  })

  await t.test('turn advancement applies turn and resource changes', async () => {
    const turn = await request(`/users/${userId}/army/advance-turn`, {
      method: 'POST'
    })

    assertStatus(turn, 200)
    assert.equal(turn.body.message, 'Turn advanced successfully.')
    assert.equal(turn.body.data.turnAdvanced, true)
    assert.equal(turn.body.data.enemyAttacked, false)
    assert.equal(turn.body.data.enemyAttackAtTurn, ENEMY_ATTACK_AT_TURN)
    assert.equal(turn.body.data.turnsOnCurrentEnemy, 1)
    assert.equal(turn.body.data.armyState.campaignProgress.currentTurn, 2)
    const artilleryRules = UNIT_TYPES.find((unitType) => unitType.unitName === 'artillery')
    assert.equal(
      turn.body.data.armyState.resources.manpower,
      40 + CAMPAIGNS[0].manpowerGainPerTurn
    )
    assert.equal(
      turn.body.data.armyState.resources.flour,
      125 + CAMPAIGNS[0].flourGainPerTurn - 4 * artilleryRules.flourUpkeep
    )
    assert.equal(
      turn.body.data.armyState.resources.supply,
      97 + CAMPAIGNS[0].supplyGainPerTurn - 4 * artilleryRules.supplyUpkeep
    )
    assert.equal(turn.body.data.armyState.campaignProgress.turnsOnCurrentEnemy, 1)
  })

  await t.test('campaign catalog and campaign progress routes work', async () => {
    const campaigns = await request('/campaigns')
    assertStatus(campaigns, 200)
    assert.equal(campaigns.body.data.length, 3)
    assert.equal(campaigns.body.data[0].campaignName, 'Unix Wars')

    for (let index = 0; index < CAMPAIGNS.length; index++) {
      const actualCampaign = campaigns.body.data[index]
      const expectedCampaign = CAMPAIGNS[index]

      assert.equal(actualCampaign.manpowerGainPerTurn, expectedCampaign.manpowerGainPerTurn)
      assert.equal(actualCampaign.musketsGainPerTurn, expectedCampaign.musketsGainPerTurn)
      assert.equal(actualCampaign.horsesGainPerTurn, expectedCampaign.horsesGainPerTurn)
      assert.equal(actualCampaign.fieldGunsGainPerTurn, expectedCampaign.fieldGunsGainPerTurn)
      assert.equal(actualCampaign.flourGainPerTurn, expectedCampaign.flourGainPerTurn)
      assert.equal(actualCampaign.supplyGainPerTurn, expectedCampaign.supplyGainPerTurn)
    }

    const missingCampaign = await request('/campaigns/999/enemies')
    assertStatus(missingCampaign, 404)
    assert.equal(missingCampaign.body.error, 'Campaign not found.')

    const enemies = await request('/campaigns/1/enemies')
    assertStatus(enemies, 200)
    assert.equal(enemies.body.data.length, 3)
    assert.equal(enemies.body.data[0].enemyName, 'Liho Border Guard')
    assert.equal(enemies.body.data[0].weakAgainstUnit, 'artillery')

    const progress = await request(`/users/${userId}/army/campaign-progress`)
    assertStatus(progress, 200)
    assert.equal(progress.body.data.campaignName, 'Unix Wars')
    assert.equal(progress.body.data.currentEnemySequence, 1)
    assert.equal(progress.body.data.turnsOnCurrentEnemy, 1)
  })

  await t.test('each campaign supplies its own explicit turn-production values', async () => {
    const created = await createUser({
      username: createUniqueName('campaign_production'),
      armyName: 'Campaign Production Legion'
    })
    const productionUserId = created.body.data.id

    for (const campaignData of CAMPAIGNS) {
      setCampaignForUser(productionUserId, campaignData.campaignNumber)

      const before = await request(`/users/${productionUserId}/army/state`)
      const advanced = await request(`/users/${productionUserId}/army/advance-turn`, {
        method: 'POST'
      })

      assertStatus(before, 200)
      assertStatus(advanced, 200)

      const beforeState = before.body.data
      const afterState = advanced.body.data.armyState

      assert.equal(afterState.campaignProgress.campaignNumber, campaignData.campaignNumber)
      assert.equal(
        afterState.campaignProgress.manpowerGainPerTurn,
        campaignData.manpowerGainPerTurn
      )
      assert.equal(afterState.campaignProgress.musketsGainPerTurn, campaignData.musketsGainPerTurn)
      assert.equal(afterState.campaignProgress.horsesGainPerTurn, campaignData.horsesGainPerTurn)
      assert.equal(
        afterState.campaignProgress.fieldGunsGainPerTurn,
        campaignData.fieldGunsGainPerTurn
      )
      assert.equal(afterState.campaignProgress.flourGainPerTurn, campaignData.flourGainPerTurn)
      assert.equal(afterState.campaignProgress.supplyGainPerTurn, campaignData.supplyGainPerTurn)
      assert.equal(
        afterState.resources.manpower - beforeState.resources.manpower,
        campaignData.manpowerGainPerTurn
      )
      assert.equal(
        afterState.resources.flour - beforeState.resources.flour,
        campaignData.flourGainPerTurn
      )
      assert.equal(
        afterState.resources.supply - beforeState.resources.supply,
        campaignData.supplyGainPerTurn
      )

      const expectedEquipmentGains = {
        muskets: campaignData.musketsGainPerTurn,
        horses: campaignData.horsesGainPerTurn,
        field_guns: campaignData.fieldGunsGainPerTurn
      }

      for (const equipmentAfterTurn of afterState.equipment) {
        const equipmentBeforeTurn = findRowByName(
          beforeState.equipment,
          'equipmentName',
          equipmentAfterTurn.equipmentName
        )

        assert.equal(
          equipmentAfterTurn.quantity - equipmentBeforeTurn.quantity,
          expectedEquipmentGains[equipmentAfterTurn.equipmentName]
        )
      }

      const turnLogs = await request(
        `/users/${productionUserId}/army/logs?eventType=turn&limit=1`
      )
      assertStatus(turnLogs, 200)

      const turnDetails = JSON.parse(turnLogs.body.data[0].details)
      assert.equal(turnDetails.manpowerGained, campaignData.manpowerGainPerTurn)
      assert.equal(turnDetails.flourGained, campaignData.flourGainPerTurn)
      assert.equal(turnDetails.supplyGained, campaignData.supplyGainPerTurn)
      assert.deepEqual(
        turnDetails.equipmentGained.map((gain) => gain.quantity),
        [
          campaignData.musketsGainPerTurn,
          campaignData.horsesGainPerTurn,
          campaignData.fieldGunsGainPerTurn
        ]
      )
    }
  })

  await t.test('turn advancement rejects corrupted campaign production values', async () => {
    const created = await createUser({
      username: createUniqueName('invalid_production'),
      armyName: 'Invalid Production Legion'
    })
    const invalidProductionUserId = created.body.data.id

    setCampaignManpowerGain(1, -1)
    const advanced = await request(`/users/${invalidProductionUserId}/army/advance-turn`, {
      method: 'POST'
    })
    setCampaignManpowerGain(1, CAMPAIGNS[0].manpowerGainPerTurn)

    assertStatus(advanced, 409)
    assert.equal(advanced.body.error, 'Campaign production values are invalid.')
  })

  await t.test('battle route resolves the current campaign enemy', async () => {
    const clientSelectedEnemy = await request(`/users/${userId}/army/battle`, {
      method: 'POST',
      body: {
        enemyArmyId: 999
      }
    })

    assertStatus(clientSelectedEnemy, 400)
    assert.equal(
      clientSelectedEnemy.body.error,
      'enemyArmyId is not allowed. Battle uses the current campaign enemy.'
    )

    const battle = await request(`/users/${userId}/army/battle`, {
      method: 'POST'
    })

    assertStatus(battle, 200)
    assert.equal(battle.body.message, 'Battle resolved successfully.')
    assert.equal(battle.body.data.outcome, 'victory')
    assert.equal(battle.body.data.enemyName, 'Liho Border Guard')
    assert.equal(battle.body.data.victoryType, 'decisive')
    assert.equal(battle.body.data.hasCounterUnit, true)
    assert.equal(battle.body.data.counterMultiplier, 1.1)
    assert.equal(Array.isArray(battle.body.data.troopLosses), true)
    assert.equal(findRowByName(battle.body.data.troopLosses, 'unitName', 'artillery').quantityLost, 1)
    assert.equal(battle.body.data.armyReset, false)
    assert.equal(battle.body.data.campaignCompleted, false)
    assert.equal(battle.body.data.gameCompleted, false)
    assert.equal(battle.body.data.campaignProgress.currentEnemySequence, 2)
    assert.equal(battle.body.data.campaignProgress.turnsOnCurrentEnemy, 0)

    const artillery = findRowByName(battle.body.data.armyState.units, 'unitName', 'artillery')
    assert.equal(artillery.quantity, 3)
  })

  await t.test('army logs support validation, limit, and eventType filtering', async () => {
    const invalidEventType = await request(`/users/${userId}/army/logs?eventType=`)
    assertStatus(invalidEventType, 400)
    assert.equal(invalidEventType.body.error, 'eventType query must be a non-empty string.')

    const invalidLimit = await request(`/users/${userId}/army/logs?limit=0`)
    assertStatus(invalidLimit, 400)
    assert.equal(invalidLimit.body.error, 'limit must be a positive integer.')

    const logs = await request(`/users/${userId}/army/logs?limit=5`)
    assertStatus(logs, 200)
    assert.equal(logs.body.message, 'Army logs retrieved successfully.')
    assert.equal(Array.isArray(logs.body.data), true)
    assert.equal(logs.body.data.length <= 5, true)

    const battleLogs = await request(`/users/${userId}/army/logs?eventType=battle`)
    assertStatus(battleLogs, 200)
    assert.equal(battleLogs.body.data.length >= 1, true)
    assert.equal(battleLogs.body.data[0].eventType, 'battle')
    assert.equal(JSON.parse(battleLogs.body.data[0].details).trigger, BATTLE_TRIGGER_MANUAL)

    const missingEventLogs = await request(`/users/${userId}/army/logs?eventType=not_a_real_event`)
    assertStatus(missingEventLogs, 200)
    assert.equal(missingEventLogs.body.data.length, 0)

    const oneLog = await request(`/users/${userId}/army/logs?limit=1`)
    assertStatus(oneLog, 200)
    assert.equal(oneLog.body.data.length, 1)
  })

  await t.test('restart resets the same user back to campaign one sequence one', async () => {
    const restarted = await request(`/users/${userId}/army/restart`, {
      method: 'POST'
    })

    assertStatus(restarted, 200)
    assert.equal(restarted.body.message, 'Game restarted successfully.')
    assert.equal(restarted.body.data.campaignProgress.currentTurn, 1)
    assert.equal(restarted.body.data.campaignProgress.gameCompleted, false)
    assert.equal(restarted.body.data.resources.manpower, 120)
    assert.equal(restarted.body.data.resources.ducats, 180)
    assert.equal(restarted.body.data.resources.flour, 120)
    assert.equal(restarted.body.data.resources.supply, 100)
    assert.equal(restarted.body.data.resources.morale, 50)
    assert.equal(restarted.body.data.campaignProgress.campaignName, 'Unix Wars')
    assert.equal(restarted.body.data.campaignProgress.currentEnemySequence, 1)
    assert.equal(restarted.body.data.campaignProgress.turnsOnCurrentEnemy, 0)

    const artillery = findRowByName(restarted.body.data.units, 'unitName', 'artillery')
    assert.equal(artillery.quantity, 0)
  })

  await t.test('enemy auto-attack waits for the sixth turn, resolves battle, and logs clearly', async () => {
    const created = await createUser({
      username: createUniqueName('auto_attack_win'),
      armyName: 'Auto Attack Winner Legion'
    })
    const autoUserId = created.body.data.id

    assert.equal(created.body.data.state.campaignProgress.turnsOnCurrentEnemy, 0)

    const recruited = await request(`/users/${autoUserId}/army/recruit`, {
      method: 'POST',
      body: {
        unitName: 'artillery',
        quantity: 4
      }
    })
    assertStatus(recruited, 200)

    for (let turnNumber = 1; turnNumber < ENEMY_ATTACK_AT_TURN; turnNumber++) {
      const turn = await request(`/users/${autoUserId}/army/advance-turn`, {
        method: 'POST'
      })

      assertStatus(turn, 200)
      assert.equal(turn.body.message, 'Turn advanced successfully.')
      assert.equal(turn.body.data.turnAdvanced, true)
      assert.equal(turn.body.data.enemyAttacked, false)
      assert.equal(turn.body.data.enemyAttackAtTurn, ENEMY_ATTACK_AT_TURN)
      assert.equal(turn.body.data.turnsOnCurrentEnemy, turnNumber)
      assert.equal(turn.body.data.armyState.campaignProgress.currentTurn, turnNumber + 1)
      assert.equal(turn.body.data.armyState.campaignProgress.currentEnemySequence, 1)
      assert.equal(turn.body.data.armyState.campaignProgress.turnsOnCurrentEnemy, turnNumber)
    }

    const autoAttack = await request(`/users/${autoUserId}/army/advance-turn`, {
      method: 'POST'
    })

    assertStatus(autoAttack, 200)
    assert.equal(autoAttack.body.message, 'Turn advanced. The enemy attacked first.')
    assert.equal(autoAttack.body.data.turnAdvanced, true)
    assert.equal(autoAttack.body.data.enemyAttacked, true)
    assert.equal(autoAttack.body.data.enemyAttackAtTurn, ENEMY_ATTACK_AT_TURN)
    assert.equal(autoAttack.body.data.turnsOnCurrentEnemy, 0)
    assert.equal(autoAttack.body.data.battle.trigger, BATTLE_TRIGGER_ENEMY_AUTO_ATTACK)
    assert.equal(autoAttack.body.data.battle.outcome, 'victory')
    assert.equal(autoAttack.body.data.battle.enemyName, 'Liho Border Guard')
    assert.equal(autoAttack.body.data.battle.playerFightingStrength, 123)
    assert.equal(autoAttack.body.data.battle.enemyFightingStrength, 75)
    assert.equal(autoAttack.body.data.battle.victoryType, 'decisive')
    assert.equal(autoAttack.body.data.battle.armyReset, false)
    assert.equal(autoAttack.body.data.battle.campaignCompleted, false)
    assert.equal(
      autoAttack.body.data.armyState.campaignProgress.currentTurn,
      ENEMY_ATTACK_AT_TURN + 1
    )
    assert.equal(autoAttack.body.data.armyState.campaignProgress.currentEnemySequence, 2)
    assert.equal(autoAttack.body.data.armyState.campaignProgress.turnsOnCurrentEnemy, 0)

    const artilleryAfterBattle = findRowByName(
      autoAttack.body.data.armyState.units,
      'unitName',
      'artillery'
    )
    assert.equal(artilleryAfterBattle.quantity, 3)

    const turnLogs = await request(`/users/${autoUserId}/army/logs?eventType=turn`)
    assertStatus(turnLogs, 200)
    assert.equal(turnLogs.body.data.length, ENEMY_ATTACK_AT_TURN)

    const normalTurnLog = turnLogs.body.data.find((log) => log.turnNumber === 2)
    const normalTurnDetails = JSON.parse(normalTurnLog.details)
    assert.equal(normalTurnDetails.enemyAttacked, false)
    assert.equal(normalTurnDetails.turnsOnCurrentEnemy, 1)

    const autoTurnLog = turnLogs.body.data.find((log) => {
      const details = JSON.parse(log.details)
      return details.enemyAttacked === true
    })
    const autoTurnDetails = JSON.parse(autoTurnLog.details)
    assert.equal(autoTurnLog.turnNumber, ENEMY_ATTACK_AT_TURN + 1)
    assert.equal(autoTurnDetails.enemyAttacked, true)
    assert.equal(autoTurnDetails.turnsOnCurrentEnemy, ENEMY_ATTACK_AT_TURN)
    assert.equal(autoTurnDetails.enemyAttackAtTurn, ENEMY_ATTACK_AT_TURN)
    assert.equal(autoTurnDetails.triggeredEnemyName, 'Liho Border Guard')

    const battleLogs = await request(`/users/${autoUserId}/army/logs?eventType=battle`)
    assertStatus(battleLogs, 200)
    assert.equal(battleLogs.body.data.length, 1)

    const battleDetails = JSON.parse(battleLogs.body.data[0].details)
    assert.equal(battleLogs.body.data[0].turnNumber, ENEMY_ATTACK_AT_TURN + 1)
    assert.equal(battleDetails.trigger, BATTLE_TRIGGER_ENEMY_AUTO_ATTACK)
    assert.equal(battleDetails.turnsOnCurrentEnemy, ENEMY_ATTACK_AT_TURN)
    assert.equal(battleDetails.enemyAttackAtTurn, ENEMY_ATTACK_AT_TURN)
    assert.equal(Array.isArray(battleDetails.troopLosses), true)

    const logs = await request(`/users/${autoUserId}/army/logs`)
    assertStatus(logs, 200)

    const sameTurnLogs = logs.body.data
      .filter((log) => log.turnNumber === ENEMY_ATTACK_AT_TURN + 1)
      .sort((first, second) => first.id - second.id)

    assert.equal(sameTurnLogs[0].eventType, 'turn')
    assert.equal(sameTurnLogs[1].eventType, 'battle')
  })

  await t.test('enemy auto-attack defeat resets the army and counter', async () => {
    const created = await createUser({
      username: createUniqueName('auto_attack_defeat'),
      armyName: 'Auto Attack Defeated Legion'
    })
    const defeatedUserId = created.body.data.id
    let finalTurn

    for (let turnNumber = 1; turnNumber <= ENEMY_ATTACK_AT_TURN; turnNumber++) {
      finalTurn = await request(`/users/${defeatedUserId}/army/advance-turn`, {
        method: 'POST'
      })
      assertStatus(finalTurn, 200)
    }

    assert.equal(finalTurn.body.data.enemyAttacked, true)
    assert.equal(finalTurn.body.data.turnsOnCurrentEnemy, 0)
    assert.equal(finalTurn.body.data.battle.trigger, BATTLE_TRIGGER_ENEMY_AUTO_ATTACK)
    assert.equal(finalTurn.body.data.battle.outcome, 'defeat')
    assert.equal(finalTurn.body.data.battle.armyReset, true)
    assert.equal(finalTurn.body.data.armyState.campaignProgress.currentTurn, 1)
    assert.equal(finalTurn.body.data.armyState.resources.manpower, 120)
    assert.equal(finalTurn.body.data.armyState.resources.ducats, 180)
    assert.equal(finalTurn.body.data.armyState.campaignProgress.campaignName, 'Unix Wars')
    assert.equal(finalTurn.body.data.armyState.campaignProgress.currentEnemySequence, 1)
    assert.equal(finalTurn.body.data.armyState.campaignProgress.turnsOnCurrentEnemy, 0)

    const battleLogs = await request(`/users/${defeatedUserId}/army/logs?eventType=battle`)
    assertStatus(battleLogs, 200)

    const details = JSON.parse(battleLogs.body.data[0].details)
    assert.equal(battleLogs.body.data[0].turnNumber, ENEMY_ATTACK_AT_TURN + 1)
    assert.equal(details.trigger, BATTLE_TRIGGER_ENEMY_AUTO_ATTACK)
    assert.equal(details.outcome, 'defeat')
    assert.deepEqual(details.troopLosses, [])
  })

  await t.test('manual battle and restart reset the enemy waiting counter', async () => {
    const created = await createUser({
      username: createUniqueName('counter_reset'),
      armyName: 'Counter Reset Legion'
    })
    const counterUserId = created.body.data.id

    const recruited = await request(`/users/${counterUserId}/army/recruit`, {
      method: 'POST',
      body: {
        unitName: 'artillery',
        quantity: 4
      }
    })
    assertStatus(recruited, 200)

    for (let turnNumber = 1; turnNumber <= 3; turnNumber++) {
      const turn = await request(`/users/${counterUserId}/army/advance-turn`, {
        method: 'POST'
      })
      assertStatus(turn, 200)
      assert.equal(turn.body.data.turnsOnCurrentEnemy, turnNumber)
    }

    const manualBattle = await request(`/users/${counterUserId}/army/battle`, {
      method: 'POST'
    })
    assertStatus(manualBattle, 200)
    assert.equal(manualBattle.body.data.outcome, 'victory')
    assert.equal(manualBattle.body.data.campaignProgress.currentEnemySequence, 2)
    assert.equal(manualBattle.body.data.campaignProgress.turnsOnCurrentEnemy, 0)

    const battleLogs = await request(`/users/${counterUserId}/army/logs?eventType=battle`)
    assertStatus(battleLogs, 200)
    assert.equal(JSON.parse(battleLogs.body.data[0].details).trigger, BATTLE_TRIGGER_MANUAL)

    const turnAfterBattle = await request(`/users/${counterUserId}/army/advance-turn`, {
      method: 'POST'
    })
    assertStatus(turnAfterBattle, 200)
    assert.equal(turnAfterBattle.body.data.enemyAttacked, false)
    assert.equal(turnAfterBattle.body.data.turnsOnCurrentEnemy, 1)

    const restarted = await request(`/users/${counterUserId}/army/restart`, {
      method: 'POST'
    })
    assertStatus(restarted, 200)
    assert.equal(restarted.body.data.campaignProgress.currentEnemySequence, 1)
    assert.equal(restarted.body.data.campaignProgress.turnsOnCurrentEnemy, 0)
  })

  await t.test('advance-turn and manual battle reject non-playable campaign states', async () => {
    const completedUser = await createUser({
      username: createUniqueName('completed_state'),
      armyName: 'Completed State Legion'
    })
    const completedUserId = completedUser.body.data.id

    setGameCompletedForUser(completedUserId, true)

    const completedTurn = await request(`/users/${completedUserId}/army/advance-turn`, {
      method: 'POST'
    })
    assertStatus(completedTurn, 409)
    assert.equal(completedTurn.body.error, 'All campaigns have already been completed.')

    const completedBattle = await request(`/users/${completedUserId}/army/battle`, {
      method: 'POST'
    })
    assertStatus(completedBattle, 409)
    assert.equal(completedBattle.body.error, 'All campaigns have already been completed.')

    const missingProgressUser = await createUser({
      username: createUniqueName('missing_progress'),
      armyName: 'Missing Progress Legion'
    })
    const missingProgressUserId = missingProgressUser.body.data.id
    deleteCampaignProgressForUser(missingProgressUserId)

    const missingProgressTurn = await request(`/users/${missingProgressUserId}/army/advance-turn`, {
      method: 'POST'
    })
    assertStatus(missingProgressTurn, 409)
    assert.equal(missingProgressTurn.body.error, 'Army has no campaign progress.')

    const missingProgressBattle = await request(`/users/${missingProgressUserId}/army/battle`, {
      method: 'POST'
    })
    assertStatus(missingProgressBattle, 409)
    assert.equal(missingProgressBattle.body.error, 'Army has no campaign progress.')

    const incompleteState = await request(`/users/${missingProgressUserId}/army/state`)
    assertStatus(incompleteState, 409)
    assert.equal(
      incompleteState.body.error,
      'Army state is incomplete. Restart the game to restore required state.'
    )

    const missingEnemyUser = await createUser({
      username: createUniqueName('missing_enemy'),
      armyName: 'Missing Enemy Legion'
    })
    const missingEnemyUserId = missingEnemyUser.body.data.id
    setCurrentEnemySequenceForUser(missingEnemyUserId, 99)

    const missingEnemyTurn = await request(`/users/${missingEnemyUserId}/army/advance-turn`, {
      method: 'POST'
    })
    assertStatus(missingEnemyTurn, 409)
    assert.equal(missingEnemyTurn.body.error, 'Campaign progress is missing its enemy army.')

    const missingEnemyBattle = await request(`/users/${missingEnemyUserId}/army/battle`, {
      method: 'POST'
    })
    assertStatus(missingEnemyBattle, 409)
    assert.equal(missingEnemyBattle.body.error, 'Campaign progress is missing its enemy army.')
  })

  await t.test('form submissions, trimmed usernames, and default army names work', async () => {
    const formUsername = createUniqueName('form_user')
    const created = await request('/users', {
      method: 'POST',
      form: {
        username: `  ${formUsername}  `,
        password: 'password123'
      }
    })

    assertStatus(created, 201)
    assertSuccessShape(created)
    assert.equal(created.body.data.username, formUsername)
    assert.equal(created.body.data.army.armyName, `${formUsername} Army`)

    const user = await request(`/users/${created.body.data.id}`)
    const army = await request(`/users/${created.body.data.id}/army`)

    assertStatus(user, 200)
    assertSuccessShape(user)
    assert.equal(user.body.data.username, formUsername)

    assertStatus(army, 200)
    assertSuccessShape(army)
    assert.equal(army.body.data.armyName, `${formUsername} Army`)
  })

  await t.test('user list filter handles realistic query inputs', async () => {
    const filteredUsername = createUniqueName('filter_user')
    await createUser({
      username: filteredUsername,
      armyName: 'Filter Legion'
    })

    const exactFilter = await request(`/users?username=${encodeURIComponent(filteredUsername)}`)
    assertStatus(exactFilter, 200)
    assert.equal(exactFilter.body.data.length, 1)
    assert.equal(exactFilter.body.data[0].username, filteredUsername)

    const missingFilter = await request('/users?username=no_user_should_match_this_value')
    assertStatus(missingFilter, 200)
    assert.equal(missingFilter.body.data.length, 0)

    const blankFilter = await request('/users?username=')
    assertStatus(blankFilter, 400)
    assert.equal(blankFilter.body.error, 'Username query must be a non-empty string.')
  })

  await t.test('invalid id edge cases are rejected consistently', async () => {
    const invalidIds = ['0', '-1', '1.5', 'abc']

    for (const invalidId of invalidIds) {
      const userResult = await request(`/users/${invalidId}`)
      const armyResult = await request(`/users/${invalidId}/army`)
      const recruitResult = await request(`/users/${invalidId}/army/recruit`, {
        method: 'POST',
        body: {
          unitName: 'infantry',
          quantity: 1
        }
      })
      const campaignResult = await request(`/campaigns/${invalidId}/enemies`)

      assertStatus(userResult, 400)
      assert.equal(userResult.body.error, 'Invalid user id.')

      assertStatus(armyResult, 400)
      assert.equal(armyResult.body.error, 'Invalid user id.')

      assertStatus(recruitResult, 400)
      assert.equal(recruitResult.body.error, 'Invalid user id.')

      assertStatus(campaignResult, 400)
      assert.equal(campaignResult.body.error, 'Invalid campaign id.')
    }
  })

  await t.test('missing users return 404 before gameplay logic runs', async () => {
    const missingUserId = 999999
    const routes = [
      { path: `/users/${missingUserId}`, method: 'GET' },
      { path: `/users/${missingUserId}/army`, method: 'GET' },
      { path: `/users/${missingUserId}/army/state`, method: 'GET' },
      { path: `/users/${missingUserId}/army/restart`, method: 'POST' },
      { path: `/users/${missingUserId}/army/advance-turn`, method: 'POST' },
      { path: `/users/${missingUserId}/army/battle`, method: 'POST' },
      { path: `/users/${missingUserId}/army/logs`, method: 'GET' }
    ]

    for (const route of routes) {
      const result = await request(route.path, { method: route.method })

      assertStatus(result, 404)
      assert.equal(result.body.error, 'User not found.')
    }
  })

  await t.test('exact resource spending is allowed, but overspending is rejected', async () => {
    const created = await createUser({
      username: createUniqueName('exact_trade'),
      armyName: 'Exact Trade Legion'
    })
    const exactUserId = created.body.data.id

    const buyAllDucats = await request(`/users/${exactUserId}/army/trade`, {
      method: 'POST',
      body: {
        tradeType: 'buy',
        item: 'supply',
        quantity: 60
      }
    })
    assertStatus(buyAllDucats, 200)
    assert.equal(buyAllDucats.body.data.resources.ducats, 0)
    assert.equal(buyAllDucats.body.data.resources.supply, 160)

    const buyWithNoDucats = await request(`/users/${exactUserId}/army/trade`, {
      method: 'POST',
      body: {
        tradeType: 'buy',
        item: 'flour',
        quantity: 1
      }
    })
    assertStatus(buyWithNoDucats, 422)
    assert.equal(buyWithNoDucats.body.error, 'Insufficient ducats.')

    const sellAllSupply = await request(`/users/${exactUserId}/army/trade`, {
      method: 'POST',
      body: {
        tradeType: 'sell',
        item: 'supply',
        quantity: 160
      }
    })
    assertStatus(sellAllSupply, 200)
    assert.equal(sellAllSupply.body.data.resources.supply, 0)
    assert.equal(sellAllSupply.body.data.resources.ducats, 160)

    const sellWithNoSupply = await request(`/users/${exactUserId}/army/trade`, {
      method: 'POST',
      body: {
        tradeType: 'sell',
        item: 'supply',
        quantity: 1
      }
    })
    assertStatus(sellWithNoSupply, 422)
    assert.equal(sellWithNoSupply.body.error, 'Insufficient supply.')
  })

  await t.test('exact equipment spending and string quantities behave like user input', async () => {
    const created = await createUser({
      username: createUniqueName('exact_recruit'),
      armyName: 'Exact Recruit Legion'
    })
    const exactUserId = created.body.data.id

    const recruitedCavalry = await request(`/users/${exactUserId}/army/recruit`, {
      method: 'POST',
      body: {
        unitName: 'cavalry',
        quantity: '5'
      }
    })
    assertStatus(recruitedCavalry, 200)

    const cavalry = findRowByName(recruitedCavalry.body.data.units, 'unitName', 'cavalry')
    const horses = findRowByName(recruitedCavalry.body.data.equipment, 'equipmentName', 'horses')

    assert.equal(cavalry.quantity, 5)
    assert.equal(horses.quantity, 0)
    assert.equal(recruitedCavalry.body.data.resources.manpower, 45)

    const tooManyCavalry = await request(`/users/${exactUserId}/army/recruit`, {
      method: 'POST',
      body: {
        unitName: 'cavalry',
        quantity: 1
      }
    })
    assertStatus(tooManyCavalry, 422)
    assert.equal(tooManyCavalry.body.error, 'Insufficient required equipment.')

    const recruitedInfantry = await request(`/users/${exactUserId}/army/recruit`, {
      method: 'POST',
      body: {
        unitName: ' infantry ',
        quantity: '4'
      }
    })
    assertStatus(recruitedInfantry, 200)

    const infantry = findRowByName(recruitedInfantry.body.data.units, 'unitName', 'infantry')
    const muskets = findRowByName(recruitedInfantry.body.data.equipment, 'equipmentName', 'muskets')

    assert.equal(infantry.quantity, 4)
    assert.equal(muskets.quantity, 40)
    assert.equal(recruitedInfantry.body.data.resources.manpower, 5)

    const notEnoughManpower = await request(`/users/${exactUserId}/army/recruit`, {
      method: 'POST',
      body: {
        unitName: 'infantry',
        quantity: 1
      }
    })
    assertStatus(notEnoughManpower, 422)
    assert.equal(notEnoughManpower.body.error, 'Insufficient manpower.')
  })

  await t.test('case-sensitive gameplay fields and decimal quantities are rejected', async () => {
    const created = await createUser({
      username: createUniqueName('case_input'),
      armyName: 'Case Input Legion'
    })
    const caseUserId = created.body.data.id

    const uppercaseTradeType = await request(`/users/${caseUserId}/army/trade`, {
      method: 'POST',
      body: {
        tradeType: 'Buy',
        item: 'flour',
        quantity: 1
      }
    })
    assertStatus(uppercaseTradeType, 400)
    assert.equal(uppercaseTradeType.body.error, 'tradeType must be buy or sell.')

    const uppercaseTradeItem = await request(`/users/${caseUserId}/army/trade`, {
      method: 'POST',
      body: {
        tradeType: 'buy',
        item: 'Flour',
        quantity: 1
      }
    })
    assertStatus(uppercaseTradeItem, 400)
    assert.equal(uppercaseTradeItem.body.error, 'item must be flour or supply.')

    const decimalTradeQuantity = await request(`/users/${caseUserId}/army/trade`, {
      method: 'POST',
      body: {
        tradeType: 'buy',
        item: 'flour',
        quantity: 1.5
      }
    })
    assertStatus(decimalTradeQuantity, 400)
    assert.equal(decimalTradeQuantity.body.error, 'Quantity must be a positive integer.')

    const uppercaseUnit = await request(`/users/${caseUserId}/army/recruit`, {
      method: 'POST',
      body: {
        unitName: 'Infantry',
        quantity: 1
      }
    })
    assertStatus(uppercaseUnit, 404)
    assert.equal(uppercaseUnit.body.error, 'Unit type not found.')

    const decimalRecruitQuantity = await request(`/users/${caseUserId}/army/recruit`, {
      method: 'POST',
      body: {
        unitName: 'infantry',
        quantity: 1.5
      }
    })
    assertStatus(decimalRecruitQuantity, 400)
    assert.equal(decimalRecruitQuantity.body.error, 'Quantity must be a positive integer.')

    const booleanTradeQuantity = await request(`/users/${caseUserId}/army/trade`, {
      method: 'POST',
      body: {
        tradeType: 'buy',
        item: 'flour',
        quantity: true
      }
    })
    assertStatus(booleanTradeQuantity, 400)
    assert.equal(booleanTradeQuantity.body.error, 'Quantity must be a positive integer.')

    const arrayRecruitQuantity = await request(`/users/${caseUserId}/army/recruit`, {
      method: 'POST',
      body: {
        unitName: 'infantry',
        quantity: [1]
      }
    })
    assertStatus(arrayRecruitQuantity, 400)
    assert.equal(arrayRecruitQuantity.body.error, 'Quantity must be a positive integer.')

    const objectUnitName = await request(`/users/${caseUserId}/army/recruit`, {
      method: 'POST',
      body: {
        unitName: { name: 'infantry' },
        quantity: 1
      }
    })
    assertStatus(objectUnitName, 400)
    assert.equal(objectUnitName.body.error, 'unitName is required.')
  })

  await t.test('battle victory types affect troop losses through the real API', async () => {
    const pyrrhicUser = await createUser({
      username: createUniqueName('pyrrhic_user'),
      armyName: 'Pyrrhic Legion'
    })
    const pyrrhicUserId = pyrrhicUser.body.data.id

    const pyrrhicRecruit = await request(`/users/${pyrrhicUserId}/army/recruit`, {
      method: 'POST',
      body: {
        unitName: 'infantry',
        quantity: 8
      }
    })
    assertStatus(pyrrhicRecruit, 200)

    const pyrrhicBattle = await request(`/users/${pyrrhicUserId}/army/battle`, {
      method: 'POST'
    })
    assertStatus(pyrrhicBattle, 200)
    assert.equal(pyrrhicBattle.body.data.outcome, 'victory')
    assert.equal(pyrrhicBattle.body.data.victoryType, 'pyrrhic')
    assert.equal(pyrrhicBattle.body.data.playerFightingStrength, 80)

    const pyrrhicInfantryLoss = findRowByName(
      pyrrhicBattle.body.data.troopLosses,
      'unitName',
      'infantry'
    )
    const pyrrhicInfantryState = findRowByName(
      pyrrhicBattle.body.data.armyState.units,
      'unitName',
      'infantry'
    )

    assert.equal(pyrrhicInfantryLoss.quantityBefore, 8)
    assert.equal(pyrrhicInfantryLoss.quantityLost, 2)
    assert.equal(pyrrhicInfantryLoss.quantityAfter, 6)
    assert.equal(pyrrhicInfantryState.quantity, 6)

    const standardUser = await createUser({
      username: createUniqueName('standard_user'),
      armyName: 'Standard Legion'
    })
    const standardUserId = standardUser.body.data.id

    const standardRecruit = await request(`/users/${standardUserId}/army/recruit`, {
      method: 'POST',
      body: {
        unitName: 'artillery',
        quantity: 3
      }
    })
    assertStatus(standardRecruit, 200)

    const standardBattle = await request(`/users/${standardUserId}/army/battle`, {
      method: 'POST'
    })
    assertStatus(standardBattle, 200)
    assert.equal(standardBattle.body.data.outcome, 'victory')
    assert.equal(standardBattle.body.data.victoryType, 'standard')
    assert.equal(standardBattle.body.data.playerFightingStrength, 92)

    const standardArtilleryLoss = findRowByName(
      standardBattle.body.data.troopLosses,
      'unitName',
      'artillery'
    )
    assert.equal(standardArtilleryLoss.quantityBefore, 3)
    assert.equal(standardArtilleryLoss.quantityLost, 1)
    assert.equal(standardArtilleryLoss.quantityAfter, 2)

    const decisiveUser = await createUser({
      username: createUniqueName('decisive_user'),
      armyName: 'Decisive Legion'
    })
    const decisiveUserId = decisiveUser.body.data.id

    const decisiveRecruit = await request(`/users/${decisiveUserId}/army/recruit`, {
      method: 'POST',
      body: {
        unitName: 'artillery',
        quantity: 4
      }
    })
    assertStatus(decisiveRecruit, 200)

    const decisiveBattle = await request(`/users/${decisiveUserId}/army/battle`, {
      method: 'POST'
    })
    assertStatus(decisiveBattle, 200)
    assert.equal(decisiveBattle.body.data.outcome, 'victory')
    assert.equal(decisiveBattle.body.data.victoryType, 'decisive')
    assert.equal(decisiveBattle.body.data.playerFightingStrength, 123)

    const decisiveArtilleryLoss = findRowByName(
      decisiveBattle.body.data.troopLosses,
      'unitName',
      'artillery'
    )
    assert.equal(decisiveArtilleryLoss.quantityBefore, 4)
    assert.equal(decisiveArtilleryLoss.quantityLost, 1)
    assert.equal(decisiveArtilleryLoss.quantityAfter, 3)
  })

  await t.test('battle with low flour applies strength and morale penalties but can still be won', async () => {
    const created = await createUser({
      username: createUniqueName('low_flour_battle'),
      armyName: 'Hungry Legion'
    })
    const lowFlourUserId = created.body.data.id

    const artillery = await request(`/users/${lowFlourUserId}/army/recruit`, {
      method: 'POST',
      body: {
        unitName: 'artillery',
        quantity: 4
      }
    })
    assertStatus(artillery, 200)

    const soldFlour = await request(`/users/${lowFlourUserId}/army/trade`, {
      method: 'POST',
      body: {
        tradeType: 'sell',
        item: 'flour',
        quantity: 120
      }
    })
    assertStatus(soldFlour, 200)
    assert.equal(soldFlour.body.data.resources.flour, 0)

    const battle = await request(`/users/${lowFlourUserId}/army/battle`, {
      method: 'POST'
    })
    assertStatus(battle, 200)
    assert.equal(battle.body.data.outcome, 'victory')
    assert.equal(battle.body.data.resourceMultiplier, 0.85)
    assert.equal(battle.body.data.playerFightingStrength, 104)
    assert.equal(battle.body.data.armyState.resources.flour, 0)
    assert.equal(battle.body.data.armyState.resources.morale, 47)

    const battleLogs = await request(`/users/${lowFlourUserId}/army/logs?eventType=battle`)
    assertStatus(battleLogs, 200)

    const details = JSON.parse(battleLogs.body.data[0].details)
    assert.equal(details.hasEnoughFlour, false)
    assert.equal(details.hasEnoughSupply, true)
    assert.equal(details.resourceMultiplier, 0.85)
  })

  await t.test('battle defeat resets an unprepared army and writes a readable battle log', async () => {
    const created = await createUser({
      username: createUniqueName('defeat_user'),
      armyName: 'Unprepared Legion'
    })
    const defeatUserId = created.body.data.id

    const battle = await request(`/users/${defeatUserId}/army/battle`, {
      method: 'POST'
    })
    assertStatus(battle, 200)
    assert.equal(battle.body.data.outcome, 'defeat')
    assert.equal(battle.body.data.enemyName, 'Liho Border Guard')
    assert.equal(battle.body.data.victoryType, null)
    assert.deepEqual(battle.body.data.troopLosses, [])
    assert.equal(battle.body.data.playerFightingStrength, 0)
    assert.equal(battle.body.data.armyReset, true)
    assert.equal(battle.body.data.campaignProgress.currentEnemySequence, 1)
    assert.equal(battle.body.data.armyState.resources.manpower, 120)
    assert.equal(battle.body.data.armyState.resources.ducats, 180)

    const battleLogs = await request(`/users/${defeatUserId}/army/logs?eventType=battle`)
    assertStatus(battleLogs, 200)
    assert.equal(battleLogs.body.data.length >= 1, true)
    assert.equal(battleLogs.body.data[0].eventType, 'battle')
    assert.match(battleLogs.body.data[0].message, /Defeated by Liho Border Guard/)

    const details = JSON.parse(battleLogs.body.data[0].details)
    assert.equal(details.outcome, 'defeat')
    assert.equal(details.enemyName, 'Liho Border Guard')
    assert.equal(details.playerFightingStrength, 0)
    assert.deepEqual(details.troopLosses, [])
  })

  await t.test('a missing army is an integrity error and restart does not recreate it', async () => {
    const created = await createUser({
      username: createUniqueName('missing_army'),
      armyName: 'Temporary Legion'
    })
    const missingArmyUserId = created.body.data.id

    deleteArmyForUser(missingArmyUserId)

    const missingArmyRoutes = [
      { path: `/users/${missingArmyUserId}/army`, method: 'GET' },
      { path: `/users/${missingArmyUserId}/army/state`, method: 'GET' },
      { path: `/users/${missingArmyUserId}/army/recruit`, method: 'POST' },
      { path: `/users/${missingArmyUserId}/army/trade`, method: 'POST' },
      { path: `/users/${missingArmyUserId}/army/advance-turn`, method: 'POST' },
      { path: `/users/${missingArmyUserId}/army/campaign-progress`, method: 'GET' },
      { path: `/users/${missingArmyUserId}/army/battle`, method: 'POST' },
      { path: `/users/${missingArmyUserId}/army/logs`, method: 'GET' }
    ]

    for (const route of missingArmyRoutes) {
      const result = await request(route.path, { method: route.method })

      assertStatus(result, 404)
      assert.equal(result.body.error, 'Army not found for this user.')
    }

    const userStillExists = await request(`/users/${missingArmyUserId}`)
    assertStatus(userStillExists, 200)

    const restart = await request(`/users/${missingArmyUserId}/army/restart`, {
      method: 'POST'
    })
    assertStatus(restart, 404)
    assert.equal(restart.body.error, 'Army not found for this user.')
  })

  await t.test('log details are parseable JSON for recruit, trade, turn, and battle', async () => {
    const created = await createUser({
      username: createUniqueName('log_detail'),
      armyName: 'Log Detail Legion'
    })
    const logUserId = created.body.data.id

    await request(`/users/${logUserId}/army/recruit`, {
      method: 'POST',
      body: {
        unitName: 'infantry',
        quantity: 1
      }
    })
    await request(`/users/${logUserId}/army/trade`, {
      method: 'POST',
      body: {
        tradeType: 'buy',
        item: 'flour',
        quantity: 1
      }
    })
    await request(`/users/${logUserId}/army/advance-turn`, {
      method: 'POST'
    })
    await request(`/users/${logUserId}/army/battle`, {
      method: 'POST'
    })

    const recruitLogs = await request(`/users/${logUserId}/army/logs?eventType=recruit`)
    const tradeLogs = await request(`/users/${logUserId}/army/logs?eventType=trade`)
    const turnLogs = await request(`/users/${logUserId}/army/logs?eventType=turn`)
    const battleLogs = await request(`/users/${logUserId}/army/logs?eventType=battle`)

    assertStatus(recruitLogs, 200)
    assertStatus(tradeLogs, 200)
    assertStatus(turnLogs, 200)
    assertStatus(battleLogs, 200)

    const recruitDetails = JSON.parse(recruitLogs.body.data[0].details)
    const tradeDetails = JSON.parse(tradeLogs.body.data[0].details)
    const turnDetails = JSON.parse(turnLogs.body.data[0].details)
    const battleDetails = JSON.parse(battleLogs.body.data[0].details)

    assert.equal(recruitDetails.unitName, 'infantry')
    assert.equal(recruitDetails.quantity, 1)
    assert.equal(tradeDetails.tradeType, 'buy')
    assert.equal(tradeDetails.item, 'flour')
    assert.equal(turnDetails.manpowerGained, CAMPAIGNS[0].manpowerGainPerTurn)
    assert.equal(turnDetails.flourGained, CAMPAIGNS[0].flourGainPerTurn)
    assert.equal(turnDetails.supplyGained, CAMPAIGNS[0].supplyGainPerTurn)
    assert.equal(Array.isArray(turnDetails.equipmentGained), true)
    assert.equal(turnDetails.enemyAttacked, false)
    assert.equal(turnDetails.turnsOnCurrentEnemy, 1)
    assert.equal(battleDetails.trigger, BATTLE_TRIGGER_MANUAL)
    assert.equal(battleDetails.enemyName, 'Liho Border Guard')
    assert.equal(typeof battleDetails.playerFightingStrength, 'number')
    assert.equal(Array.isArray(battleDetails.troopLosses), true)
  })

  await t.test('malformed JSON and unknown routes do not look like successful API calls', async () => {
    const malformedJson = await rawRequest('/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      rawBody: '{"username": "broken_json",'
    })
    assert.equal(malformedJson.status, 400)

    const unknownRoute = await rawRequest('/not-a-real-route')
    assert.equal(unknownRoute.status, 404)

    const removedArmyList = await rawRequest('/armies')
    assert.equal(removedArmyList.status, 404)

    const wrongMethod = await rawRequest('/campaigns', {
      method: 'POST'
    })
    assert.equal(wrongMethod.status, 404)
  })

  await t.test('user creation rejects non-string and blank required fields', async () => {
    const numericUsername = await request('/users', {
      method: 'POST',
      body: {
        username: 12345,
        password: 'password123'
      }
    })
    assertStatus(numericUsername, 400)
    assert.equal(numericUsername.body.error, 'Username and password are required.')

    const numericPassword = await request('/users', {
      method: 'POST',
      body: {
        username: createUniqueName('numeric_password'),
        password: 12345
      }
    })
    assertStatus(numericPassword, 400)
    assert.equal(numericPassword.body.error, 'Username and password are required.')

    const blankPassword = await request('/users', {
      method: 'POST',
      body: {
        username: createUniqueName('blank_password'),
        password: '   '
      }
    })
    assertStatus(blankPassword, 400)
    assert.equal(blankPassword.body.error, 'Username and password are required.')

    const maximumUsername = `u${'x'.repeat(USERNAME_MAX_LENGTH - 1)}`
    const maximumLength = await createUser({ username: maximumUsername })
    assert.equal(maximumLength.body.data.username, maximumUsername)
    assert.equal(maximumLength.body.data.army.armyName.length, ARMY_NAME_MAX_LENGTH)

    const oversizedUsername = await request('/users', {
      method: 'POST',
      body: {
        username: 'x'.repeat(USERNAME_MAX_LENGTH + 1),
        password: 'password123'
      }
    })
    assertStatus(oversizedUsername, 400)
    assert.equal(
      oversizedUsername.body.error,
      `Username must be ${USERNAME_MAX_LENGTH} characters or fewer.`
    )
  })

  await t.test('username update allows same name but rejects another user name', async () => {
    const firstUser = await createUser({
      username: createUniqueName('rename_first'),
      armyName: 'Rename First Legion'
    })
    const secondUser = await createUser({
      username: createUniqueName('rename_second'),
      armyName: 'Rename Second Legion'
    })
    const firstUserId = firstUser.body.data.id
    const firstUsername = firstUser.body.data.username
    const secondUserId = secondUser.body.data.id
    const secondUsername = secondUser.body.data.username

    const sameName = await request(`/users/${firstUserId}`, {
      method: 'PUT',
      body: {
        username: firstUsername
      }
    })
    assertStatus(sameName, 200)
    assert.equal(sameName.body.data.username, firstUsername)

    const duplicateName = await request(`/users/${secondUserId}`, {
      method: 'PUT',
      body: {
        username: firstUsername
      }
    })
    assertStatus(duplicateName, 409)
    assert.equal(duplicateName.body.error, 'Username already exists.')

    const secondStillExists = await request(`/users/${secondUserId}`)
    assertStatus(secondStillExists, 200)
    assert.equal(secondStillExists.body.data.username, secondUsername)

    const oversizedUpdate = await request(`/users/${secondUserId}`, {
      method: 'PUT',
      body: {
        username: 'x'.repeat(USERNAME_MAX_LENGTH + 1)
      }
    })
    assertStatus(oversizedUpdate, 400)
    assert.equal(
      oversizedUpdate.body.error,
      `Username must be ${USERNAME_MAX_LENGTH} characters or fewer.`
    )
  })

  await t.test('form gameplay requests work for army update, recruit, and trade', async () => {
    const created = await createUser({
      username: createUniqueName('form_gameplay'),
      armyName: 'Original Form Legion'
    })
    const formUserId = created.body.data.id

    const updatedArmy = await request(`/users/${formUserId}/army`, {
      method: 'PUT',
      form: {
        armyName: 'Form Updated Legion'
      }
    })
    assertStatus(updatedArmy, 200)
    assert.equal(updatedArmy.body.data.armyName, 'Form Updated Legion')

    const recruited = await request(`/users/${formUserId}/army/recruit`, {
      method: 'POST',
      form: {
        unitName: 'infantry',
        quantity: '2'
      }
    })
    assertStatus(recruited, 200)

    const infantry = findRowByName(recruited.body.data.units, 'unitName', 'infantry')
    assert.equal(infantry.quantity, 2)

    const traded = await request(`/users/${formUserId}/army/trade`, {
      method: 'POST',
      form: {
        tradeType: 'sell',
        item: 'flour',
        quantity: '10'
      }
    })
    assertStatus(traded, 200)
    assert.equal(traded.body.data.resources.flour, 110)
    assert.equal(traded.body.data.resources.ducats, 190)
  })

  await t.test('winning three battles completes campaign one and advances to campaign two', async () => {
    const created = await createUser({
      username: createUniqueName('campaign_win'),
      armyName: 'Campaign Winner Legion'
    })
    const campaignUserId = created.body.data.id

    const artillery = await request(`/users/${campaignUserId}/army/recruit`, {
      method: 'POST',
      body: {
        unitName: 'artillery',
        quantity: 4
      }
    })
    assertStatus(artillery, 200)

    const cavalry = await request(`/users/${campaignUserId}/army/recruit`, {
      method: 'POST',
      body: {
        unitName: 'cavalry',
        quantity: 2
      }
    })
    assertStatus(cavalry, 200)

    const firstBattle = await request(`/users/${campaignUserId}/army/battle`, {
      method: 'POST'
    })
    assertStatus(firstBattle, 200)
    assert.equal(firstBattle.body.data.outcome, 'victory')
    assert.equal(firstBattle.body.data.enemyName, 'Liho Border Guard')
    assert.equal(firstBattle.body.data.campaignProgress.currentEnemySequence, 2)

    const reinforcementCavalry = await request(`/users/${campaignUserId}/army/recruit`, {
      method: 'POST',
      body: {
        unitName: 'cavalry',
        quantity: 1
      }
    })
    assertStatus(reinforcementCavalry, 200)

    const secondBattle = await request(`/users/${campaignUserId}/army/battle`, {
      method: 'POST'
    })
    assertStatus(secondBattle, 200)
    assert.equal(secondBattle.body.data.outcome, 'victory')
    assert.equal(secondBattle.body.data.enemyName, 'Liho Pike Regiment')
    assert.equal(secondBattle.body.data.campaignProgress.currentEnemySequence, 3)

    for (let turnNumber = 1; turnNumber <= 4; turnNumber++) {
      const turn = await request(`/users/${campaignUserId}/army/advance-turn`, {
        method: 'POST'
      })
      assertStatus(turn, 200)
    }

    const infantry = await request(`/users/${campaignUserId}/army/recruit`, {
      method: 'POST',
      body: {
        unitName: 'infantry',
        quantity: 10
      }
    })
    assertStatus(infantry, 200)

    const thirdBattle = await request(`/users/${campaignUserId}/army/battle`, {
      method: 'POST'
    })
    assertStatus(thirdBattle, 200)
    assert.equal(thirdBattle.body.data.outcome, 'victory')
    assert.equal(thirdBattle.body.data.enemyName, 'Liho Grand Battery')
    assert.equal(thirdBattle.body.data.campaignCompleted, true)
    assert.equal(thirdBattle.body.data.gameCompleted, false)
    assert.equal(thirdBattle.body.data.campaignProgress.campaignName, 'Conquest of Wayland')
    assert.equal(thirdBattle.body.data.campaignProgress.currentEnemySequence, 1)

    const campaignLogs = await request(`/users/${campaignUserId}/army/logs?eventType=campaign`)
    assertStatus(campaignLogs, 200)

    const completionLog = campaignLogs.body.data.find((log) => log.message === 'Unix Wars completed.')
    assert.notEqual(completionLog, undefined)

    const completionDetails = JSON.parse(completionLog.details)
    assert.equal(completionDetails.completedCampaign, 'Unix Wars')
    assert.equal(completionDetails.majorRewardDucats, 120)
  })

  await t.test('restart clears old logs and leaves one fresh campaign restart log', async () => {
    const created = await createUser({
      username: createUniqueName('restart_log'),
      armyName: 'Restart Log Legion'
    })
    const restartLogUserId = created.body.data.id

    await request(`/users/${restartLogUserId}/army/recruit`, {
      method: 'POST',
      body: {
        unitName: 'infantry',
        quantity: 1
      }
    })
    await request(`/users/${restartLogUserId}/army/trade`, {
      method: 'POST',
      body: {
        tradeType: 'buy',
        item: 'flour',
        quantity: 1
      }
    })

    const logsBeforeRestart = await request(`/users/${restartLogUserId}/army/logs`)
    assertStatus(logsBeforeRestart, 200)
    assert.equal(logsBeforeRestart.body.data.length >= 3, true)

    const restarted = await request(`/users/${restartLogUserId}/army/restart`, {
      method: 'POST'
    })
    assertStatus(restarted, 200)

    const logsAfterRestart = await request(`/users/${restartLogUserId}/army/logs`)
    assertStatus(logsAfterRestart, 200)
    assert.equal(logsAfterRestart.body.data.length, 1)
    assert.equal(logsAfterRestart.body.data[0].eventType, 'campaign')
    assert.match(logsAfterRestart.body.data[0].message, /Game restarted/)

    const recruitLogsAfterRestart = await request(`/users/${restartLogUserId}/army/logs?eventType=recruit`)
    assertStatus(recruitLogsAfterRestart, 200)
    assert.equal(recruitLogsAfterRestart.body.data.length, 0)
  })

  await t.test('deleting a user also removes access to its dependent army', async () => {
    const created = await createUser({
      username: createUniqueName('cascade_user'),
      armyName: 'Cascade Legion'
    })
    const cascadeUserId = created.body.data.id

    const armyBeforeDelete = await request(`/users/${cascadeUserId}/army`)
    assertStatus(armyBeforeDelete, 200)

    const deletedUser = await request(`/users/${cascadeUserId}`, {
      method: 'DELETE'
    })
    assertStatus(deletedUser, 204)

    const armyAfterDelete = await request(`/users/${cascadeUserId}/army`)
    assertStatus(armyAfterDelete, 404)
    assert.equal(armyAfterDelete.body.error, 'User not found.')
  })

  await t.test('success responses do not leak middleware internals', async () => {
    const created = await createUser({
      username: createUniqueName('shape_user'),
      armyName: 'Shape Legion'
    })
    const shapeUserId = created.body.data.id

    const user = await request(`/users/${shapeUserId}`)
    const army = await request(`/users/${shapeUserId}/army`)
    const state = await request(`/users/${shapeUserId}/army/state`)
    const logs = await request(`/users/${shapeUserId}/army/logs`)

    const responses = [user, army, state, logs]

    for (const response of responses) {
      assertStatus(response, 200)
      assertSuccessShape(response)
      assert.equal(response.body.user, undefined)
      assert.equal(response.body.army, undefined)
      assert.equal(response.body.status, undefined)
    }
  })

  await t.test('deleting the user is the supported way to remove its army', async () => {
    const deletedUser = await request(`/users/${userId}`, {
      method: 'DELETE'
    })
    assertStatus(deletedUser, 204)

    const missingUser = await request(`/users/${userId}`)
    assertStatus(missingUser, 404)
    assert.equal(missingUser.body.error, 'User not found.')

    const deletedArmy = await request(`/users/${userId}/army`)
    assertStatus(deletedArmy, 404)
    assert.equal(deletedArmy.body.error, 'User not found.')
  })
})
