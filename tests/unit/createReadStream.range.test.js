'use strict';

const aws = require('aws-sdk');
const expect = require('chai').expect;

// Stub aws.S3 so the range arithmetic can be asserted offline — the real read path
// is exercised by the integration suite; here we only care what Range header
// createReadStream asks S3 for.
const originalS3 = aws.S3;
let lastGetObject;

function installS3Stub() {
	lastGetObject = null;
	aws.S3 = function S3Stub() {
		return {
			getObject(params) {
				lastGetObject = params;
				return { createReadStream: () => ({}) };
			}
		};
	};
}

function restoreS3() {
	aws.S3 = originalS3;
}

const utils = require('../../src');

describe('createReadStream() byte ranges', () => {

	beforeEach(installS3Stub);
	afterEach(restoreS3);

	// An HTTP byte range is inclusive at both ends. `bytes=2706-3038` is 333 bytes,
	// one more than asked for; the last byte of a 332-byte slice starting at 2706 is
	// at 3037. Verified against a real workflow payload: at length=332 the slice is
	// exactly one JSON record, and byte 333 is the newline separating the next one.
	it('requests exactly `length` bytes, not one more', () => {
		utils.createReadStream('s3://test-bucket/payload.json?offset=2706&length=332');

		expect(lastGetObject.Range).to.equal('bytes=2706-3037');
	});

	it('asks for a single byte when length is 1', () => {
		utils.createReadStream('s3://test-bucket/payload.json?offset=0&length=1');

		expect(lastGetObject.Range).to.equal('bytes=0-0');
	});

	it('sends no Range header when the url carries no range', () => {
		utils.createReadStream('s3://test-bucket/payload.json');

		expect(lastGetObject.Range).to.equal(undefined);
		expect(lastGetObject.Bucket).to.equal('test-bucket');
		expect(lastGetObject.Key).to.equal('payload.json');
	});
});
