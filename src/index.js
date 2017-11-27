import Tx from 'ethereumjs-tx'
import { ecrecover, ecsign, sha3 } from 'ethereumjs-util'
import Web3 from 'web3'
import bip39 from 'bip39'
import keythereum from 'keythereum'
import Promise, { promisifyAll, join } from 'bluebird'
import path from 'path'

const fs = promisifyAll(require('fs'))
const jsonfile = promisifyAll(require('jsonfile'))


/**
 * KeystoreGenerator
 * @module
 */
export default class KeystoreGenerator {
  constructor ({ dirPath, web3Provider, recoveryShare, address }) {
    // Set variables
    this.dirPath = dirPath
    this.recoveryShare = recoveryShare
    this.address = address
    this.pKey = null
    this.ks = null

    this.ecrecover = ecrecover
    this.sha3 = sha3

    // Main Ethereum Network
    this.web3Provider = web3Provider
    this.web3 = new Web3(new Web3.providers.HttpProvider(this.web3Provider))
    // promisified Alias for eth commands
    this.eth = Promise.promisifyAll(this.web3.eth)

    if(!recoveryShare || recoveryShare == 'false' || recoveryShare == 0) {
      // Create New Keystore
      const secret1 = sha3(bip39.generateMnemonic()).toString('hex')
      const secret2 = sha3(bip39.generateMnemonic()).toString('hex')
      const secret3 = sha3(bip39.generateMnemonic()).toString('hex')

      const password = sha3(`${secret1}${secret2}${secret3}`).toString('hex')


      this.newKeystore({ password }).then((ks) => {
        // Secrets 1&2 are saved; 3 is popped and printed to console for user to save
        // Service can be restarted with recover == true to bypass this configuration setup.
        // TODO: Write secret3 to std out for programmatic integration
        // NOTE: Consider refactoring using Shamir Secrets for combinatorial recovery
        return this.saveSecrets({ secrets: [ secret1, secret2, secret3 ] })
      }).then(() => {
        console.log(`
          =============== GITTOKEN SIGNER KEYSTORE CREATED ===============
          ================================================================
          =============== SAVE YOUR GITTOKEN WALLET ADDRESS ==============
          ${this.address}
          ================================================================
          ============ SAVE YOUR GITTOKEN WALLET RECOVERY SHARE ==========
          ${this.recoveryShare}
          ================================================================
          ================================================================
          WARNING: This software is alphaware and has not been audited.
          By using this software, you are agreeing to use this software
          at your own risk. GitToken is not liable for loss of funds,
          and does not guarantee the correctness of this software.
          This software is provided for free of use, and is open source.
          Source code is available at:

          https://github.com/git-token/keystore-generator/


          If you would like to help audit this code, please open an issue
          at:

          https://github.com/git-token/keystore-generator/issues
        `)
      }).catch((error) => {
        console.log('GitToken KeystoreGenerator Error', error)
      })
    } else {
      this.getKeystore().then((ks) => {
        console.log(`
          == GITTOKEN SIGNER KEYSTORE RECOVERED ==
          ${this.address}
          ========================================
        `)
      }).catch((error) => {
        console.log('GitToken KeystoreGenerator Error', error)
      })
    }
  }

  getKeystore() {
    return new Promise((resolve, reject) => {
      if (this.ks) { resolve(this.ks) }
      Promise.resolve(keythereum.importFromFile(this.address, this.dirPath)).then((ks) => {
        this.ks = ks
        this.address = ks.address
        resolve(this.ks)
      }).catch((error) => {
        reject(error)
      })
    })
  }

  newKeystore({ password }) {
    return new Promise((resolve, reject) => {
      Promise.resolve(keythereum.create()).then((dKey) => {
        return Promise.resolve(keythereum.dump(password, dKey.privateKey, dKey.salt, dKey.iv))
      }).then((ks) => {
        this.ks = ks
        this.address = this.ks.address
        this.password = password
        keythereum.exportToFile(this.ks)
        resolve(this.ks)
      }).catch((error) => {
        reject(error)
      })
    })
  }

  saveSecrets({ secrets }) {
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
      this.recoveryShare = secrets.pop()

      jsonfile.writeFileAsync(
        `${this.dirPath}/keystore/secrets.json`,
        secrets,
        { flag: 'w' }
      ).then(() => {
        resolve(this.recoveryShare)
      }).catch((error) => {
        reject(error)
      })

    })
  }

  deriveKey() {
    return new Promise((resolve, reject) => {
      if (this.pKey != null) { resolve(this.pKey) }
      jsonfile.readFileAsync(`${this.dirPath}/keystore/secrets.json`).then((secrets) => {
        const password = sha3(`${secrets[0]}${secrets[1]}${this.recoveryShare}`).toString('hex')
        return Promise.resolve(keythereum.recover(password, this.ks))
      }).then((pKey) => {
        this.pKey = pKey
        resolve(this.pKey)
      }).catch((error) => {
        reject(error)
      })
    })
  }

  signMessage({ messageHash }) {
    return new Promise((resolve, reject) => {
      if (!messageHash) {
        reject(new Error(`
          Invalid 'messageHash' variable. Requires keccak256 hash of message
        `))
      }
      this.deriveKey().then((pKey) => {
        return ecsign(messageHash, this.pKey)
      }).then((signedMsg) => {
        resolve(signedMsg)
      }).catch((error) => {
        reject(error)
      })
    })
  }

  signTransaction({ to, value, nonce, data, gasPrice, gasLimit, chainId }) {
    return new Promise((resolve, reject) => {
      this.deriveKey().then(() => {
        return this.eth.getTransactionCountAsync(`0x${this.address}`)
      }).then((_nonce) => {
        const tx = new Tx({
          nonce: nonce ? nonce : _nonce,
          gasPrice: gasPrice ? gasPrice : 1e9, // default to .5gwei
          from: `0x${this.address}`,
          to,
          value,
          data,
          gas: gasLimit ? gasLimit : 6712392, // as of Nov 27, 2017
          chainId: null
        })

        tx.sign(this.pKey)
        return tx.serialize()
      }).then((signedTx) => {
        resolve(signedTx)
      }).catch((error) => {
        reject(error);
      })
    })
  }

  sendTransaction(transaction) {
    return new Promise((resolve, reject) => {
      this.signTransaction(transaction).then((signedTx) => {
        return this.eth.sendRawTransactionAsync(`0x${signedTx.toString('hex')}`)
      }).then((txHash) => {
        return this.getTransactionReceipt({ txHash })
      }).then((txReceipt) => {
        resolve(txReceipt)
      }).catch((error) => {
        reject(error)
      })
    })
  }

  getTransactionReceipt({ txHash, count=0 }) {
    return new Promise((resolve, reject) => {
      if (count > 20000) {
        let error = new Error(`Could not find transaction receipt after 20000 iterations`)
        reject(error)
      } else {
        this.eth.getTransactionReceiptAsync(txHash).then((txReceipt) => {
          if (txReceipt && txReceipt['blockNumber']) {
            resolve(txReceipt)
          } else {
            return Promise.delay(1000, this.getTransactionReceipt({ txHash, count: count++ }))
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
