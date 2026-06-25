// Shared success-response middleware keeps every happy-path response on the same wavelength
// Controllers place their result in res.locals.data, then pass control down the chain

export function withMessage(message, status) {
  // Returns middleware so each route can choose its own message without repeating response code
  return function setResponseMessage(req, res, next) {
    res.locals.message = message

    if (status !== undefined) {
      res.locals.status = status
    }

    next()
  }
}

export function withDynamicMessage(builderFunction, status) {
  // Useful when the action result changes the wording, such as an enemy auto-attack
  return function setDynamicResponseMessage(req, res, next) {
    if (typeof builderFunction === 'function') {
      res.locals.message = builderFunction(req, res)
    }

    if (status !== undefined) {
      res.locals.status = status
    }

    next()
  }
}

export function sendResponse(req, res) {
  // Defaults keep simple routes simple while still allowing 201 and custom messages
  const status = res.locals.status || 200
  const message = res.locals.message || 'Success'
  let data = res.locals.data

  if (data === undefined) {
    data = {}
  }

  res.status(status).json({
    message,
    data
  })
}

export function sendNoContent(req, res) {
  // DELETE succeeded, there is genuinely nothing useful to send back
  res.status(204).send()
}
