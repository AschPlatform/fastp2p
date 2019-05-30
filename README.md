# fastp2p

Fast and low overhead p2p framework, for Node.js.

## Usage


```typescript
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

node.gossip.publish('transaction', { from: 'alice', to: 'bob', amount: 1000, id: 't1' })

node.gossip.subscribe('transaction', (msg, peer) => {
  const t = msg.data
  console.log(`receive transaction ${t.id} from ${peer}`)

  node.gossip.forward(msg)
})

node.rpc.serve('getBlocks', (req, callback) => {
  const { params, peer } = req
  // ...
  callback(null, { blocks }) 
})

const peers = node.getPeers()
const rnd = Math.floor(Math.random() * peers.length)
const peer = peers[rnd]
node.rpc.request(peer, 'getBlocks', { offset: 0, limit: 10 }, (error, result) => {
  if (!error) {
    const { blocks } = result
    // ...
  }
})
```

