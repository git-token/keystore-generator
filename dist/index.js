'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _classCallCheck2 = require('babel-runtime/helpers/classCallCheck');

var _classCallCheck3 = _interopRequireDefault(_classCallCheck2);

var _createClass2 = require('babel-runtime/helpers/createClass');

var _createClass3 = _interopRequireDefault(_createClass2);

var _ethereumjsTx = require('ethereumjs-tx');

var _ethereumjsTx2 = _interopRequireDefault(_ethereumjsTx);

var _ethereumjsUtil = require('ethereumjs-util');

var _web = require('web3');

var _web2 = _interopRequireDefault(_web);

var _bip = require('bip39');

var _bip2 = _interopRequireDefault(_bip);

var _keythereum = require('keythereum');

var _keythereum2 = _interopRequireDefault(_keythereum);

var _bluebird = require('bluebird');

var _bluebird2 = _interopRequireDefault(_bluebird);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var fs = (0, _bluebird.promisifyAll)(require('fs'));
var jsonfile = (0, _bluebird.promisifyAll)(require('jsonfile'));

/**
 * KeystoreGenerator
 * @module
 */

var KeystoreGenerator = function () {
  function KeystoreGenerator(_ref) {
    var _this = this;

    var dirPath = _ref.dirPath,
        web3Provider = _ref.web3Provider,
        recoveryShare = _ref.recoveryShare,
        address = _ref.address;
    (0, _classCallCheck3.default)(this, KeystoreGenerator);

    // Set variables
    this.dirPath = dirPath;
    this.recoveryShare = recoveryShare;
    this.address = address;
    this.pKey = null;
    this.ks = null;

    this.ecrecover = _ethereumjsUtil.ecrecover;
    this.sha3 = _ethereumjsUtil.sha3;

    // Main Ethereum Network
    this.web3Provider = web3Provider;
    this.web3 = new _web2.default(new _web2.default.providers.HttpProvider(this.web3Provider));
    // promisified Alias for eth commands
    this.eth = _bluebird2.default.promisifyAll(this.web3.eth);

    if (!recoveryShare || recoveryShare == 'false' || recoveryShare == 0) {
      // Create New Keystore
      var secret1 = (0, _ethereumjsUtil.sha3)(_bip2.default.generateMnemonic()).toString('hex');
      var secret2 = (0, _ethereumjsUtil.sha3)(_bip2.default.generateMnemonic()).toString('hex');
      var secret3 = (0, _ethereumjsUtil.sha3)(_bip2.default.generateMnemonic()).toString('hex');

      var password = (0, _ethereumjsUtil.sha3)('' + secret1 + secret2 + secret3).toString('hex');

      this.newKeystore({ password: password }).then(function (ks) {
        // Secrets 1&2 are saved; 3 is popped and printed to console for user to save
        // Service can be restarted with recover == true to bypass this configuration setup.
        // TODO: Write secret3 to std out for programmatic integration
        // NOTE: Consider refactoring using Shamir Secrets for combinatorial recovery
        return _this.saveSecrets({ secrets: [secret1, secret2, secret3] });
      }).then(function () {
        console.log('\n          =============== GITTOKEN SIGNER KEYSTORE CREATED ===============\n          ================================================================\n          =============== SAVE YOUR GITTOKEN WALLET ADDRESS ==============\n          ' + _this.address + '\n          ================================================================\n          ============ SAVE YOUR GITTOKEN WALLET RECOVERY SHARE ==========\n          ' + _this.recoveryShare + '\n          ================================================================\n          ================================================================\n          WARNING: This software is alphaware and has not been audited.\n          By using this software, you are agreeing to use this software\n          at your own risk. GitToken is not liable for loss of funds,\n          and does not guarantee the correctness of this software.\n          This software is provided for free of use, and is open source.\n          Source code is available at:\n\n          https://github.com/git-token/keystore-generator/\n\n\n          If you would like to help audit this code, please open an issue\n          at:\n\n          https://github.com/git-token/keystore-generator/issues\n        ');
      }).catch(function (error) {
        console.log('GitToken KeystoreGenerator Error', error);
      });
    } else {
      this.getKeystore().then(function (ks) {
        console.log('\n          == GITTOKEN SIGNER KEYSTORE RECOVERED ==\n          ' + _this.address + '\n          ========================================\n        ');
      }).catch(function (error) {
        console.log('GitToken KeystoreGenerator Error', error);
      });
    }
  }

  (0, _createClass3.default)(KeystoreGenerator, [{
    key: 'getKeystore',
    value: function getKeystore() {
      var _this2 = this;

      return new _bluebird2.default(function (resolve, reject) {
        if (_this2.ks) {
          resolve(_this2.ks);
        }
        _bluebird2.default.resolve(_keythereum2.default.importFromFile(_this2.address, _this2.dirPath)).then(function (ks) {
          _this2.ks = ks;
          _this2.address = ks.address;
          resolve(_this2.ks);
        }).catch(function (error) {
          reject(error);
        });
      });
    }
  }, {
    key: 'newKeystore',
    value: function newKeystore(_ref2) {
      var _this3 = this;

      var password = _ref2.password;

      return new _bluebird2.default(function (resolve, reject) {
        _bluebird2.default.resolve(_keythereum2.default.create()).then(function (dKey) {
          return _bluebird2.default.resolve(_keythereum2.default.dump(password, dKey.privateKey, dKey.salt, dKey.iv));
        }).then(function (ks) {
          _this3.ks = ks;
          _this3.address = _this3.ks.address;
          _this3.password = password;
          _keythereum2.default.exportToFile(_this3.ks);
          resolve(_this3.ks);
        }).catch(function (error) {
          reject(error);
        });
      });
    }
  }, {
    key: 'saveSecrets',
    value: function saveSecrets(_ref3) {
      var _this4 = this;

      var secrets = _ref3.secrets;

      return new _bluebird2.default(function (resolve, reject) {
        if (secrets.length < 3) {
          var error = new Error('\n          Expected secrets to be an array of sha3 hashed seeds,\n          with a minimum length of 3 shares.\n        ');
          reject(error);
        }

        // This recovery share is used to recreate the password that created the keystore
        // It is required to recover the private key and sign transactions and messages
        _this4.recoveryShare = secrets.pop();

        jsonfile.writeFileAsync(_this4.dirPath + '/keystore/secrets.json', secrets, { flag: 'w' }).then(function () {
          resolve(_this4.recoveryShare);
        }).catch(function (error) {
          reject(error);
        });
      });
    }
  }, {
    key: 'deriveKey',
    value: function deriveKey() {
      var _this5 = this;

      return new _bluebird2.default(function (resolve, reject) {
        if (_this5.pKey != null) {
          resolve(_this5.pKey);
        }
        jsonfile.readFileAsync(_this5.dirPath + '/keystore/secrets.json').then(function (secrets) {
          var password = (0, _ethereumjsUtil.sha3)('' + secrets[0] + secrets[1] + _this5.recoveryShare).toString('hex');
          return _bluebird2.default.resolve(_keythereum2.default.recover(password, _this5.ks));
        }).then(function (pKey) {
          _this5.pKey = pKey;
          resolve(_this5.pKey);
        }).catch(function (error) {
          reject(error);
        });
      });
    }
  }, {
    key: 'signMessage',
    value: function signMessage(_ref4) {
      var _this6 = this;

      var messageHash = _ref4.messageHash;

      return new _bluebird2.default(function (resolve, reject) {
        if (!messageHash) {
          reject(new Error('\n          Invalid \'messageHash\' variable. Requires keccak256 hash of message\n        '));
        }
        _this6.deriveKey().then(function (pKey) {
          return (0, _ethereumjsUtil.ecsign)(messageHash, _this6.pKey);
        }).then(function (signedMsg) {
          resolve(signedMsg);
        }).catch(function (error) {
          reject(error);
        });
      });
    }
  }, {
    key: 'signTransaction',
    value: function signTransaction(_ref5) {
      var _this7 = this;

      var to = _ref5.to,
          value = _ref5.value,
          nonce = _ref5.nonce,
          data = _ref5.data,
          gasPrice = _ref5.gasPrice,
          gasLimit = _ref5.gasLimit,
          chainId = _ref5.chainId;

      return new _bluebird2.default(function (resolve, reject) {
        _this7.deriveKey().then(function () {
          return _this7.eth.getTransactionCountAsync('0x' + _this7.address);
        }).then(function (_nonce) {
          var tx = new _ethereumjsTx2.default({
            nonce: nonce ? nonce : _nonce,
            gasPrice: gasPrice ? gasPrice : 1e9, // default to .5gwei
            from: '0x' + _this7.address,
            to: to,
            value: value,
            data: data,
            gas: gasLimit ? gasLimit : 6712392, // as of Nov 27, 2017
            chainId: null
          });

          tx.sign(_this7.pKey);
          return tx.serialize();
        }).then(function (signedTx) {
          resolve(signedTx);
        }).catch(function (error) {
          reject(error);
        });
      });
    }
  }, {
    key: 'sendTransaction',
    value: function sendTransaction(transaction) {
      var _this8 = this;

      return new _bluebird2.default(function (resolve, reject) {
        _this8.signTransaction(transaction).then(function (signedTx) {
          return _this8.eth.sendRawTransactionAsync('0x' + signedTx.toString('hex'));
        }).then(function (txHash) {
          return _this8.getTransactionReceipt({ txHash: txHash });
        }).then(function (txReceipt) {
          resolve(txReceipt);
        }).catch(function (error) {
          reject(error);
        });
      });
    }
  }, {
    key: 'getTransactionReceipt',
    value: function getTransactionReceipt(_ref6) {
      var _this9 = this;

      var txHash = _ref6.txHash,
          _ref6$count = _ref6.count,
          count = _ref6$count === undefined ? 0 : _ref6$count;

      return new _bluebird2.default(function (resolve, reject) {
        if (count > 20000) {
          var error = new Error('Could not find transaction receipt after 20000 iterations');
          reject(error);
        } else {
          _this9.eth.getTransactionReceiptAsync(txHash).then(function (txReceipt) {
            if (txReceipt && txReceipt['blockNumber']) {
              resolve(txReceipt);
            } else {
              return _bluebird2.default.delay(1000, _this9.getTransactionReceipt({ txHash: txHash, count: count++ }));
            }
          }).then(function (txReceipt) {
            resolve(txReceipt);
          }).catch(function (error) {
            reject(error);
          });
        }
      });
    }
  }]);
  return KeystoreGenerator;
}();

exports.default = KeystoreGenerator;