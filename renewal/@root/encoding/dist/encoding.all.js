;(function () {
'use strict';
var Enc = window.Encoding = {};


// To Base64

Enc.bufToBase64 = function(u8) {
	var bin = '';
	u8.forEach(function(i) {
		bin += String.fromCharCode(i);
	});
	return btoa(bin);
};

Enc.strToBase64 = function(str) {
	return btoa(Enc.strToBin(str));
};

// From Base64

function _base64ToBin(b64) {
	return atob(Enc.urlBase64ToBase64(b64));
}

Enc._base64ToBin = _base64ToBin;

Enc.base64ToBuf = function(b64) {
	return Enc.binToBuf(_base64ToBin(b64));
};

Enc.base64ToStr = function(b64) {
	return Enc.binToStr(_base64ToBin(b64));
};

// URL Safe Base64

Enc.urlBase64ToBase64 = function(u64) {
	var r = u64 % 4;
	if (2 === r) {
		u64 += '==';
	} else if (3 === r) {
		u64 += '=';
	}
	return u64.replace(/-/g, '+').replace(/_/g, '/');
};

Enc.base64ToUrlBase64 = function(b64) {
	return b64
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=/g, '');
};

Enc.bufToUrlBase64 = function(buf) {
	return Enc.base64ToUrlBase64(Enc.bufToBase64(buf));
};

Enc.strToUrlBase64 = function(str) {
	return Enc.bufToUrlBase64(Enc.strToBuf(str));
};



// To Hex

Enc.bufToHex = function(u8) {
	var hex = [];
	var i, h;
	var len = u8.byteLength || u8.length;

	for (i = 0; i < len; i += 1) {
		h = u8[i].toString(16);
		if (2 !== h.length) {
			h = '0' + h;
		}
		hex.push(h);
	}

	return hex.join('').toLowerCase();
};

Enc.numToHex = function(d) {
	d = d.toString(16); // .padStart(2, '0');
	if (d.length % 2) {
		return '0' + d;
	}
	return d;
};

Enc.strToHex = function(str) {
	return Enc._binToHex(Enc.strToBin(str));
};

Enc._binToHex = function(bin) {
	return bin
		.split('')
		.map(function(ch) {
			var h = ch.charCodeAt(0).toString(16);
			if (2 !== h.length) {
				h = '0' + h;
			}
			return h;
		})
		.join('');
};

// From Hex

Enc.hexToBuf = function(hex) {
	var arr = [];
	hex.match(/.{2}/g).forEach(function(h) {
		arr.push(parseInt(h, 16));
	});
	return 'undefined' !== typeof Uint8Array ? new Uint8Array(arr) : arr;
};

Enc.hexToStr = function(hex) {
	return Enc.binToStr(_hexToBin(hex));
};

function _hexToBin(hex) {
	return hex.replace(/([0-9A-F]{2})/gi, function(_, p1) {
		return String.fromCharCode('0x' + p1);
	});
}

Enc._hexToBin = _hexToBin;



// to Binary String

Enc.bufToBin = function(buf) {
	var bin = '';
	// cannot use .map() because Uint8Array would return only 0s
	buf.forEach(function(ch) {
		bin += String.fromCharCode(ch);
	});
	return bin;
};

Enc.strToBin = function(str) {
	// Note: TextEncoder might be faster (or it might be slower, I don't know),
	// but it doesn't solve the double-utf8 problem and MS Edge still has users without it
	var escstr = encodeURIComponent(str);
	// replaces any uri escape sequence, such as %0A,
	// with binary escape, such as 0x0A
	var binstr = escstr.replace(/%([0-9A-F]{2})/g, function(_, p1) {
		return String.fromCharCode('0x' + p1);
	});
	return binstr;
};

// to Buffer

Enc.binToBuf = function(bin) {
	var arr = bin.split('').map(function(ch) {
		return ch.charCodeAt(0);
	});
	return 'undefined' !== typeof Uint8Array ? new Uint8Array(arr) : arr;
};

Enc.strToBuf = function(str) {
	return Enc.binToBuf(Enc.strToBin(str));
};

// to Unicode String

Enc.binToStr = function(binstr) {
	var escstr = binstr.replace(/(.)/g, function(m, p) {
		var code = p
			.charCodeAt(0)
			.toString(16)
			.toUpperCase();
		if (code.length < 2) {
			code = '0' + code;
		}
		return '%' + code;
	});

	return decodeURIComponent(escstr);
};

Enc.bufToStr = function(buf) {
	return Enc.binToStr(Enc.bufToBin(buf));
};

// Base64 + Hex

Enc.base64ToHex = function(b64) {
	return Enc.bufToHex(Enc.base64ToBuf(b64));
};

Enc.hexToBase64 = function(hex) {
	return btoa(Enc._hexToBin(hex));
};

}());
