'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _toConsumableArray2 = require('babel-runtime/helpers/toConsumableArray');

var _toConsumableArray3 = _interopRequireDefault(_toConsumableArray2);

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

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var fs = _bluebird2.default.promisifyAll(require('fs'));
var jsonfile = _bluebird2.default.promisifyAll(require('jsonfile'));
var join = _bluebird2.default.join;

/**
 * KeystoreGenerator
 * @module
 */

var KeystoreGenerator = function () {
  function KeystoreGenerator(_ref) {
    var email = _ref.email,
        username = _ref.username,
        dirPath = _ref.dirPath,
        accountsPath = _ref.accountsPath,
        keystoreFileName = _ref.keystoreFileName,
        web3Provider = _ref.web3Provider;
    (0, _classCallCheck3.default)(this, KeystoreGenerator);


    // Set variables
    this.email = email;
    this.username = username;
    this.ks;
    this.password = '';
    this.derivedKey;
    this.accounts = [];
    this.dirPath = dirPath;
    this.accountsPath = accountsPath;
    this.keystoreFileName = keystoreFileName;
    this.web3Provider = web3Provider;
    this.web3 = new _web2.default(new _web2.default.providers.HttpProvider(this.web3Provider));
    this.eth = _bluebird2.default.promisifyAll(this.web3.eth);
  }

  (0, _createClass3.default)(KeystoreGenerator, [{
    key: 'createKeystore',
    value: function createKeystore(password) {
      var _this = this;

      return new _bluebird2.default(function (resolve, reject) {
        _ethLightwallet.keystore.createVault({ password: password }, function (error, ks) {
          if (error) {
            reject(error);
          }
          _this.password = password;
          _this.ks = ks;
          resolve(_this.ks);
        });
      });
    }
  }, {
    key: 'getDerivedKey',
    value: function getDerivedKey(password) {
      var _this2 = this;

      return new _bluebird2.default(function (resolve, reject) {
        if (!_this2.ks) {
          var error = new Error('\n          No keystore found! Cannot derive key without the keystore instance.\n          Please create a new vault or import a serialized keystore\n          ');
          reject(error);
        } else {
          _this2.ks.keyFromPassword(password, function (error, derivedKey) {
            if (error) {
              reject(error);
            }
            _this2.derivedKey = derivedKey;
            resolve(_this2.derivedKey);
          });
        }
      });
    }
  }, {
    key: 'createAndSaveKeystore',
    value: function createAndSaveKeystore(password) {
      var _this3 = this;

      return new _bluebird2.default(function (resolve, reject) {
        _this3.createKeystore(password).then(function (_ks) {
          return _this3.getDerivedKey(password);
        }).then(function (_derivedKey) {
          return _this3.ks.generateNewAddress(_derivedKey, 1);
        }).then(function () {
          return _this3.saveKeystore();
        }).then(function () {
          resolve(_this3.ks);
        }).catch(function (error) {
          reject(error);
        });
      });
    }

    // getPrivateKey (address) {
    //   return new Promise((resolve, reject) => {
    //
    //   })
    // }

  }, {
    key: 'importKeystore',
    value: function importKeystore(_ref2) {
      var _this4 = this;

      var dirPath = _ref2.dirPath,
          keystoreFileName = _ref2.keystoreFileName;

      return new _bluebird2.default(function (resolve, reject) {
        var dirPath = dirPath ? dirPath : _this4.dirPath;
        var keystoreFileName = keystoreFileName ? keystoreFileName : _this4.keystoreFileName;
        jsonfile.readFileAsync(dirPath + '/' + keystoreFileName).then(function (savedKeystore) {
          _this4.ks = _ethLightwallet.keystore.deserialize(savedKeystore['keystore']);
          _this4.password = savedKeystore['password'];
          // console.log('importKeystore::this.ks', this.ks)
          resolve(_this4.ks);
        }).catch(function (error) {
          if (error.code == 'ENOENT') {
            resolve(null);
          } else {
            reject(error);
          }
        });
      });
    }
  }, {
    key: 'saveKeystore',
    value: function saveKeystore() {
      var _this5 = this;

      return new _bluebird2.default(function (resolve, reject) {
        var serialized = _this5.ks.serialize();

        jsonfile.writeFileAsync(_this5.dirPath + '/' + _this5.keystoreFileName, {
          password: _this5.password,
          keystore: serialized
        }).then(function () {
          resolve(true);
        }).catch(function (error) {
          reject(error);
        });
      });
    }
  }, {
    key: 'saveAccounts',
    value: function saveAccounts(accounts) {
      var _this6 = this;

      return new _bluebird2.default(function (resolve, reject) {
        // let Accounts
        // jsonfile.readFileAsync(`${this.dirPath}/${this.fileName}`).then((_accounts) => {
        // Accounts = accounts ? [ ...accounts, ..._accounts ] : [ ...this.accounts, ..._accounts ]
        //   return jsonfile.writeFileAsync(
        //     `${this.dirPath}/${this.fileName}`,
        //     Accounts
        //   )
        jsonfile.writeFileAsync(_this6.dirPath + '/' + _this6.accountsPath, [].concat((0, _toConsumableArray3.default)(accounts)), { flag: 'a' }).then(function () {
          resolve(Accounts);
        }).catch(function (error) {
          reject(error);
        });
      });
    }
  }, {
    key: 'signTransaction',
    value: function signTransaction(_ref3) {
      var _this7 = this;

      var from = _ref3.from,
          to = _ref3.to,
          value = _ref3.value,
          nonce = _ref3.nonce,
          data = _ref3.data,
          gasPrice = _ref3.gasPrice,
          gasLimit = _ref3.gasLimit,
          chainId = _ref3.chainId;

      return new _bluebird2.default(function (resolve, reject) {
        // console.log('signTransaction::from', from)
        join(_this7.eth.getTransactionCountAsync(from), _this7.eth.getGasPriceAsync(), _this7.getDerivedKey(_this7.password)).then(function (joinedData) {
          var tx = new _ethereumjsTx2.default({
            nonce: nonce ? nonce : joinedData[0],
            gasPrice: gasPrice ? gasPrice : joinedData[1].toNumber(),
            from: from,
            to: to,
            value: value,
            data: data,
            gas: gasLimit
          });
          var serialized = '0x' + tx.serialize().toString('hex');
          // console.log('signTransaction::serialized', serialized)
          return _ethLightwallet.signing.signTx(_this7.ks, joinedData[2], serialized, from);
        }).then(function (signedTx) {
          resolve(signedTx);
        }).catch(function (error) {
          reject(error);
        });
      });
    }
  }, {
    key: 'getTransactionReceipt',
    value: function getTransactionReceipt(txHash, count) {
      var _this8 = this;

      return new _bluebird2.default(function (resolve, reject) {
        if (count > 20000) {
          var error = new Error('Could not find transaction receipt after 20000 iterations');
          reject(error);
        } else {
          _this8.eth.getTransactionReceiptAsync(txHash).then(function (txReceipt) {
            if (txReceipt['blockNumber']) {
              resolve(txReceipt);
            } else {
              return _bluebird2.default.delay(1000, _this8.getTransactionReceipt(txHash, count++));
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