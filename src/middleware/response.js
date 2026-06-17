// Shared success-response middleware.
// Controllers put their final response object into res.locals.data, then call next().

export function withMessage(message, status) {
  return function setResponseMessage(req, res, next) {
    res.locals.message = message

    if (status !== undefined) {
      res.locals.status = status
    }

    next()
  }
}

export function withDynamicMessage(builderFunction, status) {
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
  res.status(204).send()
}
