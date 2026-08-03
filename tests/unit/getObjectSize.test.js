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
		expect(() => utils.getObjectSize('s3://test-bucket/file.pdf?offset=0&length=100')).to.throw(/range urls/);
	});

	// Returning 0 would read as "small" to a caller routing by size, which is the
	// exact mistake this helper exists to prevent.
	it('rejects when S3 reports no ContentLength rather than reporting zero', () => {
		headObjectResult = {};

		return utils.getObjectSize('s3://test-bucket/file.pdf').then(
			() => { throw new Error('expected rejection'); },
			err => expect(err.message).to.match(/no ContentLength/)
		);
	});

	it('throws TypeError on a missing or non-string url', () => {
		expect(() => utils.getObjectSize()).to.throw(TypeError);
		expect(() => utils.getObjectSize('')).to.throw(TypeError);
		expect(() => utils.getObjectSize(42)).to.throw(TypeError);
	});

	it('throws on an unsupported url format', () => {
		expect(() => utils.getObjectSize('https://example.com/file.pdf')).to.throw(/Unexpected url format/);
	});
});
