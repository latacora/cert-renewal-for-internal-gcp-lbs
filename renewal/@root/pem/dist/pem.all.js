;(function () {
'use strict';
var PEM = window.PEM = {};
var Enc = {};

// "A little copying is better than a little dependency" - Rob Pike

Enc.bufToBase64 = function(u8) {
	var bin = '';
	// map is not part of u8
	u8.forEach(function(i) {
		bin += String.fromCharCode(i);
	});
	return btoa(bin);
};

Enc.base64ToBuf = function(b64) {
	return Uint8Array.from(
		atob(b64)
			.split('')
			.map(function(ch) {
				return ch.charCodeAt(0);
			})
	);
};



PEM.parseBlock = function(str) {
	var der = str
		.split(/\n/)
		.filter(function(line) {
			return !/-----/.test(line);
		})
		.join('');
	return { bytes: Enc.base64ToBuf(der) };
};



PEM.packBlock = function(opts) {
	// TODO allow for headers?
	return (
		'-----BEGIN ' +
		opts.type +
		'-----\n' +
		Enc.bufToBase64(opts.bytes)
			.match(/.{1,64}/g)
			.join('\n') +
		'\n' +
		'-----END ' +
		opts.type +
		'-----'
	);
};
}());
