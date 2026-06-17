// Generic helper functions used across controllers and utilities.

// Checks whether a value is a string with at least one non-space character.
export function checkIfNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

// Checks whether a value is already a positive whole number.
export function checkIfPositiveInteger(value) {
  return Number.isInteger(value) && value > 0
}

// Converts a value to a positive integer. Returns null when invalid.
export function checkAndGetPositiveInteger(value) {
  // Reject booleans, arrays, objects, null, and blank strings before Number()
  // can coerce them into surprising values such as true -> 1.
  if (typeof value === 'boolean' || typeof value === 'object' || value === '') {
    return null
  }

  const number = Number(value)

  if (checkIfPositiveInteger(number)) {
    return number
  }

  return null
}

// Safely returns the request body, even when no parser matched the request.
export function getRequestBody(req) {
  if (req.body === undefined || req.body === null) {
    return {}
  }

  return req.body
}

// Same as checkAndGetPositiveInteger, but allows an omitted query parameter.
export function checkAndGetOptionalPositiveInteger(value) {
  if (value === undefined) {
    return undefined
  }

  return checkAndGetPositiveInteger(value)
}

// Reads an optional positive integer from req.query and sends a 400 response when invalid.
export function checkAndGetOptionalPositiveIntegerFromQuery(req, res, queryName, errorMessage) {
  const positiveInteger = checkAndGetOptionalPositiveInteger(req.query[queryName])

  if (req.query[queryName] !== undefined && positiveInteger === null) {
    res.status(400).json({ error: errorMessage })
    return null
  }

  return positiveInteger
}

// Reads an optional limit query parameter and handles invalid query input.
export function checkAndGetLimitFromQuery(req, res) {
  return checkAndGetOptionalPositiveIntegerFromQuery(
    req,
    res,
    'limit',
    'limit must be a positive integer.'
  )
}

// Returns a fallback value when the original value is missing.
export function getValueOrDefault(value, defaultValue) {
  if (value === undefined || value === null) {
    return defaultValue
  }

  return value
}

// Reads an object property and falls back when the key is missing.
export function getObjectValueOrDefault(object, key, defaultValue) {
  if (object === undefined || object === null) {
    return defaultValue
  }

  if (object[key] === undefined || object[key] === null) {
    return defaultValue
  }

  return object[key]
}

// Keeps a number between a minimum and maximum value.
export function getNumberWithinRange(value, minimum, maximum) {
  if (value < minimum) {
    return minimum
  }

  if (value > maximum) {
    return maximum
  }

  return value
}
