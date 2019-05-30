class PeerInfo {
  constructor({ id, addr, host, port, family, transport }) {
    this.id = id
    this.addr = addr
    this.host = host
    this.port = port
    this.family = family
    this.transport = transport
  }

  static parse(addr) {
    if (typeof addr !== 'string') throw new Error('Invalid peer addr')
    const parts = addr.split('/')
    return new PeerInfo({
      addr,
      family: parts[1],
      host: parts[2],
      transport: parts[3],
      port: parts[4].toString(),
      id: parts[5],
    })
  }
}

module.exports = PeerInfo
