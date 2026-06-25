import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { and, eq } from 'drizzle-orm'
import { db } from '../src/db/db.js'
import {
  armies, armyCampaignProgress, armyEquipment, armyLogs, armyResources,
  armyUnits, campaignTemplateEnemies, campaignTemplates, unitTypes, users
} from '../src/db/schema.js'
import { ARMY_NAME_MAX_LENGTH, USERNAME_MAX_LENGTH } from '../src/constants/validation.js'
import {
  CAMPAIGN_TEMPLATES,
  STARTING_EQUIPMENT,
  STARTING_RESOURCES
} from '../src/constants/gameBalance.js'
import { getValueOrDefault } from '../src/utils/helper.js'

const port = 3199
const baseUrl = `http://127.0.0.1:${port}`
let server
let serial = 0

function unique(prefix = 'user') {
  serial += 1
  return `${prefix}_${Date.now()}_${serial}`
}

async function request(path, options = {}) {
  const headers = { ...getValueOrDefault(options.headers, {}) }
  let body
  if (options.rawBody !== undefined) body = options.rawBody
  else if (options.form) {
    headers['content-type'] = 'application/x-www-form-urlencoded'
    body = new URLSearchParams(options.form).toString()
  } else if (options.body !== undefined) {
    headers['content-type'] = 'application/json'
    body = JSON.stringify(options.body)
  }
  const response = await fetch(`${baseUrl}${path}`, {
    method: getValueOrDefault(options.method, 'GET'), headers, body
  })
  if (response.status === 204) return { status: 204, body: null, text: '' }
  const text = await response.text()
  let parsed
  try { parsed = JSON.parse(text) } catch { parsed = undefined }
  return { status: response.status, body: parsed, text, headers: response.headers }
}

function assertSuccess(response, status = 200) {
  assert.equal(response.status, status, response.text)
  assert.equal(typeof response.body.message, 'string')
  assert.ok(Object.hasOwn(response.body, 'data'))
  assert.equal(response.body.error, undefined)
}

function assertError(response, status, message) {
  assert.equal(response.status, status, response.text)
  assert.deepEqual(response.body, { error: message })
}

async function createUser(overrides = {}) {
  const username = getValueOrDefault(overrides.username, unique('player'))
  const armyName = getValueOrDefault(overrides.armyName, 'Test Legion')
  const input = {
    username,
    ...(overrides.armyName === null ? {} : { armyName })
  }
  const response = await request('/users', { method: 'POST', body: input })
  assertSuccess(response, 201)
  return response.body.data
}

async function getState(userId) {
  const response = await request(`/users/${userId}/army/state`)
  assertSuccess(response)
  return response.body.data
}

async function setResources(armyId, values) {
  await db.update(armyResources).set(values).where(eq(armyResources.armyId, armyId))
}

async function setEquipment(armyId, values) {
  await db.update(armyEquipment).set(values).where(eq(armyEquipment.armyId, armyId))
}

async function setProgress(armyId, values) {
  await db.update(armyCampaignProgress).set(values).where(eq(armyCampaignProgress.armyId, armyId))
}

async function setUnitQuantity(armyId, unitName, quantity) {
  const [type] = await db.select().from(unitTypes).where(eq(unitTypes.unitName, unitName))
  await db.update(armyUnits).set({ quantity }).where(and(
    eq(armyUnits.armyId, armyId), eq(armyUnits.unitTypeId, type.id)
  ))
}

async function makeArmyOverwhelming(armyId) {
  await setResources(armyId, { manpower: 100000, ducats: 100000, flour: 100000, supply: 100000, morale: 100 })
  await setEquipment(armyId, { muskets: 100000, horses: 100000, fieldGuns: 100000 })
  for (const name of ['infantry', 'cavalry', 'artillery']) await setUnitQuantity(armyId, name, 1000)
}

before(async () => {
  server = spawn(process.execPath, ['index.js'], {
    cwd: process.cwd(), env: { ...process.env, PORT: String(port) }, stdio: 'ignore'
  })
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(baseUrl)
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('Test server did not start.')
})

after(() => {
  if (server) server.kill()
})

test('health, unknown routes, and malformed JSON', async (t) => {
  await t.test('health route returns the service marker', async () => {
    const response = await request('/')
    assert.equal(response.status, 200)
    assert.deepEqual(response.body, { message: 'Leviathan API is running' })
  })
  await t.test('unknown routes are not successful API responses', async () => {
    const response = await request('/does-not-exist')
    assertError(response, 404, 'Route not found.')
  })
  await t.test('malformed JSON is rejected before controller execution', async () => {
    const response = await request('/users', {
      method: 'POST', headers: { 'content-type': 'application/json' }, rawBody: '{ broken'
    })
    assertError(response, 400, 'Malformed JSON body.')
  })
})

test('POST /users validates every profile field and creates complete state', async (t) => {
  for (const [name, body] of [
    ['missing body', undefined],
    ['missing username', { armyName: 'No Owner' }],
    ['blank username', { username: '   ' }],
    ['non-string username', { username: 12 }]
  ]) {
    await t.test(name, async () => {
      const response = await request('/users', { method: 'POST', ...(body === undefined ? {} : { body }) })
      assertError(response, 400, 'Username is required.')
    })
  }

  await t.test('rejects oversized username', async () => {
    const response = await request('/users', { method: 'POST', body: {
      username: 'u'.repeat(USERNAME_MAX_LENGTH + 1)
    } })
    assertError(response, 400, `Username must be ${USERNAME_MAX_LENGTH} characters or fewer.`)
  })
  await t.test('rejects blank, non-string, and oversized army names', async () => {
    for (const armyName of ['', '   ', 42]) {
      const response = await request('/users', { method: 'POST', body: {
        username: unique('bad_army'), armyName
      } })
      assertError(response, 400, 'Army name must be a non-empty string.')
    }
    const oversized = await request('/users', { method: 'POST', body: {
      username: unique('large_army'), armyName: 'a'.repeat(ARMY_NAME_MAX_LENGTH + 1)
    } })
    assertError(oversized, 400, `Army name must be ${ARMY_NAME_MAX_LENGTH} characters or fewer.`)
  })
  await t.test('trims input and allows maximum lengths', async () => {
    const maximumUsername = unique('maximum').padEnd(USERNAME_MAX_LENGTH, 'u').slice(0, USERNAME_MAX_LENGTH)
    const username = ` ${maximumUsername} `
    const armyName = ` ${'a'.repeat(ARMY_NAME_MAX_LENGTH)} `
    const response = await request('/users', { method: 'POST', body: { username, armyName } })
    assertSuccess(response, 201)
    const data = response.body.data
    assert.equal(data.username.length, USERNAME_MAX_LENGTH)
    assert.equal(data.army.armyName.length, ARMY_NAME_MAX_LENGTH)
    assert.equal(data.state, undefined)
    const state = await getState(data.id)
    assert.deepEqual(state.resources, STARTING_RESOURCES)
    assert.equal(state.equipment.horses, STARTING_EQUIPMENT.horses)
    assert.equal(state.equipment.fieldGuns, STARTING_EQUIPMENT.fieldGuns)
    assert.equal(state.equipment.muskets, STARTING_EQUIPMENT.muskets)
    assert.equal(state.units.length, 3)
    assert.ok(state.units.every((unit) => unit.quantity === 0))
    assert.equal(state.campaignProgress.campaignNumber, 1)
    assert.equal(state.campaignProgress.campaignsCompleted, 0)
    assert.equal(state.campaignProgress.currentEnemySequence, 1)
    assert.equal(state.campaignProgress.turnsOnCurrentEnemy, 0)
  })
  await t.test('generates a bounded default army name and accepts form data', async () => {
    const username = unique('form_player')
    const response = await request('/users', { method: 'POST', form: { username } })
    assertSuccess(response, 201)
    assert.equal(response.body.data.army.armyName, `${username} Army`)
    assert.ok(response.body.data.army.armyName.length <= ARMY_NAME_MAX_LENGTH)
  })
  await t.test('duplicate username returns conflict without creating another user', async () => {
    const username = unique('duplicate')
    await createUser({ username })
    const duplicate = await request('/users', { method: 'POST', body: { username } })
    assertError(duplicate, 409, 'Username already exists.')
    const rows = await db.select().from(users).where(eq(users.username, username))
    assert.equal(rows.length, 1)
  })
})

test('GET /users and GET /users/:userId cover list, filter, and IDs', async (t) => {
  const created = await createUser()
  await t.test('list returns user profiles', async () => {
    const response = await request('/users')
    assertSuccess(response)
    assert.ok(response.body.data.some((user) => user.id === created.id))
  })
  await t.test('trimmed exact username filter works', async () => {
    const response = await request(`/users?username=${encodeURIComponent(` ${created.username} `)}`)
    assertSuccess(response)
    assert.equal(response.body.data.length, 1)
    assert.equal(response.body.data[0].id, created.id)
  })
  await t.test('unknown filter yields an empty list', async () => {
    const response = await request(`/users?username=${unique('absent')}`)
    assertSuccess(response)
    assert.deepEqual(response.body.data, [])
  })
  await t.test('blank query is rejected', async () => {
    assertError(await request('/users?username=%20%20'), 400, 'Username query must be a non-empty string.')
  })
  await t.test('single user read returns the profile', async () => {
    const response = await request(`/users/${created.id}`)
    assertSuccess(response)
    assert.equal(response.body.data.username, created.username)
  })
  await t.test('invalid and missing IDs are distinguished', async () => {
    for (const id of ['abc', '0', '-1', '1.5']) assertError(await request(`/users/${id}`), 400, 'Invalid user id.')
    assertError(await request('/users/2147483647'), 404, 'User not found.')
  })
})

test('PUT /users/:userId updates safely and handles conflicts', async (t) => {
  const first = await createUser()
  const second = await createUser()
  for (const username of [undefined, '', '   ', 42]) {
    await t.test(`rejects invalid username ${String(username)}`, async () => {
      const body = username === undefined ? {} : { username }
      assertError(await request(`/users/${first.id}`, { method: 'PUT', body }), 400, 'Username is required.')
    })
  }
  await t.test('rejects oversized and already-owned names', async () => {
    assertError(await request(`/users/${first.id}`, { method: 'PUT', body: { username: 'x'.repeat(USERNAME_MAX_LENGTH + 1) } }), 400, `Username must be ${USERNAME_MAX_LENGTH} characters or fewer.`)
    assertError(await request(`/users/${first.id}`, { method: 'PUT', body: { username: second.username } }), 409, 'Username already exists.')
  })
  await t.test('allows unchanged name and trims a new name', async () => {
    const same = await request(`/users/${first.id}`, { method: 'PUT', body: { username: first.username } })
    assertSuccess(same)
    const newName = unique('renamed')
    const changed = await request(`/users/${first.id}`, { method: 'PUT', body: { username: ` ${newName} ` } })
    assertSuccess(changed)
    assert.equal(changed.body.data.username, newName)
  })
})

test('army identity, rename, and state routes', async (t) => {
  const created = await createUser({ armyName: 'Original Army' })
  await t.test('GET army returns identity without nested state', async () => {
    const response = await request(`/users/${created.id}/army`)
    assertSuccess(response)
    assert.equal(response.body.data.armyName, 'Original Army')
    assert.equal(response.body.data.resources, undefined)
  })
  await t.test('GET state returns direct equipment, unit rules, and generated progress', async () => {
    const response = await request(`/users/${created.id}/army/state`)
    assertSuccess(response)
    const state = response.body.data
    assert.equal(Array.isArray(state.equipment), false)
    assert.deepEqual(Object.keys(state.equipment).sort(), ['fieldGuns', 'horses', 'muskets'].sort())
    assert.ok(state.units.every((unit) => unit.armyUnitId === undefined && unit.unitTypeId === undefined))
    assert.deepEqual(state.units.map((unit) => unit.unitName).sort(), ['artillery', 'cavalry', 'infantry'])
    assert.ok(state.units.every((unit) => typeof unit.requiredEquipment === 'string'))
    assert.equal(state.campaignProgress.currentEnemy.enemySequence, state.campaignProgress.currentEnemySequence)
  })
  await t.test('rename validates, trims, accepts form input, and enforces max length', async () => {
    for (const armyName of [undefined, '', ' ', 4]) {
      const body = armyName === undefined ? {} : { armyName }
      assertError(await request(`/users/${created.id}/army`, { method: 'PUT', body }), 400, 'Army name is required.')
    }
    assertError(await request(`/users/${created.id}/army`, { method: 'PUT', body: { armyName: 'x'.repeat(ARMY_NAME_MAX_LENGTH + 1) } }), 400, `Army name must be ${ARMY_NAME_MAX_LENGTH} characters or fewer.`)
    const updated = await request(`/users/${created.id}/army`, { method: 'PUT', form: { armyName: ' Form Legion ' } })
    assertSuccess(updated)
    assert.equal(updated.body.data.armyName, 'Form Legion')
  })
})

test('recruitment validates input and deducts each direct equipment column atomically', async (t) => {
  const validationUser = await createUser()
  for (const [body, status, message] of [
    [{}, 400, 'unitName is required.'],
    [{ unitName: '', quantity: 1 }, 400, 'unitName is required.'],
    [{ unitName: 4, quantity: 1 }, 400, 'unitName is required.'],
    [{ unitName: 'infantry' }, 400, 'Quantity must be a positive integer.'],
    [{ unitName: 'infantry', quantity: 0 }, 400, 'Quantity must be a positive integer.'],
    [{ unitName: 'infantry', quantity: -1 }, 400, 'Quantity must be a positive integer.'],
    [{ unitName: 'infantry', quantity: 1.5 }, 400, 'Quantity must be a positive integer.'],
    [{ unitName: 'INFANTRY', quantity: 1 }, 404, 'Unit type not found.'],
    [{ unitName: 'dragon', quantity: 1 }, 404, 'Unit type not found.']
  ]) {
    await t.test(`validation ${JSON.stringify(body)}`, async () => {
      assertError(await request(`/users/${validationUser.id}/army/recruit`, { method: 'POST', body }), status, message)
    })
  }

  for (const expectation of [
    { unitName: 'infantry', equipmentKey: 'muskets', equipmentType: 'muskets', cost: 10, manpower: 10 },
    { unitName: 'cavalry', equipmentKey: 'horses', equipmentType: 'horses', cost: 5, manpower: 15 },
    { unitName: 'artillery', equipmentKey: 'fieldGuns', equipmentType: 'field_guns', cost: 2, manpower: 20 }
  ]) {
    await t.test(`recruits ${expectation.unitName}`, async () => {
      const player = await createUser()
      const before = await getState(player.id)
      const response = await request(`/users/${player.id}/army/recruit`, {
        method: 'POST', body: { unitName: ` ${expectation.unitName} `, quantity: '1' }
      })
      assertSuccess(response)
      const result = response.body.data
      assert.equal(result.army, undefined)
      assert.equal(result.campaignProgress, undefined)
      assert.equal(result.armyState, undefined)
      assert.deepEqual(result.recruited, {
        unitName: expectation.unitName,
        quantity: 1,
        totalQuantity: 1
      })
      assert.deepEqual(result.spent, {
        manpower: expectation.manpower,
        equipment: { type: expectation.equipmentType, quantity: expectation.cost }
      })
      assert.equal(result.remaining.manpower, before.resources.manpower - expectation.manpower)
      assert.deepEqual(result.remaining.equipment, {
        type: expectation.equipmentType,
        quantity: before.equipment[expectation.equipmentKey] - expectation.cost
      })
      const after = await getState(player.id)
      assert.equal(after.units.find((unit) => unit.unitName === expectation.unitName).quantity, 1)
      for (const key of ['muskets', 'horses', 'fieldGuns']) {
        if (key !== expectation.equipmentKey) assert.equal(after.equipment[key], before.equipment[key])
      }
    })
  }

  await t.test('exact equipment spending succeeds, then further recruitment fails without partial mutation', async () => {
    const player = await createUser()
    const first = await request(`/users/${player.id}/army/recruit`, { method: 'POST', body: { unitName: 'infantry', quantity: 8 } })
    assertSuccess(first)
    assert.equal(first.body.data.remaining.equipment.quantity, 0)
    const failed = await request(`/users/${player.id}/army/recruit`, { method: 'POST', body: { unitName: 'infantry', quantity: 1 } })
    assertError(failed, 422, 'Insufficient required equipment.')
    const state = await getState(player.id)
    assert.equal(state.equipment.muskets, 0)
    assert.equal(state.units.find((unit) => unit.unitName === 'infantry').quantity, 8)
  })

  await t.test('insufficient manpower takes precedence and changes nothing', async () => {
    const player = await createUser()
    await setResources(player.army.id, { manpower: 0 })
    const before = await getState(player.id)
    assertError(await request(`/users/${player.id}/army/recruit`, { method: 'POST', body: { unitName: 'cavalry', quantity: 1 } }), 422, 'Insufficient manpower.')
    const after = await getState(player.id)
    assert.equal(after.resources.manpower, before.resources.manpower)
    assert.equal(after.equipment.horses, before.equipment.horses)
  })
})

test('trade route covers every validation, affordability, and exact-spending branch', async (t) => {
  const player = await createUser()
  for (const [body, message] of [
    [{}, 'tradeType must be buy or sell.'],
    [{ tradeType: 'BUY', item: 'flour', quantity: 1 }, 'tradeType must be buy or sell.'],
    [{ tradeType: 'buy', item: 'ducats', quantity: 1 }, 'item must be flour or supply.'],
    [{ tradeType: 'buy', item: 'flour' }, 'Quantity must be a positive integer.'],
    [{ tradeType: 'buy', item: 'flour', quantity: 0 }, 'Quantity must be a positive integer.'],
    [{ tradeType: 'buy', item: 'flour', quantity: 1.5 }, 'Quantity must be a positive integer.']
  ]) {
    await t.test(`rejects ${JSON.stringify(body)}`, async () => {
      assertError(await request(`/users/${player.id}/army/trade`, { method: 'POST', body }), 400, message)
    })
  }
  await t.test('buy flour and supply at their distinct prices', async () => {
    const flour = await request(`/users/${player.id}/army/trade`, { method: 'POST', body: { tradeType: 'buy', item: 'flour', quantity: '10' } })
    assertSuccess(flour)
    assert.deepEqual(flour.body.data, {
      tradeType: 'buy', item: 'flour', quantity: 10, pricePerUnit: 2,
      ducatsChange: -20, balances: { ducats: 160, flour: 130 }
    })
    assert.equal(flour.body.data.army, undefined)
    assert.equal(flour.body.data.armyState, undefined)
    const supply = await request(`/users/${player.id}/army/trade`, { method: 'POST', body: { tradeType: 'buy', item: 'supply', quantity: 10 } })
    assertSuccess(supply)
    assert.equal(supply.body.data.balances.ducats, 130)
    assert.equal(supply.body.data.balances.supply, 110)
  })
  await t.test('sell flour and supply, including exact available quantity', async () => {
    const exact = await createUser()
    const flour = await request(`/users/${exact.id}/army/trade`, { method: 'POST', body: { tradeType: 'sell', item: 'flour', quantity: 120 } })
    assertSuccess(flour)
    assert.equal(flour.body.data.balances.flour, 0)
    assert.equal(flour.body.data.balances.ducats, 300)
    const supply = await request(`/users/${exact.id}/army/trade`, { method: 'POST', body: { tradeType: 'sell', item: 'supply', quantity: 100 } })
    assertSuccess(supply)
    assert.equal(supply.body.data.balances.supply, 0)
  })
  await t.test('exact ducat spending succeeds and overspending fails atomically', async () => {
    const exact = await createUser()
    const bought = await request(`/users/${exact.id}/army/trade`, { method: 'POST', body: { tradeType: 'buy', item: 'flour', quantity: 90 } })
    assertSuccess(bought)
    assert.equal(bought.body.data.balances.ducats, 0)
    const failed = await request(`/users/${exact.id}/army/trade`, { method: 'POST', body: { tradeType: 'buy', item: 'flour', quantity: 1 } })
    assertError(failed, 422, 'Insufficient ducats.')
    assert.equal((await getState(exact.id)).resources.ducats, 0)
  })
  await t.test('selling unavailable resources returns item-specific errors', async () => {
    const poor = await createUser()
    await setResources(poor.army.id, { flour: 0, supply: 0 })
    assertError(await request(`/users/${poor.id}/army/trade`, { method: 'POST', body: { tradeType: 'sell', item: 'flour', quantity: 1 } }), 422, 'Insufficient flour.')
    assertError(await request(`/users/${poor.id}/army/trade`, { method: 'POST', body: { tradeType: 'sell', item: 'supply', quantity: 1 } }), 422, 'Insufficient supply.')
  })
})

test('mutation responses stay action-focused and never return a full armyState', async () => {
  const player = await createUser()
  const responses = []

  responses.push(await request(`/users/${player.id}`, {
    method: 'PUT',
    body: { username: unique('focused_user') }
  }))
  responses.push(await request(`/users/${player.id}/army`, {
    method: 'PUT',
    body: { armyName: 'Focused Legion' }
  }))
  responses.push(await request(`/users/${player.id}/army/recruit`, {
    method: 'POST',
    body: { unitName: 'infantry', quantity: 1 }
  }))
  responses.push(await request(`/users/${player.id}/army/trade`, {
    method: 'POST',
    body: { tradeType: 'buy', item: 'flour', quantity: 1 }
  }))
  responses.push(await request(`/users/${player.id}/army/advance-turn`, { method: 'POST' }))

  await makeArmyOverwhelming(player.army.id)
  responses.push(await request(`/users/${player.id}/army/battle`, { method: 'POST' }))
  responses.push(await request(`/users/${player.id}/army/restart`, { method: 'POST' }))

  for (const response of responses) {
    assertSuccess(response)
    assert.equal(response.body.data.armyState, undefined)
  }
})

test('turn advancement scales production, applies upkeep, and maintains counters', async (t) => {
  await t.test('campaign one gains direct equipment and resources', async () => {
    const player = await createUser()
    const response = await request(`/users/${player.id}/army/advance-turn`, { method: 'POST' })
    assertSuccess(response)
    assert.equal(response.body.message, 'Turn advanced successfully.')
    assert.equal(response.body.data.enemyAttack.attacked, false)
    assert.equal(response.body.data.campaignMultiplier, 1)
    assert.equal(response.body.data.resourceBalances.manpower, 145)
    assert.equal(response.body.data.resourceBalances.flour, 133)
    assert.equal(response.body.data.resourceBalances.supply, 114)
    assert.equal(response.body.data.equipmentBalances.horses, 28)
    assert.equal(response.body.data.equipmentBalances.fieldGuns, 10)
    assert.equal(response.body.data.equipmentBalances.muskets, 88)
    assert.equal(response.body.data.campaignProgress.currentTurn, 2)
    assert.equal(response.body.data.campaignProgress.turnsOnCurrentEnemy, 1)
    assert.equal(response.body.data.armyState, undefined)
  })
  await t.test('campaign five applies 1.60x to every production family', async () => {
    const player = await createUser()
    await setProgress(player.army.id, { campaignNumber: 5, campaignsCompleted: 4 })
    const response = await request(`/users/${player.id}/army/advance-turn`, { method: 'POST' })
    assertSuccess(response)
    assert.equal(response.body.data.campaignMultiplier, 1.6)
    assert.equal(response.body.data.resourceBalances.manpower, 160)
    assert.equal(response.body.data.resourceBalances.flour, 141)
    assert.equal(response.body.data.resourceBalances.supply, 122)
    assert.equal(response.body.data.equipmentBalances.horses, 30)
    assert.equal(response.body.data.equipmentBalances.fieldGuns, 11)
    assert.equal(response.body.data.equipmentBalances.muskets, 93)
    assert.equal(response.body.data.campaignProgress.campaignNumber, 5)
  })
  await t.test('unit upkeep consumes production and flour shortage lowers morale', async () => {
    const player = await createUser()
    await setUnitQuantity(player.army.id, 'infantry', 100)
    await setResources(player.army.id, { flour: 0, supply: 0, morale: 3 })
    const response = await request(`/users/${player.id}/army/advance-turn`, { method: 'POST' })
    assertSuccess(response)
    const resources = response.body.data.resourceBalances
    assert.equal(resources.flour, 0)
    assert.equal(resources.supply, 0)
    assert.equal(resources.morale, 0)
  })
  await t.test('counter increments without changing faction or enemy', async () => {
    const player = await createUser()
    const before = (await getState(player.id)).campaignProgress
    for (let turn = 1; turn <= 3; turn += 1) {
      const response = await request(`/users/${player.id}/army/advance-turn`, { method: 'POST' })
      assert.equal(response.body.data.enemyAttack.turnsOnCurrentEnemy, turn)
      assert.equal(response.body.data.campaignProgress.currentFaction, before.currentFaction)
      assert.equal(response.body.data.campaignProgress.currentEnemySequence, before.currentEnemySequence)
    }
  })
})

test('enemy auto-attack resolves both defeat and victory on the sixth waiting turn', async (t) => {
  await t.test('defeat resets starter state but preserves campaign depth and faction', async () => {
    const player = await createUser()
    await setProgress(player.army.id, { campaignNumber: 5, campaignsCompleted: 4, currentEnemySequence: 2, currentFaction: 'bingxue', turnsOnCurrentEnemy: 5 })
    await setResources(player.army.id, { manpower: 999, ducats: 999, flour: 999, supply: 999, morale: 99 })
    const response = await request(`/users/${player.id}/army/advance-turn`, { method: 'POST' })
    assertSuccess(response)
    assert.equal(response.body.message, 'Turn advanced. The enemy attacked first.')
    assert.equal(response.body.data.enemyAttack.attacked, true)
    assert.equal(response.body.data.battle.trigger, 'enemy_auto_attack')
    assert.equal(response.body.data.battle.outcome, 'defeat')
    assert.equal(response.body.data.battle.armyReset, true)
    assert.equal(response.body.data.campaignProgress.campaignNumber, 5)
    assert.equal(response.body.data.campaignProgress.currentFaction, 'bingxue')
    assert.equal(response.body.data.campaignProgress.currentEnemySequence, 1)
    assert.equal(response.body.data.campaignProgress.turnsOnCurrentEnemy, 0)
    assert.equal(response.body.data.armyState, undefined)
    for (const key of Object.keys(STARTING_RESOURCES)) {
      assert.equal(response.body.data.resourceBalances[key], STARTING_RESOURCES[key])
    }
  })
  await t.test('victory advances enemy and resets waiting counter', async () => {
    const player = await createUser()
    await makeArmyOverwhelming(player.army.id)
    await setProgress(player.army.id, { currentEnemySequence: 1, turnsOnCurrentEnemy: 5, currentFaction: 'liho' })
    const response = await request(`/users/${player.id}/army/advance-turn`, { method: 'POST' })
    assertSuccess(response)
    assert.equal(response.body.data.battle.outcome, 'victory')
    assert.equal(response.body.data.battle.campaignCompleted, false)
    assert.equal(response.body.data.campaignProgress.currentEnemySequence, 2)
    assert.equal(response.body.data.campaignProgress.turnsOnCurrentEnemy, 0)
    assert.equal(response.body.data.armyState, undefined)
  })
})

test('manual battle handles client targeting, defeat, counters, casualties, and endless progression', async (t) => {
  await t.test('client cannot select or skip an enemy', async () => {
    const player = await createUser()
    assertError(await request(`/users/${player.id}/army/battle`, { method: 'POST', body: { enemyArmyId: 1 } }), 400, 'enemyArmyId is not allowed. Battle uses the current campaign enemy.')
  })
  await t.test('unprepared defeat preserves depth and faction while resetting the campaign attempt', async () => {
    const player = await createUser()
    await setProgress(player.army.id, { campaignNumber: 8, campaignsCompleted: 7, currentEnemySequence: 3, currentFaction: 'koi', turnsOnCurrentEnemy: 4 })
    await setResources(player.army.id, { manpower: 1, ducats: 2, flour: 3, supply: 4, morale: 5 })
    await setEquipment(player.army.id, { horses: 1, fieldGuns: 1, muskets: 1 })
    const response = await request(`/users/${player.id}/army/battle`, { method: 'POST' })
    assertSuccess(response)
    assert.equal(response.body.data.outcome, 'defeat')
    assert.equal(response.body.data.armyReset, true)
    assert.equal(response.body.data.campaignProgress.campaignNumber, 8)
    assert.equal(response.body.data.campaignProgress.campaignsCompleted, 7)
    assert.equal(response.body.data.campaignProgress.currentFaction, 'koi')
    assert.equal(response.body.data.campaignProgress.currentEnemySequence, 1)
    assert.equal(response.body.data.campaignProgress.turnsOnCurrentEnemy, 0)
    const state = await getState(player.id)
    assert.equal(state.equipment.horses, STARTING_EQUIPMENT.horses)
    assert.ok(state.units.every((unit) => unit.quantity === 0))
  })
  await t.test('weakness counter is reported and victory casualties persist', async () => {
    const player = await createUser()
    await makeArmyOverwhelming(player.army.id)
    await setProgress(player.army.id, { currentEnemySequence: 1, currentFaction: 'liho' })
    const response = await request(`/users/${player.id}/army/battle`, { method: 'POST' })
    assertSuccess(response)
    assert.equal(response.body.data.outcome, 'victory')
    assert.equal(response.body.data.player.hasCounterUnit, true)
    assert.equal(response.body.data.player.counterMultiplier, 1.1)
    assert.equal(response.body.data.victoryType, 'decisive')
    assert.ok(response.body.data.troopLosses.every((loss) => loss.quantityAfter < loss.quantityBefore))
    assert.ok((await getState(player.id)).units.every((unit) => unit.quantity < 1000))
  })
  await t.test('repeated victories cross several campaign boundaries without completion state', async () => {
    const player = await createUser()
    await makeArmyOverwhelming(player.army.id)
    await setProgress(player.army.id, { campaignNumber: 1, campaignsCompleted: 0, currentEnemySequence: 1, currentFaction: 'liho' })
    for (let battleNumber = 1; battleNumber <= 7; battleNumber += 1) {
      const response = await request(`/users/${player.id}/army/battle`, { method: 'POST' })
      assertSuccess(response)
      assert.equal(response.body.data.outcome, 'victory')
      assert.equal(response.body.data.gameCompleted, undefined)
    }
    const progress = (await getState(player.id)).campaignProgress
    assert.equal(progress.campaignNumber, 3)
    assert.equal(progress.campaignsCompleted, 2)
    assert.equal(progress.currentEnemySequence, 2)
    assert.equal(progress.currentEnemy.difficultyMultiplier, 1.3)
    assert.equal(progress.gameCompleted, undefined)
  })
})

test('battle transactions apply low-resource morale penalties and campaign-scaled rewards', async () => {
  const player = await createUser()
  await makeArmyOverwhelming(player.army.id)
  await setProgress(player.army.id, {
    campaignNumber: 5, campaignsCompleted: 4, currentEnemySequence: 1, currentFaction: 'liho'
  })
  await setResources(player.army.id, {
    manpower: 1000, ducats: 1000, flour: 0, supply: 0, morale: 50
  })
  const response = await request(`/users/${player.id}/army/battle`, { method: 'POST' })
  assertSuccess(response)
  assert.equal(response.body.data.outcome, 'victory')
  assert.equal(response.body.data.player.resourceMultiplier, 0.85)
  assert.equal(response.body.data.resourceBalances.manpower, 1016)
  assert.equal(response.body.data.resourceBalances.ducats, 1064)
  assert.equal(response.body.data.resourceBalances.supply, 8)
  assert.equal(response.body.data.resourceBalances.morale, 47)
})

test('army state exposes deterministic, faction-stable, scaled campaign progress', async () => {
  const player = await createUser()
  await setProgress(player.army.id, { campaignNumber: 10, campaignsCompleted: 9, currentEnemySequence: 2, currentFaction: 'bingxue', turnsOnCurrentEnemy: 3 })
  const first = await request(`/users/${player.id}/army/state`)
  const second = await request(`/users/${player.id}/army/state`)
  assertSuccess(first)
  const firstProgress = first.body.data.campaignProgress
  const secondProgress = second.body.data.campaignProgress
  assert.deepEqual(firstProgress, secondProgress)
  assert.equal(firstProgress.campaignNumber, 10)
  assert.equal(firstProgress.campaignsCompleted, 9)
  assert.equal(firstProgress.currentFaction, 'bingxue')
  assert.equal(firstProgress.currentEnemy.factionName, 'Bingxue Commonwealth')
  assert.equal(firstProgress.currentEnemy.difficultyMultiplier, 2.35)
  assert.equal(firstProgress.currentEnemy.fightingStrength, Math.round(180 * 2.35))
  assert.equal(firstProgress.currentEnemy.weakAgainstUnit, 'cavalry')
  for (const duplicate of ['factionName', 'difficultyMultiplier', 'enemyName', 'enemyFightingStrength', 'weakAgainstUnit']) {
    assert.equal(firstProgress[duplicate], undefined)
  }
})

test('army logs support validation, filtering, limits, event coverage, and JSON details', async (t) => {
  const player = await createUser()
  await request(`/users/${player.id}/army/recruit`, { method: 'POST', body: { unitName: 'infantry', quantity: 1 } })
  await request(`/users/${player.id}/army/trade`, { method: 'POST', body: { tradeType: 'buy', item: 'flour', quantity: 1 } })
  await request(`/users/${player.id}/army/advance-turn`, { method: 'POST' })
  await request(`/users/${player.id}/army/battle`, { method: 'POST' })

  await t.test('all logs are returned newest-first with expected event types', async () => {
    const response = await request(`/users/${player.id}/army/logs`)
    assertSuccess(response)
    const types = new Set(response.body.data.map((log) => log.eventType))
    for (const type of ['campaign_started', 'recruit', 'trade', 'turn_advanced', 'battle_defeat']) assert.ok(types.has(type))
    for (const log of response.body.data) {
      if (log.details !== null) assert.equal(typeof log.details, 'object')
      assert.equal(log.armyId, undefined)
    }
    const battleLog = response.body.data.find((log) => log.eventType === 'battle_defeat')
    assert.equal(battleLog.turnNumber, 2)
    assert.equal(battleLog.details.outcome, 'defeat')
  })
  await t.test('event type is trimmed and exact', async () => {
    const response = await request(`/users/${player.id}/army/logs?eventType=%20trade%20`)
    assertSuccess(response)
    assert.ok(response.body.data.length >= 1)
    assert.ok(response.body.data.every((log) => log.eventType === 'trade'))
    const absent = await request(`/users/${player.id}/army/logs?eventType=unknown`)
    assertSuccess(absent)
    assert.deepEqual(absent.body.data, [])
  })
  await t.test('limit accepts numeric strings and caps output', async () => {
    const response = await request(`/users/${player.id}/army/logs?limit=2`)
    assertSuccess(response)
    assert.equal(response.body.data.length, 2)
  })
  await t.test('invalid filters return clean 400 errors', async () => {
    assertError(await request(`/users/${player.id}/army/logs?eventType=%20%20`), 400, 'eventType query must be a non-empty string.')
    for (const limit of ['0', '-1', '1.5', 'bad', '%20']) {
      assertError(await request(`/users/${player.id}/army/logs?limit=${limit}`), 400, 'limit must be a positive integer.')
    }
  })
})

test('campaign catalogue routes remain ordered flavour data independent of active progress', async (t) => {
  await t.test('GET campaigns is ordered and complete', async () => {
    const response = await request('/campaigns')
    assertSuccess(response)
    assert.equal(response.body.data.length, 3)
    assert.deepEqual(response.body.data.map((campaign) => campaign.campaignNumber), [1, 2, 3])
    const privateFields = [
      'majorRewardDucats', 'majorRewardManpower', 'majorRewardSupply',
      'majorRewardMorale', 'manpowerGainPerTurn', 'musketsGainPerTurn',
      'horsesGainPerTurn', 'fieldGunsGainPerTurn', 'flourGainPerTurn',
      'supplyGainPerTurn'
    ]
    assert.ok(response.body.data.every((campaign) => (
      privateFields.every((field) => campaign[field] === undefined)
    )))
  })
  await t.test('each campaign enemy catalogue has three ordered rows', async () => {
    const catalogue = (await request('/campaigns')).body.data
    for (const campaign of catalogue) {
      const response = await request(`/campaigns/${campaign.id}/enemies`)
      assertSuccess(response)
      assert.equal(response.body.data.length, 3)
      assert.deepEqual(response.body.data.map((enemy) => enemy.sequence), [1, 2, 3])
      assert.ok(response.body.data.every((enemy) => (
        enemy.campaignTemplateId === undefined &&
        enemy.id === undefined &&
        enemy.minorRewardDucats === undefined &&
        enemy.minorRewardManpower === undefined &&
        enemy.minorRewardSupply === undefined
      )))
    }
  })
  await t.test('invalid and missing campaign IDs are distinguished', async () => {
    for (const id of ['bad', '0', '-1', '1.5']) assertError(await request(`/campaigns/${id}/enemies`), 400, 'Invalid campaign id.')
    assertError(await request('/campaigns/2147483647/enemies'), 404, 'Campaign not found.')
  })
})

test('restart resets all mutable state, recreates missing singleton rows, and clears history', async (t) => {
  const player = await createUser()
  await makeArmyOverwhelming(player.army.id)
  await setProgress(player.army.id, { campaignNumber: 9, campaignsCompleted: 8, currentEnemySequence: 3, currentFaction: 'koi', currentTurn: 44, turnsOnCurrentEnemy: 5 })
  await request(`/users/${player.id}/army/trade`, { method: 'POST', body: { tradeType: 'buy', item: 'flour', quantity: 1 } })
  await db.delete(armyResources).where(eq(armyResources.armyId, player.army.id))
  await db.delete(armyEquipment).where(eq(armyEquipment.armyId, player.army.id))
  const response = await request(`/users/${player.id}/army/restart`, { method: 'POST' })
  assertSuccess(response)
  const result = response.body.data
  assert.equal(result.armyId, player.army.id)
  assert.equal(result.campaignNumber, 1)
  assert.equal(result.campaignsCompleted, 0)
  assert.equal(result.currentEnemySequence, 1)
  assert.equal(result.currentTurn, 1)
  assert.equal(result.turnsOnCurrentEnemy, 0)
  assert.equal(result.resources, undefined)
  assert.equal(result.units, undefined)
  const state = await getState(player.id)
  for (const key of Object.keys(STARTING_RESOURCES)) assert.equal(state.resources[key], STARTING_RESOURCES[key])
  for (const key of Object.keys(STARTING_EQUIPMENT)) assert.equal(state.equipment[key], STARTING_EQUIPMENT[key])
  assert.ok(state.units.every((unit) => unit.quantity === 0))
  const logs = await request(`/users/${player.id}/army/logs`)
  assert.equal(logs.body.data.length, 1)
  assert.equal(logs.body.data[0].eventType, 'army_restarted')
})

test('missing required game state returns conflicts and restart restores progress', async (t) => {
  const player = await createUser()
  await db.delete(armyCampaignProgress).where(eq(armyCampaignProgress.armyId, player.army.id))
  assertError(await request(`/users/${player.id}/army/state`), 409, 'Army state is incomplete. Restart the game to restore required state.')
  assertError(await request(`/users/${player.id}/army/recruit`, { method: 'POST', body: { unitName: 'infantry', quantity: 1 } }), 409, 'Army has no campaign progress.')
  assertError(await request(`/users/${player.id}/army/trade`, { method: 'POST', body: { tradeType: 'buy', item: 'flour', quantity: 1 } }), 409, 'Army has no campaign progress.')
  assertError(await request(`/users/${player.id}/army/battle`, { method: 'POST' }), 409, 'Army has no campaign progress.')
  assertError(await request(`/users/${player.id}/army/advance-turn`, { method: 'POST' }), 409, 'Army has no campaign progress.')
  assertSuccess(await request(`/users/${player.id}/army/restart`, { method: 'POST' }))
  assertSuccess(await request(`/users/${player.id}/army/state`))
})

test('missing resource, equipment, or unit rows fail cleanly instead of crashing', async (t) => {
  for (const missingPart of ['resources', 'equipment', 'unit']) {
    await t.test(missingPart, async () => {
      const player = await createUser()
      if (missingPart === 'resources') {
        await db.delete(armyResources).where(eq(armyResources.armyId, player.army.id))
      } else if (missingPart === 'equipment') {
        await db.delete(armyEquipment).where(eq(armyEquipment.armyId, player.army.id))
      } else {
        const [unit] = await db.select().from(armyUnits).where(eq(armyUnits.armyId, player.army.id))
        await db.delete(armyUnits).where(eq(armyUnits.id, unit.id))
      }

      const error = 'Army state is incomplete. Restart the game to restore required state.'
      assertError(await request(`/users/${player.id}/army/state`), 409, error)
      assertError(await request(`/users/${player.id}/army/advance-turn`, { method: 'POST' }), 409, error)
      assertError(await request(`/users/${player.id}/army/battle`, { method: 'POST' }), 409, error)
      assertSuccess(await request(`/users/${player.id}/army/restart`, { method: 'POST' }))
    })
  }
})

test('database singleton constraints and user cascade are enforced', async (t) => {
  const player = await createUser()
  await t.test('one user cannot own two armies', async () => {
    await assert.rejects(db.insert(armies).values({ userId: player.id, armyName: 'Second Army' }))
  })
  await t.test('one army cannot own two equipment, resource, or progress rows', async () => {
    await assert.rejects(db.insert(armyEquipment).values({ armyId: player.army.id, ...STARTING_EQUIPMENT }))
    await assert.rejects(db.insert(armyResources).values({ armyId: player.army.id, ...STARTING_RESOURCES }))
    await assert.rejects(db.insert(armyCampaignProgress).values({ armyId: player.army.id, currentFaction: 'liho' }))
  })
  await t.test('duplicate army unit type is rejected', async () => {
    const [unit] = await db.select().from(armyUnits).where(eq(armyUnits.armyId, player.army.id))
    await assert.rejects(db.insert(armyUnits).values({ armyId: player.army.id, unitTypeId: unit.unitTypeId, quantity: 0 }))
  })
  await t.test('DELETE user cascades all owned state and returns 204', async () => {
    const response = await request(`/users/${player.id}`, { method: 'DELETE' })
    assert.equal(response.status, 204)
    assert.equal(response.body, null)
    assertError(await request(`/users/${player.id}`), 404, 'User not found.')
    assertError(await request(`/users/${player.id}/army`), 404, 'User not found.')
    assert.equal((await db.select().from(armies).where(eq(armies.userId, player.id))).length, 0)
    assert.equal((await db.select().from(armyResources).where(eq(armyResources.armyId, player.army.id))).length, 0)
    assert.equal((await db.select().from(armyEquipment).where(eq(armyEquipment.armyId, player.army.id))).length, 0)
    assert.equal((await db.select().from(armyUnits).where(eq(armyUnits.armyId, player.army.id))).length, 0)
    assert.equal((await db.select().from(armyCampaignProgress).where(eq(armyCampaignProgress.armyId, player.army.id))).length, 0)
    assert.equal((await db.select().from(armyLogs).where(eq(armyLogs.armyId, player.army.id))).length, 0)
  })
})

test('an existing user with an externally removed army receives army-specific 404 errors', async () => {
  const player = await createUser()
  await db.delete(armies).where(eq(armies.id, player.army.id))
  const user = await request(`/users/${player.id}`)
  assertSuccess(user)
  for (const route of [
    { path: '/army', method: 'GET' },
    { path: '/army/state', method: 'GET' },
    { path: '/army/restart', method: 'POST' },
    { path: '/army/recruit', method: 'POST', body: { unitName: 'infantry', quantity: 1 } },
    { path: '/army/trade', method: 'POST', body: { tradeType: 'buy', item: 'flour', quantity: 1 } },
    { path: '/army/advance-turn', method: 'POST' },
    { path: '/army/battle', method: 'POST' },
    { path: '/army/logs', method: 'GET' }
  ]) {
    assertError(await request(`/users/${player.id}${route.path}`, route), 404, 'Army not found for this user.')
  }
  await db.delete(users).where(eq(users.id, player.id))
})

test('all user-scoped routes consistently reject invalid and missing users', async () => {
  const suffixes = [
    { path: '', method: 'GET' }, { path: '/army', method: 'GET' },
    { path: '/army/state', method: 'GET' },
    { path: '/army/logs', method: 'GET' }, { path: '/army/restart', method: 'POST' },
    { path: '/army/advance-turn', method: 'POST' }, { path: '/army/battle', method: 'POST' },
    { path: '/army/recruit', method: 'POST', body: { unitName: 'infantry', quantity: 1 } },
    { path: '/army/trade', method: 'POST', body: { tradeType: 'buy', item: 'flour', quantity: 1 } }
  ]
  for (const route of suffixes) {
    assertError(await request(`/users/not-a-number${route.path}`, route), 400, 'Invalid user id.')
    assertError(await request(`/users/2147483647${route.path}`, route), 404, 'User not found.')
  }
})

test('static catalog tables remain seeded while active enemies are generated', async () => {
  const templateRows = await db.select().from(campaignTemplates)
  const enemyRows = await db.select().from(campaignTemplateEnemies)
  assert.equal(templateRows.length, 3)
  assert.equal(enemyRows.length, 9)
  assert.equal((await db.select().from(unitTypes)).length, 3)
  const unitRows = await db.select().from(unitTypes)
  assert.deepEqual(unitRows.map((row) => row.requiredEquipment).sort(), ['field_guns', 'horses', 'muskets'])

  for (const campaignData of CAMPAIGN_TEMPLATES) {
    const template = templateRows.find((row) => row.campaignNumber === campaignData.campaignNumber)
    assert.ok(template)
    assert.equal(template.manpowerGainPerTurn, campaignData.manpowerGainPerTurn)
    assert.equal(template.musketsGainPerTurn, campaignData.musketsGainPerTurn)
    assert.equal(template.horsesGainPerTurn, campaignData.horsesGainPerTurn)
    assert.equal(template.fieldGunsGainPerTurn, campaignData.fieldGunsGainPerTurn)
    assert.equal(template.flourGainPerTurn, campaignData.flourGainPerTurn)
    assert.equal(template.supplyGainPerTurn, campaignData.supplyGainPerTurn)
    assert.equal(template.majorRewardDucats, campaignData.majorReward.ducats)
    assert.equal(template.majorRewardManpower, campaignData.majorReward.manpower)
    assert.equal(template.majorRewardSupply, campaignData.majorReward.supply)
    assert.equal(template.majorRewardMorale, campaignData.majorReward.morale)

    const campaignEnemies = enemyRows
      .filter((row) => row.campaignTemplateId === template.id)
      .sort((first, second) => first.sequence - second.sequence)
    assert.equal(campaignEnemies.length, campaignData.enemies.length)
    for (let index = 0; index < campaignEnemies.length; index += 1) {
      assert.equal(campaignEnemies[index].minorRewardDucats, campaignData.enemies[index].minorReward.ducats)
      assert.equal(campaignEnemies[index].minorRewardManpower, campaignData.enemies[index].minorReward.manpower)
      assert.equal(campaignEnemies[index].minorRewardSupply, campaignData.enemies[index].minorReward.supply)
    }
  }
})
