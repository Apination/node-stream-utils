'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const aws = require('aws-sdk');
const expect = require('chai').expect;

// Stub aws.S3 so the sizing path runs entirely offline — no credentials, no
// network. Only headObject is needed here, and we record what it was called with
// so the url parsing can be asserted.
const originalS3 = aws.S3;
let lastHeadObject;
let headObjectResult;

function installS3Stub() {
	lastHeadObject = null;
	headObjectResult = { ContentLength: 27061035 };
	aws.S3 = function S3Stub() {
		return {
			headObject(params) {
				lastHeadObject = params;
				return { promise: () => Promise.resolve(headObjectResult) };
			}
		};
	};
}

function restoreS3() {
	aws.S3 = originalS3;
}

const utils = require('../../src');

// Asserts the rejection channel specifically: a synchronous throw from
// getObjectSize would fail this helper at the call, before .then is attached.
function expectRejection(url, pattern) {
	return utils.getObjectSize(url).then(
		() => { throw new Error('expected a rejection for ' + JSON.stringify(url)); },
		err => expect(err.message).to.match(pattern)
	);
}

describe('getObjectSize()', () => {

	beforeEach(installS3Stub);
	afterEach(restoreS3);

	it('returns ContentLength for an s3:// url and does not download the object', () => {
		return utils.getObjectSize('s3://test-bucket/path/to/file.pdf').then(size => {
			expect(size).to.equal(27061035);
			expect(lastHeadObject).to.deep.equal({ Bucket: 'test-bucket', Key: 'path/to/file.pdf' });
		});
	});

	it('accepts the https://s3.amazonaws.com/ form, like createReadStream', () => {
		return utils.getObjectSize('https://s3.amazonaws.com/test-bucket/path/to/file.pdf').then(size => {
			expect(size).to.equal(27061035);
			expect(lastHeadObject).to.deep.equal({ Bucket: 'test-bucket', Key: 'path/to/file.pdf' });
		});
	});

	it('unwraps the { $src } envelope, like createReadStream', () => {
		return utils.getObjectSize({ $src: 's3://test-bucket/path/to/file.pdf' }).then(size => {
			expect(size).to.equal(27061035);
		});
	});

	it('sizes a file:// path from the filesystem', () => {
		const file = path.join(os.tmpdir(), 'stream-utils-getObjectSize.txt');
		fs.writeFileSync(file, 'twelve bytes');

		return utils.getObjectSize('file://' + file).then(size => {
			expect(size).to.equal(12);
			fs.unlinkSync(file);
		});
	});

	// createReadStream emits only the requested slice, and asks S3 for
	// `bytes=offset-(offset+length)` — one byte more than length. Neither the whole
	// object size nor length matches the stream, so this must fail loudly.
	it('rejects a range url instead of returning a size that would not match the stream', () => {
		return expectRejection('s3://test-bucket/file.pdf?offset=0&length=100', /range urls/);
	});

	// RX_FILE is greedy, so without a check ahead of the branch the range suffix ends
	// up inside the path and the caller gets ENOENT for a file that never existed.
	it('rejects a range url on a file:// path too, not ENOENT for a glued-on suffix', () => {
		return expectRejection('file:///tmp/probe.bin?offset=0&length=100', /range urls/);
	});

	// Returning 0 would read as "small" to a caller routing by size, which is the
	// exact mistake this helper exists to prevent.
	it('rejects when S3 reports no ContentLength rather than reporting zero', () => {
		headObjectResult = {};

		return expectRejection('s3://test-bucket/file.pdf', /no ContentLength/);
	});

	// The guard is `=== undefined || === null` rather than falsy on purpose. A
	// "simplification" to `if (!head.ContentLength)` would turn every empty object
	// into a hard failure, and this is the only test that would catch it.
	it('returns 0 for an object that is genuinely empty', () => {
		headObjectResult = { ContentLength: 0 };

		return utils.getObjectSize('s3://test-bucket/empty').then(size => {
			expect(size).to.equal(0);
		});
	});

	it('propagates a headObject failure as a rejection', () => {
		const failure = new Error('Access Denied');
		failure.code = 'AccessDenied';
		aws.S3 = function S3Stub() {
			return { headObject: () => ({ promise: () => Promise.reject(failure) }) };
		};

		return expectRejection('s3://test-bucket/file.pdf', /Access Denied/);
	});

	// Every failure mode is a rejection, not a synchronous throw: a caller writing
	// `.then(...).catch(handle)` must reach `handle` for all of them.
	it('rejects rather than throws on a missing file:// path', () => {
		return expectRejection('file:///definitely/not/here.pdf', /ENOENT/);
	});

	// Still a TypeError, just delivered through the rejection channel now.
	it('rejects with TypeError on a missing or non-string url', () => {
		const assertTypeError = url => utils.getObjectSize(url).then(
			() => { throw new Error('expected a rejection for ' + JSON.stringify(url)); },
			err => expect(err).to.be.an.instanceOf(TypeError)
		);

		return Promise.all([assertTypeError(undefined), assertTypeError(''), assertTypeError(42)]);
	});

	it('rejects on an unsupported url format', () => {
		return expectRejection('https://example.com/file.pdf', /Unexpected url format/);
	});
});
