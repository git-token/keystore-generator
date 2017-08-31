const { sha3 } = require('ethereumjs-util')
const KeyGen = require('../dist/index').default
const join = require('bluebird').join

let wallet
let recover = true

new KeyGen({
  web3Provider: 'http://138.68.225.133:8545',
  dirPath: process.cwd(),
  recover
}).then((_wallet) => {
  wallet = _wallet
  return wallet.getAddress()

}).then((address) => {
  console.log('address', address)
  if(recover) {
    return join(
      wallet.signMessage({
        messageHash: sha3('Hello, World'),
        recoveryShare: '4a9c9de8036cc4eeb399961915c4f403dcd446fa533a4d4144b3aeb3078d680f'
      }),
      wallet.signTransaction({
        transaction: {
          to: '0x98678e7c5fb95dd45e5326e271c14edd0f70adc8',
          data: null,
          value: 1
        },
        recoveryShare: '4a9c9de8036cc4eeb399961915c4f403dcd446fa533a4d4144b3aeb3078d680f'
      })
    )
  } else {
    return null
  }
}).then((data) => {

  console.log('data', data)

}).catch((error) => {
  console.log('error', error)
})
