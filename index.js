const net = require('net')
const EventEmitter = require('events').EventEmitter
const debug = require('debug')
const Connection = require('./connection')
const Gossip = require('./gossip')
const RPC = require('./rpc')
const Discovery = require('./discovery')
const PeerAddr = require('./peer-addr')

class Node extends EventEmitter {
  constructor(opts) {
    super()

    this.id = opts.id
    this.port = opts.port
    this.config = opts.config
    this.publicIp = this.config.publicIp
    this.maxConnections = this.config.maxConnections || 200
    this.maxParallelDials = this.config.maxParallelDials || 50
    this.connections = new Map()
    this.listener = null
    this.connectingIds = new Set()
    this.topicHandlers = new Map()
    this.protocols = new Map()

    this.gossip = new Gossip({ node: this })
    this.rpc = new RPC({ node: this })
    this.discovery = new Discovery({
      seeds: this.config.seeds,
      peerDb: this.config.peerDb,
      node: this,
    })

    this.log = debug('fastp2p:node')
  }

  get publicAddr() {
    if (!this.publicIp) return ''
    return `/ipv4/${this.publicIp}/tcp/${this.port}/${this.id}`
  }

  async initialize() {
    const listener = this.listener = net.createServer((socket) => {
      this.log('accept new socket:', socket.remoteAddress, socket.remotePort)
      const connection = new Connection({
        socket,
        node: this,
      })
      this.prepareConnection(connection)
    })
    listener.listen(this.port, () => {
      this.log('listening', listener.address())
    })
    listener.on('error', (error) => {
      this.log('listener error:', error)
    })
    listener.on('close', () => {
      this.log('listener closed')
    })

    await this.gossip.initialize()
    await this.rpc.initialize()
    await this.discovery.initialize()
  }

  async finalize() {
    await this.discovery.finalize()
    await this.rpc.finalize()
    await this.gossip.finalize()
  }

  start() {
    this.gossip.start()
    this.rpc.start()
    this.discovery.start()
  }

  stop() {
    this.discovery.stop()
    this.rpc.stop()
    this.gossip.stop()
  }

  send(peer, message) {
    const conn = this.connections.get(peer)
    if (conn) {
      conn.send(message)
    }
  }

  connect(peer) {
    if (this.connections.size > this.maxConnections) {
      return
    }
    if (this.connectingIds.size > this.maxParallelDials) {
      return
    }

    if (typeof peer === 'string') {
      try {
        peer = PeerAddr.parse(peer)
      } catch (e) {
        this.log('Invalid peer address:', peer)
      }
    }
    if (!peer) {
      this.log('Invalid peer:', peer)
      return
    }

    const { id, host, port, addr } = peer

    if (this.id === id) return

    if (this.connectingIds.has(id)) {
      this.log('in connecting:', addr)
      return
    }

    if (this.connections.has(id)) {
      this.log('already connected:', addr)
      return
    }

    this.connectingIds.add(id)

    this.log(`connecting ${addr}`)
    const socket = net.connect(port, host)
    const connection = new Connection({
      socket,
      node: this,
      remoteId: id,
    })
    connection.on('close', () => {
      if (this.connectingIds.has(id)) {
        this.connectingIds.delete(id)
        this.emit('connect:failed', id)
      }
    })
    this.prepareConnection(connection)
  }

  disconnect(peer) {
    const conn = this.connections.get(peer)
    if (conn) {
      conn.close()
    }
  }

  getPeers() {
    return [...this.connections.keys()]
  }

  //********************************************
  // Private methods
  //********************************************

  prepareConnection(conn) {
    conn.start()
    conn.on('identified', () => {
      const id = conn.getRemotePeerId()
      this.log('connection identified', id)
      if (this.connections.has(id)) {
        this.log('connection already exists:', id)
        conn.destroy()
      } else {
        this.connections.set(id, conn)
        this.emit('connected', id)
      }
      this.connectingIds.delete(id)
    })

    conn.on('identify:failed', () => {
      const id = conn.getRemotePeerId()
      this.connectingIds.delete(id)
      this.emit('identify:failed', id)
    })

    conn.on('error', (error) => {
      if (conn.isIdentified) {
        this.log(`connection ${conn.getRemotePeerId()} error:`, error)
      }
    })

    conn.on('close', (reason) => {
      const id = conn.getRemotePeerId()
      if (id && this.connections.get(id) === conn) {
        this.log(`connection ${id} closed for reason:`, reason)
        this.connections.delete(id)
        this.emit('disconnected', id)
        this.connectingIds.delete(id)
      }
    })

    conn.on('message', (msg) => {
      this.emit('message', msg, conn.getRemotePeerId())
    })
  }
}

module.exports = Node
