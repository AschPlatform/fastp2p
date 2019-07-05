const assert = require('assert')
const debug = require('debug')
const Database = require('nedb')

const log = debug('fastp2p:discovery:peerbook')

class PeerStatus {
  constructor(addr) {
    this.addr = addr
    this.banCount = 0
    this.unbanTime = 0
  }

  reset() {
    this.banCount = 0
    this.unbanTime = 0
  }
}

class PeerBook {
  constructor(opts) {
    this.maxBanAttempts = opts.maxBanAttempts || 8
    this.banTTL = opts.banTTL || 30000
    this.peerDbPath = opts.peerDb || './peer.db'
    this.persistentInterval = opts.persistentInterval || 30000
    this.db = null
    this.peers = new Map()
  }

  async load() {
    const db = this.db = new Database({ filename: this.peerDbPath, autoload: true })
    db.persistence.setAutocompactionInterval(this.persistentInterval)

    const errorHandler = err => err && log('peer node index error', err)
    db.ensureIndex({ fieldName: 'id' }, errorHandler)

    const peersInDb = await new Promise((resolve, reject) => {
      db.find({}).exec((err, nodes) => {
        if (err) return reject(err)
        return resolve(nodes)
      })
    })
    log('peers in db', peersInDb)
    peersInDb.forEach(peer => {
      const ps = new PeerStatus(peer.addr)
      this.peers.set(peer.id, ps)
    })
  }

  add(id, addr) {
    assert(this.db, 'Peer db must be initialized')
    if (!this.peers.has(id)) {
      const peer = new PeerStatus(addr)
      this.peers.set(id, peer)
      this.db.update({ id }, { id, addr }, { upsert: true }, (err) => {
        if (err) log('peer db update failed:', err)
      })
    }
  }

  get(id) {
    return this.peers.get(id)
  }

  remove(id) {
    this.peers.delete(id)
    this.db.remove({ id }, {}, (err) => {
      if (err) log('peer db remove failed:', err)
    })
  }

  ban(id) {
    const peer = this.peers.get(id)
    if (!peer) return

    peer.banCount++
    if (peer.banCount > this.maxBanAttempts) {
      log('exceed maxBanAttempts, remove the peer:', peer.addr)
      this.remove(id)
      return
    }

    let ttl = this.banTTL * Math.pow(2, peer.banCount - 1)
    const minTTL = ttl * 0.9
    const maxTTL = ttl * 1.1

    // Add a random jitter of 20% to the ttl
    ttl = Math.floor(Math.random() * (maxTTL - minTTL) + minTTL)

    log('ban peer %s for %d ms', id, ttl)
    peer.unbanTime = Date.now() + ttl
  }

  unban(id) {
    const peer = this.peers.get(id)
    if (!peer) return
    peer.reset()
  }

  getUnbannedPeers() {
    const result = []
    this.peers.forEach((peer) => {
      if (Date.now() > peer.unbanTime) {
        result.push(peer)
      }
    })
    return result
  }

  forEachUnbanned(callback) {
    this.peers.forEach((peer, id) => {
      if (Date.now() > peer.unbanTime) {
        callback(peer, id)
      }
    })
  }

  getAllPeers() {
    return [...this.peers.values()]
  }
}

module.exports = PeerBook
