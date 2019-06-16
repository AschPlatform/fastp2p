const EventEmitter = require('events').EventEmitter
const debug = require('debug')
const PeerBook = require('./peer-book')
const PeerAddr = require('./peer-addr')

class Discovery extends EventEmitter {
  constructor(opts) {
    super()

    this.seeds = opts.seeds
    this.node = opts.node
    this.peerBook = new PeerBook({
      maxBanAttempts: opts.maxBanAttempts,
      banTTL: opts.banTTL,
      peerDb: opts.peerDb,
    })

    this.log = debug('fastp2p:discovery')
  }

  async initialize() {
    await this.peerBook.load()

    this.node.rpc.serve('announcePublic', this.announcePublicHandler.bind(this))
    this.node.rpc.serve('findPeers', this.findPeersHandler.bind(this))

    this.node.on('connected', this.onConnected.bind(this))
    this.node.on('disconnected', this.onDisconnected.bind(this))
    this.node.on('connect:failed', this.onConnectFailed.bind(this))

    this.seeds.forEach(seed => {
      const peer = PeerAddr.parse(seed)
      this.addToPeerBook(peer.id, seed)
    })
  }

  async finalize() {

  }

  start() {
    this.providePeers()
    setInterval(this.providePeers.bind(this), 10000)
    setInterval(this.findPeers.bind(this), 10000)
  }

  stop() {

  }

  //********************************************
  // Private methods
  //********************************************

  providePeers() {
    this.peerBook.forEachUnbanned(peer => this.node.connect(peer.addr))
  }

  findPeersHandler(req, callback) {
    const addrs = this.peerBook.getUnbannedPeers().map(peer => peer.addr)
    callback(null, addrs)
  }

  findPeers() {
    const peers = this.node.getPeers()
    if (!peers || peers.length === 0) {
      return
    }
    const rnd = Math.floor(Math.random() * peers.length)
    const peer = peers[rnd]
    this.node.rpc.request(peer, 'findPeers', undefined, (error, result) => {
      if (error) {
        this.log('failed to find peers:', error)
        return
      }
      this.log('findPeers result:', result)
      for (const addr of result) {
        try {
          const peer = PeerAddr.parse(addr)
          this.addToPeerBook(peer.id, addr)
        } catch (e) {
          this.log('failed to parse peer address:', addr)
        }
      }
    })
  }

  addToPeerBook(id, addr) {
    if (id !== this.node.id) {
      this.peerBook.add(id, addr)
    }
  }

  announcePublicHandler(req, callback) {
    try {
      const { addr } = req.params
      const peer = PeerAddr.parse(addr)
      this.addToPeerBook(peer.id, addr)
    } catch (e) {
      this.log('Parse announced address error:', e, req)
    }
  }

  onConnected(peer) {
    this.log('peer connected:', peer)
    const publicAddr = this.node.publicAddr
    if (publicAddr) {
      this.node.rpc.request(peer, 'announcePublic', { addr: publicAddr })
    }
    this.peerBook.unban(peer)
  }

  onDisconnected(peer) {
    this.log('peer disconnected:', peer)
    this.peerBook.ban(peer)
  }

  onConnectFailed(peer) {
    this.log('peer connect failed:', peer)
    this.peerBook.ban(peer)
  }
}

module.exports = Discovery
