'use strict';

const aws = require('aws-sdk');
const expect = require('chai').expect;

// Stub aws.S3 so the upload path runs entirely offline — no credentials, no
// network. The real ManagedUpload is exercised by the integration suite; here
// we only assert how createWriteStream forwards arguments to s3.upload().
const originalS3 = aws.S3;
let lastUpload;

function installS3Stub() {
	lastUpload = null;
	aws.S3 = function S3Stub() {
		return {
			upload(params, options, cb) {
				// Mirror the real SDK overload: upload(params, cb) or upload(params, options, cb).
				if (typeof options === 'function') {
					cb = options;
					options = undefined;
				}
				lastUpload = { params, options };
				setImmediate(() => cb(null, { Bucket: params.Bucket, Key: params.Key }));
				return { on() {} };
			}
		};
	};
}

function restoreS3() {
	aws.S3 = originalS3;
}

const utils = require('../../src');

describe('createWriteStream() uploadOptions', () => {

	const destination = { bucketName: 'test-bucket', keyPrefix: 'unit/test-' };

	beforeEach(installS3Stub);
	afterEach(restoreS3);

	it('forwards uploadOptions to s3.upload as the options argument', done => {
		const uploadOptions = { partSize: 5 * 1024 * 1024, queueSize: 2 };
		const stream = utils.createWriteStream(destination, () => {
			expect(lastUpload.options).to.deep.equal(uploadOptions);
			done();
		}, false, uploadOptions);
		stream.end('payload');
	});

	it('passes an empty options object when uploadOptions is omitted (backward compatible)', done => {
		const stream = utils.createWriteStream(destination, () => {
			expect(lastUpload.options).to.deep.equal({});
			done();
		});
		stream.end('payload');
	});

	it('throws TypeError when uploadOptions is not an object', () => {
		expect(() => utils.createWriteStream(destination, () => {}, false, 'nope')).to.throw(TypeError);
		expect(() => utils.createWriteStream(destination, () => {}, false, null)).to.throw(TypeError);
	});

	it('createWriteArrayStream forwards uploadOptions too', done => {
		const uploadOptions = { queueSize: 1 };
		const stream = utils.createWriteArrayStream(destination, () => {
			expect(lastUpload.options).to.deep.equal(uploadOptions);
			done();
		}, false, uploadOptions);
		stream.end();
	});
});
