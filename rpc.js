const debug = require('debug')
const MAX_SEQ = 4294967295

const RPCErrorBuilder = {
  methodNotFound(data) {
    return { code: -32601, message: 'Method not found', data }
  },
  parseError(data) {
    return { code: -32700, message: 'Parse error', data }
  },
  invalidRequest(data) {
    return { code: -32600, message: 'Invalid request', data }
  },
  invalidParams(data) {
    return { code: -32602, message: 'Invalid params', data }
  },
  internalError(data) {
    return { code: -32603, message: 'Internal error', data }
  },
  serverError(data) {
    return { code: -32000, message: 'Server error', data }
  },
}

class RPC {
  constructor({node}) {
    this.node = node
    this.protocol = '/rpc/0.1.0'
    this.seq = 0

    this.waitingReqs = new Map()
    this.reqCheckTimer = null
    this.reqCheckInterval = 1000
    this.defaultReqTimeout = 4000
    this.reqHandlers = new Map()

    this.log = debug('fastp2p:rpc')
  }

  async initialize() {
    this.node.on('message', this.receiveMessage.bind(this))
  }

  start() {
    this.reqCheckTimer = setInterval(this.checkReqTimeout.bind(this), this.reqCheckInterval)
  }

  stop() {

  }

  async finalize() {

  }

  request(peer, method, params, opts, callback) {
    // TODO validate params schema
    const msg = this.buildRequestMessage(method, params)

    let cb
    if (typeof opts === 'function') {
      cb = opts
    } else if (typeof callback === 'function') {
      cb = callback
    }
    if (cb) {
      const timeout = (opts && opts.timeout) ? opts.timeout : this.defaultReqTimeout
      this.waitingReqs.set(msg.seq, { timestamp: Date.now(), callback: cb, timeout })
    }
    this.node.send(peer, msg)
  }

  serve(method, handler) {
    this.reqHandlers.set(method, handler)
  }

  //********************************************
  // Private methods
  //********************************************

  checkReqTimeout() {
    const toDeleted = []
    this.waitingReqs.forEach((req, seq) => {
      const { timestamp, callback, timeout } = req
      if (Date.now() > timestamp + timeout) {
        toDeleted.push(seq)
        callback('request timeout')
      }
    })
    for (const key of toDeleted) {
      this.waitingReqs.delete(key)
    }
  }

  buildRequestMessage(method, params) {
    const msg = {
      protocol: this.protocol,
      method,
      params,
      seq: this.getSeq()
    }
    return msg
  }

  buildResponseMessage(error, result, seq) {
    const msg = {
      protocol: this.protocol,
      seq,
    }
    if (error) {
      msg.error = error
    } else if (result) {
      msg.result = result
    }
    return msg
  }

  getSeq() {
    if (this.seq < MAX_SEQ) {
      this.seq++
    } else {
      this.seq = 1
    }
    return this.seq
  }

  receiveMessage(msg, peer) {
    if (msg.protocol !== this.protocol) return

    // TODO validate msg schema
    // this.log('receive rpc message===================:', msg)
    if (msg.method) {
      this.processRequest(msg, peer)
    } else {
      this.processResponse(msg, peer)
    }
  }

  processRequest(msg, peer) {
    const { method, params, seq } = msg
    const handler = this.reqHandlers.get(method)

    const done = (error, result) => {
      const msg = this.buildResponseMessage(error, result, seq)
      this.node.send(peer, msg)
    }

    if (!handler) {
      return done(RPCErrorBuilder.methodNotFound())
    }
    try {
      handler({ params, peer }, (err, result) => {
        if (err) {
          return done(RPCErrorBuilder.serverError(err))
        }
        return done(null, result)
      })
    } catch (e) {
      return done(RPCErrorBuilder.internalError())
    }
  }

  processResponse(msg, peer) {
    const { seq, error, result } = msg
    if (!seq) {
      this.log('Ignore response message without seq', msg)
      return
    }
    const req = this.waitingReqs.get(seq)
    if (!req) {
      return
    }
    this.waitingReqs.delete(seq)
    try {
      req.callback(error, result)
    } catch (e) {
      this.log('Request callback exception:', e)
    }
  }
}

module.exports = RPC
