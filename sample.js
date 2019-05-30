const crypto = require('crypto')
const Node = require('.')

const log = require('debug')('fastp2p:main')

function randomName() {
  let size = Math.floor(Math.random() * 5) + 5
  let name = ''
  let letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

  for (var i = 0; i < size; i++) {
    name += letters.charAt(Math.floor(Math.random() * letters.length))
  }

  return name
}

function createTransaction() {
  const t = {
    timestamp: Date.now(),
    amount: Math.floor(Math.random() * 100000),
    sender: randomName(),
    receiver: randomName(),
  }
  t.id = crypto.createHash('sha256').update(`${t.timestamp}:${t.amount}:${t.sender}:${t.receiver}`).digest('hex')
  return t
}

async function main() {
  const node = new Node({
    config: {
      seeds: [
        '/ipv4/127.0.0.1/tcp/10001/satoshi',
        '/ipv4/127.0.0.1/tcp/10002/qingfeng',
        '/ipv4/47.52.169.154/tcp/10010/cdn',
        '/ipv4/47.52.45.101/tcp/10011/sp',
        '/ipv4/150.109.62.142/tcp/10012/pixel',
      ],
      publicIp: '',
      peerDb: './data/peer.db'
    },
    port: Number.parseInt(process.argv[2]),
    id: process.argv[3],
  })

  await node.initialize()

  node.start()
  setInterval(() => {
    node.gossip.publish('transaction', JSON.stringify(createTransaction()))
  }, 1000)

  const tids = new Set()
  let recentlyReceived = 0
  let recentlyReceivedDedup = 0
  node.gossip.subscribe('transaction', (msg, peer) => {
    recentlyReceived++
    const t = JSON.parse(msg.data)
    if (tids.has(t.id)) {
      return
    }
    recentlyReceivedDedup++
    log(`receive transaction ${t.id} from ${peer}`)
    tids.add(t.id)
    node.gossip.forward(msg)
  })

  setInterval(() => {
    log('--------------------------')
    log({
      peers: node.getPeers(),
      transactions: tids.size,
      recentlyReceived,
      recentlyReceivedDedup
    })
    recentlyReceived = 0
    recentlyReceivedDedup = 0
  }, 10000)
}

main().then().catch(console.error)