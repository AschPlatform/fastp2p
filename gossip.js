const EventEmitter = require('events').EventEmitter

class Gossip {
  constructor({ node }) {
    this.node = node
    this.emitter = new EventEmitter()
    this.protocol = '/gossip/0.1.0'
    this.publishLimit = 15
    this.seq = Date.now()
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
    const peers = this.getRandomPeers(this.publishLimit)
    const msg = this.buildMessage(topic, data)
    for (const peer of peers) {
      this.node.send(peer, msg)
    }
  }

  forward(msg) {
    const peers = this.getRandomPeers(this.publishLimit)
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

    // TODO validate msg schema

    const { topic } = msg
    this.emitter.emit(topic, msg, peer)
  }

  getRandomPeers(max) {
    function shuffle(peers) {
      for (let i = 0; i < peers.length; i++) {
        const j = Math.floor(Math.random() * peers.length)
        const tmp = peers[i]
        peers[i] = peers[j]
        peers[j] = tmp
      }
      return peers
    }
    return shuffle(this.node.getPeers()).slice(0, max)
  }
}

module.exports = Gossip
