"use strict";
var Keypairs = require("@root/keypairs");
var CSR = require("@root/csr");
var PEM = require("@root/pem");
var punycode = require("punycode");
var ACME = require("acme");
//var ACME = require("./@root/acme/acme.js");
require("dotenv").config();
var fs = require("fs");
var pkg = require("./package.json");

// Imports the Google Cloud client library
const { Storage } = require("@google-cloud/storage");

// Creates a client
const storage = new Storage();

// Create keypair of EC type in the jwk format
async function makeAccountPrivateKeypair() {
  console.log("creating account keypair...");
  const accountKeypair = await Keypairs.generate({ kty: "EC", format: "jwk" });
  const accountKey = accountKeypair.private;

  return accountKey;
}

// Create keypair of RSA type in the jwk format
async function makeServerPrivateKeypair() {
  console.log("creating server keypair...");

  const serverKeypair = await Keypairs.generate({ kty: "RSA", format: "jwk" });

  const serverKey = serverKeypair.private;
  return serverKey;
}

async function makeAccount(
  accountKey,
  subscriberEmail,
  maintainerEmail
) {
  // prefix not required, if added should be an RFC72321-style user-agent string to append to the ACME client (ex: mypackage/v1.1.1)
  const packageAgentPrefix = process.env.PACKAGE_AGENT_PREFIX ? process.env.PACKAGE_AGENT_PREFIX : "";

  const packageAgent = packageAgentPrefix + pkg.name + "/" + pkg.version;
  const errors = [];
  function notify(ev, msg) {
    if ("error" === ev || "warning" === ev) {
      errors.push(ev.toUpperCase() + " " + msg.message);
      return;
    }
    // be brief on all others
    console.log(ev, msg.altname || "", msg.status || "");
  }

  const acme = ACME.create({ maintainerEmail, packageAgent, notify });

  const directoryUrl =
    process.env.CERT_ENV === "production"
      ? "https://acme-v02.api.letsencrypt.org/directory"
      : "https://acme-staging-v02.api.letsencrypt.org/directory";

  await acme.init(directoryUrl);

  //var agreeToTerms = true;
  const agreeToTerms = async function () {
    return true;
  };

  console.info("registering new ACME account...");
  const account = await acme.accounts.create({
    subscriberEmail,
    agreeToTerms,
    accountKey,
  });
  console.info("created account with id", account.key.kid);
  
  return account;
  // accountKey and account will be used in the certificate options
}

async function init(config = {}) {

  const accountPrivateKeyPemFile = process.env.ACCOUNT_PRIV_KEY_PEM_FILE ? process.env.ACCOUNT_PRIV_KEY_PEM_FILE : "accountPrivateKey.pem";
  const serverPrivateKeyPemFile = process.env.SERVER_PRIV_KEY_PEM_FILE ? process.env.SERVER_PRIV_KEY_PEM_FILE : "serverPrivateKey.pem";
  const letsEncryptAccountInfoFile = process.env.LETS_ENCRYPT_ACCOUNT_INFO_FILE ? process.env.LETS_ENCRYPT_ACCOUNT_INFO_FILE : "letsEncryptAccountInfo.json";
  
  const accountPrivateKey = await makeAccountPrivateKeypair();
  const accountPem = await Keypairs.export({ jwk: accountPrivateKey, format: "pkcs8" });
  console.log(`writing account private key to ${accountPrivateKeyPemFile}`);
  await fs.promises.writeFile(`./${accountPrivateKeyPemFile}`, accountPem, "ascii");

  const serverPrivateKey = await makeServerPrivateKeypair();
  const serverPem = await Keypairs.export({ jwk: serverPrivateKey });
  console.log(`writing server private key to ${serverPrivateKeyPemFile}`);
  await fs.promises.writeFile(`./${serverPrivateKeyPemFile}`, serverPem, "ascii");

  const accountData = await makeAccount(
    accountPrivateKey,
    process.env.SUBSCRIBER_EMAIL,
    process.env.MAINTAINER_EMAIL
  );
  console.log(`writing lets encrypt account data to ${letsEncryptAccountInfoFile}`)
  await fs.promises.writeFile(
      `./${letsEncryptAccountInfoFile}`,
      JSON.stringify(accountData, null, 2)
  );
  if (config["bucket"]) {
	// Creates a client
 	const storage = new Storage();
	const bucket = storage.bucket(config.bucket.name);

  	const accountPrivateKeyFile = bucket.file(accountPrivateKeyPemFile);
  	console.log(`writing ${accountPrivateKeyPemFile} to cloudstorage`);
  	await accountPrivateKeyFile.save(accountPem);
	
	const serverPrivateKeyFile = bucket.file(serverPrivateKeyPemFile);
        console.log(`writing ${serverPrivateKeyPemFile} to cloudstorage`);
        await serverPrivateKeyFile.save(serverPem);
	
	const letsEncryptAccountInfoJsonFile = bucket.file(letsEncryptAccountInfoFile);
        console.log(`writing ${letsEncryptAccountInfoFile} to cloudstorage`);
        await letsEncryptAccountInfoJsonFile.save(JSON.stringify(accountData, null, 2));
  }

  return "Done";
}

if (require.main === module) {
    const config = {};
    if (process.env.GCP_BUCKET) {
	    config.bucket = {};
	    config.bucket.name = process.env.GCP_BUCKET;
    }
    init(config)
        .then((message) => {
            console.log(message);
        })
        .catch((err) => {
            console.log(err);
        });
}

module.exports = {
  makeAccountPrivateKeypair,
  makeServerPrivateKeypair,
  makeAccount,
  init
};
