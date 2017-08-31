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

var _ethLightwallet = require('eth-lightwallet');

var _bluebird = require('bluebird');

var _bluebird2 = _interopRequireDefault(_bluebird);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var fs = (0, _bluebird.promisifyAll)(require('fs'));
var jsonfile = (0, _bluebird.promisifyAll)(require('jsonfile'));

process.env['NODE_NO_WARNINGS'] = 1;

/**
 * Private Functions
 */

function newKeystore(_ref) {
  var password = _ref.password,
      dirPath = _ref.dirPath;

  return new _bluebird2.default(function (resolve, reject) {
    _ethLightwallet.keystore.createVault({ password: password }, function (error, ks) {
      if (error) {
        reject(error);
      }
      ks.keyFromPassword(password, function (error, dKey) {
        if (error) {
          reject(error);
        }
        ks.generateNewAddress(dKey, 1);
        jsonfile.writeFileAsync(dirPath + '/keystore.json', ks.serialize(), { flag: 'wx' }).then(function () {
          resolve(true);
        }).catch(function (error) {
          reject(error);
        });
      });
    });
  });
}

function saveSecrets(_ref2) {
  var secrets = _ref2.secrets,
      dirPath = _ref2.dirPath;

  return new _bluebird2.default(function (resolve, reject) {
    if (secrets.length < 3) {
      var error = new Error('\n        Expected secrets to be an array of sha3 hashed seeds,\n        with a minimum length of 3 shares.\n      ');
      reject(error);
    }

    // This recovery share is used to recreate the password that created the keystore
    // It is required to recover the private key and sign transactions and messages
    var recoveryShare = secrets.pop();

    jsonfile.writeFileAsync(dirPath + '/secrets.json', secrets, { flag: 'wx' }).then(function () {
      resolve(recoveryShare);
    }).catch(function (error) {
      reject(error);
    });
  });
}

function deriveKey(_ref3) {
  var dirPath = _ref3.dirPath,
      recoveryShare = _ref3.recoveryShare;

  return new _bluebird2.default(function (resolve, reject) {
    var password = void 0;
    jsonfile.readFileAsync(dirPath + '/secrets.json').then(function (secrets) {
      password = (0, _ethereumjsUtil.sha3)('' + secrets[0] + secrets[1] + recoveryShare).toString('hex');
      return jsonfile.readFileAsync(dirPath + '/keystore.json');
    }).then(function (serializedKeystore) {
      var ks = _ethLightwallet.keystore.deserialize(serializedKeystore);
      ks.keyFromPassword(password, function (error, dKey) {
        if (error) {
          reject(error);
        }
        resolve(dKey);
      });
    }).catch(function (error) {
      reject(error);
    });
  });
}

/**
 * KeystoreGenerator
 * @module
 */

var KeystoreGenerator = function () {
  function KeystoreGenerator(_ref4) {
    var _this = this;

    var dirPath = _ref4.dirPath,
        web3Provider = _ref4.web3Provider,
        recover = _ref4.recover;
    (0, _classCallCheck3.default)(this, KeystoreGenerator);

    return new _bluebird2.default(function (resolve, reject) {
      // Set variables
      _this.dirPath = dirPath;
      _this.web3Provider = web3Provider;
      _this.web3 = new _web2.default(new _web2.default.providers.HttpProvider(_this.web3Provider));
      _this.eth = _bluebird2.default.promisifyAll(_this.web3.eth);

      if (!recover) {
        // Create New Keystore
        var secret1 = (0, _ethereumjsUtil.sha3)(_ethLightwallet.keystore.generateRandomSeed()).toString('hex');
        var secret2 = (0, _ethereumjsUtil.sha3)(_ethLightwallet.keystore.generateRandomSeed()).toString('hex');
        var secret3 = (0, _ethereumjsUtil.sha3)(_ethLightwallet.keystore.generateRandomSeed()).toString('hex');

        var password = (0, _ethereumjsUtil.sha3)('' + secret1 + secret2 + secret3).toString('hex');
        newKeystore({ password: password, dirPath: _this.dirPath }).then(function (ks) {
          return saveSecrets({ secrets: [secret1, secret2, secret3], dirPath: _this.dirPath });
        }).then(function () {
          console.log('GitToken Signer Keystore Created!');
          console.log('=================================');
          console.log('SAVE THE FOLLOWING RECOVERY SHARE');
          console.log('=================================');
          console.log('=================================');
          console.log(secret3);
          console.log('=================================');
          resolve(_this);
        }).catch(function (error) {
          reject(error);
        });
      } else {
        resolve(_this);
      }
    });
  }

  (0, _createClass3.default)(KeystoreGenerator, [{
    key: 'getAddress',
    value: function getAddress() {
      var _this2 = this;

      return new _bluebird2.default(function (resolve, reject) {
        jsonfile.readFileAsync(_this2.dirPath + '/keystore.json').then(function (serializedKeystore) {
          var ks = _ethLightwallet.keystore.deserialize(serializedKeystore);
          resolve(ks.getAddresses()[0]);
        }).catch(function (error) {
          reject(error);
        });
      });
    }
  }, {
    key: 'signTransaction',
    value: function signTransaction(_ref5) {
      var _this3 = this;

      var transaction = _ref5.transaction,
          recoveryShare = _ref5.recoveryShare;

      return new _bluebird2.default(function (resolve, reject) {
        var to = transaction.to,
            value = transaction.value,
            nonce = transaction.nonce,
            data = transaction.data,
            gasPrice = transaction.gasPrice,
            gasLimit = transaction.gasLimit,
            chainId = transaction.chainId;

        var from = void 0;
        _this3.getAddress().then(function (_from) {
          from = _from;

          return (0, _bluebird.join)(_this3.eth.getTransactionCountAsync(from), _this3.eth.getGasPriceAsync(), deriveKey({ dirPath: _this3.dirPath, recoveryShare: recoveryShare }), jsonfile.readFileAsync(_this3.dirPath + '/keystore.json'));
        }).then(function (joinedData) {
          var ks = _ethLightwallet.keystore.deserialize(joinedData[3]);
          var tx = new _ethereumjsTx2.default({
            nonce: nonce ? nonce : joinedData[0],
            gasPrice: gasPrice ? gasPrice : joinedData[1],
            from: from,
            to: to,
            value: value,
            data: data,
            gas: gasLimit
          });
          var serialized = '0x' + tx.serialize().toString('hex');
          // console.log('signTransaction::serialized', serialized)
          return _ethLightwallet.signing.signTx(ks, joinedData[2], serialized, from);
        }).then(function (signedTx) {
          resolve(signedTx);
        }).catch(function (error) {
          reject(error);
        });
      });
    }
  }, {
    key: 'signMessage',
    value: function signMessage(_ref6) {
      var _this4 = this;

      var messageHash = _ref6.messageHash,
          recoveryShare = _ref6.recoveryShare;

      return new _bluebird2.default(function (resolve, reject) {
        (0, _bluebird.join)(_this4.getAddress(), jsonfile.readFileAsync(_this4.dirPath + '/keystore.json'), deriveKey({ dirPath: _this4.dirPath, recoveryShare: recoveryShare })).then(function (joinedData) {
          var address = joinedData[0];
          var ks = _ethLightwallet.keystore.deserialize(joinedData[1]);
          var dKey = joinedData[2];

          return _ethLightwallet.signing.signMsg(ks, dKey, messageHash, address);
        }).then(function (signedMessage) {
          resolve(signedMessage);
        }).catch(function (error) {
          reject(error);
        });
      });
    }
  }, {
    key: 'getTransactionReceipt',
    value: function getTransactionReceipt(txHash, count) {
      var _this5 = this;

      return new _bluebird2.default(function (resolve, reject) {
        if (count > 20000) {
          var error = new Error('Could not find transaction receipt after 20000 iterations');
          reject(error);
        } else {
          _this5.eth.getTransactionReceiptAsync(txHash).then(function (txReceipt) {
            if (txReceipt['blockNumber']) {
              resolve(txReceipt);
            } else {
              return _bluebird2.default.delay(1000, _this5.getTransactionReceipt(txHash, count++));
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