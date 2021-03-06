# Changelog

-   v3 (Oct 2019)
    -   Add POST-as-GET for Let's Encrypt v2 release 2 (ACME / RFC 8555)
    -   Jump to v3 for parity with Greenlock
    -   Merge browser and node.js versions in one
    -   Drop all backwards-compat complexity
    -   Move to zero-external deps, using @root packages only
-   v1.8
    -   more transitional prepwork for new v2 API
    -   support newer (simpler) dns-01 and http-01 libraries
-   v1.5
    -   perform full test challenge first (even before nonce)
-   v1.3
    -   Use node RSA keygen by default
    -   No non-optional external deps!
-   v1.2
    -   fix some API out-of-specness
    -   doc some magic numbers (status)
    -   updated deps
-   v1.1.0
    -   reduce dependencies (use lightweight @coolaj86/request instead of request)
-   v1.0.5 - cleanup logging
-   v1.0.4 - v6- compat use `promisify` from node's util or bluebird
-   v1.0.3 - documentation cleanup
-   v1.0.2
    -   use `options.contact` to provide raw contact array
    -   made `options.email` optional
    -   file cleanup
-   v1.0.1
    -   Compat API is ready for use
    -   Eliminate debug logging
-   Apr 10, 2018 - tested backwards-compatibility using greenlock.js
-   Apr 5, 2018 - export http and dns challenge tests
-   Apr 5, 2018 - test http and dns challenges (success and failure)
-   Apr 5, 2018 - test subdomains and its wildcard
-   Apr 5, 2018 - test two subdomains
-   Apr 5, 2018 - test wildcard
-   Apr 5, 2018 - completely match api for acme v1 (le-acme-core.js)
-   Mar 21, 2018 - _mostly_ matches le-acme-core.js API
-   Mar 21, 2018 - can now accept values (not hard coded)
-   Mar 20, 2018 - SUCCESS - got a test certificate (hard-coded)
-   Mar 20, 2018 - download certificate
-   Mar 20, 2018 - poll for status
-   Mar 20, 2018 - finalize order (submit csr)
-   Mar 20, 2018 - generate domain keypair
-   Mar 20, 2018 - respond to challenges
-   Mar 16, 2018 - get challenges
-   Mar 16, 2018 - new order
-   Mar 15, 2018 - create account
-   Mar 15, 2018 - generate account keypair
-   Mar 15, 2018 - get nonce
-   Mar 15, 2018 - get directory
