const EventEmitter = require('events').EventEmitter
const LRU = require('lru-cache')

function shuffle(arr) {
  for (let i = 0; i < arr.length; i++) {
    const j = Math.floor(Math.random() * arr.length)
    const tmp = arr[i]
    arr[i] = arr[j]
    arr[j] = tmp
  }
  return arr
}

class Gossip {
  constructor({ node }) {
    this.node = node
    this.emitter = new EventEmitter()
    this.protocol = '/gossip/0.1.0'
    this.publishLimit = 15
    this.seq = Date.now()
    this.cache = new LRU({ max: 100000, maxAge: 30 * 60 * 1000 })
  }

  async initialize() {
    this.node.on('message', this.receiveMessage.bind(this))
  }

  async finalize() {

  }

  start() {
  }

  stop() {

  }

  publish(topic, data) {
    const msg = this.buildMessage(topic, data)
    const key = this.getMessageKey(msg)
    const filteredPeers = this.node.getPeers().filter(p =>
      !(p === msg.source || (this.cache.has(key) && this.cache.get(key).has(p)))
    )
    const peers = shuffle(filteredPeers).slice(0, this.publishLimit)
    for (const peer of peers) {
      this.node.send(peer, msg)
    }
  }

  forward(msg) {
    const key = this.getMessageKey(msg)
    const filteredPeers = this.node.getPeers().filter(p =>
      !(p === msg.source || (this.cache.has(key) && this.cache.get(key).has(p)))
    )
    const peers = shuffle(filteredPeers).slice(0, this.publishLimit)
    for (const peer of peers) {
      this.node.send(peer, msg)
    }
  }

  subscribe(topic, handler) {
    this.emitter.on(topic, handler)
  }

  //********************************************
  // Private methods
  //********************************************

  buildMessage(topic, data) {
    const msg = {
      protocol: this.protocol,
      source: this.node.id,
      topic,
      data,
      seq: this.getSeq()
    }
    return msg
  }

  getMessageKey(msg) {
    return `${msg.source}:${msg.seq}`
  }

  getSeq() {
    if (this.seq < Number.MAX_SAFE_INTEGER) {
      this.seq++
    } else {
      this.seq = 1
    }
    return this.seq
  }

  receiveMessage(msg, peer) {
    if (msg.protocol !== this.protocol) return

    const key = this.getMessageKey(msg)
    if (this.cache.has(key)) {
      this.cache.get(key).add(peer)
      return
    }

    this.cache.set(key, new Set([peer]))

    const { topic } = msg
    this.emitter.emit(topic, msg, peer)
  }
}

module.exports = Gossip
