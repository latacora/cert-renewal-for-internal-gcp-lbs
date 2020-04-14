"use strict";
const googleDns = require("acme-dns-01-gcp");
require("dotenv").config();

// Imports the Google Cloud client library
const { Storage } = require("@google-cloud/storage");

// Creates a client
const storage = new Storage();
const bucket = storage.bucket("certs-bucket-for-testing");

var fs = require("fs");
async function get_cert() {
  const bucketResponse = await bucket.getFiles();
  const start = Date.now();
  var maintainerEmail = process.env.MAINTAINER_EMAIL;
  var subscriberEmail = process.env.SUBSCRIBER_EMAIL;
  var customerEmail = process.env.CUSTOMER_EMAIL;

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

  // This is your Let's Encrypt account
  var Keypairs = require("@root/keypairs");
  // This should probably have already been created somewhere else
  // if accountKey has not been created yet, use this code
  // otherwise pull the private account key from secrets or something, encrypted in storage?
  var accountKeypair = await Keypairs.generate({ kty: "EC", format: "jwk" });
  var accountKey = accountKeypair.private;

  var accountPem = await Keypairs.export({ jwk: accountKey, format: "pkcs8" });

  ///////////////////////////
  // Use the storage of choice, we're using google storage here
  const privkeyFile = bucket.file("accountprivkey.pem");
  await fs.promises.writeFile("/tmp/accountprivkey.pem", accountPem, "ascii");
  console.log("writing accountprivkey.pem");
  await privkeyFile.save(accountPem);

  const privkeyData = await privkeyFile.download();
  console.log(privkeyData[0].toString());
  let privateAccountKeyPem = privkeyData[0].toString();
  /*
  var privateAccountKeyPem = await fs.promises.readFile(
    "/tmp/accountprivkey.pem",
    "ascii"
  );
  */
  /////////////////////////////////////////////////

  var accountKey = await Keypairs.import({ pem: privateAccountKeyPem });

  var agreeToTerms = true;
  // If you are multi-tenanted or white-labled and need to present the terms of
  // use to the Subscriber running the service, you can do so with a function.

  var agreeToTerms = async function () {
    return true;
  };

  //###################################
  //Create Let's Encrypt Account or just pull up your account data that's json

  console.info("registering new ACME account...");
  var account = await acme.accounts.create({
    subscriberEmail,
    agreeToTerms,
    accountKey,
  });
  console.info("created account with id", account.key.kid);
  console.log("account");
  console.log(account);
  // just need to save the account too so no need to "create" each time
  // accountKey and account will be used in the certificate options
  //###################################

  // You can generate new serverkey, but you probably have already done this once
  var serverKeypair = await Keypairs.generate({ kty: "RSA", format: "jwk" });

  var serverKey = serverKeypair.private;
  let serverPem = await Keypairs.export({ jwk: serverKey });

  ///////////////////////////
  // Use the storage of choice, we're using google storage here
  const serverPrivkeyFile = bucket.file("privkey.pem");
  console.log("writing privkey.pem to cloudstorage");
  await serverPrivkeyFile.save(serverPem);

  const serverPrivkeyData = await serverPrivkeyFile.download();
  console.log("serverPem loaded from cloud storage");
  console.log(serverPrivkeyData[0].toString());
  serverPem = serverPrivkeyData[0].toString();

  /////////////////////////////////////////////////
  var serverKey = await Keypairs.import({ pem: serverPem });


  var punycode = require("punycode");
  //var domains = [process.env.DOMAIN_NAME];
  var domains = JSON.parse(process.env.DOMAIN_NAME);
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
  await fs.promises.writeFile("/tmp/csr.crt", csr, "ascii");
  const projectId = process.env.PROJECT_ID;
  const zonename = process.env.ZONENAME;
  const challenges = {
    "dns-01": {
      ...googleDns.create({ projectId, zonename }),
      propagationDelay: 120000,
    },
  };

  // Validate Domains
  var certificateOptions = { account, accountKey, csr, domains, challenges };
  var pems = await acme.certificates.create(certificateOptions);

  // might need to clean up record sets for the domains with a predetermined prefix
  // requires awareness of googledns which makes this non-portable
  // ideally this would be handled in the acme.certificates, but it's difficult to modify that

  // Get SSL Certificate
  var fullchain = pems.cert + "\n" + pems.chain + "\n";

  ///////////////////////////
  // Use the storage of choice, we're using google storage here
  const pubkeyCertFile = bucket.file("pubkeycert.pem");
  console.log("writing pubkeycert.pem to cloudstorage");
  await pubkeyCertFile.save(pems.cert);

  /////////////////////////////////////////////////

  ///////////////////////////
  // Use the storage of choice, we're using google storage here
  const fullchainFile = bucket.file("fullchain.pem");
  console.log("writing fullchain.pem to cloudstorage");
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

if (process.env.CERT_ENV === "development") {
  console.log("calling get_cert");
  get_cert().then(function (success) {
    console.log(success);
  });
}
