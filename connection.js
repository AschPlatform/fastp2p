const EventEmitter = require('events').EventEmitter
const debug = require('debug')
const pull = require('pull-stream')
const toPull = require('stream-to-pull-stream')
const lp = require('pull-length-prefixed')
const Pushable = require('pull-pushable')

const IDENTIFY_PROTOCOL = '/identify/0.0.0'
const MAX_BUFFER_SIZE = 1024 * 1024 * 10

class Connection extends EventEmitter {
  constructor({ socket, node }) {
    super()
    this.socket = socket
    this.node = node
    this.isIdentified = false
    this.observedAddress = `${socket.remoteAddress}:${socket.remotePort}`
    this.remoteId = null
    this.writer = null
    this.started = false
    this.destroyed = false
    this.heartbeatTimer = null
    this.heartbeatInterval = 60000

    this.log = debug('fastp2p:connection')
  }

  start() {
    if (this.started) {
      this.log('already started')
      return
    }
    this.started = true

    const socket = this.socket
    this.writer = new Pushable()
    const duplex = toPull.duplex(socket)

    pull(
      this.writer,
      lp.encode(),
      duplex,
      lp.decode({ maxLength: MAX_BUFFER_SIZE }),
      pull.drain(
        (data) => this.processMessage(data),
        (error) => {
          if (error) {
            this.emit('error', 'pull drain error: ' + error)
          }
        }
      )
    )

    socket.on('error', (error) => {
      this.emit('error', error)
    })

    socket.on('end', () => {
      this.emitClose('socket end')
    })

    socket.on('close', () => {
      this.emitClose('socket closed')
    })

    // TODO use asymmetric encryption to identify
    this.send({
      protocol: IDENTIFY_PROTOCOL,
      id: this.node.id,
    })

    setTimeout(() => {
      if (!this.isIdentified) {
        this.emitClose('identify timeout')
      }
    }, 4000)
  }

  send(msg) {
    this.writer.push(Buffer.from(JSON.stringify(msg)))
  }

  getRemotePeerId() {
    return this.remoteId
  }

  destroy() {
    if (this.destroyed) return
    this.destroyed = true
    this.stopHeartbeat()
    this.socket.destroy()
    this.socket.unref()
    this.log('connection destroyed')
  }

  //********************************************
  // Private methods
  //********************************************
  startHeartbeat() {
    if (this.heartbeatTimer) return
    this.heartbeatTimer = setInterval(() => {
      this.send({
        protocol: '/_hb_',
      })
    }, this.heartbeatInterval)
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
  }

  processMessage(data) {
    const msg = JSON.parse(data.toString())
    if (msg.protocol === IDENTIFY_PROTOCOL) {
      this.remoteId = msg.id
      this.isIdentified = true
      this.emit('identified')
      this.startHeartbeat()
    } else {
      this.emit('message', msg)
    }
  }

  emitClose(reason) {
    if (!this.closed) {
      this.closed = true
      this.stopHeartbeat()
      this.emit('close', reason)
    }
  }
}

module.exports = Connection
