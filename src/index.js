import Tx from 'ethereumjs-tx'
import { ecsign, sha3 } from 'ethereumjs-util'
import Web3 from 'web3'
import { keystore, signing } from 'eth-lightwallet'
import Promise, { promisifyAll, join } from 'bluebird'
import path from 'path'

const fs = promisifyAll(require('fs'))
const jsonfile = promisifyAll(require('jsonfile'))

/**
 * Private Functions
 */

function newKeystore({ password, dirPath }) {
  return new Promise((resolve, reject) => {
    keystore.createVault({ password }, (error, ks) => {
      if (error) { reject(error) }
      ks.keyFromPassword(password, (error, dKey) => {
        if (error) { reject(error) }
        ks.generateNewAddress(dKey, 1)
        jsonfile.writeFileAsync(
          `${dirPath}/keystore.json`,
          JSON.parse(ks.serialize()),
          { flag: 'w' }
        ).then(() => {
          resolve(true)
        }).catch((error) => {
          reject(error)
        })
      })
    })
  })
}

function saveSecrets({ secrets, dirPath }) {
  return new Promise((resolve, reject) => {
    if (secrets.length < 3) {
      let error = new Error(`
        Expected secrets to be an array of sha3 hashed seeds,
        with a minimum length of 3 shares.
      `)
      reject(error)
    }

    // This recovery share is used to recreate the password that created the keystore
    // It is required to recover the private key and sign transactions and messages
    let recoveryShare = secrets.pop()

    jsonfile.writeFileAsync(
      `${dirPath}/secrets.json`,
      secrets,
      { flag: 'w' }
    ).then(() => {
      resolve(recoveryShare)
    }).catch((error) => {
      reject(error)
    })

  })
}

function deriveKey({ dirPath, recoveryShare }) {
  return new Promise((resolve, reject) => {
    let password;
    jsonfile.readFileAsync(`${dirPath}/secrets.json`).then((secrets) => {
      password = sha3(`${secrets[0]}${secrets[1]}${recoveryShare}`).toString('hex')
      return jsonfile.readFileAsync(`${dirPath}/keystore.json`)
    }).then((serializedKeystore) => {
      let ks = keystore.deserialize(JSON.stringify(serializedKeystore))
      ks.keyFromPassword(password, (error, dKey) => {
        if (error) { reject(error) }
        resolve(dKey)
      })
    }).catch((error) => {
      reject(error)
    })
  })
}

/**
 * KeystoreGenerator
 * @module
 */
export default class KeystoreGenerator {
  constructor ({ dirPath, torvaldsProvider, web3Provider, recover }) {
    // Set variables
    this.dirPath = dirPath

    // Main Ethereum Network
    this.web3Provider = web3Provider
    this.web3 = new Web3(new Web3.providers.HttpProvider(this.web3Provider))
    // promisified Alias for eth commands
    this.eth = Promise.promisifyAll(this.web3.eth)


    // Torvalds Network
    this.torvaldsProvider = torvaldsProvider
    this.torvaldsWeb3 = new Web3(new Web3.providers.HttpProvider(this.torvaldsProvider))
    this.torvaldsEth = Promise.promisifyAll(this.torvaldsWeb3.eth)

    this.ethProviders = {
      ethereum: this.eth,
      torvalds: this.torvaldsEth
    }

    if(!recover || recover == 'false' || recover == 0) {
      // Create New Keystore
      const secret1 = sha3(keystore.generateRandomSeed()).toString('hex')
      const secret2 = sha3(keystore.generateRandomSeed()).toString('hex')
      const secret3 = sha3(keystore.generateRandomSeed()).toString('hex')

      const password = sha3(`${secret1}${secret2}${secret3}`).toString('hex')

      newKeystore({ password, dirPath: this.dirPath }).then((ks) => {
        // Secrets 1&2 are saved; 3 is popped and printed to console for user to save
        // Service can be restarted with recover == true to bypass this configuration setup.
        // TODO: Write secret3 to std out for programmatic integration
        // NOTE: Consider refactoring using Shamir Secrets for combinatorial recovery
        return saveSecrets({ secrets: [
          secret1,
          secret2,
          secret3
        ], dirPath: this.dirPath })
      }).then(() => {
        console.log('=============== GITTOKEN SIGNER KEYSTORE CREATED ===============')
        console.log('================================================================')

        return this.getAddress()
      }).then((address) => {
        console.log('==================== GITTOKEN WALLET ADDRESS ===================')
        console.log('================================================================')
        console.log(`0x${address}`)
        console.log('================================================================')
        console.log('=============== SAVE THE FOLLOWING RECOVERY SHARE ==============')
        console.log('================================================================')
        console.log(secret3)
        console.log('================================================================')
      }).catch((error) => {
        console.log('Keystore Constructor Error', error)
      })
    }
  }

  getAddress() {
    return new Promise((resolve, reject) => {
      jsonfile.readFileAsync(`${this.dirPath}/keystore.json`).then((serializedKeystore) => {
        let ks = keystore.deserialize(JSON.stringify(serializedKeystore))
        resolve(ks.getAddresses()[0])
      }).catch((error) => {
        reject(error)
      })
    })
  }

  signTransaction({ network, transaction, recoveryShare }) {
    return new Promise((resolve, reject) => {
      if (!network) {
        reject(new Error(`
          Invalid 'network' variable.
          Requires a network string of 'torvalds' or 'ethereum'
        `))
      }
      if (!transaction) {
        reject(new Error(`
          Invalid 'transaction' variable.
          Requires a valid Ethereum transaction object
        `))
      }
      if (!recoveryShare) {
        reject(new Error(`
          Invalid 'recoveryShare' variable.
          Requires keccak256 hash of recovery share
        `))
      }
      const { to, value, nonce, data, gasPrice, gasLimit, chainId } = transaction
      let from
      this.getAddress().then((_from) => {
        from = `0x${_from}`

        return join(
          this.ethProviders[network].getTransactionCountAsync(from),
          this.ethProviders[network].getGasPriceAsync(),
          deriveKey({ dirPath: this.dirPath, recoveryShare }),
          jsonfile.readFileAsync(`${this.dirPath}/keystore.json`)
        )
      }).then((joinedData) => {
        let ks = keystore.deserialize(JSON.stringify(joinedData[3]))
        let tx = new Tx({
          nonce: nonce ? nonce : joinedData[0],
          gasPrice: gasPrice ? gasPrice : joinedData[1],
          from,
          to,
          value,
          data,
          gas: gasLimit
        })
        const serialized = `0x${tx.serialize().toString('hex')}`

        // console.log('signTransaction::serialized', serialized)
        // console.log('signTransaction::ks, joinedData[2], serialized, from', ks, joinedData[2], serialized, from)

        return signing.signTx(ks, joinedData[2], serialized, from)
      }).then((signedTx) => {
        resolve(signedTx)
      }).catch((error) => {
        reject(error);
      })
    })
  }

  signMessage({ messageHash, recoveryShare }) {
    return new Promise((resolve, reject) => {
      if (!messageHash) {
        reject(new Error(`
          Invalid 'messageHash' variable. Requires keccak256 hash of message
        `))
      }
      if (!recoveryShare) {
        reject(new Error(`
          Invalid 'recoveryShare' variable. Requires keccak256 hash of recovery share
        `))
      }
      join(
        this.getAddress(),
        jsonfile.readFileAsync(`${this.dirPath}/keystore.json`),
        deriveKey({ dirPath: this.dirPath, recoveryShare })
      ).then((joinedData) => {
        let address = joinedData[0]
        let ks = keystore.deserialize(JSON.stringify(joinedData[1]))
        let dKey = joinedData[2]

        return signing.signMsg(ks, dKey, messageHash, address)
      }).then((signedMessage) => {
        resolve(signedMessage)
      }).catch((error) => {
        reject(error)
      })
    })
  }

  getTransactionReceipt({ network, txHash, count }) {
    return new Promise((resolve, reject) => {
      if (count > 20000) {
        let error = new Error(`Could not find transaction receipt after 20000 iterations`)
        reject(error)
      } else {
        this.ethProviders[network].getTransactionReceiptAsync(txHash).then((txReceipt) => {
          console.log('txReceipt', txReceipt)
          if (txReceipt && txReceipt['blockNumber']) {
            resolve(txReceipt)
          } else {
            return Promise.delay(1000, this.getTransactionReceipt({ network, txHash, count: count++ }))
          }
        }).then((txReceipt) => {
          resolve(txReceipt)
        }).catch((error) => {
          reject(error)
        })
      }
    })
  }

}
