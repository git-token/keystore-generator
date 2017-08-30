import Tx from 'ethereumjs-tx'
import { ecsign } from 'ethereumjs-util'
import Web3 from 'web3'
import { keystore, signing } from 'eth-lightwallet'
import Promise from 'bluebird'
const fs = Promise.promisifyAll(require('fs'))
const jsonfile = Promise.promisifyAll(require('jsonfile'))
const join = Promise.join

/**
 * KeystoreGenerator
 * @module
 */
export default class KeystoreGenerator {
  constructor ({
    email,
    username,
    dirPath,
    accountsPath,
    keystoreFileName,
    web3Provider
  }) {

    // Set variables
    this.email = email
    this.username = username
    this.ks
    this.password = ''
    this.derivedKey
    this.accounts = []
    this.dirPath = dirPath
    this.accountsPath = accountsPath
    this.keystoreFileName = keystoreFileName
    this.web3Provider = web3Provider
    this.web3 = new Web3(new Web3.providers.HttpProvider(this.web3Provider))
    this.eth = Promise.promisifyAll(this.web3.eth)
  }

  createKeystore (password) {
    return new Promise((resolve, reject) => {
      keystore.createVault({ password }, (error, ks) => {
        if (error) { reject(error) }
        this.password = password
        this.ks = ks
        resolve(this.ks)
      })
    })
  }

  getDerivedKey (password) {
    return new Promise((resolve, reject) => {
      if(!this.ks) {
        let error = new Error(`
          No keystore found! Cannot derive key without the keystore instance.
          Please create a new vault or import a serialized keystore
          `)
        reject(error)
      } else {
        this.ks.keyFromPassword(password, (error, derivedKey) => {
          if (error) { reject(error) }
          this.derivedKey = derivedKey
          resolve(this.derivedKey)
        })
      }
    })
  }

  createAndSaveKeystore (password) {
    return new Promise((resolve, reject) => {
      this.createKeystore(password).then((_ks) => {
        return this.getDerivedKey(password)
      }).then((_derivedKey) => {
        return this.ks.generateNewAddress(_derivedKey, 1)
      }).then(() => {
        return this.saveKeystore()
      }).then(() => {
        resolve(this.ks)
      }).catch((error) => {
        reject(error)
      })
    })
  }

  // getPrivateKey (address) {
  //   return new Promise((resolve, reject) => {
  //
  //   })
  // }

  importKeystore ({ dirPath, keystoreFileName }) {
    return new Promise((resolve, reject) => {
      let dirPath = dirPath ? dirPath : this.dirPath
      let keystoreFileName = keystoreFileName ? keystoreFileName : this.keystoreFileName
      jsonfile.readFileAsync(`${dirPath}/${keystoreFileName}`).then((savedKeystore) => {
        this.ks = keystore.deserialize(savedKeystore['keystore'])
        this.password = savedKeystore['password']
        // console.log('importKeystore::this.ks', this.ks)
        resolve(this.ks)
      }).catch((error) => {
        if (error.code == 'ENOENT') {
          resolve(null)
        } else {
          reject(error)
        }
      })
    })
  }

  saveKeystore () {
    return new Promise((resolve, reject) => {
      let serialized = this.ks.serialize()

      jsonfile.writeFileAsync(
        `${this.dirPath}/${this.keystoreFileName}`,{
          password: this.password,
          keystore: serialized
        }
      ).then(() => {
        resolve(true)
      }).catch((error) => {
        reject(error)
      })
    })
  }

  saveAccounts (accounts) {
    return new Promise((resolve, reject) => {
      // let Accounts
      // jsonfile.readFileAsync(`${this.dirPath}/${this.fileName}`).then((_accounts) => {
        // Accounts = accounts ? [ ...accounts, ..._accounts ] : [ ...this.accounts, ..._accounts ]
      //   return jsonfile.writeFileAsync(
      //     `${this.dirPath}/${this.fileName}`,
      //     Accounts
      //   )
      jsonfile.writeFileAsync(
          `${this.dirPath}/${this.accountsPath}`,
          [ ...accounts ],
          { flag: 'a' }
        ).then(() => {
        resolve(Accounts)
      }).catch((error) => {
        reject(error)
      })
    })
  }

  signTransaction({ from, to, value, nonce, data, gasPrice, gasLimit, chainId }) {
    return new Promise((resolve, reject) => {
      // console.log('signTransaction::from', from)
      join(
        this.eth.getTransactionCountAsync(from),
        this.eth.getGasPriceAsync(),
        this.getDerivedKey(this.password)
      ).then((joinedData) => {
        let tx = new Tx({
          nonce: nonce ? nonce : joinedData[0],
          gasPrice: gasPrice ? gasPrice : joinedData[1].toNumber(),
          from,
          to,
          value,
          data,
          gas: gasLimit
        })
        const serialized = `0x${tx.serialize().toString('hex')}`
        // console.log('signTransaction::serialized', serialized)
        return signing.signTx(this.ks, joinedData[2], serialized, from)
      }).then((signedTx) => {
        resolve(signedTx)
      }).catch((error) => {
        reject(error);
      })
    })
  }

  getTransactionReceipt(txHash, count) {
    return new Promise((resolve, reject) => {
      if (count > 20000) {
        let error = new Error(`Could not find transaction receipt after 20000 iterations`)
        reject(error)
      } else {
        this.eth.getTransactionReceiptAsync(txHash).then((txReceipt) => {
          if (txReceipt['blockNumber']) {
            resolve(txReceipt)
          } else {
            return Promise.delay(1000, this.getTransactionReceipt(txHash, count++))
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
