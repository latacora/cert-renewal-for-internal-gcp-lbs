"use strict";
const googleDns = require("acme-dns-01-gcp");
require("dotenv").config();

// Imports the Google Cloud client library
const { Storage } = require("@google-cloud/storage");

// Creates a client
const storage = new Storage();
const bucket = storage.bucket(process.env.GCP_BUCKET);

var fs = require("fs");
async function get_cert() {
  const start = Date.now();
  var maintainerEmail = process.env.MAINTAINER_EMAIL;
  var subscriberEmail = process.env.SUBSCRIBER_EMAIL;
  var customerEmail = process.env.CUSTOMER_EMAIL;
  var accountPrivateKeyPemFile = process.env.ACCOUNT_PRIV_KEY_PEM_FILE ? process.env.ACCOUNT_PRIV_KEY_PEM_FILE : "accountPrivateKey.pem";
  var serverPrivateKeyPemFile = process.env.SERVER_PRIV_KEY_PEM_FILE ? process.env.SERVER_PRIV_KEY_PEM_FILE : "serverPrivateKey.pem";
  var letsEncryptAccountInfoFile = process.env.LETS_ENCRYPT_ACCOUNT_INFO_FILE ? process.env.LETS_ENCRYPT_ACCOUNT_INFO_FILE : "letsEncryptAccountInfo.json";
  var sslCertFile = process.env.SSL_CERT_FILE ? process.env.SSL_CERT_FILE : "sslCert.pem";
  var certChainFile = process.env.CERT_CHAIN_FILE ? process.env.CERT_CHAIN_FILE : "certChain.pem";



  var pkg = require("./package.json");
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

  //var ACME = require("acme");
  var ACME = require("./@root/acme/acme.js");
  var acme = ACME.create({ maintainerEmail, packageAgent, notify });

  var directoryUrl =
    process.env.CERT_ENV === "production"
      ? "https://acme-v02.api.letsencrypt.org/directory"
      : "https://acme-staging-v02.api.letsencrypt.org/directory";

  await acme.init(directoryUrl);

  var Keypairs = require("@root/keypairs");

  ///////////////////////////
  // Use the storage of choice, we're using google storage here
  const gcpAccountPrivateKeyPemFile = bucket.file(accountPrivateKeyPemFile);

  let accountPrivateKeyPemFileResponse = await gcpAccountPrivateKeyPemFile.download();
  let accountPrivateKeyPem = accountPrivateKeyPemFileResponse[0].toString();
  //
  /////////////////////////////////////////////////

  var accountKey = await Keypairs.import({ pem: accountPrivateKeyPem });

  //Pulling down your Let's Encrypt account data that's json

  const accountInfoFile = bucket.file(letsEncryptAccountInfoFile);

  let letsEncryptAccountInfoResponse = await accountInfoFile.download();
  var account = JSON.parse(letsEncryptAccountInfoResponse[0].toString());
  console.log("loaded account");
  
  // accountKey and account will be used in the certificate options
  //###################################

  // Get server private key
  ///////////////////////////
  // Use the storage of choice, we're using google storage here
  const gcpServerPrivateKeyPemFile = bucket.file(serverPrivateKeyPemFile);

  const gcpServerPrivateKeyDataResponse = await gcpServerPrivateKeyPemFile.download();
  const serverPrivateKeyPem = gcpServerPrivateKeyDataResponse[0].toString();

  const serverKey = await Keypairs.import({ pem: serverPrivateKeyPem });
  ////////////////////////////////////////
  var punycode = require("punycode");
  // since it's a google function, you could also pass in a payload that would be the domains list
  var domains = JSON.parse(process.env.DOMAIN_NAMES);
  domains = domains.map(function (name) {
    return punycode.toASCII(name);
  });

  var CSR = require("@root/csr");
  var PEM = require("@root/pem");

  var encoding = "der";
  var typ = "CERTIFICATE REQUEST";

  var csrDer = await CSR.csr({ jwk: serverKey, domains, encoding });
  var csr = PEM.packBlock({ type: typ, bytes: csrDer });

  console.log("csr created");
  //await fs.promises.writeFile("/tmp/csr.crt", csr, "ascii");
  
  // This is account info regarding where the Google DNS service lives
  const projectId = process.env.PROJECT_ID;
  const zonename = process.env.ZONENAME;
  // propagationDelay could probably be changed
  const challenges = {
    "dns-01": {
      ...googleDns.create({ projectId, zonename }),
      propagationDelay: 120000,
    },
  };

  // Validate Domains
  var certificateOptions = { account, accountKey, csr, domains, challenges };
  var pems = await acme.certificates.create(certificateOptions);

  // Get SSL Certificate
  var fullchain = pems.cert + "\n" + pems.chain + "\n";

  ///////////////////////////
  // Use the storage of choice, we're using google storage here
  const gcpSslCertFile = bucket.file(sslCertFile);
  console.log(`writing ${sslCertFile} to cloudstorage`);
  await gcpSslCertFile.save(pems.cert);

  /////////////////////////////////////////////////

  ///////////////////////////
  // Use the storage of choice, we're using google storage here
  const fullchainFile = bucket.file(certChainFile);
  console.log(`writing ${certChainFile} to cloudstorage`);
  await fullchainFile.save(fullchain);

  /////////////////////////////////////////////////

  const end = Date.now();

  // just wait an extra 30 seconds to allow for dns stuff to complete. Maybe the acme.certificates.create() function isn't properly accounting for promise resolution
  console.log(
    "sleeping to wait acme dns validation stuff to complete 30sec..."
  );
  await new Promise((r) => setTimeout(r, 30000));

  console.log(`total elapsed time: ${millisToMinutesAndSeconds(end - start)}`);
  return "Completed!";
}
function millisToMinutesAndSeconds(millis) {
  var minutes = Math.floor(millis / 60000);
  var seconds = ((millis % 60000) / 1000).toFixed(0);
  return minutes + ":" + (seconds < 10 ? "0" : "") + seconds;
}

module.exports.handler = get_cert;

if (require.main === module) {
    get_cert()
        .then((message) => {
            console.log(message);
        })
        .catch((err) => {
            console.log(err);
        });
}
