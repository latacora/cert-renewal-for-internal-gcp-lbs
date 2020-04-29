"use strict";
const googleDns = require("acme-dns-01-gcp");
var Keypairs = require("@root/keypairs");
var CSR = require("@root/csr");
var PEM = require("@root/pem");
var punycode = require("punycode");
//var ACME = require("acme");
var ACME = require("./@root/acme/acme.js");
require("dotenv").config();
var fs = require("fs");
var pkg = require("./package.json");

// Imports the Google Cloud client library
const { Storage } = require("@google-cloud/storage");

// Creates a client
const storage = new Storage();
const bucket = storage.bucket(process.env.GCP_BUCKET);

// serverKey is the sever private key (not pem format)
// domains is a list of domains that we want the cert to include with the subject in the first position and already punycode.toASCII formatted
async function createCsr(serverKey, domains) {
  console.log("creating the csr....");

  var encoding = "der";
  var typ = "CERTIFICATE REQUEST";

  var csrDer = await CSR.csr({ jwk: serverKey, domains, encoding });
  var csr = PEM.packBlock({ type: typ, bytes: csrDer });

  console.log("csr created");
  console.log(csr);
  return csr;
}

// Create keypair of EC type in the jwk format
async function makeAccountPrivateKeypair() {
  console.log(" creating account keypair");
  var accountKeypair = await Keypairs.generate({ kty: "EC", format: "jwk" });
  var accountKey = accountKeypair.private;

  //console.log("writing account private key to accountPrivateKey.pem");
  //var accountPem = await Keypairs.export({ jwk: accountKey, format: "pkcs8" });
  //await fs.promises.writeFile("./accountPrivateKey.pem", accountPem, "ascii");
  // write to bucket too?
  return accountKey;
}

// Create keypair of RSA type in the jwk format
async function makeServerPrivateKeypair() {
  console.log("creating server keypair...");
  // write to bucket too?
  var serverKeypair = await Keypairs.generate({ kty: "RSA", format: "jwk" });

  var serverKey = serverKeypair.private;
  //let serverPem = await Keypairs.export({ jwk: serverKey });
  //console.log("writing account private key to serverPrivateKey.pem");
  //await fs.promises.writeFile("./serverPrivateKey.pem", serverPem, "ascii");
  return serverKey;
}

async function makeAccount(
  accountKey,
  subscriberEmail = process.env.SUBSCRIBER_EMAIL,
  maintainerEmail = process.env.MAINTAINER_EMAIL
) {
  var packageAgent = "test-" + pkg.name + "/" + pkg.version;
  const errors = [];
  function notify(ev, msg) {
    if ("error" === ev || "warning" === ev) {
      errors.push(ev.toUpperCase() + " " + msg.message);
      return;
    }
    // be brief on all others
    console.log(ev, msg.altname || "", msg.status || "");
  }

  var acme = ACME.create({ maintainerEmail, packageAgent, notify });

  var directoryUrl =
    process.env.CERT_ENV === "production"
      ? "https://acme-v02.api.letsencrypt.org/directory"
      : "https://acme-staging-v02.api.letsencrypt.org/directory";

  await acme.init(directoryUrl);

  //var agreeToTerms = true;
  var agreeToTerms = async function () {
    return true;
  };

  console.info("registering new ACME account...");
  var account = await acme.accounts.create({
    subscriberEmail,
    agreeToTerms,
    accountKey,
  });
  console.info("created account with id", account.key.kid);
  /*await fs.promises.writeFile(
    "./accountInfo.json",
    JSON.stringify(account, null, 2)
  );
  */
  return account;
  // accountKey and account will be used in the certificate options
}

async function init() {
  var accountPrivateKeyPemFile = process.env.ACCOUNT_PRIV_KEY_PEM_FILE ? process.env.ACCOUNT_PRIV_KEY_PEM_FILE : "accountPrivateKey.pem";
  var serverPrivateKeyPemFile = process.env.SERVER_PRIV_KEY_PEM_FILE ? process.env.SERVER_PRIV_KEY_PEM_FILE : "serverPrivateKey.pem";
  var letsEncryptAccountInfoFile = process.env.LETS_ENCRYPT_ACCOUNT_INFO_FILE ? process.env.LETS_ENCRYPT_ACCOUNT_INFO_FILE : "letsEncryptAccountInfo.json";
  
  let accountPrivateKey = await makeAccountPrivateKeypair();
  let accountPem = await Keypairs.export({ jwk: accountPrivateKey, format: "pkcs8" });
  console.log(`writing account private key to ${accountPrivateKeyPemFile}`);
  await fs.promises.writeFile(`./${accountPrivateKeyPemFile}`, accountPem, "ascii");

  let serverPrivateKey = await makeServerPrivateKeypair();
  let serverPem = await Keypairs.export({ jwk: serverPrivateKey });
  console.log(`writing server private key to ${serverPrivateKeyPemFile}`);
  await fs.promises.writeFile(`./${serverPrivateKeyPemFile}`, serverPem, "ascii");

  let accountData = await makeAccount(
    accountPrivateKey,
    process.env.SUBSCRIBER_EMAIL,
    process.env.MAINTAINER_EMAIL
  );
  console.log(`writing lets encrypt account data to ${letsEncryptAccountInfoFile}`)
  await fs.promises.writeFile(
      `./${letsEncryptAccountInfoFile}`,
      JSON.stringify(accountData, null, 2)
  );

  return "Done";
}

if (require.main === module) {
    init()
        .then((message) => {
            console.log(message);
        })
        .catch((err) => {
            console.log(err);
        });
}

module.exports = {
  createCsr,
  makeAccountPrivateKeypair,
  makeServerPrivateKeypair,
  makeAccount,
  init
};
